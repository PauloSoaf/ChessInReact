import { PlayerId } from '../core/coordinates/types';
import { ITopology } from '../core/topology/types';
import { SquareTopology } from '../core/topology/SquareTopology';
import { IPieceEntity } from '../core/entities/types';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { EngineBridge } from '../core/workers/EngineBridge';
import { MockWorkerPort } from '../core/workers/dummyWorker';
import { gameStore } from '../core/state/gameStore';
import { GlobalEventBus } from '../core/events/EventBus';
import { AIDifficultyLevel, IBestMoveResult } from '../workers/ai/interfaces/IAIEngineContracts';

export interface IBotMatchControllerOptions {
  readonly botPlayer?: PlayerId;
  readonly humanPlayer?: PlayerId;
  readonly difficulty?: AIDifficultyLevel;
  readonly enabled?: boolean;
  readonly bridge?: EngineBridge;
  readonly topology?: ITopology;
}

/**
 * Autonomous Bot Match Controller (Spec 05 § 1, § 15.1 US05-P01/P02, § 16 RF-01, RF-02).
 * Drives turn-based matches between human and bot in real browser environments.
 * - Watches domain state changes and triggers AI calculation when it is the bot's turn.
 * - Validates AI recommendations against authoritative Rules Engine before dispatching MovePieceCommand.
 * - Immediately invalidates in-flight requests and cancels searches upon Undo, Reset, or Game Over.
 */
export class BotMatchController {
  private botPlayer: PlayerId;
  private humanPlayer: PlayerId;
  private difficulty: AIDifficultyLevel;
  private enabled: boolean;
  private bridge: EngineBridge;
  private topology: ITopology;

  private isThinking = false;
  private currentTurnToken = 0;
  private lastEvaluationScore = 0;
  private lastCalculationTimeMs = 0;
  private lastBestMoveStr: string | null = null;
  private listeners = new Set<(isThinking: boolean) => void>();

  constructor(options?: IBotMatchControllerOptions) {
    this.botPlayer = options?.botPlayer ?? 'P2';
    this.humanPlayer = options?.humanPlayer ?? 'P1';
    this.difficulty = options?.difficulty ?? 2;
    this.enabled = options?.enabled ?? false;
    if (options?.bridge) {
      this.bridge = options.bridge;
    } else if (typeof Worker !== 'undefined') {
      this.bridge = new EngineBridge();
    } else {
      // Fallback for headless / Node test environments without native Worker API
      this.bridge = new EngineBridge({ workerPort: new MockWorkerPort(5) });
    }
    this.topology = options?.topology ?? new SquareTopology({ width: 8, height: 8 });
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.cancel();
    } else {
      this.checkAndTriggerBotTurn();
    }
  }

  public isBotEnabled(): boolean {
    return this.enabled;
  }

  public setDifficulty(difficulty: AIDifficultyLevel): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): AIDifficultyLevel {
    return this.difficulty;
  }

  public getBotPlayer(): PlayerId {
    return this.botPlayer;
  }

  public setBotPlayer(player: PlayerId): void {
    this.botPlayer = player;
  }

  public getHumanPlayer(): PlayerId {
    return this.humanPlayer;
  }

  public getIsThinking(): boolean {
    return this.isThinking;
  }

  public getLastEvaluationScore(): number {
    return this.lastEvaluationScore;
  }

  public getLastCalculationTimeMs(): number {
    return this.lastCalculationTimeMs;
  }

  public getLastBestMove(): string | null {
    return this.lastBestMoveStr;
  }

  public setTopology(topology: ITopology): void {
    this.topology = topology;
  }

  public subscribe(listener: (isThinking: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.isThinking);
    }
  }

  /**
   * Immediately aborts in-flight bot computation and invalidates tokens (RNF-09).
   */
  public cancel(): void {
    this.currentTurnToken++;
    this.isThinking = false;
    this.notify();
    this.bridge.cancelPendingSearches();
  }

  /**
   * Evaluates current gameStore state and triggers bot move if it is bot's turn.
   */
  public async checkAndTriggerBotTurn(): Promise<IBestMoveResult | null> {
    if (!this.enabled) return null;

    const domain = gameStore.getState().domain;
    if (domain.isGameOver || domain.winnerId !== null) {
      this.cancel();
      return null;
    }

    if (domain.activePlayer !== this.botPlayer) {
      // It's human's turn; ensure no bot search is running
      if (this.isThinking) {
        this.cancel();
      }
      return null;
    }

    if (this.isThinking) {
      return null; // Already calculating for current turn
    }

    this.isThinking = true;
    this.notify();
    const token = ++this.currentTurnToken;
    const matchId = domain.matchId;
    const turnNumber = domain.turnNumber;

    try {
      const result = await this.bridge.calculateBestMove(domain, {
        difficulty: this.difficulty,
        variantId: domain.variantId,
      });

      // 1. Stale token / Match reset check: Drop response if state changed during search
      const currentDomain = gameStore.getState().domain;
      if (
        token !== this.currentTurnToken ||
        currentDomain.matchId !== matchId ||
        currentDomain.turnNumber !== turnNumber ||
        currentDomain.activePlayer !== this.botPlayer ||
        currentDomain.isGameOver
      ) {
        return null; // Safely discard outdated or cancelled move
      }

      if (!result || !result.bestMove) {
        return null;
      }

      const best = result.bestMove;
      this.lastEvaluationScore = result.evaluationScore;
      this.lastCalculationTimeMs = result.calculationTimeMs;
      this.lastBestMoveStr = `${best.fromCoord}->${best.toCoord}`;

      // 2. Rules Engine verification: Validate AI move before executing command
      const piece = currentDomain.boardEntities[best.pieceId] as IPieceEntity | undefined;
      if (!piece || piece.isCaptured || piece.ownerId !== this.botPlayer) {
        console.warn('[BotMatchController] Recommended piece is invalid or captured.');
        return null;
      }

      const legalMoves = RulesEngine.getLegalMovesForPiece(piece, currentDomain, this.topology);
      const matchedMove = legalMoves.find((m) => m.to === best.toCoord);

      if (!matchedMove) {
        console.warn(
          `[BotMatchController] Illegal move recommendation rejected: ${piece.variantId} to ${best.toCoord}`
        );
        return null;
      }

      // 3. Dispatch MovePieceCommand through Core State Store (Single Source of Truth)
      const promotionVariant = matchedMove.isPromotion
        ? (best.promotionVariant ?? 'QUEEN')
        : undefined;

      const moveCmd = new MovePieceCommand(
        piece.id,
        piece.position,
        best.toCoord,
        this.botPlayer,
        undefined,
        true,
        true,
        promotionVariant,
        this.topology
      );

      gameStore.getState().executeCommand(moveCmd);

      GlobalEventBus.emit('AI_EVALUATION_READY', {
        bestMove: best,
        evaluationScore: result.evaluationScore,
        depthReached: result.depthReached,
        pvLine: result.pvLine,
      });

      return result;
    } catch (err) {
      // Abort errors are expected on cancel/reset
      if (!(err instanceof Error) || !err.message.includes('aborted')) {
        console.warn('[BotMatchController] Bot computation failed:', err);
      }
      return null;
    } finally {
      if (token === this.currentTurnToken) {
        this.isThinking = false;
        this.notify();
      }
    }
  }

  public dispose(): void {
    this.cancel();
    this.listeners.clear();
    this.bridge.dispose();
  }
}

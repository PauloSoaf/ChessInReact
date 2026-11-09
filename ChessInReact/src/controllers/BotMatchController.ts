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
  private isDisposedFlag = false;
  private bridgeOptions?: IBotMatchControllerOptions;

  private isThinking = false;
  private currentTurnToken = 0;
  private lastEvaluationScore = 0;
  private lastCalculationTimeMs = 0;
  private lastBestMoveStr: string | null = null;
  private listeners = new Set<(isThinking: boolean) => void>();

  constructor(options?: IBotMatchControllerOptions) {
    this.bridgeOptions = options;
    this.botPlayer = options?.botPlayer ?? 'P2';
    this.humanPlayer = options?.humanPlayer ?? 'P1';
    this.difficulty = options?.difficulty ?? 2;
    this.enabled = options?.enabled ?? false;
    this.bridge = this.createBridge(options);
    this.topology = options?.topology ?? new SquareTopology({ width: 8, height: 8 });
  }

  private createBridge(options?: IBotMatchControllerOptions): EngineBridge {
    if (options?.bridge) {
      return options.bridge;
    } else if (typeof Worker !== 'undefined') {
      return new EngineBridge();
    } else {
      // Fallback for headless / Node test environments without native Worker API:
      // provide workerFactory so each worker reset spawns a clean, non-terminated instance
      return new EngineBridge({
        workerFactory: () => new MockWorkerPort(5),
      });
    }
  }

  public ensureBridge(): EngineBridge {
    if (this.bridge.isDisposedBridge()) {
      this.bridge = this.createBridge(this.bridgeOptions);
      this.isDisposedFlag = false;
    }
    return this.bridge;
  }

  public isDisposed(): boolean {
    return this.isDisposedFlag || this.bridge.isDisposedBridge();
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
      const bridge = this.ensureBridge();
      const topologyOptions =
        this.topology.type === 'SQUARE'
          ? {
              width: (this.topology as SquareTopology).width ?? 8,
              height: (this.topology as SquareTopology).height ?? 8,
            }
          : undefined;

      const result = await bridge.calculateBestMove(domain, {
        difficulty: this.difficulty,
        variantId: domain.variantId,
        topologyOptions,
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
      // Abort, cancellation and disposal errors are expected on cancel/reset/turn transition
      const msg = err instanceof Error ? err.message : String(err);
      const isExpectedAbort =
        msg.includes('aborted') ||
        msg.includes('disposed') ||
        msg.includes('cancelled');
      if (!isExpectedAbort) {
        console.warn('[BotMatchController] Worker calculation failed, executing async resilient fallback:', err);
        try {
          // 1. Yield to the event loop so the UI remains interactive (RNF-09)
          await new Promise((resolve) => setTimeout(resolve, 0));

          // 2. Early abort check if state changed or search was cancelled during yield
          if (token !== this.currentTurnToken || this.isDisposedFlag) {
            return null;
          }

          // 3. Reset and respawn the worker bridge to restore computation capacity for subsequent turns
          this.bridge.cancelPendingSearches();
          if (!this.bridgeOptions?.bridge) {
            this.bridge.dispose();
            this.bridge = this.createBridge(this.bridgeOptions);
          }

          const currentDomain = gameStore.getState().domain;
          if (
            currentDomain.matchId !== matchId ||
            currentDomain.turnNumber !== turnNumber ||
            currentDomain.activePlayer !== this.botPlayer ||
            currentDomain.isGameOver
          ) {
            return null;
          }

          // 4. Guaranteed Non-Blocking Fallback (RNF-09):
          // First, attempt asynchronous recalculation via the freshly respawned WebWorker (off-main-thread).
          let fallbackResult: IBestMoveResult | null = null;
          if (!this.bridgeOptions?.bridge && typeof Worker !== 'undefined') {
            try {
              fallbackResult = await this.bridge.calculateBestMove(currentDomain, {
                difficulty: 1,
                timeBudgetMs: 50,
                variantId: currentDomain.variantId,
                topologyOptions:
                  this.topology.type === 'SQUARE'
                    ? {
                        width: (this.topology as SquareTopology).width ?? 8,
                        height: (this.topology as SquareTopology).height ?? 8,
                      }
                    : undefined,
              });
            } catch {
              // Worker retry failed; proceed to instantaneous O(1) legal move fallback
            }
          }

          // 5. Zero-search O(1) Instantaneous Fallback (Zero main-thread blocking):
          // If worker retry is unavailable or threw, select the first legal move directly from RulesEngine
          // without running any minimax/tree search on the main thread (< 0.1ms execution).
          if (!fallbackResult || !fallbackResult.bestMove) {
            const botPieces = Object.values(currentDomain.boardEntities).filter(
              (e): e is IPieceEntity => e.type === 'PIECE' && !e.isCaptured && e.ownerId === this.botPlayer
            );
            for (const p of botPieces) {
              const legal = RulesEngine.getLegalMovesForPiece(p, currentDomain, this.topology);
              if (legal.length > 0) {
                const chosen = legal[0];
                fallbackResult = {
                  bestMove: {
                    pieceId: p.id,
                    fromCoord: p.position,
                    toCoord: chosen.to,
                    promotionVariant: chosen.isPromotion ? 'QUEEN' : undefined,
                  },
                  evaluationScore: 0,
                  calculationTimeMs: 1,
                  depthReached: 1,
                  nodesCalculated: 1,
                  pvLine: [`${p.position}->${chosen.to}`],
                };
                break;
              }
            }
          }

          // Re-check token before command dispatch
          if (token !== this.currentTurnToken || this.isDisposedFlag) {
            return null;
          }

          if (fallbackResult && fallbackResult.bestMove) {
            const best = fallbackResult.bestMove;
            const piece = currentDomain.boardEntities[best.pieceId] as IPieceEntity | undefined;
            if (piece && !piece.isCaptured && piece.ownerId === this.botPlayer) {
              const legalMoves = RulesEngine.getLegalMovesForPiece(piece, currentDomain, this.topology);
              const matchedMove = legalMoves.find((m) => m.to === best.toCoord);
              if (matchedMove) {
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
                this.lastEvaluationScore = fallbackResult.evaluationScore;
                this.lastCalculationTimeMs = fallbackResult.calculationTimeMs;
                this.lastBestMoveStr = `${best.fromCoord}->${best.toCoord}`;
                GlobalEventBus.emit('AI_EVALUATION_READY', {
                  bestMove: best,
                  evaluationScore: fallbackResult.evaluationScore,
                  depthReached: fallbackResult.depthReached,
                  pvLine: fallbackResult.pvLine,
                });
                return fallbackResult;
              }
            }
          }
        } catch (fallbackErr) {
          console.error('[BotMatchController] Resilient fallback failed:', fallbackErr);
        }
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
    this.isDisposedFlag = true;
    this.cancel();
    this.listeners.clear();
    this.bridge.dispose();
  }
}

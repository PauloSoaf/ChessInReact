/**
 * ChessInReact - Universal Match Controller (Spec 13, 14, 15, 16)
 *
 * Universal gameplay orchestrator for ALL variants and minigames:
 * - 2 to 12 player slots (1v1, FFA, Teams).
 * - Independent slot role assignment: HUMAN_LOCAL, AI_BOT, HUMAN_REMOTE, BOT_STANDIN.
 * - 0-Human Spectator Mode: autonomous bot-vs-bot games with Pause, Resume, Step, 1x/2x/5x speed.
 * - Variant mechanics:
 *   * Duck Chess 2-phase atomic turns (Piece Move -> Duck Placement).
 *   * Spell Chess (Official Cooldowns and Expanded Mana).
 *   * Massive Multiplayer clockwise turn cycle and scoring.
 *   * Capablanca and expanded geometries.
 */

import { asCoordinateKey, asEntityId, createSquareCoord, PlayerId, SquareCodec } from '../core/coordinates';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { CheckValidator } from '../engine/rules/CheckValidator';
import { ITopology } from '../core/topology/types';
import { SquareTopology } from '../core/topology/SquareTopology';
import { gameStore } from '../core/state/gameStore';
import { bootstrapGame } from '../core/bootstrap/GameInitializer';
import { IMatchConfiguration, IParticipantSlot } from '../matchmaking/config/IMatchConfiguration';
import { MatchConfigurationManager } from '../matchmaking/config/MatchConfigurationManager';
import { AIWorkerPool } from '../workers/ai/AIWorkerPool';
import { VariantPieceInitializer } from '../engine/variants/VariantPieceInitializer';
import { DuckChessEngine, DuckTurnPhase, IDuckChessState } from '../analysis/minigames/DuckChessEngine';
import { OfficialSpellEngine, IOfficialSpellState } from '../engine/variants/spells/OfficialSpellEngine';
import { SpellChessEngine, ISpellGameState, ISpellCard } from '../analysis/minigames/SpellChessEngine';
import { TurnCycleManager, ITurnCycleState } from '../engine/multiplayer/arenas/TurnCycleManager';
import { FFAScoringEngine, IFFAPlayerScore } from '../engine/multiplayer/arenas/FFAScoringEngine';
import { CompositeArenaLayouts } from '../engine/multiplayer/arenas/CompositeArenaLayouts';
import { ArenaModeId } from '../engine/multiplayer/arenas/interfaces/IArenaContracts';

export interface IUniversalMatchSnapshot {
  readonly config: IMatchConfiguration;
  readonly isSpectatorMatch: boolean;
  readonly isPaused: boolean;
  readonly playbackSpeed: 1 | 2 | 5;
  readonly isThinking: boolean;
  readonly activePlayer: PlayerId;
  readonly activeSlot: IParticipantSlot;
  readonly lastMoveSummary: string | null;
  readonly duckCoordinate: string | null;
  readonly duckPhase: DuckTurnPhase;
  readonly officialSpellState: IOfficialSpellState | null;
  readonly expandedSpellState: ISpellGameState | null;
  readonly scores: Readonly<Record<string, number>>;
  readonly eliminatedPlayers: ReadonlyArray<string>;
}

export class UniversalMatchController {
  private config: IMatchConfiguration;
  private topology: ITopology;
  private isSpectator: boolean;
  private isPausedState = false;
  private playbackSpeedState: 1 | 2 | 5 = 1;
  private isThinkingState = false;
  private lastMoveSummaryStr: string | null = null;

  // Duck Chess state
  private duckState: IDuckChessState | null = null;

  // Spell Chess states
  private officialSpellState: IOfficialSpellState | null = null;
  private expandedSpellState: ISpellGameState | null = null;

  // Multiplayer Arena states
  private turnCycleState: ITurnCycleState | null = null;
  private scoresState: Record<string, IFFAPlayerScore> = {};

  // Timers & listeners
  private autonomousTimer: number | null = null;
  private isDisposedFlag = false;
  private listeners = new Set<(snapshot: IUniversalMatchSnapshot) => void>();
  private storeUnsubscribe: (() => void) | null = null;

  constructor(initialConfig?: IMatchConfiguration) {
    this.config = initialConfig ?? MatchConfigurationManager.createDefaultMatch('standard', 2);
    this.topology = this.resolveTopology(this.config);
    this.isSpectator = this.config.slots.every(
      (s) => s.role === 'AI_BOT' || s.role === 'BOT_STANDIN'
    );

    this.initializeVariantStates();
  }

  private resolveTopology(config: IMatchConfiguration): ITopology {
    const v = config.variantId.toUpperCase();
    if (v === 'CAPABLANCA_CHESS') {
      return new SquareTopology({ width: 10, height: 8 });
    }
    const arenaLayout = CompositeArenaLayouts.getLayout(v as ArenaModeId);
    if (arenaLayout) {
      if (arenaLayout.boardType === 'SQUARE_CROSS') {
        return new SquareTopology({ width: 14, height: 14 });
      }
      return new SquareTopology({ width: 16, height: 16 });
    }
    return new SquareTopology({ width: 8, height: 8 });
  }

  private initializeVariantStates(): void {
    const v = this.config.variantId.toUpperCase();

    // Duck Chess initialization
    if (v.includes('DUCK')) {
      this.duckState = DuckChessEngine.createInitialState();
    } else {
      this.duckState = null;
    }

    // Official Spell Chess
    if (v === 'SPELL_CHESS_OFFICIAL') {
      this.officialSpellState = OfficialSpellEngine.createInitialState();
    } else {
      this.officialSpellState = null;
    }

    // Expanded Spell Chess
    if (v === 'SPELL_CHESS_EXPANDED') {
      this.expandedSpellState = SpellChessEngine.createInitialState();
    } else {
      this.expandedSpellState = null;
    }

    // Multiplayer Arenas
    if (this.config.totalParticipants > 2) {
      const factions = this.config.slots.map((s) => `FACTION_${s.slotIndex + 1}`);
      this.turnCycleState = TurnCycleManager.createInitialState(factions);
      this.scoresState = {};
      for (const f of factions) {
        this.scoresState[f] = FFAScoringEngine.createInitialScore(f);
      }
    } else {
      this.turnCycleState = null;
      this.scoresState = {};
    }
  }

  /**
   * Initializes and boots a new match with the provided configuration.
   */
  public startMatch(config?: IMatchConfiguration): void {
    if (config) {
      this.config = config;
      this.topology = this.resolveTopology(config);
      this.isSpectator = config.slots.every(
        (s) => s.role === 'AI_BOT' || s.role === 'BOT_STANDIN'
      );
    }

    this.clearAutonomousTimer();
    this.initializeVariantStates();

    // Spawn pieces appropriate for this variant and player count
    const initialPieces = VariantPieceInitializer.createPiecesForVariant(
      this.config.variantId
    );

    bootstrapGame({
      matchId: this.config.matchId,
      variantId: this.config.variantId as 'classic_square' | 'hex_ffa',
      initialPieces,
      targetStore: gameStore,
    });

    // Ensure store listener is active
    if (!this.storeUnsubscribe) {
      this.storeUnsubscribe = gameStore.subscribe(() => {
        this.handleStoreUpdate();
      });
    }

    this.notify();

    // If initial player is a bot, trigger turn!
    this.scheduleAutonomousTurnIfNeeded();
  }

  public getConfig(): IMatchConfiguration {
    return this.config;
  }

  public getTopology(): ITopology {
    return this.topology;
  }

  public isSpectatorMatch(): boolean {
    return this.isSpectator;
  }

  public isPaused(): boolean {
    return this.isPausedState;
  }

  public togglePause(): void {
    this.isPausedState = !this.isPausedState;
    this.notify();
    if (!this.isPausedState) {
      this.scheduleAutonomousTurnIfNeeded();
    } else {
      this.clearAutonomousTimer();
    }
  }

  public setPlaybackSpeed(speed: 1 | 2 | 5): void {
    this.playbackSpeedState = speed;
    this.notify();
  }

  public getPlaybackSpeed(): 1 | 2 | 5 {
    return this.playbackSpeedState;
  }

  public getIsThinking(): boolean {
    return this.isThinkingState;
  }

  public getSlotForPlayer(playerId: PlayerId): IParticipantSlot | undefined {
    // Map P1 -> slot 0, P2 -> slot 1, etc.
    const match = playerId.match(/^P(\d+)$/);
    if (!match) return this.config.slots[0];
    const slotIdx = parseInt(match[1], 10) - 1;
    return this.config.slots.find((s) => s.slotIndex === slotIdx) ?? this.config.slots[slotIdx];
  }

  public getActiveSlot(): IParticipantSlot {
    const domain = gameStore.getState().domain;
    return this.getSlotForPlayer(domain.activePlayer) ?? this.config.slots[0];
  }

  public getSnapshot(): IUniversalMatchSnapshot {
    const domain = gameStore.getState().domain;
    const activeSlot = this.getActiveSlot();
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.scoresState)) {
      scores[k] = v.totalScore;
    }

    const eliminated = this.turnCycleState
      ? Array.from(this.turnCycleState.eliminatedFactions)
      : [];

    return {
      config: this.config,
      isSpectatorMatch: this.isSpectator,
      isPaused: this.isPausedState,
      playbackSpeed: this.playbackSpeedState,
      isThinking: this.isThinkingState,
      activePlayer: domain.activePlayer,
      activeSlot,
      lastMoveSummary: this.lastMoveSummaryStr,
      duckCoordinate: this.duckState?.duckCoordinate ?? null,
      duckPhase: this.duckState?.currentPhase ?? 'PIECE_MOVE',
      officialSpellState: this.officialSpellState,
      expandedSpellState: this.expandedSpellState,
      scores,
      eliminatedPlayers: eliminated,
    };
  }

  public subscribe(listener: (snapshot: IUniversalMatchSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snap = this.getSnapshot();
    for (const l of this.listeners) {
      l(snap);
    }
  }

  private handleStoreUpdate(): void {
    this.notify();
    this.scheduleAutonomousTurnIfNeeded();
  }

  private clearAutonomousTimer(): void {
    if (this.autonomousTimer !== null) {
      clearTimeout(this.autonomousTimer);
      this.autonomousTimer = null;
    }
  }

  /**
   * Evaluates whether the current active turn belongs to an AI Bot and schedules execution.
   */
  public scheduleAutonomousTurnIfNeeded(): void {
    if (this.isDisposedFlag || this.isPausedState || this.isThinkingState) return;

    const domain = gameStore.getState().domain;
    if (domain.isGameOver) return;

    const activeSlot = this.getSlotForPlayer(domain.activePlayer);
    if (!activeSlot) return;

    const isBot = activeSlot.role === 'AI_BOT' || activeSlot.role === 'BOT_STANDIN';
    if (!isBot) return;

    this.clearAutonomousTimer();

    // Speed cadence: 1x = 650ms, 2x = 300ms, 5x = 90ms
    const delay = this.playbackSpeedState === 5 ? 90 : this.playbackSpeedState === 2 ? 300 : 650;

    this.autonomousTimer = (typeof window !== 'undefined' ? window.setTimeout : setTimeout)(() => {
      this.stepBotTurn();
    }, delay) as unknown as number;
  }

  /**
   * Executes a single step of bot deliberation and command dispatch.
   */
  public async stepBotTurn(): Promise<boolean> {
    if (this.isDisposedFlag) return false;

    const domain = gameStore.getState().domain;
    if (domain.isGameOver) return false;

    const activeSlot = this.getSlotForPlayer(domain.activePlayer);
    if (!activeSlot) return false;

    const isBot = activeSlot.role === 'AI_BOT' || activeSlot.role === 'BOT_STANDIN';
    if (!isBot) return false;

    this.isThinkingState = true;
    this.notify();

    try {
      // 1. Query legal moves through authoritative RulesEngine
      const legalMoves = RulesEngine.getLegalMoves(domain, this.topology);

      if (legalMoves.length === 0) {
        // Stalemate or Checkmate resolution
        const inCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, this.topology);
        const opponent: PlayerId = domain.activePlayer === 'P1' ? 'P2' : 'P1';

        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: inCheck ? opponent : null,
          },
        }));

        this.isThinkingState = false;
        this.notify();
        return false;
      }

      // 2. Prepare request for pluggable AI Worker Pool
      const candidateMoves = legalMoves.map((m) => ({
        from: m.from,
        to: m.to,
        pieceId: m.pieceId,
        isCapture: m.isCapture,
        promotion: m.isPromotion ? 'QUEEN' : undefined,
      }));

      // Candidate empty squares for Duck Chess
      const emptySquares = this.getEmptySquares();
      const opponentId: PlayerId = domain.activePlayer === 'P1' ? 'P2' : 'P1';
      const friendlyKing = CheckValidator.findRoyalPiece(domain.activePlayer, domain);
      const opponentKing = CheckValidator.findRoyalPiece(opponentId, domain);
      const specializedContext: Record<string, unknown> = {
        participantCount: this.config.totalParticipants,
        friendlyKingCoord: friendlyKing?.position,
        opponentKingCoord: opponentKing?.position,
        emptySquares,
        duckCoordinate: this.duckState?.duckCoordinate,
        mana:
          this.expandedSpellState &&
          (domain.activePlayer === 'P1'
            ? this.expandedSpellState.whiteMana
            : this.expandedSpellState.blackMana),
        jumpCharges:
          this.officialSpellState &&
          (domain.activePlayer === 'P1'
            ? this.officialSpellState.whiteCharges.jumpCharges
            : this.officialSpellState.blackCharges.jumpCharges),
      };

      const decision = await AIWorkerPool.dispatchDecision({
        matchId: domain.matchId,
        variantId: this.config.variantId,
        actingPlayer: domain.activePlayer,
        difficultyLevel: activeSlot.botConfig?.difficultyLevel ?? 3,
        timeBudgetMs: activeSlot.botConfig?.thinkTimeMs ?? 500,
        legalMoves: candidateMoves,
        specializedContext,
      });

      // 3. Execute MovePieceCommand on core domain
      const best = decision.move;
      const cmd = new MovePieceCommand(
        asEntityId(best.pieceId),
        asCoordinateKey(best.from),
        asCoordinateKey(best.to),
        domain.activePlayer,
        undefined,
        true,
        true,
        best.promotion,
        this.topology
      );

      gameStore.getState().executeCommand(cmd);
      this.lastMoveSummaryStr = `${best.from} → ${best.to}`;

      // 4. Handle secondary variant mechanics
      if (this.duckState) {
        const targetDuck =
          (decision.secondaryAction?.payload?.targetCoordinate as string) ??
          emptySquares.find((sq) => sq !== best.to) ??
          'e4';
        this.duckState = {
          ...this.duckState,
          duckCoordinate: targetDuck,
          currentPhase: 'PIECE_MOVE',
          activePlayer: domain.activePlayer === 'P1' ? 'BLACK' : 'WHITE',
        };
      }

      // 5. Handle multiplayer turn cycling if > 2 players
      if (this.config.totalParticipants > 2 && this.turnCycleState) {
        this.turnCycleState = TurnCycleManager.advanceTurn(this.turnCycleState);
        const nextFaction = TurnCycleManager.getActiveFaction(this.turnCycleState);
        const nextPlayerId = this.factionToPlayerId(nextFaction);

        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            activePlayer: nextPlayerId,
          },
        }));
      }

      return true;
    } catch (err) {
      console.warn('[UniversalMatchController] Bot calculation error:', err);
      return false;
    } finally {
      this.isThinkingState = false;
      this.notify();
      this.scheduleAutonomousTurnIfNeeded();
    }
  }

  /**
   * Places the rubber duck in Duck Chess Phase 2.
   */
  public placeDuck(targetCoord: string): boolean {
    if (!this.duckState || this.duckState.currentPhase !== 'PLACE_DUCK') {
      return false;
    }

    const domain = gameStore.getState().domain;
    const occupied = new Set(Object.keys(domain.occupancy));

    try {
      this.duckState = DuckChessEngine.executePlaceDuck(this.duckState, targetCoord, occupied);
      this.notify();
      this.scheduleAutonomousTurnIfNeeded();
      return true;
    } catch (err) {
      console.warn('[UniversalMatchController] Duck placement error:', err);
      return false;
    }
  }

  /**
   * Triggered when a human makes a piece move in Duck Chess, entering Phase 2.
   */
  public onHumanPieceMoved(from: string, to: string, pieceId: string): void {
    if (!this.duckState) return;

    try {
      this.duckState = DuckChessEngine.executePieceMove(this.duckState, {
        from,
        to,
        pieceId,
      });
      this.notify();
    } catch (err) {
      console.warn('[UniversalMatchController] Duck Chess piece move error:', err);
    }
  }

  /**
   * Casts a spell in Official Spell Chess (Freeze or Jump).
   */
  public castOfficialSpell(
    spellType: 'FREEZE' | 'JUMP',
    target: { file: number; rank: number } | string
  ): boolean {
    if (!this.officialSpellState) return false;

    const domain = gameStore.getState().domain;
    const player = domain.activePlayer === 'P1' ? 'WHITE' : 'BLACK';

    if (spellType === 'FREEZE') {
      const center =
        typeof target === 'string'
          ? { file: target.charCodeAt(0) - 97, rank: parseInt(target[1], 10) - 1 }
          : target;

      const res = OfficialSpellEngine.castFreeze(this.officialSpellState, player, center);
      if (res.success) {
        this.officialSpellState = res.state;
        this.notify();
        return true;
      }
    } else {
      const pieceId = typeof target === 'string' ? target : '';
      const res = OfficialSpellEngine.castJump(this.officialSpellState, player, pieceId);
      if (res.success) {
        this.officialSpellState = res.state;
        this.notify();
        return true;
      }
    }

    return false;
  }

  /**
   * Casts a spell in Expanded Spell Chess.
   */
  public castExpandedSpell(spell: ISpellCard, targetCoord: string): boolean {
    if (!this.expandedSpellState) return false;

    const domain = gameStore.getState().domain;
    const player = domain.activePlayer === 'P1' ? 'WHITE' : 'BLACK';

    try {
      let nextState = this.expandedSpellState;
      if (spell.type === 'FREEZE') {
        nextState = SpellChessEngine.castFreeze(nextState, player, targetCoord);
      } else if (spell.type === 'JUMP') {
        const entityId = domain.occupancy[asCoordinateKey(targetCoord)] ?? '';
        nextState = SpellChessEngine.castJump(nextState, player, entityId);
      } else if (spell.type === 'STEALTH_TRAP') {
        nextState = SpellChessEngine.castStealthTrap(nextState, player, targetCoord);
      } else if (spell.type === 'INVISIBILITY') {
        const entityId = domain.occupancy[asCoordinateKey(targetCoord)] ?? '';
        nextState = SpellChessEngine.castInvisibility(nextState, player, entityId);
      } else if (spell.type === 'MIRROR_SHIELD') {
        const entityId = domain.occupancy[asCoordinateKey(targetCoord)] ?? '';
        nextState = SpellChessEngine.castMirrorShield(nextState, player, entityId);
      }
      this.expandedSpellState = nextState;
      this.notify();
      return true;
    } catch (err) {
      console.warn('[UniversalMatchController] Expanded spell error:', err);
      return false;
    }
  }

  private getEmptySquares(): string[] {
    const domain = gameStore.getState().domain;
    const empty: string[] = [];
    const size =
      this.topology.type === 'SQUARE'
        ? (this.topology as SquareTopology).width ?? 8
        : 8;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        const key = SquareCodec.encode(createSquareCoord(x, y));
        if (!domain.occupancy[key]) {
          empty.push(key);
        }
      }
    }

    return empty;
  }

  private factionToPlayerId(factionId: string): PlayerId {
    const match = factionId.match(/^FACTION_(\d+)$/);
    if (!match) return 'P1';
    const num = parseInt(match[1], 10);
    const clamped = Math.max(1, Math.min(8, num));
    return `P${clamped}` as PlayerId;
  }

  public dispose(): void {
    this.isDisposedFlag = true;
    this.clearAutonomousTimer();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.listeners.clear();
  }
}

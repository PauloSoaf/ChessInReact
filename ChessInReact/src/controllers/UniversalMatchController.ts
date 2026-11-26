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
import { DropPieceCommand } from '../core/commands/DropPieceCommand';
import { RulesEngine } from '../engine/rules/RulesEngine';
import { VariantRegistry } from '../engine/rules/VariantRegistry';
import { CheckValidator } from '../engine/rules/CheckValidator';
import { ITopology } from '../core/topology/types';
import { SquareTopology } from '../core/topology/SquareTopology';
import { gameStore } from '../core/state/gameStore';
import { bootstrapGame } from '../core/bootstrap/GameInitializer';
import {
  IMatchConfiguration,
  IParticipantSlot,
  ParticipantRole,
} from '../matchmaking/config/IMatchConfiguration';
import { MatchConfigurationManager } from '../matchmaking/config/MatchConfigurationManager';
import { AIWorkerPool } from '../workers/ai/AIWorkerPool';
import { GlobalEventBus } from '../core/events/EventBus';
import { VariantPieceInitializer } from '../engine/variants/VariantPieceInitializer';
import { DuckChessEngine, DuckTurnPhase, IDuckChessState } from '../analysis/minigames/DuckChessEngine';
import { OfficialSpellEngine, IOfficialSpellState } from '../engine/variants/spells/OfficialSpellEngine';
import {
  SpellChessEngine,
  ISpellGameState,
  ISpellCard,
  SPELL_CATALOG,
} from '../analysis/minigames/SpellChessEngine';
import { TurnCycleManager, ITurnCycleState } from '../engine/multiplayer/arenas/TurnCycleManager';
import { FFAScoringEngine, IFFAPlayerScore } from '../engine/multiplayer/arenas/FFAScoringEngine';
import { VariantCatalog } from '../engine/variants/catalog/VariantCatalog';
import { VariantMapConfig } from '../engine/variants/VariantMapConfig';
import { ThreeCheckTracker, ICheckCountState } from '../engine/variants/modifiers/ThreeCheckTracker';
import { RacingKingsValidator, IRacingKingsState } from '../engine/variants/modifiers/RacingKingsValidator';
import { KingOfTheHillEvaluator } from '../engine/variants/modifiers/KingOfTheHillEvaluator';
import { IEntity, IPieceEntity } from '../core/entities/types';
import { ParticipantClockManager } from '../matchmaking/config/ParticipantClockManager';
import { SANNotationGenerator } from '../engine/rules/notation/SANNotationGenerator';
import { IDomainState } from '../core/state/gameState';
import { BoardEvaluator } from '../workers/ai/heuristics/BoardEvaluator';
import { SpellChessMoveGenerator } from '../workers/ai/strategies/spell/SpellChessMoveGenerator';

export interface IMoveItem {
  turnNumber: number;
  white?: string;
  black?: string;
  timestamp?: number;
}

export interface IMoveRecord {
  readonly matchId: string;
  readonly ply: number;
  readonly turnNumber: number;
  readonly playerId: PlayerId;
  readonly from: string;
  readonly to: string;
  readonly pieceId: string;
  readonly pieceVariant: string;
  readonly isCapture: boolean;
  readonly capturedPieceId?: string | null;
  readonly isPromotion?: boolean;
  readonly promotionVariant?: string;
  readonly isCastling?: boolean;
  readonly isEnPassant?: boolean;
  readonly san: string;
  readonly uci: string;
  readonly clockTimeLeftMs?: number;
  readonly evalCp?: number;
  readonly actionType: 'PIECE_MOVE' | 'DUCK' | 'DROP' | 'SPELL' | 'BOT_MOVE';
  readonly spellType?: string;
}

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
  readonly frozenCoordinates: readonly string[];
  readonly officialSpellState: IOfficialSpellState | null;
  readonly expandedSpellState: ISpellGameState | null;
  readonly threeCheckState: ICheckCountState | null;
  readonly racingKingsState: IRacingKingsState | null;
  readonly scores: Readonly<Record<string, number>>;
  readonly eliminatedPlayers: ReadonlyArray<string>;
  readonly hasCastSpellThisTurn: boolean;
  readonly clocks: Readonly<Record<string, number>>;
  readonly moveHistory: ReadonlyArray<IMoveRecord>;
}

export interface IUniversalMatchHistorySnapshot {
  readonly officialSpellState: IOfficialSpellState | null;
  readonly expandedSpellState: ISpellGameState | null;
  readonly duckState: IDuckChessState | null;
  readonly threeCheckState: ICheckCountState | null;
  readonly racingKingsState: IRacingKingsState | null;
  readonly scoresState: Record<string, IFFAPlayerScore>;
  readonly turnCycleState: ITurnCycleState | null;
  readonly lastMoveSummaryStr: string | null;
  readonly actionType?: 'SPELL' | 'PIECE_MOVE' | 'DUCK' | 'DROP' | 'BOT_MOVE';
  readonly hasCastSpellThisTurn?: boolean;
  readonly clocksSnapshot?: Readonly<Record<string, number>>;
  readonly moveHistoryCount?: number;
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
  private threeCheckState: ICheckCountState | null = null;
  private racingKingsState: IRacingKingsState | null = null;
  private hasCastSpellThisTurn = false;

  // Multiplayer Arena states
  private turnCycleState: ITurnCycleState | null = null;
  private scoresState: Record<string, IFFAPlayerScore> = {};

  // Monotonic participant clock & move history managers (Spec 16 § 4, Spec 09 § 4)
  private clockManager = new ParticipantClockManager();
  private clockInterval: number | null = null;
  private moveHistory: IMoveRecord[] = [];
  private lastDomain: IDomainState | null = null;

  // Minigame & variant lossless history stacks (Spec 01 & Spec 12)
  private minigameUndoStack: IUniversalMatchHistorySnapshot[] = [];
  private minigameRedoStack: IUniversalMatchHistorySnapshot[] = [];

  // Timers & listeners
  private autonomousTimer: number | null = null;
  private isDisposedFlag = false;
  private matchGeneration = 0;
  private botRequestSequence = 0;
  private activeBotRequestId = 0;
  private listeners = new Set<(snapshot: IUniversalMatchSnapshot) => void>();
  private storeUnsubscribe: (() => void) | null = null;

  constructor(initialConfig?: IMatchConfiguration) {
    this.config = initialConfig ?? MatchConfigurationManager.createDefaultMatch('standard', 2);
    this.topology = this.resolveTopology(this.config);
    this.isSpectator = this.config.slots.every(
      (s) => s.role === 'AI_BOT' || s.role === 'BOT_STANDIN'
    );
    this.clockManager.initializeFromConfig(this.config);
    this.lastDomain = gameStore.getState().domain;

    this.initializeVariantStates();
  }

  private resolveTopology(config: IMatchConfiguration): ITopology {
    return VariantCatalog.getTopologyForVariant(config.variantId);
  }

  private initializeVariantStates(): void {
    const v = this.config.variantId.toUpperCase();

    // Three-Check / Five-Check
    if (v === 'THREE_CHECK') {
      this.threeCheckState = ThreeCheckTracker.createInitialState(3);
    } else if (v === 'FIVE_CHECK') {
      this.threeCheckState = ThreeCheckTracker.createInitialState(5);
    } else {
      this.threeCheckState = null;
    }

    // Duck Chess initialization
    if (v.includes('DUCK')) {
      this.duckState = DuckChessEngine.createInitialState();
    } else {
      this.duckState = null;
    }

    // Official Spell Chess
    if (v === 'SPELL_CHESS_OFFICIAL' || v === 'SPELL_CHESS' || v === 'SPELL_CHESS_KING_CAPTURE_ONLY') {
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

    // Racing Kings
    if (v.includes('RACING')) {
      this.racingKingsState = RacingKingsValidator.createInitialState();
    } else {
      this.racingKingsState = null;
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
    // A new configuration invalidates every decision produced for the prior
    // match, including decisions that are still awaiting an async strategy.
    this.matchGeneration++;
    this.activeBotRequestId = 0;
    this.isThinkingState = false;
    this.minigameUndoStack = [];
    this.minigameRedoStack = [];

    if (config) {
      this.config = config;
      this.topology = this.resolveTopology(config);
      this.isSpectator = config.slots.every(
        (s) => s.role === 'AI_BOT' || s.role === 'BOT_STANDIN'
      );
    }

    this.clearAutonomousTimer();
    this.stopClockTicking();
    this.initializeVariantStates();
    this.clockManager.initializeFromConfig(this.config);
    this.moveHistory = [];

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

    // Persist the rules variant in the authoritative state so legality, explosions,
    // forced captures and drops apply for humans, bots and the 2D/3D boards alike.
    const rulesConfig = VariantRegistry.resolveRulesConfig(this.config.variantId);
    if (rulesConfig) {
      gameStore.setState((s) => ({
        domain: { ...s.domain, variantId: rulesConfig.variantId },
      }));
    }
    this.syncVariantModifiersToDomain();
    // Ensure store listener is active
    if (!this.storeUnsubscribe) {
      this.storeUnsubscribe = gameStore.subscribe(() => {
        this.handleStoreUpdate();
      });
    }

    this.lastDomain = gameStore.getState().domain;
    this.startClockTicking();
    this.notify();

    // If initial player is a bot, trigger turn!
    this.scheduleAutonomousTurnIfNeeded();
  }

  public getConfig(): IMatchConfiguration {
    return this.config;
  }

  /**
   * Dynamically updates a participant slot role (e.g. toggling P2 between AI_BOT and HUMAN_LOCAL)
   * without resetting the board state.
   */
  public updateSlotRole(
    slotIndex: number,
    role: ParticipantRole,
    botDifficulty?: 1 | 2 | 3 | 4 | 5
  ): void {
    this.config = MatchConfigurationManager.updateSlotRole(this.config, slotIndex, role);
    if (botDifficulty !== undefined && (role === 'AI_BOT' || role === 'BOT_STANDIN')) {
      this.config = MatchConfigurationManager.updateBotDifficulty(this.config, slotIndex, botDifficulty);
    }
    this.isSpectator = this.config.slots.every(
      (s) => s.role === 'AI_BOT' || s.role === 'BOT_STANDIN'
    );
    this.activeBotRequestId = 0;
    this.isThinkingState = false;
    this.clearAutonomousTimer();
    this.notify();
    this.scheduleAutonomousTurnIfNeeded();
  }

  /**
   * Updates bot difficulty level for a given slot in the active match.
   */
  public updateBotDifficulty(slotIndex: number, difficulty: 1 | 2 | 3 | 4 | 5): void {
    this.config = MatchConfigurationManager.updateBotDifficulty(this.config, slotIndex, difficulty);
    this.notify();
  }

  /**
   * Resets the current match while preserving the active variant and participant slots.
   */
  public resetCurrentMatch(): void {
    this.startMatch(this.config);
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
    if (this.isPausedState) {
      this.activeBotRequestId = 0;
      this.stopClockTicking();
    } else {
      this.startClockTicking();
    }
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

  public getClockManager(): ParticipantClockManager {
    return this.clockManager;
  }

  public getMoveHistory(): readonly IMoveRecord[] {
    return this.moveHistory;
  }

  /**
   * Records a snapshot of all active minigame states before a game action occurs.
   */
  public recordHistorySnapshot(actionType?: 'SPELL' | 'PIECE_MOVE' | 'DUCK' | 'DROP' | 'BOT_MOVE'): void {
    const snapshot: IUniversalMatchHistorySnapshot = {
      officialSpellState: this.officialSpellState ? JSON.parse(JSON.stringify(this.officialSpellState)) : null,
      expandedSpellState: this.expandedSpellState ? JSON.parse(JSON.stringify(this.expandedSpellState)) : null,
      duckState: this.duckState ? JSON.parse(JSON.stringify(this.duckState)) : null,
      threeCheckState: this.threeCheckState ? JSON.parse(JSON.stringify(this.threeCheckState)) : null,
      racingKingsState: this.racingKingsState ? JSON.parse(JSON.stringify(this.racingKingsState)) : null,
      scoresState: JSON.parse(JSON.stringify(this.scoresState)),
      turnCycleState: this.turnCycleState ? JSON.parse(JSON.stringify(this.turnCycleState)) : null,
      lastMoveSummaryStr: this.lastMoveSummaryStr,
      actionType,
      hasCastSpellThisTurn: this.hasCastSpellThisTurn,
      clocksSnapshot: this.clockManager.captureSnapshot(),
      moveHistoryCount: this.moveHistory.length,
    };
    this.minigameUndoStack.push(snapshot);
    if (this.minigameUndoStack.length > 100) {
      this.minigameUndoStack.shift();
    }
    this.minigameRedoStack = [];
  }

  /**
   * Reverts the most recent game action (including spells, duck placements, reserve drops, and piece moves)
   * while maintaining 100% synchronization between Core state, spell charges, mana, and cooldowns.
   */
  public undo(): boolean {
    let wasSpellOnly = false;
    if (this.minigameUndoStack.length > 0) {
      const prev = this.minigameUndoStack.pop()!;
      wasSpellOnly = prev.actionType === 'SPELL';

      const currentSnapshot: IUniversalMatchHistorySnapshot = {
        officialSpellState: this.officialSpellState ? JSON.parse(JSON.stringify(this.officialSpellState)) : null,
        expandedSpellState: this.expandedSpellState ? JSON.parse(JSON.stringify(this.expandedSpellState)) : null,
        duckState: this.duckState ? JSON.parse(JSON.stringify(this.duckState)) : null,
        threeCheckState: this.threeCheckState ? JSON.parse(JSON.stringify(this.threeCheckState)) : null,
        racingKingsState: this.racingKingsState ? JSON.parse(JSON.stringify(this.racingKingsState)) : null,
        scoresState: JSON.parse(JSON.stringify(this.scoresState)),
        turnCycleState: this.turnCycleState ? JSON.parse(JSON.stringify(this.turnCycleState)) : null,
        lastMoveSummaryStr: this.lastMoveSummaryStr,
        actionType: prev.actionType,
        hasCastSpellThisTurn: this.hasCastSpellThisTurn,
        clocksSnapshot: this.clockManager.captureSnapshot(),
        moveHistoryCount: this.moveHistory.length,
      };
      this.minigameRedoStack.push(currentSnapshot);

      this.officialSpellState = prev.officialSpellState;
      this.expandedSpellState = prev.expandedSpellState;
      this.duckState = prev.duckState;
      this.threeCheckState = prev.threeCheckState;
      this.racingKingsState = prev.racingKingsState;
      this.scoresState = prev.scoresState;
      this.turnCycleState = prev.turnCycleState;
      this.lastMoveSummaryStr = prev.lastMoveSummaryStr;
      this.hasCastSpellThisTurn = prev.hasCastSpellThisTurn ?? false;

      if (prev.clocksSnapshot) {
        this.clockManager.restoreSnapshot(prev.clocksSnapshot);
      }
      if (prev.moveHistoryCount !== undefined) {
        this.moveHistory = this.moveHistory.slice(0, prev.moveHistoryCount);
      }
    }

    let coreUndone = false;
    if (!wasSpellOnly) {
      coreUndone = gameStore.getState().undo();
    }

    const currentDomain = gameStore.getState().domain;
    this.lastDomain = currentDomain;
    this.clockManager.setActivePlayer(currentDomain.activePlayer);

    this.syncVariantModifiersToDomain();
    this.notify();
    return wasSpellOnly || coreUndone;
  }

  /**
   * Reapplies the most recently undone action.
   */
  public redo(): boolean {
    let wasSpellOnly = false;
    if (this.minigameRedoStack.length > 0) {
      const next = this.minigameRedoStack.pop()!;
      wasSpellOnly = next.actionType === 'SPELL';

      const currentSnapshot: IUniversalMatchHistorySnapshot = {
        officialSpellState: this.officialSpellState ? JSON.parse(JSON.stringify(this.officialSpellState)) : null,
        expandedSpellState: this.expandedSpellState ? JSON.parse(JSON.stringify(this.expandedSpellState)) : null,
        duckState: this.duckState ? JSON.parse(JSON.stringify(this.duckState)) : null,
        threeCheckState: this.threeCheckState ? JSON.parse(JSON.stringify(this.threeCheckState)) : null,
        racingKingsState: this.racingKingsState ? JSON.parse(JSON.stringify(this.racingKingsState)) : null,
        scoresState: JSON.parse(JSON.stringify(this.scoresState)),
        turnCycleState: this.turnCycleState ? JSON.parse(JSON.stringify(this.turnCycleState)) : null,
        lastMoveSummaryStr: this.lastMoveSummaryStr,
        actionType: next.actionType,
        hasCastSpellThisTurn: this.hasCastSpellThisTurn,
        clocksSnapshot: this.clockManager.captureSnapshot(),
        moveHistoryCount: this.moveHistory.length,
      };
      this.minigameUndoStack.push(currentSnapshot);

      this.officialSpellState = next.officialSpellState;
      this.expandedSpellState = next.expandedSpellState;
      this.duckState = next.duckState;
      this.threeCheckState = next.threeCheckState;
      this.racingKingsState = next.racingKingsState;
      this.scoresState = next.scoresState;
      this.turnCycleState = next.turnCycleState;
      this.hasCastSpellThisTurn = next.hasCastSpellThisTurn ?? false;
      this.lastMoveSummaryStr = next.lastMoveSummaryStr;

      if (next.clocksSnapshot) {
        this.clockManager.restoreSnapshot(next.clocksSnapshot);
      }
    }

    let coreRedone = false;
    if (!wasSpellOnly) {
      coreRedone = gameStore.getState().redo();
    }

    const currentDomain = gameStore.getState().domain;
    this.lastDomain = currentDomain;
    this.clockManager.setActivePlayer(currentDomain.activePlayer);

    this.syncVariantModifiersToDomain();
    this.notify();
    return wasSpellOnly || coreRedone;
  }

  public canUndo(): boolean {
    return this.minigameUndoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.minigameRedoStack.length > 0;
  }

  public peekUndoActionType(): string | undefined {
    if (this.minigameUndoStack.length === 0) return undefined;
    return this.minigameUndoStack[this.minigameUndoStack.length - 1].actionType;
  }

  public peekRedoActionType(): string | undefined {
    if (this.minigameRedoStack.length === 0) return undefined;
    return this.minigameRedoStack[this.minigameRedoStack.length - 1].actionType;
  }

  public getSlotForPlayer(playerId: PlayerId): IParticipantSlot | undefined {
    // Map P1 -> slot 0, P2 -> slot 1, etc.
    const match = playerId.match(/^P(\d+)$/);
    if (!match) return this.config.slots[0];
    const slotIdx = parseInt(match[1], 10) - 1;
    return this.config.slots.find((s) => s.slotIndex === slotIdx) ?? this.config.slots[slotIdx];
  }

  /**
   * Resolves bot ownership by the active player identity, never by a fixed
   * P2 assumption. This is the single predicate used by autonomous turn
   * scheduling and manual bot stepping.
   */
  public isBotPlayer(playerId: PlayerId): boolean {
    const slot = this.getSlotForPlayer(playerId);
    return slot?.role === 'AI_BOT' || slot?.role === 'BOT_STANDIN';
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
      frozenCoordinates: [
        ...(this.officialSpellState ? Object.keys(this.officialSpellState.activeFrozenCoordinates) : []),
        ...(this.expandedSpellState ? Object.keys(this.expandedSpellState.frozenCoordinates) : []),
      ],
      officialSpellState: this.officialSpellState,
      expandedSpellState: this.expandedSpellState,
      threeCheckState: this.threeCheckState ? { ...this.threeCheckState } : null,
      racingKingsState: this.racingKingsState ? { ...this.racingKingsState } : null,
      scores,
      eliminatedPlayers: eliminated,
      hasCastSpellThisTurn: this.hasCastSpellThisTurn,
      clocks: this.clockManager.getClocksMap(),
      moveHistory: [...this.moveHistory],
    };
  }

  public startClockTicking(): void {
    this.stopClockTicking();
    const domain = gameStore.getState().domain;
    if (domain.isGameOver || this.isPausedState || this.isDisposedFlag) return;

    const firstSlotClock = this.config.slots[0]?.clock;
    if (firstSlotClock && firstSlotClock.initialSeconds === 0) return;

    this.clockManager.setActivePlayer(domain.activePlayer);
    this.clockManager.start();

    this.clockInterval = (typeof window !== 'undefined' ? window.setInterval : setInterval)(() => {
      this.tickClocks();
    }, 100) as unknown as number;
  }

  public stopClockTicking(): void {
    if (this.clockInterval !== null) {
      clearInterval(this.clockInterval);
      this.clockInterval = null;
    }
    this.clockManager.pause();
  }

  private tickClocks(): void {
    const domain = gameStore.getState().domain;
    if (domain.isGameOver || this.isPausedState || this.isDisposedFlag) {
      this.stopClockTicking();
      return;
    }

    const tickResult = this.clockManager.tick();
    const activePlayer = tickResult.activePlayer;
    const timeLeftMs = tickResult.updatedClocks[activePlayer] ?? 0;
    const isUrgent = timeLeftMs > 0 && timeLeftMs < 10000;
    const isExpired = tickResult.timedOutPlayer !== null;

    const secondsLeft = Math.floor(timeLeftMs / 1000);

    if (secondsLeft <= 30 && secondsLeft > 0) {
      GlobalEventBus.emit('CLOCK_TICK', {
        playerId: activePlayer,
        secondsLeft,
        isUrgent,
      });
    }

    if (isUrgent && timeLeftMs >= 9800 && timeLeftMs <= 10000) {
      GlobalEventBus.emit('TIME_WARNING', {
        playerId: activePlayer,
        secondsLeft: Math.round(timeLeftMs / 1000),
      });
    }

    if (isExpired) {
      this.handleClockTimeout(tickResult.timedOutPlayer ?? activePlayer);
    } else {
      this.notify();
    }
  }

  private handleClockTimeout(timedOutPlayer: PlayerId): void {
    this.stopClockTicking();
    const domain = gameStore.getState().domain;
    if (domain.isGameOver) return;

    if (this.config.totalParticipants > 2 && this.turnCycleState) {
      const currentFaction = `FACTION_${timedOutPlayer.replace('P', '')}`;
      this.turnCycleState = TurnCycleManager.eliminateFaction(this.turnCycleState, currentFaction);
      const surviving = TurnCycleManager.getSurvivingFactions(this.turnCycleState);

      if (surviving.length <= 1) {
        const winner = surviving.length === 1 ? this.factionToPlayerId(surviving[0]) : null;
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: winner,
          },
        }));
        GlobalEventBus.emit('GAME_ENDED', { winnerId: winner, reason: 'Tempo Esgotado' });
        this.notify();
        return;
      }

      const nextFaction = TurnCycleManager.getActiveFaction(this.turnCycleState);
      const nextPlayerId = this.factionToPlayerId(nextFaction);
      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          activePlayer: nextPlayerId,
        },
      }));
      this.clockManager.setActivePlayer(nextPlayerId);
      this.startClockTicking();
      this.notify();
      this.scheduleAutonomousTurnIfNeeded();
      return;
    }

    const winnerId: PlayerId = timedOutPlayer === 'P1' ? 'P2' : 'P1';
    gameStore.setState((s) => ({
      domain: {
        ...s.domain,
        isGameOver: true,
        winnerId,
      },
    }));

    GlobalEventBus.emit('GAME_ENDED', { winnerId, reason: 'Tempo Esgotado' });
    this.notify();
  }

  private recordMoveEntry(record: IMoveRecord): void {
    if (record.evalCp === undefined) {
      try {
        const domain = gameStore.getState().domain;
        const scores = BoardEvaluator.evaluate(domain, this.topology);
        const evalCp = (scores.P1 ?? 0) - (scores.P2 ?? 0);
        record = { ...record, evalCp };
      } catch {
        // Fallback gracefully if evaluator cannot compute
      }
    }
    this.moveHistory.push(record);
    this.lastMoveSummaryStr = record.san;
  }

  public getEvaluationsStream(): readonly number[] {
    const stream: number[] = [0];
    for (const move of this.moveHistory) {
      if (move.actionType !== 'SPELL' && move.actionType !== 'DUCK') {
        stream.push(move.evalCp ?? 0);
      }
    }
    return stream;
  }

  public getFormattedMoveItems(): IMoveItem[] {
    const items: IMoveItem[] = [];
    let currentItem: IMoveItem | null = null;

    for (const move of this.moveHistory) {
      if (move.actionType === 'SPELL' || move.actionType === 'DUCK') {
        continue;
      }
      const isP1 = move.playerId === 'P1';
      if (isP1) {
        if (currentItem) {
          items.push(currentItem);
        }
        currentItem = {
          turnNumber: move.turnNumber,
          white: move.san,
          timestamp: move.clockTimeLeftMs,
        };
      } else {
        if (currentItem && currentItem.turnNumber === move.turnNumber) {
          currentItem.black = move.san;
          items.push(currentItem);
          currentItem = null;
        } else {
          if (currentItem) items.push(currentItem);
          items.push({
            turnNumber: move.turnNumber,
            black: move.san,
            timestamp: move.clockTimeLeftMs,
          });
          currentItem = null;
        }
      }
    }
    if (currentItem) {
      items.push(currentItem);
    }
    return items;
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
    if (domain.isGameOver || domain.matchId !== this.config.matchId) return;
    if (this.duckState && this.duckState.currentPhase === 'PLACE_DUCK') return;

    const activeSlot = this.getSlotForPlayer(domain.activePlayer);
    if (!activeSlot) return;

    if (!this.isBotPlayer(domain.activePlayer)) return;

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
    if (this.isDisposedFlag || this.isThinkingState) return false;

    const domain = gameStore.getState().domain;
    if (domain.isGameOver || domain.matchId !== this.config.matchId) return false;
    if (this.duckState && this.duckState.currentPhase === 'PLACE_DUCK') return false;

    const activeSlot = this.getSlotForPlayer(domain.activePlayer);
    if (!activeSlot) return false;

    if (!this.isBotPlayer(domain.activePlayer)) return false;

    const requestId = ++this.botRequestSequence;
    this.activeBotRequestId = requestId;
    const generation = this.matchGeneration;
    const requestContext = {
      matchId: domain.matchId,
      revision: domain.revision,
      activePlayer: domain.activePlayer,
      turnNumber: domain.turnNumber,
    };

    this.isThinkingState = true;
    this.notify();

    try {
      // 1. Query legal moves through authoritative RulesEngine
      let legalMoves = RulesEngine.getLegalMoves(domain, this.topology);

      if (legalMoves.length === 0) {
        const isSpellChess = Boolean(
          this.config.variantId.toUpperCase().includes('SPELL') ||
          domain.variantId?.toUpperCase().includes('SPELL')
        );

        // Spell Chess Check Defense & Zero-Moves Resolution:
        // If the bot has Freeze or Jump available, check if casting can unlock legal moves!
        if (isSpellChess && this.officialSpellState) {
          const inCheck = CheckValidator.isRoyalInCheck(domain.activePlayer, domain, this.topology);
          const botCharges = domain.activePlayer === 'P1'
            ? this.officialSpellState.whiteCharges
            : this.officialSpellState.blackCharges;
          const hasSpells = Boolean(
            (botCharges.freezeCharges > 0 && botCharges.freezeCooldownTurns === 0) ||
            (botCharges.jumpCharges > 0 && botCharges.jumpCooldownTurns === 0)
          );

          if (hasSpells && (inCheck || legalMoves.length === 0)) {
            const activeFrozen = Object.keys(this.officialSpellState.activeFrozenCoordinates);
            const activeJumps = Object.keys(this.officialSpellState.activeJumpPieceIds);
            const unlockedActions = SpellChessMoveGenerator.generateTurnActions(
              domain,
              domain.activePlayer,
              this.topology,
              {
                freezeRemaining: botCharges.freezeCharges,
                jumpRemaining: botCharges.jumpCharges,
                freezeCooldown: botCharges.freezeCooldownTurns,
                jumpCooldown: botCharges.jumpCooldownTurns,
              },
              activeFrozen,
              activeJumps
            );

            if (unlockedActions.length > 0) {
              legalMoves = unlockedActions.map((a) => ({
                pieceId: asEntityId(a.move.pieceId),
                from: asCoordinateKey(a.move.from),
                to: asCoordinateKey(a.move.to),
                isCapture: Boolean(a.move.isCapture),
                isPromotion: Boolean(a.move.promotion),
              }));
            }
          }
        }
      }

      if (legalMoves.length === 0) {
        // Stalemate or Checkmate resolution

        if (this.config.totalParticipants > 2 && this.turnCycleState) {
          const currentFaction = `FACTION_${domain.activePlayer.replace('P', '')}`;
          this.turnCycleState = TurnCycleManager.eliminateFaction(this.turnCycleState, currentFaction);
          const surviving = TurnCycleManager.getSurvivingFactions(this.turnCycleState);

          if (surviving.length <= 1) {
            const winner = surviving.length === 1 ? this.factionToPlayerId(surviving[0]) : null;
            gameStore.setState((s) => ({
              domain: {
                ...s.domain,
                isGameOver: true,
                winnerId: winner,
              },
            }));
            this.isThinkingState = false;
            this.notify();
            return false;
          }

          const nextFaction = TurnCycleManager.getActiveFaction(this.turnCycleState);
          const nextPlayerId = this.factionToPlayerId(nextFaction);
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              activePlayer: nextPlayerId,
            },
          }));

          this.isThinkingState = false;
          this.notify();
          this.scheduleAutonomousTurnIfNeeded();
          return true;
        }

        const result = RulesEngine.getGameResult(domain, this.topology);

        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: result.isGameOver,
            winnerId: result.winnerId,
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
      const officialCharges =
        this.officialSpellState &&
        (domain.activePlayer === 'P1'
          ? this.officialSpellState.whiteCharges
          : this.officialSpellState.blackCharges);
      const opponentCharges =
        this.officialSpellState &&
        (domain.activePlayer === 'P1'
          ? this.officialSpellState.blackCharges
          : this.officialSpellState.whiteCharges);
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
        freezeCharges: officialCharges?.freezeCharges ?? 0,
        jumpCharges: officialCharges?.jumpCharges ?? 0,
        freezeCooldown: officialCharges?.freezeCooldownTurns ?? 0,
        jumpCooldown: officialCharges?.jumpCooldownTurns ?? 0,
        opponentJumpCharges: opponentCharges?.jumpCharges ?? 0,
        opponentJumpCooldown: opponentCharges?.jumpCooldownTurns ?? 0,
        opponentFreezeCharges: opponentCharges?.freezeCharges ?? 0,
        opponentFreezeCooldown: opponentCharges?.freezeCooldownTurns ?? 0,
        activeFrozenCoordinates: this.officialSpellState
          ? Object.keys(this.officialSpellState.activeFrozenCoordinates)
          : [],
      };

      const botDiff = activeSlot.botConfig?.difficultyLevel ?? 3;
      const standardBudget =
        botDiff === 5 ? 2500 : botDiff === 4 ? 1500 : botDiff === 3 ? 800 : botDiff === 2 ? 350 : 150;
      const timeBudgetMs = Math.max(activeSlot.botConfig?.thinkTimeMs ?? standardBudget, standardBudget);

      const decision = await AIWorkerPool.dispatchDecision({
        matchId: domain.matchId,
        variantId: this.config.variantId,
        actingPlayer: domain.activePlayer,
        difficultyLevel: botDiff,
        timeBudgetMs,
        legalMoves: candidateMoves,
        specializedContext,
        domain,
        topology: this.topology,
      });

      const currentDomain = gameStore.getState().domain;
      const isStaleRequest =
        this.isDisposedFlag ||
        generation !== this.matchGeneration ||
        requestId !== this.activeBotRequestId ||
        currentDomain.matchId !== requestContext.matchId ||
        currentDomain.revision !== requestContext.revision ||
        currentDomain.activePlayer !== requestContext.activePlayer ||
        currentDomain.turnNumber !== requestContext.turnNumber ||
        currentDomain.isGameOver;

      // Never apply a move, spell, duck placement, or turn transition after
      // reset, undo, abandonment, participant change, or a newer request.
      if (isStaleRequest) {
        return false;
      }

      this.recordHistorySnapshot('BOT_MOVE');

      // 3. Apply the secondary action before the move when it grants a
      // modifier to the move itself (for example Official Jump).
      this.applyBotSecondaryAction(decision.secondaryAction);

      // 4. Execute MovePieceCommand on core domain
      const best = decision.move;
      const movingPlayerSide: 'WHITE' | 'BLACK' = domain.activePlayer === 'P1' ? 'WHITE' : 'BLACK';
      const movingPieceEntity = domain.boardEntities[asEntityId(best.pieceId)] as IPieceEntity | undefined;
      const targetEntityId = domain.occupancy[asCoordinateKey(best.to)];
      const capturedEntity = targetEntityId
        ? domain.boardEntities[targetEntityId]
        : undefined;

      const fromAlg = SANNotationGenerator.coordToAlgebraic(best.from);
      const toAlg = SANNotationGenerator.coordToAlgebraic(best.to);
      const isCastling = (movingPieceEntity?.variantId.toUpperCase() === 'KING') &&
        ((fromAlg === 'e1' && (toAlg === 'g1' || toAlg === 'c1')) || (fromAlg === 'e8' && (toAlg === 'g8' || toAlg === 'c8')));

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
      const postMoveDomain = gameStore.getState().domain;
      this.lastDomain = postMoveDomain;

      const sanResult = SANNotationGenerator.generateSAN({
        from: best.from,
        to: best.to,
        pieceId: best.pieceId,
        domainBefore: domain,
        domainAfter: postMoveDomain,
        topology: this.topology,
        isCapture: Boolean(targetEntityId),
        isCastling,
        promotionVariant: best.promotion,
      });
      const uciResult = SANNotationGenerator.generateUCI(best.from, best.to, best.promotion);

      const movingPlayerId = domain.activePlayer;
      const ply = this.moveHistory.length + 1;
      const fullmoveNumber = Math.ceil(ply / 2);
      const moveEntry: IMoveRecord = {
        matchId: domain.matchId,
        ply,
        turnNumber: fullmoveNumber,
        playerId: movingPlayerId,
        from: best.from,
        to: best.to,
        pieceId: best.pieceId,
        pieceVariant: movingPieceEntity?.variantId ?? 'UNKNOWN',
        isCapture: Boolean(targetEntityId),
        capturedPieceId: targetEntityId ?? null,
        isPromotion: Boolean(best.promotion),
        promotionVariant: best.promotion,
        isCastling,
        san: sanResult,
        uci: uciResult,
        clockTimeLeftMs: this.clockManager.getTimeLeftMs(movingPlayerId),
        actionType: 'BOT_MOVE',
      };
      this.recordMoveEntry(moveEntry);

      if (!this.duckState) {
        this.clockManager.applyIncrement(movingPlayerId);
        this.clockManager.setActivePlayer(postMoveDomain.activePlayer);
      }

      this.lastMoveSummaryStr = sanResult;

      // Decoupled Audio & Feedback Event Dispatching for autonomous bot moves
      if (capturedEntity && (capturedEntity as { type?: string }).type === 'PIECE') {
        GlobalEventBus.emit('PIECE_CAPTURED', {
          capturedId: asEntityId(capturedEntity.id),
          captorId: asEntityId(best.pieceId),
          coordinate: asCoordinateKey(best.to),
          variantId: (capturedEntity as { variantId?: string }).variantId ?? 'PAWN',
        });
      } else {
        GlobalEventBus.emit('PIECE_MOVED', {
          pieceId: asEntityId(best.pieceId),
          from: asCoordinateKey(best.from),
          to: asCoordinateKey(best.to),
          actingPlayer: domain.activePlayer,
        });
      }

      // 4b. Apply post-move Spell Chess triggers (traps, portals, mana/cooldown advance)
      this.applySpellEffectsAfterMove(best.pieceId, best.to, movingPlayerSide);

      // Three-Check / Five-Check evaluation
      if (this.threeCheckState) {
        const currentDomain = gameStore.getState().domain;
        const isCheck = CheckValidator.isRoyalInCheck(currentDomain.activePlayer, currentDomain, this.topology);
        if (isCheck) {
          this.threeCheckState = ThreeCheckTracker.registerCheck(this.threeCheckState, movingPlayerSide);
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              metadata: {
                ...(s.domain as { metadata?: Record<string, unknown> }).metadata,
                threeCheckState: this.threeCheckState,
              },
              isGameOver: this.threeCheckState?.isGameOver || s.domain.isGameOver,
              winnerId: this.threeCheckState?.isGameOver
                ? (this.threeCheckState.winner === 'WHITE' ? 'P1' : 'P2')
                : s.domain.winnerId,
            },
          }));
        }
      }

      // Racing Kings evaluation
      if (this.racingKingsState) {
        const movedPiece = domain.boardEntities[asEntityId(best.pieceId)] as IPieceEntity | undefined;
        const isKing = movedPiece?.type === 'PIECE' && (movedPiece.variantId.toUpperCase() === 'KING' || movedPiece.variantId.toUpperCase() === 'K');
        if (isKing) {
          const destY = Number(best.to.split(',')[1]);
          this.racingKingsState = RacingKingsValidator.evaluateRaceTurn(this.racingKingsState, movingPlayerSide, destY);
          if (this.racingKingsState.isGameOver) {
            gameStore.setState((s) => ({
              domain: {
                ...s.domain,
                isGameOver: true,
                winnerId: this.racingKingsState?.winner === 'WHITE' ? 'P1' : this.racingKingsState?.winner === 'BLACK' ? 'P2' : null,
              },
            }));
          }
        }
      }

      // King of the Hill evaluation
      if (this.config.variantId.toUpperCase().includes('HILL')) {
        const currentDomain = gameStore.getState().domain;
        const p1King = CheckValidator.findRoyalPiece('P1', currentDomain);
        const p2King = CheckValidator.findRoyalPiece('P2', currentDomain);
        if (p1King && p2King) {
          const hillEval = KingOfTheHillEvaluator.evaluateKingPosition(p1King.position, p2King.position);
          if (hillEval.isGameOver) {
            gameStore.setState((s) => ({
              domain: {
                ...s.domain,
                isGameOver: true,
                winnerId: hillEval.winner === 'WHITE' ? 'P1' : 'P2',
              },
            }));
          }
        }
      }

      // Spell Chess Royal Capture Victory (Spec 12 / Spec 13)
      if (this.config.variantId.toUpperCase().includes('SPELL')) {
        const currentDomain = gameStore.getState().domain;
        const p1King = CheckValidator.findRoyalPiece('P1', currentDomain);
        const p2King = CheckValidator.findRoyalPiece('P2', currentDomain);
        if (!p1King || !p2King) {
          const winner = p1King ? 'P1' : p2King ? 'P2' : null;
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: winner,
            },
          }));
          this.notify();
        }
      }

      // Spell Chess Royal Capture Victory (Spec 12 / Spec 13)
      if (this.config.variantId.toUpperCase().includes('SPELL')) {
        const currentDomain = gameStore.getState().domain;
        const p1King = CheckValidator.findRoyalPiece('P1', currentDomain);
        const p2King = CheckValidator.findRoyalPiece('P2', currentDomain);
        if (!p1King || !p2King) {
          const winner = p1King ? 'P1' : p2King ? 'P2' : null;
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: winner,
            },
          }));
          this.notify();
        }
      }

      // 5. Complete Duck Chess' mandatory second phase through its engine.
      if (this.duckState) {
        this.duckState = DuckChessEngine.executePieceMove(this.duckState, {
          from: best.from,
          to: best.to,
          pieceId: best.pieceId,
          capturedPieceType:
            capturedEntity?.type === 'PIECE' ? capturedEntity.variantId : undefined,
        });

        if (this.duckState.isGameOver) {
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: domain.activePlayer,
            },
          }));
          return true;
        }

        const targetDuck =
          (decision.secondaryAction?.payload?.targetCoordinate as string) ??
          emptySquares.find((sq) => sq !== best.to) ??
          'e4';
        this.placeDuck(targetDuck);
      }

      // 6. Handle multiplayer turn cycling if > 2 players
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

  private applyBotSecondaryAction(
    action: {
      readonly type: 'PLACE_DUCK' | 'CAST_SPELL' | 'DROP_PIECE';
      readonly payload: Readonly<Record<string, unknown>>;
    } | undefined
  ): void {
    if (!action || this.hasCastSpellThisTurn) return;

    if (action.type === 'DROP_PIECE') {
      const pieceVariant = action.payload.pieceVariant as string;
      const targetCoord = action.payload.targetCoord as string;
      if (pieceVariant && targetCoord) {
        this.dropPiece(pieceVariant, targetCoord);
      }
      return;
    }

    if (action.type !== 'CAST_SPELL') return;

    const spellType = action.payload.spellType;
    if (this.officialSpellState && (spellType === 'FREEZE' || spellType === 'JUMP')) {
      const target =
        spellType === 'FREEZE'
          ? (action.payload.targetCoord as string)
          : ((action.payload.targetCoord as string) ?? (action.payload.targetPieceId as string));
      this.castOfficialSpell(spellType, target);
      return;
    }

    if (this.expandedSpellState && typeof spellType === 'string') {
      const spell = SPELL_CATALOG.find((candidate) => candidate.type === spellType);
      const target =
        (action.payload.targetCoord as string) ??
        (action.payload.sourceCoord as string) ??
        '';
      if (spell) {
        this.castExpandedSpell(spell, target, action.payload.sourceCoord as string | undefined);
      }
    }
  }

  /**
   * Drops a piece from reserve onto the board (Shogi, Bughouse, Crazyhouse, Seirawan).
   * Fully integrated with Core State Command architecture for lossless Undo/Redo.
   */
  public dropPiece(pieceVariant: string, targetCoord: string): boolean {
    const domain = gameStore.getState().domain;
    const coordKey = asCoordinateKey(targetCoord);
    if (domain.occupancy[coordKey]) return false;

    this.recordHistorySnapshot('DROP');

    const cmd = new DropPieceCommand(domain.activePlayer, pieceVariant, coordKey);
    gameStore.getState().executeCommand(cmd);

    const mover = domain.activePlayer;
    const toAlg = SANNotationGenerator.coordToAlgebraic(targetCoord);
    const v = pieceVariant.toUpperCase();
    const pieceLetter = v === 'KNIGHT' ? 'N' : v[0];
    const san = `${pieceLetter}@${toAlg}`;
    const ply = this.moveHistory.length + 1;
    const fullmoveNumber = Math.ceil(ply / 2);

    this.recordMoveEntry({
      matchId: domain.matchId,
      ply,
      turnNumber: fullmoveNumber,
      playerId: mover,
      from: 'reserve',
      to: targetCoord,
      pieceId: `drop_${pieceVariant}`,
      pieceVariant,
      isCapture: false,
      san,
      uci: `${pieceLetter}@${toAlg}`,
      clockTimeLeftMs: this.clockManager.getTimeLeftMs(mover),
      actionType: 'DROP',
    });

    const postDomain = gameStore.getState().domain;
    this.lastDomain = postDomain;
    this.clockManager.applyIncrement(mover);
    this.clockManager.setActivePlayer(postDomain.activePlayer);

    GlobalEventBus.emit('PIECE_DROPPED', {
      pieceVariant,
      coordinate: coordKey,
      playerId: mover,
    });

    this.notify();
    this.scheduleAutonomousTurnIfNeeded();
    return true;
  }

  /**
   * Places the rubber duck in Duck Chess Phase 2.
   */
  public placeDuck(targetCoord: string): boolean {
    if (!this.duckState || this.duckState.currentPhase !== 'PLACE_DUCK') {
      return false;
    }

    this.recordHistorySnapshot('DUCK');

    const domain = gameStore.getState().domain;
    const occupied = new Set(
      Object.entries(domain.occupancy)
        .filter(([, entityId]) => entityId !== 'duck_obstacle')
        .map(([coord]) => coord)
    );

    try {
      const mover: PlayerId = this.duckState.activePlayer === 'WHITE' ? 'P1' : 'P2';
      const opponent: PlayerId = mover === 'P1' ? 'P2' : 'P1';

      this.duckState = DuckChessEngine.executePlaceDuck(this.duckState, targetCoord, occupied);
      this.syncVariantModifiersToDomain();

      const duckAlg = SANNotationGenerator.coordToAlgebraic(targetCoord);
      const ply = this.moveHistory.length + 1;
      const fullmoveNumber = Math.ceil(ply / 2);
      this.recordMoveEntry({
        matchId: domain.matchId,
        ply,
        turnNumber: fullmoveNumber,
        playerId: mover,
        from: 'duck',
        to: targetCoord,
        pieceId: 'duck_obstacle',
        pieceVariant: 'DUCK',
        isCapture: false,
        san: `[DUCK:${duckAlg}]`,
        uci: `@${duckAlg}`,
        clockTimeLeftMs: this.clockManager.getTimeLeftMs(mover),
        actionType: 'DUCK',
      });

      // Apply Fischer increment now that the full turn is finished
      this.clockManager.applyIncrement(mover);
      this.clockManager.setActivePlayer(opponent);

      GlobalEventBus.emit('DUCK_PLACED', {
        coordinate: asCoordinateKey(targetCoord),
        playerId: mover,
      });

      this.notify();
      this.scheduleAutonomousTurnIfNeeded();
      return true;
    } catch (err) {
      console.warn('[UniversalMatchController] Duck placement error:', err);
      return false;
    }
  }

  /**
   * Triggered when a human makes a piece move in Duck Chess, Spell Chess, or multiplayer arenas.
   */
  public onHumanPieceMoved(from: string, to: string, pieceId: string, promotionVariant?: string): void {
    this.recordHistorySnapshot('PIECE_MOVE');
    const postMoveDomain = gameStore.getState().domain;
    const movedPlayerSide: 'WHITE' | 'BLACK' = postMoveDomain.activePlayer === 'P2' ? 'WHITE' : 'BLACK';
    const movingPlayerId: PlayerId = postMoveDomain.activePlayer === 'P2' ? 'P1' : 'P2';
    const ply = this.moveHistory.length + 1;
    const fullmoveNumber = Math.ceil(ply / 2);

    const domainBefore = this.lastDomain ?? postMoveDomain;
    const movedEntity = (domainBefore.boardEntities[asEntityId(pieceId)] ?? postMoveDomain.boardEntities[asEntityId(pieceId)]) as IPieceEntity | undefined;
    const fromAlg = SANNotationGenerator.coordToAlgebraic(from);
    const toAlg = SANNotationGenerator.coordToAlgebraic(to);
    const isCastling = (movedEntity?.variantId.toUpperCase() === 'KING') &&
      ((fromAlg === 'e1' && (toAlg === 'g1' || toAlg === 'c1')) || (fromAlg === 'e8' && (toAlg === 'g8' || toAlg === 'c8')));

    const destOccupantBefore = domainBefore.occupancy[asCoordinateKey(to)];
    const isCapture = Boolean(destOccupantBefore && destOccupantBefore !== pieceId);

    const sanResult = SANNotationGenerator.generateSAN({
      from,
      to,
      pieceId,
      domainBefore,
      domainAfter: postMoveDomain,
      topology: this.topology,
      isCapture,
      isCastling,
      promotionVariant,
    });
    const uciResult = SANNotationGenerator.generateUCI(from, to, promotionVariant);

    const moveEntry: IMoveRecord = {
      matchId: postMoveDomain.matchId,
      ply,
      turnNumber: fullmoveNumber,
      playerId: movingPlayerId,
      from,
      to,
      pieceId,
      pieceVariant: movedEntity?.variantId ?? 'UNKNOWN',
      isCapture,
      capturedPieceId: destOccupantBefore ?? null,
      isPromotion: Boolean(promotionVariant),
      promotionVariant,
      isCastling,
      san: sanResult,
      uci: uciResult,
      clockTimeLeftMs: this.clockManager.getTimeLeftMs(movingPlayerId),
      actionType: 'PIECE_MOVE',
    };
    this.recordMoveEntry(moveEntry);
    this.lastDomain = postMoveDomain;

    if (!this.duckState) {
      this.clockManager.applyIncrement(movingPlayerId);
      this.clockManager.setActivePlayer(postMoveDomain.activePlayer);
    }

    this.applySpellEffectsAfterMove(pieceId, to, movedPlayerSide);

    // Three-Check / Five-Check evaluation
    if (this.threeCheckState) {
      const isCheck = CheckValidator.isRoyalInCheck(postMoveDomain.activePlayer, postMoveDomain, this.topology);
      if (isCheck) {
        this.threeCheckState = ThreeCheckTracker.registerCheck(this.threeCheckState, movedPlayerSide);
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            metadata: {
              ...(s.domain as { metadata?: Record<string, unknown> }).metadata,
              threeCheckState: this.threeCheckState,
            },
            isGameOver: this.threeCheckState?.isGameOver || s.domain.isGameOver,
            winnerId: this.threeCheckState?.isGameOver
              ? (this.threeCheckState.winner === 'WHITE' ? 'P1' : 'P2')
              : s.domain.winnerId,
          },
        }));
      }
    }

    // Racing Kings evaluation
    if (this.racingKingsState) {
      const isKing = movedEntity?.type === 'PIECE' && (movedEntity.variantId.toUpperCase() === 'KING' || movedEntity.variantId.toUpperCase() === 'K');
      if (isKing) {
        const destY = Number(to.split(',')[1]);
        this.racingKingsState = RacingKingsValidator.evaluateRaceTurn(this.racingKingsState, movedPlayerSide, destY);
        if (this.racingKingsState.isGameOver) {
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: this.racingKingsState?.winner === 'WHITE' ? 'P1' : this.racingKingsState?.winner === 'BLACK' ? 'P2' : null,
            },
          }));
        }
      }
    }

    // King of the Hill evaluation
    if (this.config.variantId.toUpperCase().includes('HILL')) {
      const p1King = CheckValidator.findRoyalPiece('P1', postMoveDomain);
      const p2King = CheckValidator.findRoyalPiece('P2', postMoveDomain);
      if (p1King && p2King) {
        const hillEval = KingOfTheHillEvaluator.evaluateKingPosition(p1King.position, p2King.position);
        if (hillEval.isGameOver) {
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: hillEval.winner === 'WHITE' ? 'P1' : 'P2',
            },
          }));
        }
      }
    }

    // Spell Chess Royal Capture Victory (Spec 12 / Spec 13)
    if (this.config.variantId.toUpperCase().includes('SPELL')) {
      const p1King = CheckValidator.findRoyalPiece('P1', postMoveDomain);
      const p2King = CheckValidator.findRoyalPiece('P2', postMoveDomain);
      if (!p1King || !p2King) {
        const winner = p1King ? 'P1' : p2King ? 'P2' : null;
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: winner,
          },
        }));
        this.notify();
      }
    }

    if (this.duckState) {
      this.clearAutonomousTimer();
      this.activeBotRequestId = 0;
      try {
        this.duckState = DuckChessEngine.executePieceMove(this.duckState, {
          from,
          to,
          pieceId,
        });
        if (this.duckState.isGameOver) {
          gameStore.setState((s) => ({
            domain: {
              ...s.domain,
              isGameOver: true,
              winnerId: this.duckState?.winner === 'WHITE' ? 'P1' : 'P2',
            },
          }));
        }
        this.notify();
      } catch (err) {
        console.warn('[UniversalMatchController] Duck Chess piece move error:', err);
      }
      return;
    }

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
      this.notify();
      this.scheduleAutonomousTurnIfNeeded();
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
      let center: { file: number; rank: number };
      if (typeof target === 'string') {
        const trimmed = target.trim();
        if (trimmed.includes(',')) {
          const [f, r] = trimmed.split(',').map(Number);
          center = { file: Number.isNaN(f) ? 3 : f, rank: Number.isNaN(r) ? 3 : r };
        } else if (/^[a-j][1-9]\d?$/i.test(trimmed)) {
          center = {
            file: trimmed.toLowerCase().charCodeAt(0) - 97,
            rank: parseInt(trimmed.slice(1), 10) - 1,
          };
        } else {
          center = { file: 3, rank: 3 };
        }
      } else {
        center = target;
      }

      const res = OfficialSpellEngine.castFreeze(this.officialSpellState, player, center);
      if (res.success) {
        this.recordHistorySnapshot('SPELL');
        this.hasCastSpellThisTurn = true;
        this.officialSpellState = res.state;
        this.syncVariantModifiersToDomain();
    this.notify();
        GlobalEventBus.emit('SPELL_CAST', {
          spellType: 'FREEZE',
          coordinate: asCoordinateKey(`${center.file},${center.rank}`),
          playerId: domain.activePlayer,
        });
        this.notify();
        return true;
      }
    } else {
      let pieceId = typeof target === 'string' ? target.trim() : '';
      if (pieceId.includes(',')) {
        pieceId = domain.occupancy[asCoordinateKey(pieceId)] ?? pieceId;
      } else if (/^[a-j][1-9]\d?$/i.test(pieceId)) {
        const file = pieceId.toLowerCase().charCodeAt(0) - 97;
        const rank = parseInt(pieceId.slice(1), 10) - 1;
        pieceId = domain.occupancy[asCoordinateKey(`${file},${rank}`)] ?? pieceId;
      }
      if (!pieceId) {
        return false;
      }
      const res = OfficialSpellEngine.castJump(this.officialSpellState, player, pieceId);
      if (res.success) {
        this.recordHistorySnapshot('SPELL');
        this.hasCastSpellThisTurn = true;
        this.officialSpellState = res.state;
        this.syncVariantModifiersToDomain();
    this.notify();
        GlobalEventBus.emit('SPELL_CAST', {
          spellType: 'JUMP',
          coordinate: asCoordinateKey(typeof target === 'string' ? target : '0,0'),
          playerId: domain.activePlayer,
        });
        this.notify();
        return true;
      }
    }

    return false;
  }

  /**
   * Casts a spell in Expanded Spell Chess.
   */
  public castExpandedSpell(
    spell: ISpellCard,
    targetCoord: string,
    sourceCoord?: string
  ): boolean {
    if (!this.expandedSpellState) return false;
    if (this.hasCastSpellThisTurn) return false;

    const domain = gameStore.getState().domain;
    const player = domain.activePlayer === 'P1' ? 'WHITE' : 'BLACK';
    const normTarget = this.normalizeToGameCoord(targetCoord);
    const normSource = sourceCoord ? this.normalizeToGameCoord(sourceCoord) : undefined;

    try {
      let nextState = this.expandedSpellState;
      if (spell.type === 'FREEZE') {
        const [cf, cr] = normTarget.split(',').map(Number);
        const isCartesian = targetCoord.includes(',');
        const freezeCoords: string[] = [];
        for (let df = -1; df <= 1; df++) {
          for (let dr = -1; dr <= 1; dr++) {
            const f = cf + df;
            const r = cr + dr;
            if (f >= 0 && f < 8 && r >= 0 && r < 8) {
              const c = `${f},${r}`;
              freezeCoords.push(isCartesian ? c : SANNotationGenerator.coordToAlgebraic(c));
            }
          }
        }
        nextState = SpellChessEngine.castFreeze(nextState, player, freezeCoords);
      } else if (spell.type === 'JUMP') {
        const entityId =
          domain.occupancy[asCoordinateKey(normTarget)] ??
          domain.occupancy[asCoordinateKey(targetCoord)] ??
          '';
        if (!entityId) return false;
        nextState = SpellChessEngine.castJump(nextState, player, entityId);
      } else if (spell.type === 'STEALTH_TRAP') {
        if (domain.occupancy[asCoordinateKey(normTarget)]) return false;
        nextState = SpellChessEngine.castStealthTrap(nextState, player, normTarget);
      } else if (spell.type === 'INVISIBILITY') {
        const entityId =
          domain.occupancy[asCoordinateKey(normTarget)] ??
          domain.occupancy[asCoordinateKey(targetCoord)] ??
          '';
        if (!entityId) return false;
        const piece = domain.boardEntities[entityId] as IPieceEntity | undefined;
        if (!piece || piece.ownerId !== domain.activePlayer) return false;
        nextState = SpellChessEngine.castInvisibility(nextState, player, entityId);
      } else if (spell.type === 'MIRROR_SHIELD') {
        const entityId =
          domain.occupancy[asCoordinateKey(normTarget)] ??
          domain.occupancy[asCoordinateKey(targetCoord)] ??
          '';
        if (!entityId) return false;
        const piece = domain.boardEntities[entityId] as IPieceEntity | undefined;
        if (!piece || piece.ownerId !== domain.activePlayer) return false;
        nextState = SpellChessEngine.castMirrorShield(nextState, player, entityId);
      } else if (spell.type === 'PORTAL') {
        const firstCoord = normSource ?? '';
        const destinationCoord = normTarget;
        if (!firstCoord || !destinationCoord || firstCoord === destinationCoord) {
          return false;
        }
        if (
          domain.occupancy[asCoordinateKey(firstCoord)] ||
          domain.occupancy[asCoordinateKey(destinationCoord)]
        ) {
          return false;
        }
        nextState = SpellChessEngine.castPortal(nextState, player, firstCoord, destinationCoord);
      } else if (spell.type === 'RESURRECTION') {
        const capturedFriendly = Object.values(domain.boardEntities).find(
          (e): e is IPieceEntity =>
            e.type === 'PIECE' &&
            e.isCaptured &&
            e.ownerId === domain.activePlayer &&
            e.variantId.toUpperCase() !== 'KING'
        );
        if (!capturedFriendly) return false;
        nextState = SpellChessEngine.castResurrection(nextState, player);
        const backRank = player === 'WHITE' ? 0 : 7;
        let spawnCoord = '';
        if (normTarget) {
          const [, tr] = normTarget.split(',').map(Number);
          if (tr === backRank && !domain.occupancy[asCoordinateKey(normTarget)]) {
            spawnCoord = normTarget;
          }
        }
        if (!spawnCoord) {
          for (let fx = 0; fx < 8; fx++) {
            const candidate = `${fx},${backRank}`;
            if (!domain.occupancy[asCoordinateKey(candidate)]) {
              spawnCoord = candidate;
              break;
            }
          }
        }
        if (!spawnCoord) return false;

        const revivedId = capturedFriendly.id;
        const revivedPiece: IPieceEntity = {
          ...capturedFriendly,
          position: asCoordinateKey(spawnCoord),
          isCaptured: false,
          hasMoved: true,
        };
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            boardEntities: {
              ...s.domain.boardEntities,
              [revivedId]: revivedPiece,
            },
            occupancy: {
              ...s.domain.occupancy,
              [asCoordinateKey(spawnCoord)]: revivedId,
            },
          },
        }));
      }

      this.recordHistorySnapshot('SPELL');
      this.hasCastSpellThisTurn = true;
      this.expandedSpellState = nextState;
      this.syncVariantModifiersToDomain();
      this.notify();
      GlobalEventBus.emit('SPELL_CAST', {
        spellType: spell.type,
        coordinate: asCoordinateKey(normTarget),
        playerId: domain.activePlayer,
      });
      this.notify();
      return true;
    } catch (err) {
      console.warn('[UniversalMatchController] Expanded spell error:', err);
      return false;
    }
  }

  private normalizeToGameCoord(raw: string): string {
    const trimmed = raw.trim();
    if (/^\d+,\d+$/.test(trimmed)) return trimmed;
    if (/^[a-p][1-9]\d?$/i.test(trimmed)) {
      const file = trimmed.toLowerCase().charCodeAt(0) - 97;
      const rank = parseInt(trimmed.slice(1), 10) - 1;
      return `${file},${rank}`;
    }
    return trimmed;
  }

  /**
   * Synchronizes Duck Chess obstacle and Spell Chess frozen squares & piece buffs
   * directly into gameStore.domain so RulesEngine and 2D/3D renderers share a single source of truth.
   */
  private syncVariantModifiersToDomain(): void {
    const s = gameStore.getState();
    const domain = s.domain;
    const nextEntities: Record<string, IEntity> = { ...domain.boardEntities };
    const nextOccupancy: Record<string, ReturnType<typeof asEntityId>> = { ...domain.occupancy };
    const nextTerrain: Record<string, ReturnType<typeof asEntityId>> = {};

    // 1. Remove previous synthetic duck & frozen terrain entities
    for (const [coord, occId] of Object.entries(nextOccupancy)) {
      if (occId === 'duck_obstacle') {
        delete nextOccupancy[coord];
      }
    }
    delete nextEntities['duck_obstacle'];
    for (const key of Object.keys(nextEntities)) {
      if (key.startsWith('frozen_terrain_')) {
        delete nextEntities[key];
      }
    }

    // 2. Sync Duck Chess obstacle
    if (this.duckState?.duckCoordinate) {
      const duckCoord = asCoordinateKey(this.normalizeToGameCoord(this.duckState.duckCoordinate));
      const duckId = asEntityId('duck_obstacle');
      nextEntities[duckId] = {
        id: duckId,
        type: 'OBSTACLE',
        position: duckCoord,
        destructible: false,
        provenance: 'GAMEPLAY',
        metadata: { variantId: 'DUCK' },
      };
      if (!nextOccupancy[duckCoord]) {
        nextOccupancy[duckCoord] = duckId;
      }
    }

    // 3. Collect Frozen Squares (tracked via frozenSet to apply isFrozen to pieces)
    const frozenSet = new Set<string>();
    if (this.officialSpellState) {
      for (const [coord, turns] of Object.entries(this.officialSpellState.activeFrozenCoordinates)) {
        if (turns > 0) frozenSet.add(this.normalizeToGameCoord(coord));
      }
    }
    if (this.expandedSpellState) {
      for (const [coord, turns] of Object.entries(this.expandedSpellState.frozenCoordinates)) {
        if (turns > 0) frozenSet.add(this.normalizeToGameCoord(coord));
      }
    }

    // 4. Sync Piece Buffs (hasJump, isFrozen, isShielded, isInvisible)
    const jumpSet = new Set<string>();
    if (this.officialSpellState) {
      for (const [pid, turns] of Object.entries(this.officialSpellState.activeJumpPieceIds)) {
        if (turns > 0) jumpSet.add(pid);
      }
    }
    if (this.expandedSpellState) {
      for (const [pid, turns] of Object.entries(this.expandedSpellState.jumpPieces)) {
        if (turns > 0) jumpSet.add(pid);
      }
    }
    const shieldSet = new Set<string>(
      this.expandedSpellState
        ? Object.entries(this.expandedSpellState.shieldedPieces)
            .filter(([, turns]) => turns > 0)
            .map(([pid]) => pid)
        : []
    );
    const invisibleSet = new Set<string>(this.expandedSpellState?.invisiblePieces ?? []);

    for (const [id, entity] of Object.entries(nextEntities)) {
      if (entity && entity.type === 'PIECE') {
        const piece = entity as IPieceEntity;
        const isFrozen = frozenSet.has(piece.position);
        const hasJump = jumpSet.has(piece.id);
        const isShielded = shieldSet.has(piece.id);
        const isInvisible = invisibleSet.has(piece.id);
        nextEntities[id] = {
          ...piece,
          metadata: {
            ...(piece.metadata ?? {}),
            isFrozen,
            hasJump,
            canBeJumpedOver: hasJump,
            isShielded,
            isInvisible,
          },
        };
      }
    }

    const nextMetadata = {
      ...(domain.metadata ?? {}),
      officialSpellState: this.officialSpellState
        ? JSON.parse(JSON.stringify(this.officialSpellState))
        : null,
      expandedSpellState: this.expandedSpellState
        ? JSON.parse(JSON.stringify(this.expandedSpellState))
        : null,
    };

    gameStore.setState((prev) => ({
      domain: {
        ...prev.domain,
        boardEntities: nextEntities as typeof prev.domain.boardEntities,
        occupancy: nextOccupancy,
        terrain: nextTerrain,
        metadata: nextMetadata,
      },
    }));
  }

  /**
   * Resolves post-move Spell Chess interactions:
   * - Consumes Jump charge on moved piece
   * - Triggers Stealth Trap detonation if opponent stepped onto a trap
   * - Teleports piece through linked Portal if destination is vacant
   * - Advances turn cooldowns and mana economy
   */
  private applySpellEffectsAfterMove(
    movedPieceId: string,
    toCoordRaw: string,
    movingPlayer: 'WHITE' | 'BLACK'
  ): void {
    if (!this.officialSpellState && !this.expandedSpellState) return;

    const toCoord = this.normalizeToGameCoord(toCoordRaw);
    this.hasCastSpellThisTurn = false;

    if (this.officialSpellState) {
      const nextJumps = { ...this.officialSpellState.activeJumpPieceIds };
      delete nextJumps[movedPieceId];
      this.officialSpellState = OfficialSpellEngine.advanceTurn(
        {
          ...this.officialSpellState,
          activeJumpPieceIds: nextJumps,
        },
        movingPlayer
      );
    }

    if (this.expandedSpellState) {
      let state = this.expandedSpellState;

      // 1. Stealth Trap check
      const trapRes = SpellChessEngine.resolveTrapTrigger(state, toCoord, movingPlayer);
      state = trapRes.updatedState;

      if (trapRes.detonated) {
        const domain = gameStore.getState().domain;
        const piece = domain.boardEntities[asEntityId(movedPieceId)] as IPieceEntity | undefined;
        if (piece && !piece.metadata?.isShielded) {
          const nextOcc = { ...domain.occupancy };
          delete nextOcc[asCoordinateKey(toCoord)];
          gameStore.setState((prev) => ({
            domain: {
              ...prev.domain,
              boardEntities: {
                ...prev.domain.boardEntities,
                [asEntityId(movedPieceId)]: {
                  ...piece,
                  isCaptured: true,
                },
              },
              occupancy: nextOcc,
            },
          }));
        }
      } else {
        // 2. Dimensional Portal check
        const portalDest = SpellChessEngine.resolvePortalDestination(state, toCoord);
        if (portalDest) {
          const normDest = this.normalizeToGameCoord(portalDest);
          const domain = gameStore.getState().domain;
          const destKey = asCoordinateKey(normDest);
          const srcKey = asCoordinateKey(toCoord);
          const piece = domain.boardEntities[asEntityId(movedPieceId)] as IPieceEntity | undefined;
          if (piece && !piece.isCaptured && !domain.occupancy[destKey]) {
            const nextOcc = { ...domain.occupancy };
            delete nextOcc[srcKey];
            nextOcc[destKey] = asEntityId(movedPieceId);
            gameStore.setState((prev) => ({
              domain: {
                ...prev.domain,
                boardEntities: {
                  ...prev.domain.boardEntities,
                  [asEntityId(movedPieceId)]: {
                    ...piece,
                    position: destKey,
                  },
                },
                occupancy: nextOcc,
              },
            }));
          }
        }
      }

      // 3. Advance turn mana (+1 up to 6) and tick durations
      const nextActive: 'WHITE' | 'BLACK' = movingPlayer === 'WHITE' ? 'BLACK' : 'WHITE';
      this.expandedSpellState = SpellChessEngine.advanceTurn(state, nextActive);
    }

    this.syncVariantModifiersToDomain();
    this.notify();
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
        if (VariantMapConfig.isVoidSquare(this.config.variantId, x, y, size)) {
          continue;
        }
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
    const clamped = Math.max(1, Math.min(12, num));
    return `P${clamped}` as PlayerId;
  }

  public dispose(): void {
    this.isDisposedFlag = true;
    this.matchGeneration++;
    this.activeBotRequestId = 0;
    this.clearAutonomousTimer();
    this.stopClockTicking();
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = null;
    }
    this.listeners.clear();
  }
}

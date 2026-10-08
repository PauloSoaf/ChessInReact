import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity } from '../entities/types';

/**
 * Pure Domain State: represents authoritative match state.
 * Fully deterministic, serializable, and decoupled from UI transient variables.
 */
export interface IDomainState {
  readonly matchId: string;
  readonly variantId: string;
  readonly isGameOver: boolean;
  readonly winnerId: PlayerId | null;
  readonly activePlayer: PlayerId;
  readonly turnNumber: number;
  readonly revision: number;

  /**
   * Dual spatial storage structures for O(1) expected lookup:
   * entityById and occupancyByCoordinate.
   */
  readonly boardEntities: Record<EntityId, IEntity>;
  readonly occupancy: Record<CoordinateKey, EntityId>;

  /**
   * Crazyhouse / capture inventory.
   */
  readonly capturedInventory: Record<PlayerId, string[]>;

  /**
   * Turn metadata.
   */
  readonly turnState: {
    readonly phase: 'WAITING' | 'COMMIT' | 'RESOLUTION';
    readonly lastActionTimestamp: number;
    readonly enPassantTarget: CoordinateKey | null;
    readonly fiftyMoveCounter: number;
  };
}

/**
 * UI / Presentation State: transient visual states that do not pollute
 * snapshots, determinism, or network payloads.
 */
export interface IPresentationUIState {
  readonly selectedPieceId: EntityId | null;
  readonly highlightedCoords: readonly CoordinateKey[];
  readonly hoveredCoord: CoordinateKey | null;
  readonly visibilityWindow: {
    readonly qMin: number;
    readonly qMax: number;
    readonly rMin: number;
    readonly rMax: number;
  };
}

/**
 * Complete Game State aggregating Domain State and UI State.
 */
export interface IGameState {
  readonly domain: IDomainState;
  readonly ui: IPresentationUIState;
}

/**
 * Minimal command representation for store dispatcher.
 */
export interface IStoreCommand {
  execute(draft: IDomainState): void;
  undo(draft: IDomainState): void;
  readonly description?: string;
}

/**
 * Action contracts exposed by the Store.
 */
export interface IGameActions {
  // Domain actions
  executeCommand(command: IStoreCommand): void;
  syncDomainState(newDomainState: IDomainState): void;
  resetDomainState(initialDomain: IDomainState): void;
  setGameStatus(isGameOver: boolean, winnerId?: PlayerId | null): void;
  setActivePlayer(player: PlayerId): void;

  // UI / Presentation actions
  selectPiece(pieceId: EntityId | null): void;
  setHighlights(coords: readonly CoordinateKey[]): void;
  setHoveredCoord(coord: CoordinateKey | null): void;
  setVisibilityWindow(window: IPresentationUIState['visibilityWindow']): void;
  resetUIState(): void;
}

export type IGameStore = IGameState & IGameActions;

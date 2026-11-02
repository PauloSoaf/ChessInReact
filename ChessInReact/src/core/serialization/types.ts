import { PlayerId } from '../coordinates/types';
import { IDomainState } from '../state/gameState';

/**
 * Snapshot contracts:
 * 1. DomainSnapshot: In-memory structured representation of the full game state.
 * 2. PersistenceSnapshot: Lossless JSON string representing the full match history and state.
 * 3. WorkerSnapshot: Compact, contiguous Int32Array buffer with an immutable stringTable sidecar
 *    and auxiliary metadata for zero-copy Worker transfer and 100% lossless state restoration.
 */
export type DomainSnapshot = IDomainState;
export type PersistenceSnapshot = string;

export interface IWorkerStateMetadata {
  readonly matchId?: string;
  readonly variantId?: string;
  readonly isGameOver?: boolean;
  readonly winnerId?: PlayerId | null;
  readonly revision?: number;
  readonly capturedInventory?: Record<PlayerId, readonly string[]>;
  readonly turnState?: {
    readonly phase?: 'WAITING' | 'COMMIT' | 'RESOLUTION';
    readonly lastActionTimestamp?: number;
    readonly enPassantTarget?: string | null;
    readonly fiftyMoveCounter?: number;
    readonly positionHistory?: readonly string[];
  };
}

export interface WorkerSnapshot {
  readonly buffer: Int32Array;
  readonly stringTable: readonly string[];
  readonly metadata?: IWorkerStateMetadata;
}

/**
 * Binary protocol layout constants for worker flat array serialization.
 */
export const BINARY_SCHEMA_VERSION_V1 = 1;
export const BINARY_SCHEMA_VERSION_V2 = 2;
export const BINARY_SCHEMA_VERSION = BINARY_SCHEMA_VERSION_V1;

/**
 * Header layout in Int32Array:
 * V1 Header: 4 integers (16 bytes).
 * V2 Header: 8 integers (32 bytes) incorporating enPassant, fiftyMoveCounter, and gameOver.
 */
export const HEADER_SIZE_INTS_V1 = 4;
export const HEADER_SIZE_INTS_V2 = 8;
export const HEADER_SIZE_INTS = HEADER_SIZE_INTS_V1;

export enum HeaderOffset {
  SCHEMA_VERSION = 0,
  ENTITY_COUNT = 1,
  ACTIVE_PLAYER = 2,
  TURN_NUMBER = 3,
  // Extended V2 Header fields:
  FIFTY_MOVE_COUNTER = 4,
  GAME_OVER_AND_WINNER = 5, // Packed: [isGameOver: 1 bit | winnerPlayerId: 4 bits]
  EN_PASSANT_X = 6,         // En passant target coordinate X (or -999999 if null)
  EN_PASSANT_Y = 7,         // En passant target coordinate Y (or -999999 if null)
}

/**
 * Per-entity binary record layout: 5 integers (20 bytes per entity).
 * Stride = 5.
 */
export const ENTITY_STRIDE_INTS = 5;

export enum EntityFieldOffset {
  TYPE_OWNER_FLAGS_VARIANT = 0, // Packed 32-bit: [Type: 4 bits | Owner: 4 bits | Flags: 8 bits | Variant: 16 bits]
  X_OR_Q = 1,                   // Signed 32-bit integer coordinate
  Y_OR_R = 2,                   // Signed 32-bit integer coordinate
  Z_OR_S = 3,                   // Signed 32-bit integer coordinate
  ID_STRING_INDEX = 4,          // Integer index into stringTable sidecar (lossless, zero-collision)
}

export enum EntityTypeBinary {
  UNKNOWN = 0,
  PIECE = 1,
  TERRAIN = 2,
  OBSTACLE = 3,
}

export enum PlayerBinary {
  NONE = 0,
  P1 = 1,
  P2 = 2,
  P3 = 3,
  P4 = 4,
  P5 = 5,
  P6 = 6,
  P7 = 7,
  P8 = 8,
}

export type CoordinateKind = 'SQUARE' | 'HEX_CUBIC';

export enum EntityFlagsBinary {
  NONE = 0,
  HAS_MOVED = 1 << 0,
  IS_CAPTURED = 1 << 1,
  IS_HEX_COORDINATE = 1 << 2,
}

export enum VariantBinary {
  UNKNOWN = 0,
  PAWN = 1,
  KNIGHT = 2,
  BISHOP = 3,
  ROOK = 4,
  QUEEN = 5,
  KING = 6,
  MOUNTAIN = 10,
  WATER = 11,
  PLAINS = 12,
  FOREST = 13,
  CHASM = 14,
  OBSTACLE_WALL = 20,
}

export interface DeserializedWorkerState {
  readonly schemaVersion: number;
  readonly entityCount: number;
  readonly activePlayer: PlayerId;
  readonly turnNumber: number;
  readonly fiftyMoveCounter?: number;
  readonly isGameOver?: boolean;
  readonly winnerId?: PlayerId | null;
  readonly enPassantTarget?: string | null;
  readonly metadata?: IWorkerStateMetadata;
  readonly entities: readonly {
    readonly id: string;
    readonly type: 'PIECE' | 'TERRAIN' | 'OBSTACLE';
    readonly ownerId: PlayerId;
    readonly variantId: string;
    readonly kind: CoordinateKind;
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly hasMoved: boolean;
    readonly isCaptured: boolean;
  }[];
}


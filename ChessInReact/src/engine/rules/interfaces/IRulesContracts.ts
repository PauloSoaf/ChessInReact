import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';

/**
 * Standard chess and fairy piece types.
 */
export type StandardPieceType = 'PAWN' | 'KNIGHT' | 'BISHOP' | 'ROOK' | 'QUEEN' | 'KING';
export type FairyPieceType =
  | 'AMAZON' // Queen + Knight
  | 'CHANCELLOR' // Rook + Knight (Marshall)
  | 'ARCHBISHOP' // Bishop + Knight (Cardinal / Paladin)
  | 'WAZIR' // 1 step orthogonal
  | 'FERZ' // 1 step diagonal
  | 'CAMEL' // (3,1) leaper
  | 'ZEBRA' // (3,2) leaper
  | 'GRASSHOPPER' // Queen hopper
  | 'NIGHTRIDER' // Knight slider
  | string;

export type PieceVariantId = StandardPieceType | FairyPieceType;

/**
 * Movement intent requested by player or bot.
 */
export interface IMoveIntent {
  readonly pieceId: EntityId;
  readonly from: CoordinateKey;
  readonly to: CoordinateKey;
  readonly actingPlayer: PlayerId;
  readonly promotionVariant?: PieceVariantId;
  readonly isDrop?: boolean;
}

/**
 * Structured rejection reasons for invalid moves.
 */
export type MoveRejectionCode =
  | 'ENTITY_NOT_FOUND'
  | 'NOT_A_PIECE'
  | 'PIECE_IS_CAPTURED'
  | 'NOT_PLAYER_PIECE'
  | 'NOT_PLAYER_TURN'
  | 'ORIGIN_MISMATCH'
  | 'ORIGIN_EQUALS_DESTINATION'
  | 'DESTINATION_OUT_OF_BOUNDS'
  | 'DESTINATION_FRIENDLY_OCCUPIED'
  | 'DESTINATION_IMPASSABLE'
  | 'GEOMETRICALLY_INVALID'
  | 'PATH_OBSTRUCTED'
  | 'KING_IN_CHECK'
  | 'LEAVES_KING_IN_CHECK'
  | 'CANNOT_CASTLE_THROUGH_CHECK'
  | 'CANNOT_CASTLE_PIECES_MOVED'
  | 'CANNOT_CASTLE_PATH_OCCUPIED'
  | 'INVALID_EN_PASSANT'
  | 'INVALID_PROMOTION'
  | 'FORCED_CAPTURE_AVAILABLE'
  | 'ILLEGAL_DROP'
  | 'UNKNOWN_REJECTION';

/**
 * Validation result with full diagnostic feedback.
 */
export interface IValidationResult {
  readonly valid: boolean;
  readonly code?: MoveRejectionCode;
  readonly reason?: string;
  readonly isCapture?: boolean;
  readonly capturedPieceId?: EntityId;
  readonly isCastling?: 'KINGSIDE' | 'QUEENSIDE';
  readonly isEnPassant?: boolean;
  readonly isPromotion?: boolean;
  readonly isDrop?: boolean;
}

/**
 * Fully qualified legal move descriptor with potential side-effects.
 */
export interface ILegalMove {
  readonly pieceId: EntityId;
  readonly from: CoordinateKey;
  readonly to: CoordinateKey;
  readonly isCapture: boolean;
  readonly capturedPieceId?: EntityId;
  readonly isCastling?: 'KINGSIDE' | 'QUEENSIDE';
  readonly isEnPassant?: boolean;
  readonly isPromotion?: boolean;
  readonly promotionOptions?: PieceVariantId[];
  readonly isDrop?: boolean;
}

/**
 * Game outcome enumeration.
 */
export type GameTerminationStatus =
  | 'IN_PROGRESS'
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'RESIGNATION'
  | 'TIMEOUT'
  | 'INSUFFICIENT_MATERIAL'
  | 'THREEFOLD_REPETITION'
  | 'FIVEFOLD_REPETITION'
  | 'FIFTY_MOVE_RULE'
  | 'SEVENTYFIVE_MOVE_RULE'
  | 'HILL_CONTROLLED' // King of the Hill
  | 'ALL_PIECES_LOST' // Antichess
  | 'MUTUAL_DRAW_AGREEMENT';

/**
 * Result of game termination detection.
 */
export interface IGameResult {
  readonly isGameOver: boolean;
  readonly status: GameTerminationStatus;
  readonly winnerId: PlayerId | null;
  readonly reason?: string;
}

/**
 * Elementary step vector relative to orientation or topology.
 */
export interface IStepVector {
  readonly dx: number;
  readonly dy: number;
  readonly maxSteps?: number; // 1 for leaper/single step, Infinity for slider
  readonly canMove?: boolean; // false for capture-only (e.g. pawn diagonals)
  readonly canCapture?: boolean; // false for move-only (e.g. pawn forward)
  readonly isHopper?: boolean; // true for grasshopper, cannon
}

/**
 * Directional filter for Betza prefixes.
 */
export type BetzaDirectionPrefix =
  | 'f' // forward
  | 'b' // backward
  | 'r' // right
  | 'l' // left
  | 's' // sideways (left or right)
  | 'v' // vertical (forward or backward)
  | 'm' // move only (no capture)
  | 'c' // capture only (no move)
  | 'p'; // hopper

/**
 * Configuration options for variants.
 */
export interface IVariantConfiguration {
  readonly variantId: string;
  readonly enforceCheck?: boolean; // false for Antichess
  readonly allowDrops?: boolean; // true for Crazyhouse
  readonly captureExplosion?: boolean; // true for Atomic
  readonly hillCenterCoords?: readonly CoordinateKey[]; // King of the Hill
  readonly claimableDrawRules?: boolean; // true if 3-fold / 50-move are claimable rather than immediate
  readonly nPlayerEliminationPolicy?: 'NEUTRALIZE' | 'REMOVE' | 'TRANSFER';
}

/**
 * Piece movement specification produced by Betza parser or JSON registry.
 */
export interface IPieceDefinition {
  readonly variantId: PieceVariantId;
  readonly betzaNotation?: string;
  readonly vectors: readonly IStepVector[];
  readonly isRoyal?: boolean;
}

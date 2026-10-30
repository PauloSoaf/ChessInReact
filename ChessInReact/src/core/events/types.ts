import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';

/**
 * Strongly typed game domain event types.
 */
export type GameEventType =
  | 'PIECE_MOVED'
  | 'PIECE_CAPTURED'
  | 'CHECK_TRIGGERED'
  | 'MATE_TRIGGERED'
  | 'TURN_CHANGED'
  | 'GAME_ENDED'
  | 'EXPLOSION'
  | 'TIME_WARNING'
  | 'AI_EVALUATION_READY'
  | 'AI_SEARCH_PROGRESS';

/**
 * Payloads associated with each domain event type.
 */
export interface IGameEventPayload {
  PIECE_MOVED: {
    readonly pieceId: EntityId;
    readonly from: CoordinateKey;
    readonly to: CoordinateKey;
    readonly actingPlayer: PlayerId;
  };
  PIECE_CAPTURED: {
    readonly capturedId: EntityId;
    readonly captorId: EntityId;
    readonly coordinate: CoordinateKey;
    readonly variantId: string;
  };
  CHECK_TRIGGERED: {
    readonly kingId: EntityId;
    readonly attackerIds: readonly EntityId[];
  };
  MATE_TRIGGERED: {
    readonly loserId: PlayerId;
    readonly winnerId: PlayerId;
  };
  TURN_CHANGED: {
    readonly turnNumber: number;
    readonly activePlayer: PlayerId;
  };
  GAME_ENDED: {
    readonly winnerId: PlayerId | null;
    readonly reason: string;
  };
  EXPLOSION: {
    readonly epicenter: CoordinateKey;
    readonly radius: number;
    readonly destroyedIds: readonly EntityId[];
  };
  TIME_WARNING: {
    readonly playerId: PlayerId;
    readonly secondsLeft: number;
  };
  AI_EVALUATION_READY: {
    readonly bestMove: {
      readonly fromCoord: CoordinateKey;
      readonly toCoord: CoordinateKey;
      readonly pieceId: EntityId;
    } | null;
    readonly evaluationScore: number;
    readonly depthReached: number;
    readonly pvLine: readonly string[];
  };
  AI_SEARCH_PROGRESS: {
    readonly depthReached: number;
    readonly nps: number;
    readonly currentBestMove?: {
      readonly fromCoord: CoordinateKey;
      readonly toCoord: CoordinateKey;
      readonly pieceId: EntityId;
    };
  };
}

export type EventCallback<T extends GameEventType> = (
  payload: IGameEventPayload[T]
) => void;

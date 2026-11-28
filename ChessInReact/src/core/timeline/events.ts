/** Persisted game events (PATCH-16/17). One event per committed action, in order. */
import { PlayerId } from '../coordinates';
import { IMatchConfiguration } from '../../matchmaking/config/IMatchConfiguration';
import { ISessionDelta, ISessionState } from './sessionState';

export const EVENT_SCHEMA_VERSION = 1;

export type MatchEndReason =
  | 'CHECKMATE_OR_RULES' | 'KING_CAPTURE' | 'DRAW_BY_RULES' | 'DRAW_AGREED' | 'RESIGNATION' | 'TIMEOUT';

/** The move as shown in the history; search diagnostics are reduced to a short summary. */
export interface ITimelineMove {
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
  readonly san: string;
  readonly uci: string;
  readonly clockTimeLeftMs?: number;
  readonly actionType: 'PIECE_MOVE' | 'SPELL' | 'DUCK' | 'DROP' | 'BOT_MOVE';
  readonly evalCp?: number;
  readonly engine?: { readonly strategy: string; readonly depth: number; readonly nodes: number; readonly fallback: boolean };
}

export interface ISpellPayload {
  readonly spell: { readonly type: string; readonly targetSquare: string };
  readonly chargesBefore: number | null;
  readonly chargesAfter: number | null;
  readonly cooldownBefore: number | null;
  readonly cooldownAfter: number | null;
  /** Half-turns the effect remains active, counting the caster's own move. */
  readonly durationHalfTurns: number;
  readonly rules: string;
}

interface IEventBase {
  /** Stable and idempotent: the same action can never be stored twice. */
  readonly id: string;
  readonly matchId: string;
  readonly sequence: number;
  /** Number of completed moves after this event. */
  readonly ply: number;
  readonly turnNumber: number;
  readonly playerId: PlayerId;
  readonly occurredAt: string;
  readonly engineVersion: string;
  readonly clocks: Readonly<Record<string, number>>;
  readonly checksum: string;
}

export type GameEvent = IEventBase & (
  | { readonly type: 'MATCH_STARTED'; readonly payload: { readonly config: IMatchConfiguration; readonly initialState: ISessionState } }
  | { readonly type: 'SPELL_CAST'; readonly payload: ISpellPayload; readonly delta: ISessionDelta }
  | { readonly type: 'PIECE_MOVED' | 'PIECE_DROPPED' | 'DUCK_PLACED'; readonly payload: { readonly move: ITimelineMove }; readonly delta: ISessionDelta }
  | { readonly type: 'TURN_COMPLETED'; readonly payload: Record<string, never>; readonly delta: ISessionDelta }
  | { readonly type: 'TIMELINE_REWOUND'; readonly payload: { readonly moves: ITimelineMove[] }; readonly delta: ISessionDelta }
  | { readonly type: 'MATCH_ENDED'; readonly payload: { readonly winnerId: PlayerId | null; readonly reason: MatchEndReason }; readonly delta: ISessionDelta }
);

export type GameEventType = GameEvent['type'];

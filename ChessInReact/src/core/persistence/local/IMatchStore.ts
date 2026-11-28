import { PlayerId } from '../../coordinates';
import { IMatchConfiguration } from '../../../matchmaking/config/IMatchConfiguration';
import { GameEvent, MatchEndReason } from '../../timeline/events';

export type StoredMatchStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABORTED' | 'INTERRUPTED';

/** Everything the history list needs, without loading any event. */
export interface IStoredMatch {
  readonly matchId: string;
  readonly ownerUserId: string;
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly variantId: string;
  readonly status: StoredMatchStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly endedAt?: string;
  readonly winnerId?: PlayerId | null;
  readonly endReason?: MatchEndReason;
  readonly lastSequence: number;
  readonly lastPly: number;
  readonly config: IMatchConfiguration;
  readonly humanPlayer: PlayerId | null;
  readonly opponentLabel: string;
  readonly clocks: Readonly<Record<string, number>>;
  readonly visibility: 'PRIVATE';
}

/** Another writer stored a different history. Nothing was overwritten. */
export class StoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreConflictError';
  }
}

export interface IMatchStore {
  /** Atomically stores one event and the updated summary. Idempotent per event id. */
  append(match: IStoredMatch, event: GameEvent): Promise<'STORED' | 'DUPLICATE'>;
  /** Refreshes the clocks only if the stored history is still at `expectedSequence`. */
  updateClocks(matchId: string, clocks: Readonly<Record<string, number>>, expectedSequence: number): Promise<void>;
  get(matchId: string): Promise<IStoredMatch | undefined>;
  events(matchId: string): Promise<GameEvent[]>;
  /** Newest first. */
  list(ownerUserId: string, limit: number, offset?: number): Promise<IStoredMatch[]>;
  /** Inserts a complete match, failing if the id already exists. */
  insert(match: IStoredMatch, events: readonly GameEvent[]): Promise<void>;
  delete(matchId: string): Promise<void>;
}

/** Shared ordering rule: returns what to do with `event` given what is already stored. */
export function classifyAppend(
  stored: IStoredMatch | undefined, existing: GameEvent | undefined, event: GameEvent,
): 'STORE' | 'DUPLICATE' {
  if (existing) {
    if (existing.id === event.id && existing.checksum === event.checksum && existing.occurredAt === event.occurredAt) {
      return 'DUPLICATE';
    }
    throw new StoreConflictError(`Sequence ${event.sequence} of ${event.matchId} already holds different data.`);
  }
  const expected = stored ? stored.lastSequence + 1 : 0;
  if (event.sequence !== expected) {
    throw new StoreConflictError(`Expected sequence ${expected} for ${event.matchId}, received ${event.sequence}.`);
  }
  return 'STORE';
}

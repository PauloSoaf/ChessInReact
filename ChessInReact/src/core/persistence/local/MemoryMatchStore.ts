/** Non-durable store with the same ordering rules; used by tests and when IndexedDB is absent. */
import { GameEvent } from '../../timeline/events';
import { IMatchStore, IStoredMatch, StoreConflictError, classifyAppend } from './IMatchStore';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemoryMatchStore implements IMatchStore {
  private readonly matches = new Map<string, IStoredMatch>();
  private readonly log = new Map<string, GameEvent[]>();

  async append(match: IStoredMatch, event: GameEvent): Promise<'STORED' | 'DUPLICATE'> {
    const list = this.log.get(event.matchId) ?? [];
    if (classifyAppend(this.matches.get(event.matchId), list[event.sequence], event) === 'DUPLICATE') return 'DUPLICATE';
    list[event.sequence] = copy(event);
    this.log.set(event.matchId, list);
    this.matches.set(match.matchId, copy(match));
    return 'STORED';
  }

  async updateClocks(matchId: string, clocks: Readonly<Record<string, number>>, expectedSequence: number): Promise<void> {
    const match = this.matches.get(matchId);
    if (match && match.lastSequence === expectedSequence) this.matches.set(matchId, { ...match, clocks: { ...clocks } });
  }

  async get(matchId: string): Promise<IStoredMatch | undefined> {
    const match = this.matches.get(matchId);
    return match ? copy(match) : undefined;
  }

  async events(matchId: string): Promise<GameEvent[]> {
    return copy(this.log.get(matchId) ?? []);
  }

  async list(ownerUserId: string, limit: number, offset = 0): Promise<IStoredMatch[]> {
    return copy([...this.matches.values()].filter((m) => m.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(offset, offset + limit));
  }

  async insert(match: IStoredMatch, events: readonly GameEvent[]): Promise<void> {
    if (this.matches.has(match.matchId)) throw new StoreConflictError(`Match ${match.matchId} already exists.`);
    this.matches.set(match.matchId, copy(match));
    this.log.set(match.matchId, copy([...events]));
  }

  async delete(matchId: string): Promise<void> {
    this.matches.delete(matchId);
    this.log.delete(matchId);
  }
}

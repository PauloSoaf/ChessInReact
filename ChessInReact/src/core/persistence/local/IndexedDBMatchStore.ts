/**
 * Durable local storage of matches. A write resolves only after its transaction commits, so
 * "saved on this device" is never reported early. Upgrades only add structures.
 */
import { GameEvent } from '../../timeline/events';
import { IMatchStore, IStoredMatch, StoreConflictError, classifyAppend } from './IMatchStore';

export const MATCH_DB_NAME = 'chessinreact-matches';
const DB_VERSION = 1;
const MATCHES = 'matches';
const EVENTS = 'events';

const request = <T>(r: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export class IndexedDBMatchStore implements IMatchStore {
  private database: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory = indexedDB, private readonly name = MATCH_DB_NAME) {}

  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const opening = this.factory.open(this.name, DB_VERSION);
      opening.onupgradeneeded = () => {
        const db = opening.result;
        if (!db.objectStoreNames.contains(MATCHES)) {
          db.createObjectStore(MATCHES, { keyPath: 'matchId' })
            .createIndex('byOwner', ['ownerUserId', 'updatedAt']);
        }
        if (!db.objectStoreNames.contains(EVENTS)) {
          db.createObjectStore(EVENTS, { keyPath: ['matchId', 'sequence'] });
        }
      };
      opening.onsuccess = () => {
        // A newer tab upgrading the schema must not be blocked by this one.
        opening.result.onversionchange = () => { opening.result.close(); this.database = null; };
        resolve(opening.result);
      };
      opening.onerror = () => { this.database = null; reject(opening.error); };
    });
    return this.database;
  }

  /** Runs `work` in one transaction and resolves after the commit. */
  private async transact<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const tx = (await this.open()).transaction([MATCHES, EVENTS], mode);
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'));
    });
    committed.catch(() => undefined);
    let result: T;
    try {
      result = await work(tx);
    } catch (error) {
      try { tx.abort(); } catch { /* already finished */ }
      throw error;
    }
    await committed;
    return result;
  }

  append(match: IStoredMatch, event: GameEvent): Promise<'STORED' | 'DUPLICATE'> {
    return this.transact('readwrite', async (tx) => {
      const [stored, existing] = await Promise.all([
        request<IStoredMatch | undefined>(tx.objectStore(MATCHES).get(event.matchId)),
        request<GameEvent | undefined>(tx.objectStore(EVENTS).get([event.matchId, event.sequence])),
      ]);
      if (classifyAppend(stored, existing, event) === 'DUPLICATE') return 'DUPLICATE';
      tx.objectStore(EVENTS).add(event);
      tx.objectStore(MATCHES).put(match);
      return 'STORED';
    });
  }

  updateClocks(matchId: string, clocks: Readonly<Record<string, number>>, expectedSequence: number): Promise<void> {
    return this.transact('readwrite', async (tx) => {
      const match = await request<IStoredMatch | undefined>(tx.objectStore(MATCHES).get(matchId));
      if (match && match.lastSequence === expectedSequence) tx.objectStore(MATCHES).put({ ...match, clocks: { ...clocks } });
    });
  }

  get(matchId: string): Promise<IStoredMatch | undefined> {
    return this.transact('readonly', (tx) => request<IStoredMatch | undefined>(tx.objectStore(MATCHES).get(matchId)));
  }

  events(matchId: string): Promise<GameEvent[]> {
    return this.transact('readonly', (tx) => request<GameEvent[]>(
      tx.objectStore(EVENTS).getAll(IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]))));
  }

  list(ownerUserId: string, limit: number, offset = 0): Promise<IStoredMatch[]> {
    return this.transact('readonly', (tx) => new Promise((resolve, reject) => {
      const range = IDBKeyRange.bound([ownerUserId, ''], [ownerUserId, '￿']);
      const cursor = tx.objectStore(MATCHES).index('byOwner').openCursor(range, 'prev');
      const found: IStoredMatch[] = [];
      let skip = offset;
      cursor.onerror = () => reject(cursor.error);
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (!current || found.length >= limit) { resolve(found); return; }
        if (skip > 0) { skip--; } else { found.push(current.value as IStoredMatch); }
        current.continue();
      };
    }));
  }

  insert(match: IStoredMatch, events: readonly GameEvent[]): Promise<void> {
    return this.transact('readwrite', async (tx) => {
      if (await request(tx.objectStore(MATCHES).get(match.matchId))) {
        throw new StoreConflictError(`Match ${match.matchId} already exists.`);
      }
      tx.objectStore(MATCHES).add(match);
      for (const event of events) tx.objectStore(EVENTS).add(event);
    });
  }

  delete(matchId: string): Promise<void> {
    return this.transact('readwrite', async (tx) => {
      tx.objectStore(MATCHES).delete(matchId);
      tx.objectStore(EVENTS).delete(IDBKeyRange.bound([matchId, 0], [matchId, Number.MAX_SAFE_INTEGER]));
    });
  }
}

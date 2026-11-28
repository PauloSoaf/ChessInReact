/**
 * Saves every committed game event as it happens: strictly ordered, retried with backoff and
 * never overwriting a history that another writer extended.
 */
import { PlayerId } from '../coordinates';
import { GameEvent, EVENT_SCHEMA_VERSION } from '../timeline/events';
import { JournalListener } from '../timeline/MatchJournal';
import { IMatchConfiguration } from '../../matchmaking/config/IMatchConfiguration';
import { isBotRole, playerIdOfSlot, singleLocalHuman } from '../../matchmaking/config/participants';
import { IMatchStore, IStoredMatch, StoreConflictError } from './local/IMatchStore';

export type SaveStatus = 'IDLE' | 'SAVING' | 'LOCAL_SAVED' | 'ERROR' | 'CONFLICT' | 'UNAVAILABLE';

/** No backend is configured in this project, so nothing is ever reported as cloud-synced. */
export const CLOUD_BACKUP_AVAILABLE = false;

export const ACTIVE_MATCH_KEY = 'chessinreact:active-match';
const RETRY_DELAYS_MS = [500, 1000, 2000, 5000, 15000, 30000];

/** Grants this tab the right to write a match. Resolves false when another tab holds it. */
export type MatchLock = (matchId: string) => Promise<false | (() => void)>;

export const webLock: MatchLock = (matchId) => {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return Promise.resolve(() => undefined); // the store still rejects divergent writes
  return new Promise((resolve) => {
    void locks.request(`chessinreact-match-${matchId}`, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(false); return undefined; }
      return new Promise<void>((release) => resolve(() => release()));
    });
  });
};

export function describeOpponent(config: IMatchConfiguration): string {
  const human = singleLocalHuman(config);
  const others = config.slots.filter((slot) => playerIdOfSlot(slot) !== human);
  if (config.totalParticipants > 2) return `${config.totalParticipants} participantes`;
  if (!human) {
    return config.slots.every((slot) => isBotRole(slot.role)) ? 'IA contra IA' : 'Duelo local';
  }
  const other = others[0];
  return isBotRole(other?.role) ? `IA N${other?.botConfig?.difficultyLevel ?? 3}` : 'Jogador local';
}

export function summarize(
  previous: IStoredMatch | undefined, event: GameEvent, ownerUserId: string, config: IMatchConfiguration,
): IStoredMatch {
  const base: IStoredMatch = previous ?? {
    matchId: event.matchId, ownerUserId, schemaVersion: EVENT_SCHEMA_VERSION, engineVersion: event.engineVersion,
    variantId: config.variantId, status: 'IN_PROGRESS', startedAt: event.occurredAt, updatedAt: event.occurredAt,
    lastSequence: -1, lastPly: 0, config, humanPlayer: singleLocalHuman(config),
    opponentLabel: describeOpponent(config), clocks: event.clocks, visibility: 'PRIVATE',
  };
  const next = {
    ...base, updatedAt: event.occurredAt, lastSequence: event.sequence, lastPly: event.ply, clocks: event.clocks,
  };
  if (event.type === 'MATCH_ENDED') {
    return {
      ...next, status: 'COMPLETED', endedAt: event.occurredAt,
      winnerId: event.payload.winnerId as PlayerId | null, endReason: event.payload.reason,
    };
  }
  return next;
}

interface IMatchWriter {
  summary: IStoredMatch | undefined;
  config: IMatchConfiguration;
  release: (() => void) | null;
}

export class MatchPersistenceCoordinator {
  private status: SaveStatus = 'IDLE';
  private readonly listeners = new Set<(status: SaveStatus) => void>();
  private readonly queue: GameEvent[] = [];
  private readonly writers = new Map<string, IMatchWriter>();
  private readonly blocked = new Set<string>();
  private draining: Promise<void> | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private activeMatchId: string | null = null;

  constructor(
    private readonly store: IMatchStore,
    private readonly ownerUserId: string,
    private readonly preferences: Pick<Storage, 'setItem'> | null = null,
    private readonly lock: MatchLock = webLock,
  ) {}

  get currentStatus(): SaveStatus { return this.status; }

  onStatus(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: SaveStatus): void {
    if (status === this.status) return;
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  /** Connect to a MatchJournal: `journal.subscribe(coordinator.listener)`. */
  readonly listener: JournalListener = (event) => {
    if (event.type === 'MATCH_STARTED') {
      this.writers.set(event.matchId, { summary: undefined, config: event.payload.config, release: null });
      this.activate(event.matchId);
    }
    this.queue.push(event);
    this.setStatus('SAVING');
    void this.drain();
  };

  /** Resumes writing a match that was just restored from the store. */
  async resume(match: IStoredMatch): Promise<void> {
    this.writers.set(match.matchId, { summary: match, config: match.config, release: null });
    this.activate(match.matchId);
    await this.claim(match.matchId);
    if (!this.blocked.has(match.matchId)) this.setStatus('LOCAL_SAVED');
  }

  private activate(matchId: string): void {
    for (const [id, writer] of this.writers) {
      if (id !== matchId && !this.queue.some((e) => e.matchId === id)) {
        writer.release?.();
        writer.release = null;
      }
    }
    this.activeMatchId = matchId;
    this.preferences?.setItem(ACTIVE_MATCH_KEY, matchId);
  }

  private async claim(matchId: string): Promise<boolean> {
    const writer = this.writers.get(matchId);
    if (!writer || this.blocked.has(matchId)) return false;
    if (writer.release) return true;
    const release = await this.lock(matchId);
    if (!release) {
      this.blocked.add(matchId);
      this.setStatus('CONFLICT');
      return false;
    }
    writer.release = release;
    return true;
  }

  /** Writes queued events in order. Resolves when the queue is empty or writing stops. */
  drain(): Promise<void> {
    this.draining ??= this.process().finally(() => { this.draining = null; });
    return this.draining;
  }

  private async process(): Promise<void> {
    while (this.queue.length) {
      const event = this.queue[0];
      if (this.blocked.has(event.matchId) || !(await this.claim(event.matchId))) {
        this.queue.shift();
        continue;
      }
      const writer = this.writers.get(event.matchId)!;
      const summary = summarize(writer.summary, event, this.ownerUserId, writer.config);
      try {
        await this.store.append(summary, event);
      } catch (error) {
        if (error instanceof StoreConflictError) {
          // Someone else owns a newer history: stop writing this match instead of overwriting it.
          this.blocked.add(event.matchId);
          this.queue.shift();
          this.setStatus('CONFLICT');
          continue;
        }
        console.error('[MatchPersistence] Save failed, will retry:', error);
        this.setStatus('ERROR');
        this.scheduleRetry();
        return;
      }
      writer.summary = summary;
      this.retries = 0;
      this.queue.shift();
    }
    if (this.activeMatchId && !this.blocked.has(this.activeMatchId)) this.setStatus('LOCAL_SAVED');
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = RETRY_DELAYS_MS[Math.min(this.retries++, RETRY_DELAYS_MS.length - 1)];
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.drain(); }, delay);
  }

  /** Keeps the saved clocks fresh between moves. */
  async saveClocks(clocks: Readonly<Record<string, number>>): Promise<void> {
    const writer = this.activeMatchId ? this.writers.get(this.activeMatchId) : undefined;
    if (!writer?.summary || writer.summary.status !== 'IN_PROGRESS' || this.queue.length ||
      this.blocked.has(this.activeMatchId!)) return;
    await this.store.updateClocks(writer.summary.matchId, clocks, writer.summary.lastSequence);
  }

  dispose(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    for (const writer of this.writers.values()) writer.release?.();
    this.writers.clear();
    this.listeners.clear();
  }
}

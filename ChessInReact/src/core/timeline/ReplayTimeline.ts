/**
 * Random access to any past position of a match. Built only from stored events; it never
 * touches the live game, the clocks or any engine.
 */
import { GameEvent, ISpellPayload, ITimelineMove, MatchEndReason } from './events';
import { ISessionState, applyDelta, boardChecksum } from './sessionState';

export interface IPlyEntry {
  readonly move: ITimelineMove;
  /** Event that completed this ply. */
  readonly eventIndex: number;
  /** Spells cast during this turn, before the move, in order. */
  readonly spells: ReadonlyArray<{ readonly eventIndex: number; readonly payload: ISpellPayload }>;
}

const CACHE_EVERY = 16;

export class ReplayTimeline {
  private readonly events: GameEvent[] = [];
  private entries: IPlyEntry[] = [];
  /** Entries dropped by a rewind, so that a redo restores them with their spells. */
  private readonly undone = new Map<number, IPlyEntry>();
  private pendingSpells: Array<{ eventIndex: number; payload: ISpellPayload }> = [];
  private readonly cache = new Map<number, ISessionState>();
  private last: { index: number; state: ISessionState } | null = null;
  private ending: { winnerId: string | null; reason: MatchEndReason; eventIndex: number } | null = null;

  constructor(events: readonly GameEvent[] = []) {
    for (const event of events) this.append(event);
  }

  append(event: GameEvent): void {
    const index = this.events.length;
    if (index === 0 && event.type !== 'MATCH_STARTED') throw new Error('A timeline must start with MATCH_STARTED.');
    if (index > 0 && event.sequence !== this.events[index - 1].sequence + 1) {
      throw new Error(`Event sequence gap at ${event.sequence}.`);
    }
    this.events.push(event);
    switch (event.type) {
      case 'MATCH_STARTED':
        this.cache.set(0, event.payload.initialState);
        break;
      case 'SPELL_CAST':
        this.pendingSpells.push({ eventIndex: index, payload: event.payload });
        break;
      case 'PIECE_MOVED':
      case 'PIECE_DROPPED':
      case 'DUCK_PLACED':
        this.entries.push({ move: event.payload.move, eventIndex: index, spells: this.pendingSpells });
        this.pendingSpells = [];
        break;
      case 'TIMELINE_REWOUND': {
        const kept = event.payload.moves.length;
        let lastRemoved: IPlyEntry | undefined;
        for (let ply = this.entries.length; ply > kept; ply--) {
          lastRemoved = this.entries[ply - 1];
          this.undone.set(ply, lastRemoved);
        }
        this.entries = this.entries.slice(0, kept);
        for (let i = this.entries.length; i < kept; i++) {
          const move = event.payload.moves[i];
          const earlier = this.undone.get(i + 1);
          const matches = earlier && earlier.move.uci === move.uci && earlier.move.playerId === move.playerId;
          this.entries.push(matches ? earlier : { move, eventIndex: index, spells: [] });
        }
        // A spell whose move was undone stays pending while the rewound state still has it cast.
        this.pendingSpells = this.stateAfterEvent(index).variant.hasCastSpellThisTurn
          ? [...(lastRemoved?.spells ?? this.pendingSpells)]
          : [];
        this.ending = null;
        break;
      }
      case 'MATCH_ENDED':
        this.ending = { winnerId: event.payload.winnerId, reason: event.payload.reason, eventIndex: index };
        break;
    }
  }

  get length(): number { return this.events.length; }
  get livePly(): number { return this.entries.length; }
  get result() { return this.ending; }
  get allEvents(): readonly GameEvent[] { return this.events; }
  entry(ply: number): IPlyEntry | undefined { return this.entries[ply - 1]; }
  get moves(): ITimelineMove[] { return this.entries.map((e) => e.move); }

  /** State right after the event at `index`, rebuilt from the closest cached state before it. */
  stateAfterEvent(index: number): ISessionState {
    if (index < 0 || index >= this.events.length) throw new Error(`No event ${index} in this timeline.`);
    let from = index;
    while (!this.cache.has(from) && this.last?.index !== from) from--;
    let state = this.cache.get(from) ?? this.last!.state;
    for (let i = from + 1; i <= index; i++) {
      const event = this.events[i];
      if (event.type !== 'MATCH_STARTED') state = applyDelta(state, event.delta);
      if (i % CACHE_EVERY === 0) this.cache.set(i, state);
    }
    this.last = { index, state };
    return state;
  }

  /** Position after `ply` moves; ply 0 is the initial position. */
  stateAtPly(ply: number): ISessionState {
    const clamped = Math.max(0, Math.min(this.livePly, ply));
    if (clamped === 0) return this.stateAfterEvent(0);
    return this.stateAfterEvent(this.entries[clamped - 1].eventIndex);
  }

  latestState(): ISessionState {
    return this.stateAfterEvent(this.events.length - 1);
  }

  /** Verifies every stored checksum. Returns the first damaged sequence, or null. */
  findCorruption(): number | null {
    for (let i = 0; i < this.events.length; i++) {
      try {
        if (boardChecksum(this.stateAfterEvent(i)) !== this.events[i].checksum) return this.events[i].sequence;
      } catch {
        return this.events[i].sequence;
      }
    }
    return null;
  }
}

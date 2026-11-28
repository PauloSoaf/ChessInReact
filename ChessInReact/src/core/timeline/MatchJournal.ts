/**
 * Records the authoritative event stream of the current match. The controller is the only
 * writer; persistence and replay are readers.
 */
import { PlayerId } from '../coordinates';
import { ENGINE_VERSION } from '../engineVersion';
import { IMatchConfiguration } from '../../matchmaking/config/IMatchConfiguration';
import { GameEvent, ITimelineMove } from './events';
import { ReplayTimeline } from './ReplayTimeline';
import { ISessionState, boardChecksum, diffSession, isEmptyDelta, snapshotSession } from './sessionState';

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
/** What the caller provides; identity, ordering and integrity fields are filled in here. */
export type EventDraft = DistributiveOmit<GameEvent,
  'id' | 'matchId' | 'sequence' | 'ply' | 'turnNumber' | 'playerId' | 'occurredAt' | 'engineVersion' | 'checksum' | 'delta' | 'clocks'>;

export interface IJournalContext {
  readonly state: ISessionState;
  readonly playerId: PlayerId;
  readonly clocks: Readonly<Record<string, number>>;
}

export type JournalListener = (event: GameEvent, timeline: ReplayTimeline) => void;

export class MatchJournal {
  private timeline = new ReplayTimeline();
  private previous: ISessionState | null = null;
  private matchId = '';
  private readonly listeners = new Set<JournalListener>();

  get current(): ReplayTimeline { return this.timeline; }

  subscribe(listener: JournalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(config: IMatchConfiguration, context: IJournalContext): void {
    this.matchId = config.matchId;
    this.timeline = new ReplayTimeline();
    const initialState = snapshotSession(context.state);
    this.previous = initialState;
    this.emit({ type: 'MATCH_STARTED', payload: { config, initialState } }, context, initialState);
  }

  /** Continues an existing stream after a restore, without emitting anything. */
  adopt(matchId: string, events: readonly GameEvent[]): void {
    this.matchId = matchId;
    this.timeline = new ReplayTimeline(events);
    this.previous = this.timeline.latestState();
  }

  /** Appends an event carrying whatever changed since the previous one. */
  record(draft: Exclude<EventDraft, { type: 'MATCH_STARTED' }>, context: IJournalContext, allowEmpty = true): boolean {
    if (!this.previous) return false;
    const next = snapshotSession(context.state);
    const delta = diffSession(this.previous, next);
    if (!allowEmpty && isEmptyDelta(delta)) return false;
    this.previous = next;
    this.emit({ ...draft, delta } as EventDraft & { delta: typeof delta }, context, next);
    return true;
  }

  private emit(draft: object, context: IJournalContext, state: ISessionState): void {
    const sequence = this.timeline.length;
    const typed = draft as { type: GameEvent['type']; payload: { move?: ITimelineMove; moves?: ITimelineMove[] } };
    const ply = typed.type === 'TIMELINE_REWOUND' ? typed.payload.moves!.length
      : typed.payload.move ? typed.payload.move.ply : this.timeline.livePly;
    const event = {
      ...draft,
      id: `${this.matchId}:${sequence}`,
      matchId: this.matchId,
      sequence,
      ply,
      turnNumber: state.domain.turnNumber,
      playerId: context.playerId,
      occurredAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      clocks: { ...context.clocks },
      checksum: boardChecksum(state),
    } as unknown as GameEvent;
    this.timeline.append(event);
    for (const listener of this.listeners) listener(event, this.timeline);
  }
}

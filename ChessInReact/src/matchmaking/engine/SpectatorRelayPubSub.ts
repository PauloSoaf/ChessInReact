/**
 * ChessInReact - Spectator Relay Pub/Sub (Spec 08 § 6, RF-11)
 *
 * Implements decoupled event broadcasting for live match spectators:
 * 1. Channel isolation per match (`match:<matchId>:events`).
 * 2. In-memory buffer of recent events for instant spectator catchup.
 * 3. Clean subscription / unsubscription lifecycle.
 */

export interface ISpectatorEvent {
  readonly matchId: string;
  readonly ply: number;
  readonly moveNotation: string;
  readonly fen: string;
  readonly evalCentipawns?: number;
  readonly timestampMs: number;
}

export type SpectatorCallback = (event: ISpectatorEvent) => void;

export class SpectatorRelayPubSub {
  public static readonly MAX_CATCHUP_BUFFER = 50;

  private readonly subscribers = new Map<string, Set<SpectatorCallback>>();
  private readonly eventHistory = new Map<string, ISpectatorEvent[]>();

  /**
   * Subscribes a spectator to a match's live event stream.
   * Immediately delivers buffered history to bring spectator up to date.
   */
  public subscribe(
    matchId: string,
    callback: SpectatorCallback
  ): { unsubscribe: () => void; initialCatchup: readonly ISpectatorEvent[] } {
    let subs = this.subscribers.get(matchId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(matchId, subs);
    }
    subs.add(callback);

    const history = this.eventHistory.get(matchId) ?? [];

    return {
      unsubscribe: () => {
        const currentSubs = this.subscribers.get(matchId);
        if (currentSubs) {
          currentSubs.delete(callback);
          if (currentSubs.size === 0) {
            this.subscribers.delete(matchId);
          }
        }
      },
      initialCatchup: [...history],
    };
  }

  /**
   * Broadcasts a new match event to all subscribed spectators.
   */
  public publish(event: ISpectatorEvent): void {
    // 1. Append to catchup buffer
    let history = this.eventHistory.get(event.matchId);
    if (!history) {
      history = [];
      this.eventHistory.set(event.matchId, history);
    }
    history.push(event);
    if (history.length > SpectatorRelayPubSub.MAX_CATCHUP_BUFFER) {
      history.shift();
    }

    // 2. Deliver to active subscribers
    const subs = this.subscribers.get(event.matchId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event);
        } catch (err) {
          console.warn('[SpectatorRelayPubSub] Subscriber threw error:', err);
        }
      }
    }
  }

  /**
   * Returns active spectator count for a match.
   */
  public getSpectatorCount(matchId: string): number {
    return this.subscribers.get(matchId)?.size ?? 0;
  }

  /**
   * Cleans up channel when match terminates.
   */
  public closeChannel(matchId: string): void {
    this.subscribers.delete(matchId);
    this.eventHistory.delete(matchId);
  }
}

import { EventCallback, GameEventType, IGameEventPayload } from './types';

export class EventBus {
  // O(1) set operations for listener registration and removal (Section 19.1 GitHub 7)
  private listeners: Map<GameEventType, Set<(payload: unknown) => void>> = new Map();
  private errorHandler: ((error: unknown, eventType: GameEventType) => void) | null = null;

  /**
   * Set custom error handler for isolated listener exceptions.
   */
  public setErrorHandler(
    handler: ((error: unknown, eventType: GameEventType) => void) | null
  ): void {
    this.errorHandler = handler;
  }

  /**
   * Subscribe to a typed game event. Returns an unsubscribe teardown function.
   */
  public subscribe<T extends GameEventType>(
    eventType: T,
    callback: EventCallback<T>
  ): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(callback as (payload: unknown) => void);

    return () => {
      this.unsubscribe(eventType, callback);
    };
  }

  /**
   * Unsubscribe a specific listener.
   */
  public unsubscribe<T extends GameEventType>(
    eventType: T,
    callback: EventCallback<T>
  ): void {
    const set = this.listeners.get(eventType);
    if (set) {
      set.delete(callback as (payload: unknown) => void);
      if (set.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Emits an event with type-checked payload.
   * Isolates listener exceptions so one failing listener does NOT interrupt others.
   */
  public emit<T extends GameEventType>(
    eventType: T,
    payload: IGameEventPayload[T]
  ): void {
    const set = this.listeners.get(eventType);
    if (!set || set.size === 0) return;

    // Snapshot set to prevent mutation issues during dispatch
    const currentListeners = Array.from(set);
    for (const listener of currentListeners) {
      try {
        listener(payload);
      } catch (err) {
        if (this.errorHandler) {
          this.errorHandler(err, eventType);
        } else {
          // Default: non-blocking log
          console.error(`[EventBus] Error in listener for event "${eventType}":`, err);
        }
      }
    }
  }

  /**
   * Returns count of active listeners for an event type or total across all events.
   */
  public listenerCount(eventType?: GameEventType): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clears all subscriptions (e.g. on match unmount / restart).
   */
  public clear(): void {
    this.listeners.clear();
  }
}

/**
 * Global singleton EventBus instance.
 */
export const GlobalEventBus = new EventBus();

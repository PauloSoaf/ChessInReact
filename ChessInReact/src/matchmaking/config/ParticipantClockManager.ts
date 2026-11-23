/**
 * ChessInReact - Monotonic Multi-Participant Clock Engine (Spec 16 § 4, Spec 06 RF-09, RNF-16-02)
 *
 * Implements authoritative drift-free chess clocks for up to 12 participants:
 * - Monotonic elapsed time calculation using performance.now() (zero drift during background tab throttle).
 * - Exact Fischer increment application upon valid turn completion.
 * - Single authoritative timeout detection.
 * - Lossless undo/redo snapshot capture and restoration.
 */

import { PlayerId } from '../../core/coordinates/types';
import { IMatchConfiguration } from './IMatchConfiguration';

export interface IParticipantClockState {
  readonly playerId: PlayerId;
  readonly slotIndex: number;
  readonly initialSeconds: number;
  readonly incrementSeconds: number;
  readonly isUnlimited: boolean;
  timeLeftMs: number;
}

export interface IClockTickResult {
  readonly updatedClocks: Record<PlayerId, number>;
  readonly timedOutPlayer: PlayerId | null;
  readonly activePlayer: PlayerId;
}

export class ParticipantClockManager {
  private clocks: Map<PlayerId, IParticipantClockState> = new Map();
  private activePlayer: PlayerId = 'P1';
  private lastTickTimestamp: number = 0;
  private isRunning: boolean = false;
  private timedOutPlayer: PlayerId | null = null;

  constructor(config?: IMatchConfiguration) {
    if (config) {
      this.initializeFromConfig(config);
    }
  }

  /**
   * Initializes clocks for all participant slots (from 2 up to 12 players).
   */
  public initializeFromConfig(config: IMatchConfiguration): void {
    this.clocks.clear();
    this.timedOutPlayer = null;
    this.isRunning = false;
    this.lastTickTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const slots = config.slots ?? [];
    slots.forEach((slot, index) => {
      const playerId = `P${index + 1}` as PlayerId;
      const initialSeconds = slot.clock?.initialSeconds ?? 300;
      const incrementSeconds = slot.clock?.incrementSeconds ?? 0;
      const isUnlimited = initialSeconds <= 0;

      this.clocks.set(playerId, {
        playerId,
        slotIndex: index,
        initialSeconds,
        incrementSeconds,
        isUnlimited,
        timeLeftMs: isUnlimited ? Infinity : initialSeconds * 1000,
      });
    });

    // Ensure at least P1 and P2 exist if slots were empty
    if (!this.clocks.has('P1')) {
      this.clocks.set('P1', {
        playerId: 'P1',
        slotIndex: 0,
        initialSeconds: 300,
        incrementSeconds: 0,
        isUnlimited: false,
        timeLeftMs: 300000,
      });
    }
    if (!this.clocks.has('P2')) {
      this.clocks.set('P2', {
        playerId: 'P2',
        slotIndex: 1,
        initialSeconds: 300,
        incrementSeconds: 0,
        isUnlimited: false,
        timeLeftMs: 300000,
      });
    }

    this.activePlayer = 'P1';
  }

  /**
   * Starts or resumes monotonic clock ticking.
   */
  public start(activePlayer?: PlayerId, now?: number): void {
    if (activePlayer) {
      this.activePlayer = activePlayer;
    }
    this.lastTickTimestamp = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this.isRunning = true;
  }

  /**
   * Pauses clock ticking (e.g. spectator pause or match review).
   */
  public pause(): void {
    this.isRunning = false;
  }

  /**
   * Switches active turn to a new player, resetting monotonic baseline.
   */
  public setActivePlayer(nextPlayer: PlayerId, now?: number): void {
    this.activePlayer = nextPlayer;
    this.lastTickTimestamp = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  /**
   * Monotonically ticks the active player's clock based on real elapsed time delta.
   * Completely immune to tab throttle or background timer coalescing.
   */
  public tick(now?: number): IClockTickResult {
    const currentTimestamp = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (!this.isRunning || this.timedOutPlayer) {
      return {
        updatedClocks: this.getClocksMap(),
        timedOutPlayer: this.timedOutPlayer,
        activePlayer: this.activePlayer,
      };
    }

    const elapsedMs = Math.max(0, currentTimestamp - this.lastTickTimestamp);
    this.lastTickTimestamp = currentTimestamp;

    const activeClock = this.clocks.get(this.activePlayer);
    if (activeClock && !activeClock.isUnlimited && activeClock.timeLeftMs > 0) {
      activeClock.timeLeftMs = Math.max(0, activeClock.timeLeftMs - elapsedMs);

      if (activeClock.timeLeftMs === 0) {
        this.timedOutPlayer = this.activePlayer;
        this.isRunning = false;
      }
    }

    return {
      updatedClocks: this.getClocksMap(),
      timedOutPlayer: this.timedOutPlayer,
      activePlayer: this.activePlayer,
    };
  }

  /**
   * Applies the Fischer increment to the player who just concluded a turn.
   */
  public applyIncrement(playerId: PlayerId): void {
    const clock = this.clocks.get(playerId);
    if (clock && !clock.isUnlimited && clock.incrementSeconds > 0 && clock.timeLeftMs > 0) {
      clock.timeLeftMs += clock.incrementSeconds * 1000;
    }
  }

  /**
   * Returns milliseconds remaining for a given player.
   */
  public getTimeLeftMs(playerId: PlayerId): number {
    const clock = this.clocks.get(playerId);
    if (!clock) return 300000;
    return clock.timeLeftMs;
  }

  /**
   * Returns a dictionary of timeLeftMs for all participant slots.
   */
  public getClocksMap(): Record<PlayerId, number> {
    const map: Partial<Record<PlayerId, number>> = {};
    for (const [playerId, clock] of this.clocks.entries()) {
      map[playerId] = clock.timeLeftMs;
    }
    return map as Record<PlayerId, number>;
  }

  /**
   * Captures an immutable snapshot of clock values for Undo/Redo history.
   */
  public captureSnapshot(): Record<PlayerId, number> {
    return this.getClocksMap();
  }

  /**
   * Restores clock values from a historic snapshot.
   */
  public restoreSnapshot(snapshot: Record<string, number>, now?: number): void {
    for (const [playerId, timeMs] of Object.entries(snapshot)) {
      const clock = this.clocks.get(playerId as PlayerId);
      if (clock) {
        clock.timeLeftMs = timeMs;
      }
    }
    this.timedOutPlayer = null;
    this.lastTickTimestamp = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }

  /**
   * Checks if any participant has timed out.
   */
  public getTimedOutPlayer(): PlayerId | null {
    return this.timedOutPlayer;
  }

  /**
   * Resets timeout flag.
   */
  public clearTimedOut(): void {
    this.timedOutPlayer = null;
  }
}

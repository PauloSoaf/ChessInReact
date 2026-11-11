/**
 * ChessInReact - Anti-Dodge Queue Penalty Manager (Spec 08 § 6, RF-10)
 *
 * Enforces temporary locks against players who reject or abandon matched games:
 * 1. 60-second cooldown on first dodge.
 * 2. Escalating penalty multiplier (60s -> 300s -> 900s) on consecutive dodges.
 * 3. Automatic cooldown expiration and reset after 24h clean window.
 */

export interface IDodgeRecord {
  readonly playerId: string;
  readonly dodgeCount: number;
  readonly lockedUntilMs: number;
  readonly lastDodgeTimestampMs: number;
}

export class AntiDodgePenaltyManager {
  public static readonly BASE_PENALTY_MS = 60 * 1000; // 60 seconds
  public static readonly PENALTY_TIERS_MS = [60 * 1000, 300 * 1000, 900 * 1000]; // 1m, 5m, 15m
  public static readonly CLEAN_SLATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  private readonly records = new Map<string, IDodgeRecord>();

  /**
   * Registers a queue dodge / match refusal event for a player.
   */
  public registerDodge(playerId: string, nowMs: number = Date.now()): IDodgeRecord {
    const existing = this.records.get(playerId);

    let count = 1;
    if (existing) {
      const isClean = nowMs - existing.lastDodgeTimestampMs > AntiDodgePenaltyManager.CLEAN_SLATE_WINDOW_MS;
      count = isClean ? 1 : existing.dodgeCount + 1;
    }

    const tierIndex = Math.min(count - 1, AntiDodgePenaltyManager.PENALTY_TIERS_MS.length - 1);
    const penaltyDuration = AntiDodgePenaltyManager.PENALTY_TIERS_MS[tierIndex] ?? AntiDodgePenaltyManager.BASE_PENALTY_MS;
    const lockedUntilMs = nowMs + penaltyDuration;

    const record: IDodgeRecord = {
      playerId,
      dodgeCount: count,
      lockedUntilMs,
      lastDodgeTimestampMs: nowMs,
    };

    this.records.set(playerId, record);
    return record;
  }

  /**
   * Checks whether a player is permitted to join matchmaking.
   */
  public canJoinQueue(
    playerId: string,
    nowMs: number = Date.now()
  ): { allowed: boolean; remainingLockSeconds?: number } {
    const record = this.records.get(playerId);
    if (!record) {
      return { allowed: true };
    }

    if (nowMs >= record.lockedUntilMs) {
      return { allowed: true };
    }

    const remainingLockSeconds = Math.ceil((record.lockedUntilMs - nowMs) / 1000);
    return {
      allowed: false,
      remainingLockSeconds,
    };
  }

  /**
   * Clears the dodge penalty record (admin action or reset).
   */
  public clearPenalty(playerId: string): void {
    this.records.delete(playerId);
  }
}

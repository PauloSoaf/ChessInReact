/**
 * ChessInReact - User Presence Tracker (Spec 08 § 6, RF-14)
 *
 * Tracks concurrent online presence and player distribution:
 * 1. Heartbeat-based presence registry with 30s TTL.
 * 2. Breakdown by game mode/variant and global concurrency.
 * 3. Automatic eviction of stale sessions.
 */

export interface IUserPresence {
  readonly userId: string;
  readonly currentVariantId: string;
  readonly lastHeartbeatMs: number;
}

export class PresenceTracker {
  public static readonly PRESENCE_TTL_MS = 30 * 1000; // 30 seconds

  private readonly users = new Map<string, IUserPresence>();

  /**
   * Registers or refreshes a user's presence heartbeat.
   */
  public recordHeartbeat(
    userId: string,
    currentVariantId: string = 'lobby',
    nowMs: number = Date.now()
  ): void {
    this.users.set(userId, {
      userId,
      currentVariantId,
      lastHeartbeatMs: nowMs,
    });
  }

  /**
   * Removes user presence immediately (explicit disconnect/logout).
   */
  public removeUser(userId: string): void {
    this.users.delete(userId);
  }

  /**
   * Purges users whose heartbeat is older than PRESENCE_TTL_MS.
   */
  public purgeStaleUsers(nowMs: number = Date.now()): number {
    let purged = 0;
    for (const [userId, record] of this.users.entries()) {
      if (nowMs - record.lastHeartbeatMs > PresenceTracker.PRESENCE_TTL_MS) {
        this.users.delete(userId);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Returns current active user count.
   */
  public getOnlineCount(nowMs: number = Date.now()): number {
    this.purgeStaleUsers(nowMs);
    return this.users.size;
  }

  /**
   * Returns active user count broken down by variant/location.
   */
  public getPresenceBreakdown(nowMs: number = Date.now()): Record<string, number> {
    this.purgeStaleUsers(nowMs);

    const breakdown: Record<string, number> = {};
    for (const record of this.users.values()) {
      breakdown[record.currentVariantId] = (breakdown[record.currentVariantId] ?? 0) + 1;
    }
    return breakdown;
  }
}

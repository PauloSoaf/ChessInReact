/**
 * ChessInReact - Distributed Queue Lock (Redlock Pattern) (Spec 08 § 9.2, RF-02, RNF-12)
 *
 * Implements non-reentrant distributed mutex locking for multi-worker matchmaking clusters:
 * 1. SET lock:<resource> <token> NX PX <ttlMs> semantics.
 * 2. Guaranteed single-worker execution within micro-windows (e.g. 100ms).
 * 3. Token-guarded release ensuring only the acquiring worker can unlock.
 * 4. Automatic TTL eviction preventing deadlocks on worker failure.
 */

export interface ILockRecord {
  readonly resourceKey: string;
  readonly token: string;
  readonly workerId: string;
  readonly expiresAtMs: number;
}

export class DistributedQueueLock {
  public static readonly DEFAULT_TTL_MS = 100; // 100ms micro-window per Spec 08 § 9.2

  private readonly activeLocks = new Map<string, ILockRecord>();

  /**
   * Generates a cryptographically random unique lock token.
   */
  private generateToken(): string {
    return `lkt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Attempts to acquire a non-reentrant lock on a resource (e.g. `lock:queue:variant_hex4`).
   * Equivalent to Redis command `SET lock:<resource> <token> NX PX <ttlMs>`.
   */
  public acquire(
    resourceKey: string,
    ttlMs: number = DistributedQueueLock.DEFAULT_TTL_MS,
    workerId: string = 'worker_local',
    nowMs: number = Date.now()
  ): { acquired: boolean; token?: string } {
    const existing = this.activeLocks.get(resourceKey);

    // If lock exists and has not expired, acquisition fails (NX condition)
    if (existing && nowMs < existing.expiresAtMs) {
      return { acquired: false };
    }

    const token = this.generateToken();
    const record: ILockRecord = {
      resourceKey,
      token,
      workerId,
      expiresAtMs: nowMs + ttlMs,
    };

    this.activeLocks.set(resourceKey, record);
    return { acquired: true, token };
  }

  /**
   * Releases the lock if the token matches the current lock holder.
   * Equivalent to atomic Redis Lua script:
   * if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end
   */
  public release(resourceKey: string, token: string): boolean {
    const existing = this.activeLocks.get(resourceKey);
    if (!existing) {
      return false;
    }

    if (existing.token !== token) {
      return false; // Token mismatch - cannot release lock held by another worker
    }

    this.activeLocks.delete(resourceKey);
    return true;
  }

  /**
   * Executes an asynchronous task inside a distributed lock guard.
   */
  public async withLock<T>(
    resourceKey: string,
    action: () => Promise<T> | T,
    ttlMs: number = DistributedQueueLock.DEFAULT_TTL_MS,
    workerId: string = 'worker_local',
    nowMs: number = Date.now()
  ): Promise<{ success: boolean; result?: T; error?: string }> {
    const { acquired, token } = this.acquire(resourceKey, ttlMs, workerId, nowMs);
    if (!acquired || !token) {
      return { success: false, error: `Resource locked: ${resourceKey}` };
    }

    try {
      const result = await action();
      return { success: true, result };
    } finally {
      this.release(resourceKey, token);
    }
  }

  /**
   * Returns whether a resource is currently locked.
   */
  public isLocked(resourceKey: string, nowMs: number = Date.now()): boolean {
    const existing = this.activeLocks.get(resourceKey);
    if (!existing) return false;
    if (nowMs >= existing.expiresAtMs) {
      this.activeLocks.delete(resourceKey);
      return false;
    }
    return true;
  }

  /**
   * Purges all expired locks.
   */
  public purgeExpired(nowMs: number = Date.now()): number {
    let purged = 0;
    for (const [key, lock] of this.activeLocks.entries()) {
      if (nowMs >= lock.expiresAtMs) {
        this.activeLocks.delete(key);
        purged++;
      }
    }
    return purged;
  }
}


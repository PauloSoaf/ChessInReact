/**
 * ChessInReact - Matchmaker API Rate Limiter (Spec 08 § 13.1 #9, RF-12)
 *
 * Implements sliding window rate limiting based on Upstash RateLimit Token Bucket semantics:
 * - Enforces max requests per time window (default: 2 requests / 1000ms per user/IP).
 * - Frustrates flood attempts and queue spam attacks on Serverless Redis.
 * - Provides remaining request counts and TTL reset timestamps.
 * - Automatic eviction of stale window entries.
 */

export interface IRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
}

export interface IRateLimiterConfig {
  readonly maxRequests: number; // Max allowed requests per window (default: 2 per RF-12)
  readonly windowMs: number; // Time window duration in milliseconds (default: 1000ms)
}

export class MatchmakerRateLimiter {
  public static readonly DEFAULT_MAX_REQUESTS = 2; // 2 req/sec per RF-12
  public static readonly DEFAULT_WINDOW_MS = 1000; // 1 second

  private readonly config: IRateLimiterConfig;
  private readonly requestLog = new Map<string, number[]>(); // key -> array of request timestamps

  public constructor(config: Partial<IRateLimiterConfig> = {}) {
    this.config = {
      maxRequests: config.maxRequests ?? MatchmakerRateLimiter.DEFAULT_MAX_REQUESTS,
      windowMs: config.windowMs ?? MatchmakerRateLimiter.DEFAULT_WINDOW_MS,
    };
  }

  /**
   * Evaluates and consumes a token for the given client identifier.
   */
  public consume(key: string, nowMs: number = Date.now()): IRateLimitResult {
    const windowStart = nowMs - this.config.windowMs;
    const history = this.requestLog.get(key) ?? [];

    // Filter out timestamps outside the active sliding window
    const validTimestamps = history.filter((t) => t > windowStart);

    if (validTimestamps.length >= this.config.maxRequests) {
      const oldestValid = validTimestamps[0] ?? nowMs;
      const resetMs = oldestValid + this.config.windowMs - nowMs;

      this.requestLog.set(key, validTimestamps);
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.max(0, resetMs),
      };
    }

    validTimestamps.push(nowMs);
    this.requestLog.set(key, validTimestamps);

    const remaining = this.config.maxRequests - validTimestamps.length;
    return {
      allowed: true,
      remaining,
      resetMs: this.config.windowMs,
    };
  }

  /**
   * Checks whether the client is allowed without consuming a request token.
   */
  public check(key: string, nowMs: number = Date.now()): IRateLimitResult {
    const windowStart = nowMs - this.config.windowMs;
    const history = this.requestLog.get(key) ?? [];
    const validTimestamps = history.filter((t) => t > windowStart);

    const remaining = Math.max(0, this.config.maxRequests - validTimestamps.length);
    const allowed = validTimestamps.length < this.config.maxRequests;
    const oldest = validTimestamps[0] ?? nowMs;
    const resetMs = allowed ? this.config.windowMs : Math.max(0, oldest + this.config.windowMs - nowMs);

    return {
      allowed,
      remaining,
      resetMs,
    };
  }

  /**
   * Resets rate limit quota for a key.
   */
  public reset(key: string): void {
    this.requestLog.delete(key);
  }

  /**
   * Purges idle keys whose history has completely expired.
   */
  public purgeStale(nowMs: number = Date.now()): number {
    const windowStart = nowMs - this.config.windowMs;
    let purged = 0;

    for (const [key, timestamps] of this.requestLog.entries()) {
      const active = timestamps.filter((t) => t > windowStart);
      if (active.length === 0) {
        this.requestLog.delete(key);
        purged++;
      } else if (active.length < timestamps.length) {
        this.requestLog.set(key, active);
      }
    }

    return purged;
  }
}


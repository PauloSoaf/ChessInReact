/**
 * Sliding Window Token Bucket rate limiter to satisfy RF-11 and anti-DoS constraints.
 * Allows at most maxTokensPerWindow messages within the sliding window duration.
 */
export class RateLimiter {
  private timestamps: Map<string, number[]> = new Map();

  constructor(
    public readonly maxTokensPerWindow: number = 10,
    public readonly windowDurationMs: number = 1000
  ) {}

  /**
   * Evaluates if a client action is permitted under the rate limit.
   * Returns true if allowed, false if limit exceeded.
   */
  public checkRateLimit(clientId: string, now: number = Date.now()): boolean {
    let clientTimes = this.timestamps.get(clientId);
    if (!clientTimes) {
      clientTimes = [];
      this.timestamps.set(clientId, clientTimes);
    }

    const cutoff = now - this.windowDurationMs;
    // Discard timestamps outside window
    const validTimes = clientTimes.filter((t) => t > cutoff);

    if (validTimes.length >= this.maxTokensPerWindow) {
      this.timestamps.set(clientId, validTimes);
      return false; // Rate limit exceeded!
    }

    validTimes.push(now);
    this.timestamps.set(clientId, validTimes);
    return true;
  }

  /**
   * Clear tracking for a disconnected client.
   */
  public removeClient(clientId: string): void {
    this.timestamps.delete(clientId);
  }

  public clear(): void {
    this.timestamps.clear();
  }
}

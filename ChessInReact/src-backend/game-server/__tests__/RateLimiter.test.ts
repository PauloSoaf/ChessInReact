import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../rooms/RateLimiter';

describe('Spec 03 - RateLimiter (RF-11 Anti-DoS)', () => {
  it('allows up to 10 commands per second under nominal load', () => {
    const limiter = new RateLimiter(10, 1000);
    const clientId = 'client-session-1';
    const now = 100000;

    // Send 10 commands in the same window
    for (let i = 0; i < 10; i++) {
      const allowed = limiter.checkRateLimit(clientId, now + i * 50);
      expect(allowed).toBe(true);
    }

    // 11th command within the 1-second window should be rejected
    const blocked = limiter.checkRateLimit(clientId, now + 550);
    expect(blocked).toBe(false);
  });

  it('permits commands again once sliding window elapses', () => {
    const limiter = new RateLimiter(5, 500);
    const clientId = 'client-session-2';
    const baseTime = 200000;

    // Max out 5 tokens
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkRateLimit(clientId, baseTime + i * 10)).toBe(true);
    }
    expect(limiter.checkRateLimit(clientId, baseTime + 100)).toBe(false);

    // Advance time past the 500ms window
    expect(limiter.checkRateLimit(clientId, baseTime + 600)).toBe(true);
  });

  it('isolates rate limits per client ID independently', () => {
    const limiter = new RateLimiter(2, 1000);
    const clientA = 'client-a';
    const clientB = 'client-b';
    const now = 300000;

    expect(limiter.checkRateLimit(clientA, now)).toBe(true);
    expect(limiter.checkRateLimit(clientA, now + 10)).toBe(true);
    expect(limiter.checkRateLimit(clientA, now + 20)).toBe(false);

    // Client B is unaffected by Client A's rate limit
    expect(limiter.checkRateLimit(clientB, now + 20)).toBe(true);
  });

  it('removes client on session disconnection', () => {
    const limiter = new RateLimiter(2, 1000);
    const clientId = 'client-transient';
    const now = 400000;

    limiter.checkRateLimit(clientId, now);
    limiter.checkRateLimit(clientId, now + 10);
    expect(limiter.checkRateLimit(clientId, now + 20)).toBe(false);

    limiter.removeClient(clientId);
    // After removal, new attempts start fresh
    expect(limiter.checkRateLimit(clientId, now + 30)).toBe(true);
  });
});

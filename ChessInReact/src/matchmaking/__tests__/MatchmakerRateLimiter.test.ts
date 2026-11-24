import { describe, it, expect, beforeEach } from 'vitest';
import { MatchmakerRateLimiter } from '../engine/MatchmakerRateLimiter';

describe('Spec 08 - Matchmaker API Rate Limiter (Spec 08 § 13.1 #9, RF-12)', () => {
  let limiter: MatchmakerRateLimiter;

  beforeEach(() => {
    limiter = new MatchmakerRateLimiter({
      maxRequests: 2,
      windowMs: 1000,
    });
  });

  it('allows requests within the 2 req/sec threshold and decrements remaining quota', () => {
    const t0 = 10000;
    const r1 = limiter.consume('user-1', t0);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(1);

    const r2 = limiter.consume('user-1', t0 + 200);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(0);

    const r3 = limiter.consume('user-1', t0 + 400);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.resetMs).toBeGreaterThan(0);
    expect(r3.resetMs).toBeLessThanOrEqual(1000);
  });

  it('maintains isolated quotas per user or IP identifier', () => {
    const t0 = 20000;
    limiter.consume('user-alice', t0);
    limiter.consume('user-alice', t0 + 100);
    const blockedAlice = limiter.consume('user-alice', t0 + 200);
    expect(blockedAlice.allowed).toBe(false);

    // Bob still has fresh quota
    const rBob = limiter.consume('user-bob', t0 + 250);
    expect(rBob.allowed).toBe(true);
    expect(rBob.remaining).toBe(1);
  });

  it('resets quota once the sliding window expires', () => {
    const t0 = 30000;
    limiter.consume('user-1', t0);
    limiter.consume('user-1', t0 + 100);
    expect(limiter.consume('user-1', t0 + 200).allowed).toBe(false);

    // After 1001 ms, window has moved past t0
    const rAfter = limiter.consume('user-1', t0 + 1001);
    expect(rAfter.allowed).toBe(true);
  });

  it('evaluates quota via check() without consuming tokens', () => {
    const t0 = 40000;
    const c1 = limiter.check('user-1', t0);
    expect(c1.allowed).toBe(true);
    expect(c1.remaining).toBe(2);

    limiter.consume('user-1', t0);
    const c2 = limiter.check('user-1', t0 + 10);
    expect(c2.allowed).toBe(true);
    expect(c2.remaining).toBe(1);

    limiter.consume('user-1', t0 + 20);
    const c3 = limiter.check('user-1', t0 + 30);
    expect(c3.allowed).toBe(false);
    expect(c3.remaining).toBe(0);
  });

  it('resets user quota explicitly on reset()', () => {
    const t0 = 50000;
    limiter.consume('user-1', t0);
    limiter.consume('user-1', t0 + 100);
    expect(limiter.check('user-1', t0 + 150).allowed).toBe(false);

    limiter.reset('user-1');
    const fresh = limiter.consume('user-1', t0 + 160);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(1);
  });

  it('purges stale entries whose timestamps have all expired', () => {
    const t0 = 60000;
    limiter.consume('active-user', t0 + 900);
    limiter.consume('stale-user', t0);

    const purged = limiter.purgeStale(t0 + 1100);
    expect(purged).toBe(1);

    // Active user still had event within 1000ms window
    expect(limiter.check('active-user', t0 + 1100).remaining).toBe(1);
  });
});


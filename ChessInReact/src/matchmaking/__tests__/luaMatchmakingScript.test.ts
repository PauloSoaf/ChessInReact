import { describe, it, expect } from 'vitest';
import {
  REDIS_MATCHMAKING_LUA_SCRIPT,
  executeSimulatedLuaMatcher,
} from '../scripts/luaMatchmakingScript';

describe('Spec 08 - Redis Atomic Lua Matchmaking Script (Spec 08 § 11 #3, § 13.1 #1, US08-D02)', () => {
  it('defines valid Redis EVAL script with atomic ZRANGE and ZREM operations', () => {
    expect(REDIS_MATCHMAKING_LUA_SCRIPT).toContain('redis.call(\'ZRANGE\'');
    expect(REDIS_MATCHMAKING_LUA_SCRIPT).toContain('redis.call(\'ZREM\'');
    expect(REDIS_MATCHMAKING_LUA_SCRIPT).toContain('maxTolerance');
  });

  it('returns empty match when queue has fewer candidates than groupSize', () => {
    const queue = [{ id: 'p1', score: 1500 }];
    const res = executeSimulatedLuaMatcher(queue, 2, 50);
    expect(res.matched).toBe(false);
    expect(res.playerIds).toHaveLength(0);
  });

  it('matches 2 players whose ELO difference is within tolerance', () => {
    const queue = [
      { id: 'p1', score: 1510 },
      { id: 'p2', score: 1530 },
    ];
    const res = executeSimulatedLuaMatcher(queue, 2, 50);
    expect(res.matched).toBe(true);
    expect(res.playerIds).toEqual(['p1', 'p2']);
    expect(res.maxScore - res.minScore).toBe(20);
  });

  it('rejects pairing when ELO difference exceeds tolerance', () => {
    const queue = [
      { id: 'p1', score: 1200 },
      { id: 'p2', score: 1800 },
    ];
    const res = executeSimulatedLuaMatcher(queue, 2, 50);
    expect(res.matched).toBe(false);
    expect(res.playerIds).toHaveLength(0);
  });

  it('matches 4-player FFA hexagonal arena when 4 candidates are tightly clustered', () => {
    const queue = [
      { id: 'p-hex1', score: 2000 },
      { id: 'p-hex2', score: 2025 },
      { id: 'p-hex3', score: 2040 },
      { id: 'p-hex4', score: 2050 },
    ];
    const res = executeSimulatedLuaMatcher(queue, 4, 60);
    expect(res.matched).toBe(true);
    expect(res.playerIds).toHaveLength(4);
    expect(res.playerIds).toEqual(['p-hex1', 'p-hex2', 'p-hex3', 'p-hex4']);
    expect(res.maxScore - res.minScore).toBe(50);
  });

  it('slides past a low-ELO outlier to group 2 balanced players', () => {
    const queue = [
      { id: 'p-beginner', score: 800 },
      { id: 'p-master1', score: 2400 },
      { id: 'p-master2', score: 2420 },
    ];
    const res = executeSimulatedLuaMatcher(queue, 2, 50);
    expect(res.matched).toBe(true);
    expect(res.playerIds).toEqual(['p-master1', 'p-master2']);
  });
});


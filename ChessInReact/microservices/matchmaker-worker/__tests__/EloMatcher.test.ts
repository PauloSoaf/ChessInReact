import { describe, it, expect, beforeEach } from 'vitest';
import { EloMatcher } from '../src/EloMatcher';
import { RoomAllocator } from '../src/RoomAllocator';
import { DistributedQueueLock } from '../../../src/matchmaking/engine/DistributedQueueLock';

describe('Spec 08 - Matchmaker Worker: EloMatcher & RoomAllocator (Spec 08 § 6, § 7, § 9.2)', () => {
  let lock: DistributedQueueLock;
  let roomAllocator: RoomAllocator;
  let matcher: EloMatcher;

  beforeEach(() => {
    lock = new DistributedQueueLock();
    roomAllocator = new RoomAllocator('test_secret');
    matcher = new EloMatcher(lock, roomAllocator);
  });

  it('generates cryptographically valid HMAC-SHA256 JWT ticket tokens', () => {
    const token = roomAllocator.generateTicketJwt({
      userId: 'player-test',
      matchId: 'room-123',
      elo: 1600,
      factionIndex: 0,
      exp: 9999999999,
    });

    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    expect(header.alg).toBe('HS256');
    expect(payload.userId).toBe('player-test');
    expect(payload.matchId).toBe('room-123');
  });

  it('forms a match when candidates are within tolerance and emits signed broadcast', () => {
    matcher.enqueue('STANDARD_CHESS', {
      id: 't-1',
      userId: 'alice',
      displayName: 'Alice',
      eloRating: 1500,
    });
    matcher.enqueue('STANDARD_CHESS', {
      id: 't-2',
      userId: 'bob',
      displayName: 'Bob',
      eloRating: 1520,
    });

    const tickResult = matcher.matchTick('STANDARD_CHESS', 2, 50, 'worker-1');
    expect(tickResult.matched).toBe(true);
    expect(tickResult.match).toBeDefined();

    const broadcast = tickResult.match!;
    expect(broadcast.variantId).toBe('STANDARD_CHESS');
    expect(broadcast.playerAssignments).toHaveLength(2);
    expect(broadcast.playerAssignments[0]?.userId).toBe('alice');
    expect(broadcast.playerAssignments[0]?.factionIndex).toBe(0);
    expect(broadcast.playerAssignments[1]?.userId).toBe('bob');
    expect(broadcast.playerAssignments[1]?.factionIndex).toBe(1);

    // Queue should now be empty
    const nextTick = matcher.matchTick('STANDARD_CHESS', 2, 50, 'worker-1');
    expect(nextTick.matched).toBe(false);
  });

  it('respects Redlock mutual exclusion and returns lockedOut if another worker holds lock', () => {
    // Worker A holds the lock
    lock.acquire('lock:queue:HEXAGONAL_4P', 500, 'worker-A', 1000);

    // Worker B attempts tick
    matcher.enqueue('HEXAGONAL_4P', {
      id: 't-1',
      userId: 'u1',
      displayName: 'U1',
      eloRating: 2000,
    });
    matcher.enqueue('HEXAGONAL_4P', {
      id: 't-2',
      userId: 'u2',
      displayName: 'U2',
      eloRating: 2010,
    });

    const res = matcher.matchTick('HEXAGONAL_4P', 2, 50, 'worker-B', 1050);
    expect(res.matched).toBe(false);
    expect(res.lockedOut).toBe(true);
  });
});

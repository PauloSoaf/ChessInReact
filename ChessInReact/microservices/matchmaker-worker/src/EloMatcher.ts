/**
 * ChessInReact - Matchmaker Worker: EloMatcher Process (Spec 08 § 6, § 9.2, US08-D02)
 *
 * Runs atomic matchmaking loop:
 * - Acquires Redlock Distributed Lock to prevent duplicate room creation.
 * - Runs atomic cluster matching.
 * - Allocates Colyseus Room with signed JWTs via RoomAllocator.
 * - Emits `match_ready` Pub/Sub broadcast.
 */

import { DistributedQueueLock } from '../../../src/matchmaking/engine/DistributedQueueLock';
import { executeSimulatedLuaMatcher } from '../../../src/matchmaking/scripts/luaMatchmakingScript';
import { RoomAllocator, IMatchCandidate, IRoomAllocationResult } from './RoomAllocator';

export interface IMatchReadyBroadcast {
  readonly roomId: string;
  readonly serverUrl: string;
  readonly variantId: string;
  readonly playerAssignments: IRoomAllocationResult['playerAssignments'];
  readonly timestamp: number;
}

export class EloMatcher {
  private readonly lock: DistributedQueueLock;
  private readonly roomAllocator: RoomAllocator;
  private readonly queueMap = new Map<string, Array<{ id: string; score: number; candidate: IMatchCandidate }>>();
  private readonly matchBroadcasts: IMatchReadyBroadcast[] = [];

  public constructor(
    lock = new DistributedQueueLock(),
    roomAllocator = new RoomAllocator()
  ) {
    this.lock = lock;
    this.roomAllocator = roomAllocator;
  }

  /**
   * Adds candidate to queue.
   */
  public enqueue(variantId: string, candidate: IMatchCandidate): void {
    let q = this.queueMap.get(variantId);
    if (!q) {
      q = [];
      this.queueMap.set(variantId, q);
    }
    q.push({
      id: candidate.id,
      score: candidate.eloRating,
      candidate,
    });
  }

  /**
   * Executes single tick of matchmaking on the specified queue with Redlock mutual exclusion.
   */
  public matchTick(
    variantId: string,
    groupSize: number = 2,
    maxTolerance: number = 50,
    workerId: string = 'worker-1',
    nowMs: number = Date.now()
  ): { matched: boolean; match?: IMatchReadyBroadcast; lockedOut?: boolean } {
    const lockKey = `lock:queue:${variantId}`;
    const lease = this.lock.acquire(lockKey, 200, workerId, nowMs);

    if (!lease.acquired) {
      return { matched: false, lockedOut: true };
    }

    try {
      const queue = this.queueMap.get(variantId) ?? [];
      const matchResult = executeSimulatedLuaMatcher(queue, groupSize, maxTolerance);

      if (!matchResult.matched || matchResult.playerIds.length === 0) {
        return { matched: false };
      }

      // Extract matched candidates and remove from queue
      const matchedCandidates: IMatchCandidate[] = [];
      const remaining: typeof queue = [];

      for (const item of queue) {
        if (matchResult.playerIds.includes(item.id)) {
          matchedCandidates.push(item.candidate);
        } else {
          remaining.push(item);
        }
      }
      this.queueMap.set(variantId, remaining);

      // Allocate room and signed tokens
      const allocation = this.roomAllocator.allocateRoom(
        { variantId, players: matchedCandidates },
        nowMs
      );

      const broadcast: IMatchReadyBroadcast = {
        roomId: allocation.roomId,
        serverUrl: allocation.serverUrl,
        variantId,
        playerAssignments: allocation.playerAssignments,
        timestamp: nowMs,
      };

      this.matchBroadcasts.push(broadcast);
      return { matched: true, match: broadcast };
    } finally {
      if (lease.token) {
        this.lock.release(lockKey, lease.token);
      }
    }
  }

  public getBroadcastHistory(): readonly IMatchReadyBroadcast[] {
    return this.matchBroadcasts;
  }
}

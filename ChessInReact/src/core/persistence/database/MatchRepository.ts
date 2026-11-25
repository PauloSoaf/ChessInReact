/**
 * ChessInReact - Match Repository & Write-Behind Persistence (Spec 09 § 7, RF-01, RF-03, RF-07, RF-09, RF-12, RF-15)
 *
 * Implements high-performance persistence, Glicko-2 atomic rating updates,
 * Event Sourcing tape storage, soft deletes, and Leaderboard queries.
 */

import {
  IPrismaDatabaseClient,
  IDBMatchHistory,
  IDBMatchMetadata,
  IDBPlayerRating,
  IDBCustomVariant,
} from './IPrismaDatabaseClient';
import {
  Glicko2Engine,
  IGlicko2Player,
  IGlicko2MultiplayerEntry,
} from '../../../matchmaking/engine/Glicko2Engine';
import { MatchEventStreamEngine, IMatchEventStream } from '../eventsourcing/MatchEventStreamEngine';

export interface ISaveMatchInput {
  matchId: string;
  variantId: string;
  topology: string;
  seed: string;
  engineVersion?: string;
  isRanked: boolean;
  timeControl: string;
  playerIds: string[];
  playerResults: ('WIN' | 'LOSS' | 'DRAW')[];
  moveStream: string[];
  eventStream?: IMatchEventStream;
}

export class MatchRepository {
  constructor(private readonly prisma: IPrismaDatabaseClient) {}

  /**
   * Persists a completed match record with Event Sourcing tape (RF-01, RF-02, RF-03).
   * Automatically compresses event streams exceeding 50 moves.
   */
  public async saveMatch(input: ISaveMatchInput): Promise<IDBMatchHistory> {
    let compressedBytes: Uint8Array | null = null;

    if (input.eventStream && input.eventStream.events.length > 50) {
      const payload = MatchEventStreamEngine.compressStream(input.eventStream);
      const jsonStr = JSON.stringify(payload);
      compressedBytes = new TextEncoder().encode(jsonStr);
    }

    const metadata: IDBMatchMetadata = {
      variantId: input.variantId,
      topology: input.topology,
      seed: input.seed,
      timeControl: input.timeControl,
      totalTurns: input.moveStream.length,
    };

    return this.prisma.matchHistory.create({
      data: {
        id: input.matchId,
        variantId: input.variantId,
        engineVersion: input.engineVersion ?? '1.0.0',
        isRanked: input.isRanked,
        metadata,
        playerIds: input.playerIds,
        playerResults: input.playerResults,
        moveStream: input.moveStream,
        compressedPayload: compressedBytes,
      },
    });
  }

  /**
   * Loads match record by ID for deterministic replay (RF-04).
   */
  public async getMatchById(matchId: string): Promise<IDBMatchHistory | null> {
    return this.prisma.matchHistory.findUnique({
      where: { id: matchId },
    });
  }

  /**
   * Queries paginated match history for a specific player in < 50ms (RNF-04).
   */
  public async listUserMatches(
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<IDBMatchHistory[]> {
    return this.prisma.matchHistory.findMany({
      where: {
        playerIds: { has: userId },
      },
      orderBy: { endedAt: 'desc' },
      take: Math.min(50, Math.max(1, limit)),
      skip: Math.max(0, offset),
    });
  }

  /**
   * Updates Glicko-2 ratings for all match participants in a single atomic ACID transaction (RF-07, RNF-06).
   */
  public async updateRatingsTransaction(
    playerIds: string[],
    results: ('WIN' | 'LOSS' | 'DRAW')[],
    variantId: string
  ): Promise<IDBPlayerRating[]> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Fetch current ratings for all players
      const existingRatings: Record<string, IGlicko2Player> = {};
      for (const pid of playerIds) {
        const found = await tx.playerRating.findUnique({
          where: { userId_variantId: { userId: pid, variantId } },
        });
        if (found) {
          existingRatings[pid] = {
            rating: found.ratingValue,
            ratingDeviation: found.ratingDeviation,
            volatility: found.volatility,
          };
        } else {
          existingRatings[pid] = Glicko2Engine.createDefaultPlayer();
        }
      }

      // 2. Compute updated Glicko-2 rating tuples
      const engine = new Glicko2Engine();
      const updatedMap = new Map<string, IGlicko2Player>();

      if (playerIds.length === 2) {
        const scoreA = results[0] === 'WIN' ? 1.0 : results[0] === 'DRAW' ? 0.5 : 0.0;
        const p1 = playerIds[0]!;
        const p2 = playerIds[1]!;
        const res = engine.update1v1Match(existingRatings[p1]!, existingRatings[p2]!, scoreA);
        updatedMap.set(p1, res.playerA);
        updatedMap.set(p2, res.playerB);
      } else {
        const entries: IGlicko2MultiplayerEntry[] = playerIds.map((pid, idx) => ({
          playerId: pid,
          player: existingRatings[pid]!,
          rank: results[idx] === 'WIN' ? 1 : results[idx] === 'DRAW' ? 2 : 3,
        }));
        const multiRes = engine.updateMultiplayerMatch(entries);
        for (const [pid, profile] of multiRes.entries()) {
          updatedMap.set(pid, profile);
        }
      }

      // 3. Upsert into database atomically
      const saved: IDBPlayerRating[] = [];
      for (const [pid, rating] of updatedMap.entries()) {
        const res = await tx.playerRating.upsert({
          where: { userId_variantId: { userId: pid, variantId } },
          create: {
            userId: pid,
            variantId,
            ratingValue: rating.rating,
            ratingDeviation: rating.ratingDeviation,
            volatility: rating.volatility,
          },
          update: {
            ratingValue: rating.rating,
            ratingDeviation: rating.ratingDeviation,
            volatility: rating.volatility,
          },
        });
        saved.push(res);
      }

      return saved;
    });
  }

  /**
   * Retrieves top ranked players using the composite B-Tree index in < 25ms (RF-12, RNF-15).
   */
  public async getLeaderboard(
    variantId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<IDBPlayerRating[]> {
    return this.prisma.playerRating.findMany({
      where: { variantId },
      orderBy: { ratingValue: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
      skip: Math.max(0, offset),
    });
  }

  /**
   * Soft-deletes a custom variant model preserving historical replay references (RF-09).
   */
  public async softDeleteVariant(
    variantId: string,
    authorId: string
  ): Promise<IDBCustomVariant | null> {
    const existing = await this.prisma.customVariant.findUnique({
      where: { id: variantId },
    });

    if (!existing || existing.authorId !== authorId) {
      return null;
    }

    return this.prisma.customVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Purges abandoned sessions (< 2 moves) and incomplete matches (RF-15).
   */
  public async purgeAbandonedSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const candidateMatches = await this.prisma.matchHistory.findMany({
      where: {
        endedAt: { lte: cutoff },
      },
      take: 500,
    });

    const abandonedIds = candidateMatches
      .filter((m) => m.moveStream.length < 2)
      .map((m) => m.id);

    if (abandonedIds.length === 0) return 0;

    const res = await this.prisma.matchHistory.deleteMany({
      where: { id: { in: abandonedIds } },
    });

    return res.count;
  }
}

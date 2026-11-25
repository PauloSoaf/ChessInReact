import { describe, it, expect, beforeEach } from 'vitest';
import { MatchRepository, ISaveMatchInput } from '../MatchRepository';
import {
  IPrismaDatabaseClient,
  IDBUser,
  IDBPlayerRating,
  IDBMatchHistory,
  IDBCustomVariant,
} from '../IPrismaDatabaseClient';
import { MatchEventStreamEngine } from '../../eventsourcing/MatchEventStreamEngine';

function createMockPrismaClient(): IPrismaDatabaseClient {
  const users: Map<string, IDBUser> = new Map();
  const playerRatings: Map<string, IDBPlayerRating> = new Map();
  const matchHistories: Map<string, IDBMatchHistory> = new Map();
  const customVariants: Map<string, IDBCustomVariant> = new Map();

  const client: IPrismaDatabaseClient = {
    user: {
      async findUnique({ where }) {
        if (where.id) return users.get(where.id) ?? null;
        for (const u of users.values()) {
          if (where.username && u.username === where.username) return u;
          if (where.email && u.email === where.email) return u;
        }
        return null;
      },
      async create({ data }) {
        const user: IDBUser = {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.set(user.id, user);
        return user;
      },
      async update({ where, data }) {
        const existing = users.get(where.id);
        if (!existing) throw new Error('User not found');
        const updated: IDBUser = { ...existing, ...data, updatedAt: new Date() };
        users.set(where.id, updated);
        return updated;
      },
    },
    playerRating: {
      async findUnique({ where }) {
        const key = `${where.userId_variantId.userId}_${where.userId_variantId.variantId}`;
        return playerRatings.get(key) ?? null;
      },
      async findMany({ where, orderBy, take, skip }) {
        let results = Array.from(playerRatings.values());
        if (where?.variantId) {
          results = results.filter((r) => r.variantId === where.variantId);
        }
        if (orderBy?.ratingValue) {
          results.sort((a, b) =>
            orderBy.ratingValue === 'desc'
              ? b.ratingValue - a.ratingValue
              : a.ratingValue - b.ratingValue
          );
        }
        const s = skip ?? 0;
        const t = take ?? results.length;
        return results.slice(s, s + t);
      },
      async upsert({ where, create, update }) {
        const key = `${where.userId_variantId.userId}_${where.userId_variantId.variantId}`;
        const existing = playerRatings.get(key);
        if (existing) {
          const updated: IDBPlayerRating = {
            ...existing,
            ...update,
            updatedAt: new Date(),
          };
          playerRatings.set(key, updated);
          return updated;
        } else {
          const created: IDBPlayerRating = {
            ...create,
            id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            updatedAt: new Date(),
          };
          playerRatings.set(key, created);
          return created;
        }
      },
    },
    matchHistory: {
      async findUnique({ where }) {
        return matchHistories.get(where.id) ?? null;
      },
      async findMany({ where, orderBy, take, skip }) {
        let results = Array.from(matchHistories.values());
        if (where?.variantId) {
          results = results.filter((m) => m.variantId === where.variantId);
        }
        if (where?.playerIds?.has) {
          const target = where.playerIds.has;
          results = results.filter((m) => m.playerIds.includes(target));
        }
        if (where?.endedAt?.lte) {
          results = results.filter((m) => m.endedAt.getTime() <= where.endedAt!.lte!.getTime());
        }
        if (orderBy?.endedAt) {
          results.sort((a, b) =>
            orderBy.endedAt === 'desc'
              ? b.endedAt.getTime() - a.endedAt.getTime()
              : a.endedAt.getTime() - b.endedAt.getTime()
          );
        }
        const s = skip ?? 0;
        const t = take ?? results.length;
        return results.slice(s, s + t);
      },
      async create({ data }) {
        const match: IDBMatchHistory = {
          ...data,
          endedAt: data.endedAt ?? new Date(),
        };
        matchHistories.set(match.id, match);
        return match;
      },
      async deleteMany({ where }) {
        let count = 0;
        if (where.id?.in) {
          for (const id of where.id.in) {
            if (matchHistories.delete(id)) count++;
          }
        }
        return { count };
      },
    },
    customVariant: {
      async findUnique({ where }) {
        return customVariants.get(where.id) ?? null;
      },
      async findMany({ where, take, skip }) {
        let results = Array.from(customVariants.values());
        if (where?.isPublic !== undefined) {
          results = results.filter((v) => v.isPublic === where.isPublic);
        }
        if (where?.authorId) {
          results = results.filter((v) => v.authorId === where.authorId);
        }
        if (where?.deletedAt === null) {
          results = results.filter((v) => v.deletedAt === null || v.deletedAt === undefined);
        }
        const s = skip ?? 0;
        const t = take ?? results.length;
        return results.slice(s, s + t);
      },
      async create({ data }) {
        const variant: IDBCustomVariant = {
          ...data,
          createdAt: new Date(),
          deletedAt: null,
        };
        customVariants.set(variant.id, variant);
        return variant;
      },
      async update({ where, data }) {
        const existing = customVariants.get(where.id);
        if (!existing) throw new Error('Variant not found');
        const updated: IDBCustomVariant = { ...existing, ...data };
        customVariants.set(where.id, updated);
        return updated;
      },
    },
    async $transaction<T>(fn: (tx: IPrismaDatabaseClient) => Promise<T>): Promise<T> {
      return fn(client);
    },
  };

  return client;
}

describe('Spec 09 - MatchRepository & Database Persistence (S09-RF01, RF-03, RF-07, RF-09, RF-12, RF-15)', () => {
  let prisma: IPrismaDatabaseClient;
  let repo: MatchRepository;

  beforeEach(() => {
    prisma = createMockPrismaClient();
    repo = new MatchRepository(prisma);
  });

  it('persists match history with event stream and verifies lossless retrieval (RF-01, RF-02)', async () => {
    const input: ISaveMatchInput = {
      matchId: 'match_1001',
      variantId: 'standard',
      topology: 'SQUARE',
      seed: 'seed_abc',
      isRanked: true,
      timeControl: '5+3',
      playerIds: ['user_p1', 'user_p2'],
      playerResults: ['WIN', 'LOSS'],
      moveStream: ['e2>e4', 'e7>e5', 'g1>f3'],
    };

    const saved = await repo.saveMatch(input);
    expect(saved.id).toBe('match_1001');
    expect(saved.engineVersion).toBe('1.0.0');
    expect(saved.playerIds).toEqual(['user_p1', 'user_p2']);
    expect(saved.compressedPayload).toBeNull();

    const loaded = await repo.getMatchById('match_1001');
    expect(loaded).toBeDefined();
    expect(loaded?.metadata.seed).toBe('seed_abc');
    expect(loaded?.metadata.totalTurns).toBe(3);
  });

  it('compresses event stream with LZ-dictionary encoding for games > 50 moves (RF-03, RNF-01)', async () => {
    let stream = MatchEventStreamEngine.createStream('match_long', 'seed_dense');
    for (let i = 1; i <= 60; i++) {
      stream = MatchEventStreamEngine.appendEvent(stream, {
        notation: `mv${i}`,
        fromCoord: 'e2',
        toCoord: 'e4',
        pieceId: 'p_w1',
        timestampMs: i * 1000,
      });
    }

    const input: ISaveMatchInput = {
      matchId: 'match_long',
      variantId: 'hex_4p',
      topology: 'HEX',
      seed: 'seed_dense',
      isRanked: true,
      timeControl: '10+0',
      playerIds: ['u1', 'u2', 'u3', 'u4'],
      playerResults: ['WIN', 'LOSS', 'LOSS', 'LOSS'],
      moveStream: stream.events.map((e) => `${e.fromCoord}>${e.toCoord}`),
      eventStream: stream,
    };

    const saved = await repo.saveMatch(input);
    expect(saved.compressedPayload).not.toBeNull();
    expect(saved.compressedPayload?.byteLength).toBeGreaterThan(0);

    const jsonStr = new TextDecoder().decode(saved.compressedPayload!);
    const parsedPayload = JSON.parse(jsonStr);
    expect(parsedPayload.isCompressed).toBe(true);
    expect(parsedPayload.uncompressedPlyCount).toBe(60);
  });

  it('lists user match history with pagination in descending order (RNF-04)', async () => {
    for (let i = 1; i <= 5; i++) {
      await repo.saveMatch({
        matchId: `m_${i}`,
        variantId: 'standard',
        topology: 'SQUARE',
        seed: `seed_${i}`,
        isRanked: true,
        timeControl: '3+2',
        playerIds: ['target_user', `bot_${i}`],
        playerResults: ['WIN', 'LOSS'],
        moveStream: ['e2>e4'],
      });
    }

    const page1 = await repo.listUserMatches('target_user', 3, 0);
    expect(page1).toHaveLength(3);

    const page2 = await repo.listUserMatches('target_user', 3, 3);
    expect(page2).toHaveLength(2);
  });

  it('updates Glicko-2 ratings atomically inside an ACID transaction (RF-07, RNF-06)', async () => {
    const playerIds = ['alice', 'bob'];
    const results: ('WIN' | 'LOSS')[] = ['WIN', 'LOSS'];

    const updated = await repo.updateRatingsTransaction(playerIds, results, 'standard');
    expect(updated).toHaveLength(2);

    const aliceRating = updated.find((r) => r.userId === 'alice')!;
    const bobRating = updated.find((r) => r.userId === 'bob')!;

    // Winner rating increases, loser rating decreases
    expect(aliceRating.ratingValue).toBeGreaterThan(1500);
    expect(bobRating.ratingValue).toBeLessThan(1500);
    expect(aliceRating.ratingDeviation).toBeLessThan(350);
  });

  it('retrieves variant leaderboard sorted by ratingValue DESC (RF-12, RNF-15)', async () => {
    await prisma.playerRating.upsert({
      where: { userId_variantId: { userId: 'player_a', variantId: 'duck' } },
      create: { userId: 'player_a', variantId: 'duck', ratingValue: 1650, ratingDeviation: 100, volatility: 0.06 },
      update: {},
    });
    await prisma.playerRating.upsert({
      where: { userId_variantId: { userId: 'player_b', variantId: 'duck' } },
      create: { userId: 'player_b', variantId: 'duck', ratingValue: 1800, ratingDeviation: 80, volatility: 0.06 },
      update: {},
    });
    await prisma.playerRating.upsert({
      where: { userId_variantId: { userId: 'player_c', variantId: 'duck' } },
      create: { userId: 'player_c', variantId: 'duck', ratingValue: 1400, ratingDeviation: 120, volatility: 0.06 },
      update: {},
    });

    const leaderboard = await repo.getLeaderboard('duck', 10);
    expect(leaderboard).toHaveLength(3);
    expect(leaderboard[0]?.userId).toBe('player_b'); // 1800
    expect(leaderboard[1]?.userId).toBe('player_a'); // 1650
    expect(leaderboard[2]?.userId).toBe('player_c'); // 1400
  });

  it('applies soft delete to custom variants preserving historical references (RF-09)', async () => {
    const created = await prisma.customVariant.create({
      data: {
        id: 'var_dragon',
        authorId: 'author_1',
        name: 'Dragon Piece',
        betzaRules: 'mQN',
        isPublic: true,
      },
    });
    expect(created.deletedAt).toBeNull();

    // Unauthorized deletion must be rejected
    const unauth = await repo.softDeleteVariant('var_dragon', 'intruder');
    expect(unauth).toBeNull();

    // Authorized author soft-delete
    const deleted = await repo.softDeleteVariant('var_dragon', 'author_1');
    expect(deleted).not.toBeNull();
    expect(deleted?.deletedAt).toBeInstanceOf(Date);

    // Record remains in database for historic replay
    const rawRecord = await prisma.customVariant.findUnique({ where: { id: 'var_dragon' } });
    expect(rawRecord).toBeDefined();
    expect(rawRecord?.deletedAt).not.toBeNull();
  });

  it('purges abandoned matches with less than 2 moves (RF-15)', async () => {
    const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    // Abandoned match (< 2 moves)
    await prisma.matchHistory.create({
      data: {
        id: 'abandoned_1',
        variantId: 'standard',
        engineVersion: '1.0.0',
        isRanked: false,
        metadata: { variantId: 'standard', topology: 'SQUARE', seed: 's1', timeControl: '5+0', totalTurns: 1 },
        playerIds: ['p1', 'p2'],
        playerResults: ['DRAW', 'DRAW'],
        moveStream: ['e2>e4'],
        endedAt: oldDate,
      },
    });

    // Completed match (>= 2 moves)
    await prisma.matchHistory.create({
      data: {
        id: 'completed_1',
        variantId: 'standard',
        engineVersion: '1.0.0',
        isRanked: true,
        metadata: { variantId: 'standard', topology: 'SQUARE', seed: 's2', timeControl: '5+0', totalTurns: 4 },
        playerIds: ['p1', 'p2'],
        playerResults: ['WIN', 'LOSS'],
        moveStream: ['e2>e4', 'e7>e5', 'g1>f3', 'b8>c6'],
        endedAt: oldDate,
      },
    });

    const purgedCount = await repo.purgeAbandonedSessions(7 * 24 * 60 * 60 * 1000);
    expect(purgedCount).toBe(1);

    expect(await repo.getMatchById('abandoned_1')).toBeNull();
    expect(await repo.getMatchById('completed_1')).not.toBeNull();
  });
});


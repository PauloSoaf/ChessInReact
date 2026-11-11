import { describe, it, expect } from 'vitest';
import {
  MatchEventStreamEngine,
  IMatchEventStream,
  UserStatsAggregator,
  IMatchSummaryInput,
  SupabaseRLSPolicyCatalog,
} from '../index';

describe('Spec 09 - Supabase Event Sourcing, Compression & RLS (S09-RF01, RF-02, RF-03, RF-11, RF-12, RF-14)', () => {
  describe('MatchEventStreamEngine (Event Sourcing & Compression)', () => {
    it('creates initial event stream with semantic engine version 1.0.0', () => {
      const stream = MatchEventStreamEngine.createStream('m_1001', 'seed_alpha_42');
      expect(stream.matchId).toBe('m_1001');
      expect(stream.initialSeed).toBe('seed_alpha_42');
      expect(stream.engineVersion).toBe('1.0.0');
      expect(stream.events).toHaveLength(0);
    });

    it('appends events sequentially and advances ply counter deterministically', () => {
      let stream = MatchEventStreamEngine.createStream('m_1002');

      stream = MatchEventStreamEngine.appendEvent(stream, {
        notation: 'e4',
        fromCoord: 'e2',
        toCoord: 'e4',
        pieceId: 'p_w_e2',
        timestampMs: 1200,
      });

      stream = MatchEventStreamEngine.appendEvent(stream, {
        notation: 'e5',
        fromCoord: 'e7',
        toCoord: 'e5',
        pieceId: 'p_b_e7',
        timestampMs: 2400,
      });

      expect(stream.events).toHaveLength(2);
      expect(stream.events[0]?.ply).toBe(1);
      expect(stream.events[1]?.ply).toBe(2);

      const tape = MatchEventStreamEngine.exportAsLinearTape(stream);
      expect(tape).toEqual(['e2>e4@1200', 'e7>e5@2400']);
    });

    it('keeps raw JSON payload for short games (<= 50 moves) and roundtrips losslessly', () => {
      let stream = MatchEventStreamEngine.createStream('m_short');
      for (let i = 1; i <= 20; i++) {
        stream = MatchEventStreamEngine.appendEvent(stream, {
          notation: `mv${i}`,
          fromCoord: `a${(i % 8) + 1}`,
          toCoord: `b${(i % 8) + 1}`,
          pieceId: `pc_${i}`,
          timestampMs: i * 1000,
        });
      }

      const compressed = MatchEventStreamEngine.compressStream(stream);
      expect(compressed.isCompressed).toBe(false);
      expect(compressed.uncompressedPlyCount).toBe(20);

      const decompressed = MatchEventStreamEngine.decompressStream(compressed);
      expect(decompressed.events).toHaveLength(20);
      expect(decompressed.events).toEqual(stream.events);
    });

    it('activates dictionary compression for games > 50 moves and roundtrips 100% deterministically', () => {
      let stream: IMatchEventStream = MatchEventStreamEngine.createStream('m_long', 'seed_999');

      // Generate 70 moves with recurring tactical patterns
      const recurringMoves = [
        { notation: 'Nf3', from: 'g1', to: 'f3', p: 'w_n1' },
        { notation: 'Nc6', from: 'b8', to: 'c6', p: 'b_n1' },
        { notation: 'Bb5', from: 'f1', to: 'b5', p: 'w_b1' },
        { notation: 'a6', from: 'a7', to: 'a6', p: 'b_p1' },
      ];

      for (let i = 0; i < 70; i++) {
        const pattern = recurringMoves[i % recurringMoves.length]!;
        stream = MatchEventStreamEngine.appendEvent(stream, {
          notation: pattern.notation,
          fromCoord: pattern.from,
          toCoord: pattern.to,
          pieceId: pattern.p,
          timestampMs: (i + 1) * 1500,
        });
      }

      expect(stream.events).toHaveLength(70);

      const payload = MatchEventStreamEngine.compressStream(stream);
      expect(payload.isCompressed).toBe(true);
      expect(payload.uncompressedPlyCount).toBe(70);
      expect(payload.compressedIndices).toHaveLength(70);
      // Dictionary deduplicates the recurring move tokens
      expect(payload.dictionary.length).toBeLessThan(70);

      const restored = MatchEventStreamEngine.decompressStream(payload);
      expect(restored.matchId).toBe('m_long');
      expect(restored.initialSeed).toBe('seed_999');
      expect(restored.events).toHaveLength(70);
      expect(restored.events).toEqual(stream.events);
    });
  });

  describe('UserStatsAggregator (Player Lifetime Analytics)', () => {
    it('returns zero metrics when matches history is empty', () => {
      const stats = UserStatsAggregator.calculateStats([]);
      expect(stats.totalMatches).toBe(0);
      expect(stats.wins).toBe(0);
      expect(stats.winRatePercentage).toBe(0);
      expect(stats.averageAccuracyCaps2).toBe(0);
      expect(stats.variantBreakdown).toEqual({});
    });

    it('aggregates match outcomes, win rates, duration and accuracy CAPS2', () => {
      const matches: IMatchSummaryInput[] = [
        { matchId: 'm1', variantId: 'standard', result: 'WIN', durationSeconds: 600, movesCount: 40, accuracyCaps2: 85.5 },
        { matchId: 'm2', variantId: 'standard', result: 'LOSS', durationSeconds: 400, movesCount: 30, accuracyCaps2: 70.0 },
        { matchId: 'm3', variantId: 'duck', result: 'WIN', durationSeconds: 300, movesCount: 20, accuracyCaps2: 90.0 },
        { matchId: 'm4', variantId: 'spell', result: 'DRAW', durationSeconds: 500, movesCount: 35, accuracyCaps2: 80.0 },
      ];

      const stats = UserStatsAggregator.calculateStats(matches);
      expect(stats.totalMatches).toBe(4);
      expect(stats.wins).toBe(2);
      expect(stats.losses).toBe(1);
      expect(stats.draws).toBe(1);
      expect(stats.winRatePercentage).toBe(50.0); // 2/4 = 50%
      expect(stats.averageAccuracyCaps2).toBe(81.38); // (85.5 + 70 + 90 + 80) / 4 = 81.375 -> 81.38
      expect(stats.totalDurationSeconds).toBe(1800);
      expect(stats.totalMovesCount).toBe(125);

      // Variant breakdown
      expect(stats.variantBreakdown['standard']?.played).toBe(2);
      expect(stats.variantBreakdown['standard']?.wins).toBe(1);
      expect(stats.variantBreakdown['standard']?.winRatePercentage).toBe(50.0);

      expect(stats.variantBreakdown['duck']?.played).toBe(1);
      expect(stats.variantBreakdown['duck']?.wins).toBe(1);
      expect(stats.variantBreakdown['duck']?.winRatePercentage).toBe(100.0);

      expect(stats.variantBreakdown['spell']?.played).toBe(1);
      expect(stats.variantBreakdown['spell']?.draws).toBe(1);
      expect(stats.variantBreakdown['spell']?.winRatePercentage).toBe(0);
    });
  });

  describe('SupabaseRLSPolicyCatalog (Security & Migration Integrity)', () => {
    it('defines authoritative RLS policies for all core relational tables', () => {
      const policies = SupabaseRLSPolicyCatalog.POLICIES;
      expect(policies.length).toBeGreaterThanOrEqual(6);

      const userUpdatePolicy = policies.find((p) => p.policyName === 'user_update_own_profile');
      expect(userUpdatePolicy).toBeDefined();
      expect(userUpdatePolicy?.usingExpression).toContain('auth.uid()');

      const variantReadPolicy = policies.find((p) => p.policyName === 'variants_read_public_or_own');
      expect(variantReadPolicy).toBeDefined();
      expect(variantReadPolicy?.usingExpression).toContain('"isPublic" = true');
      expect(variantReadPolicy?.usingExpression).toContain('"deletedAt" IS NULL');
    });

    it('defines compound B-Tree indexes for ultra-fast leaderboard and query resolution', () => {
      const indexes = SupabaseRLSPolicyCatalog.INDEXES;
      expect(indexes.length).toBeGreaterThanOrEqual(4);

      const leaderboardIndex = indexes.find((i) => i.indexName === 'idx_player_rating_leaderboard_btree');
      expect(leaderboardIndex).toBeDefined();
      expect(leaderboardIndex?.tableName).toBe('PlayerRating');
      expect(leaderboardIndex?.columns).toEqual(['variantId', 'ratingValue DESC']);
    });

    it('generates executable SQL migration string containing RLS and Index definitions', () => {
      const sql = SupabaseRLSPolicyCatalog.generatePostgresMigrationSql();
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('CREATE POLICY "user_update_own_profile"');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS "idx_player_rating_leaderboard_btree"');
    });
  });
});

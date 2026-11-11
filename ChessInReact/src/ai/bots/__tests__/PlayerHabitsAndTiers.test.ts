import { describe, it, expect } from 'vitest';
import {
  PlayerHabitProfiler,
  IPlayerMoveSample,
  LowRatingBlunderInjector,
  ICandidateMoveEval,
  TierProgressionManager,
  IPlayerProgressionState,
} from '../index';

describe('Spec 11 - Player Habit Profiling, Low-Rating Blunder & Tier Progression (S11-RF05, S11-RF06, S11-RF12)', () => {
  describe('PlayerHabitProfiler (RF-05 Habit Profiling)', () => {
    it('returns default balanced profile when no move samples exist', () => {
      const profile = PlayerHabitProfiler.buildProfile('p_empty', []);
      expect(profile.playerId).toBe('p_empty');
      expect(profile.totalMovesSampled).toBe(0);
      expect(profile.aggressivenessScore).toBe(0.5);
      expect(profile.castlingPreference).toBe('FLEXIBLE');
      expect(profile.averageMoveTimeMs).toBe(5000);
    });

    it('identifies hyper-aggressive early attackers with early queen moves and checks', () => {
      const samples: IPlayerMoveSample[] = [
        { ply: 2, moveUci: 'e2e4', isEarlyQueenMove: false, isCheckDelivered: false, isPawnCapture: false, durationMs: 1200 },
        { ply: 4, moveUci: 'd1h5', isEarlyQueenMove: true, isCheckDelivered: false, isPawnCapture: false, durationMs: 800 },
        { ply: 6, moveUci: 'f1c4', isEarlyQueenMove: false, isCheckDelivered: false, isPawnCapture: false, durationMs: 1500 },
        { ply: 8, moveUci: 'h5f7', isEarlyQueenMove: true, isCheckDelivered: true, isPawnCapture: true, durationMs: 900 },
      ];

      const profile = PlayerHabitProfiler.buildProfile('p_aggro', samples);
      expect(profile.totalMovesSampled).toBe(4);
      expect(profile.aggressivenessScore).toBeGreaterThanOrEqual(0.8);
      expect(profile.earlyAttackTendency).toBeGreaterThan(0.5);
      expect(profile.averageMoveTimeMs).toBe(1100);
    });

    it('classifies castling preference as KINGSIDE when player predominantly castles O-O', () => {
      const samples: IPlayerMoveSample[] = [
        { ply: 10, moveUci: 'e1g1', isEarlyQueenMove: false, isCheckDelivered: false, isPawnCapture: false, castledSide: 'O-O', durationMs: 4000 },
        { ply: 12, moveUci: 'e1g1', isEarlyQueenMove: false, isCheckDelivered: false, isPawnCapture: false, castledSide: 'O-O', durationMs: 3000 },
        { ply: 14, moveUci: 'e1g1', isEarlyQueenMove: false, isCheckDelivered: false, isPawnCapture: false, castledSide: 'O-O', durationMs: 5000 },
      ];

      const profile = PlayerHabitProfiler.buildProfile('p_castle', samples);
      expect(profile.castlingPreference).toBe('KINGSIDE');
    });
  });

  describe('LowRatingBlunderInjector (RF-06 Blunder & Noise Injection)', () => {
    it('sets blunder probability to 0.0 for bots rated 800 and above', () => {
      expect(LowRatingBlunderInjector.getBlunderProbability(800)).toBe(0.0);
      expect(LowRatingBlunderInjector.getBlunderProbability(1200)).toBe(0.0);
      expect(LowRatingBlunderInjector.getBlunderProbability(2200)).toBe(0.0);
    });

    it('scales blunder probability inversely with rating for beginner bots (< 800)', () => {
      const prob0 = LowRatingBlunderInjector.getBlunderProbability(0);
      const prob400 = LowRatingBlunderInjector.getBlunderProbability(400);
      const prob750 = LowRatingBlunderInjector.getBlunderProbability(750);

      expect(prob0).toBeCloseTo(0.30, 2);
      expect(prob400).toBeLessThan(prob0);
      expect(prob750).toBeLessThan(prob400);
      expect(prob750).toBeGreaterThan(0.0);
    });

    it('injects blunder into candidate selection when random seed falls below blunder threshold', () => {
      const candidates: ICandidateMoveEval[] = [
        { moveUci: 'e2e4', baseScoreCentipawns: 35 },
        { moveUci: 'g1f3', baseScoreCentipawns: 25 },
        { moveUci: 'f2f3', baseScoreCentipawns: -250 }, // Weak blunder move
      ];

      // Seed 0.01 is well below rating 0 blunder probability (~0.30)
      const blunderResult = LowRatingBlunderInjector.perturbAndSelectMove(candidates, 0, 0.01);
      expect(blunderResult.isBlunderInjected).toBe(true);
      expect(blunderResult.selectedMoveUci).not.toBe('e2e4');

      // Seed 0.99 avoids blunder and selects top perturbed move
      const normalResult = LowRatingBlunderInjector.perturbAndSelectMove(candidates, 1200, 0.99);
      expect(normalResult.isBlunderInjected).toBe(false);
      expect(normalResult.selectedMoveUci).toBe('e2e4');
    });
  });

  describe('TierProgressionManager (RF-12 Progressive Tier Unlocking)', () => {
    it('initializes with Tier 1 unlocked and higher tiers locked for new players', () => {
      const state: IPlayerProgressionState = {
        playerRating: 300,
        victoriesByTier: { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 },
      };

      const tiers = TierProgressionManager.evaluateAllTiers(state);
      expect(tiers[0]?.isUnlocked).toBe(true);
      expect(tiers[1]?.isUnlocked).toBe(false);
      expect(tiers[2]?.isUnlocked).toBe(false);
      expect(tiers[3]?.isUnlocked).toBe(false);

      expect(TierProgressionManager.isTierUnlocked(state, 'tier_1')).toBe(true);
      expect(TierProgressionManager.isTierUnlocked(state, 'tier_2')).toBe(false);
    });

    it('unlocks Tier 2 when player earns 3 victories in Tier 1 or achieves Rating 500', () => {
      let state: IPlayerProgressionState = {
        playerRating: 400,
        victoriesByTier: { tier_1: 2, tier_2: 0, tier_3: 0, tier_4: 0 },
      };

      expect(TierProgressionManager.isTierUnlocked(state, 'tier_2')).toBe(false);

      // Earn 3rd victory
      state = TierProgressionManager.recordVictory(state, 'tier_1');
      expect(state.victoriesByTier.tier_1).toBe(3);
      expect(TierProgressionManager.isTierUnlocked(state, 'tier_2')).toBe(true);

      // Or with Rating >= 500
      const ratingUnlockState: IPlayerProgressionState = {
        playerRating: 520,
        victoriesByTier: { tier_1: 0, tier_2: 0, tier_3: 0, tier_4: 0 },
      };
      expect(TierProgressionManager.isTierUnlocked(ratingUnlockState, 'tier_2')).toBe(true);
    });

    it('unlocks Tier 3 and Tier 4 sequentially as milestones are conquered', () => {
      let state: IPlayerProgressionState = {
        playerRating: 1200,
        victoriesByTier: { tier_1: 3, tier_2: 0, tier_3: 0, tier_4: 0 },
      };

      // Rating 1200 unlocks Tier 3 (since Tier 2 is unlocked by Tier 1 wins)
      expect(TierProgressionManager.isTierUnlocked(state, 'tier_3')).toBe(true);
      expect(TierProgressionManager.isTierUnlocked(state, 'tier_4')).toBe(false);

      // 5 victories in Tier 3 unlocks Tier 4
      state = {
        ...state,
        victoriesByTier: { ...state.victoriesByTier, tier_3: 5 },
      };
      expect(TierProgressionManager.isTierUnlocked(state, 'tier_4')).toBe(true);
    });
  });
});

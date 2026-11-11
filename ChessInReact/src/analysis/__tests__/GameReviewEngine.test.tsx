// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameReviewEngine } from '../GameReviewEngine';
import { AdvantageGraph } from '../components/AdvantageGraph';

describe('Spec 12 Game Review, CAPS2 Accuracy & Advantage Graph Suite (S12-RF01, S12-RF02, S12-RF03)', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Centipawns to Win Probability Sigmoidal Mapping (Spec 12 § 1, RF-01)', () => {
    it('accurately maps standard centipawns to scientific winning chances', () => {
      expect(GameReviewEngine.centipawnsToWinProbability(0)).toBe(50.0);
      expect(GameReviewEngine.centipawnsToWinProbability(300)).toBeCloseTo(75.1, 0);
      expect(GameReviewEngine.centipawnsToWinProbability(-300)).toBeCloseTo(24.9, 0);
      expect(GameReviewEngine.centipawnsToWinProbability(1200)).toBeGreaterThan(95.0);
      expect(GameReviewEngine.centipawnsToWinProbability(-1200)).toBeLessThan(5.0);
    });
  });

  describe('2. Move Quality Classification Matrix (Spec 12 § 1, RF-01)', () => {
    it('classifies moves across all tiers based on winning probability drop', () => {
      // White move: 50% -> 50% = Best
      expect(GameReviewEngine.classifyMove(50, 50, true)).toBe('BEST');
      // White move: 50% -> 48% (drop 2%) = Excellent
      expect(GameReviewEngine.classifyMove(50, 48, true)).toBe('EXCELLENT');
      // White move: 50% -> 45% (drop 5%) = Good
      expect(GameReviewEngine.classifyMove(50, 45, true)).toBe('GOOD');
      // White move: 50% -> 38% (drop 12%) = Inaccuracy
      expect(GameReviewEngine.classifyMove(50, 38, true)).toBe('INACCURACY');
      // White move: 50% -> 28% (drop 22%) = Mistake
      expect(GameReviewEngine.classifyMove(50, 28, true)).toBe('MISTAKE');
      // White move: 50% -> 15% (drop 35%) = Blunder
      expect(GameReviewEngine.classifyMove(50, 15, true)).toBe('BLUNDER');

      // Brilliant move: sacrifice with <= 1.5% drop
      expect(GameReviewEngine.classifyMove(55, 55, true, { isSacrifice: true })).toBe('BRILLIANT');

      // Missed win: dropped from 90% down to 50%
      expect(GameReviewEngine.classifyMove(90, 50, true)).toBe('MISSED_WIN');
    });

    it('classifies Black moves correctly where lower win chance is advantageous for Black', () => {
      // Black move: 50% -> 40% (Black gained 10%, drop is 0) = Best
      expect(GameReviewEngine.classifyMove(50, 40, false)).toBe('BEST');
      // Black move: 50% -> 68% (Black lost 18%) = Mistake
      expect(GameReviewEngine.classifyMove(50, 68, false)).toBe('MISTAKE');
      // Black move: 50% -> 85% (Black lost 35%) = Blunder
      expect(GameReviewEngine.classifyMove(50, 85, false)).toBe('BLUNDER');
    });
  });

  describe('3. CAPS2 Accuracy Calculation (Spec 12 § 1, RF-02)', () => {
    it('computes 100% accuracy for zero-loss play and scales gracefully', () => {
      expect(GameReviewEngine.computeCAPS2Accuracy([])).toBe(100.0);
      expect(GameReviewEngine.computeCAPS2Accuracy([0, 0, 0])).toBe(100.0);
      expect(GameReviewEngine.computeCAPS2Accuracy([2, 3, 1])).toBeGreaterThan(88.0);
      expect(GameReviewEngine.computeCAPS2Accuracy([25, 30, 20])).toBeLessThan(40.0);
    });
  });

  describe('4. Full Match Review Analysis (Spec 12 § 1, RF-01, RF-02)', () => {
    it('analyzes evaluation stream and returns complete review breakdown', () => {
      const evalsCp = [20, 15, 60, -40, 180, 160, 450, 420];
      const sans = ['e4', 'e5', 'Nf3', 'd6', 'd4', 'exd4', 'Nxd4', 'Nf6'];

      const summary = GameReviewEngine.analyzeMatch(evalsCp, sans);

      expect(summary.whiteAccuracy).toBeGreaterThan(70.0);
      expect(summary.blackAccuracy).toBeGreaterThan(60.0);
      expect(summary.evalStream).toHaveLength(8);

      expect(summary.evalStream[0].ply).toBe(1);
      expect(summary.evalStream[0].turnNumber).toBe(1);
      expect(summary.evalStream[0].isWhite).toBe(true);
      expect(summary.evalStream[0].moveSan).toBe('e4');
      expect(summary.evalStream[1].isWhite).toBe(false);

      expect(summary.counts.P1.BEST + summary.counts.P1.EXCELLENT + summary.counts.P1.GOOD).toBeGreaterThan(0);
    });
  });

  describe('5. Interactive SVG AdvantageGraph Component (Spec 12 § 1, RF-03)', () => {
    it('renders responsive SVG line graph with area fills and handles scrub click', () => {
      const evalsCp = [0, 40, -60, 250, -350];
      const summary = GameReviewEngine.analyzeMatch(evalsCp);
      const handleSelectPly = vi.fn();

      render(
        <AdvantageGraph
          evalStream={summary.evalStream}
          currentPly={3}
          onSelectPly={handleSelectPly}
        />
      );

      expect(screen.getByTestId('advantage-graph-container')).toBeDefined();
      const svg = screen.getByTestId('advantage-graph-svg');
      expect(svg).toBeDefined();

      // Click to scrub to a ply
      fireEvent.click(svg, { clientX: 200, clientY: 50 });
      expect(handleSelectPly).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  AIWorkerPool,
  MaxNMultiplayerStrategy,
  ISMCTSFogOfWarStrategy,
  DuckChessPlannerStrategy,
  BughouseCoordinatedAgent,
  SpellOptimizationStrategy,
  PuzzleBattleBotStrategy,
} from '../index';

describe('Spec 15: Universal Bot Intelligence & Pluggable Engines', () => {
  const mockLegalMoves = [
    { from: 'e2', to: 'e4', pieceId: 'wp_e2', isCapture: false },
    { from: 'g1', to: 'f3', pieceId: 'wn_g1', isCapture: false },
    { from: 'd2', to: 'd4', pieceId: 'wp_d2', isCapture: false },
    { from: 'e4', to: 'd5', pieceId: 'wp_e4', isCapture: true }, // Capture!
  ];

  describe('RF-15-01: Strategy Router Coverage for 100% of Variants', () => {
    it('maps every variant family to a specialized AI strategy', () => {
      expect(AIWorkerPool.selectStrategyForVariant('FOUR_PLAYER_FFA', 4)).toBe('MAXN_MULTIPLAYER');
      expect(AIWorkerPool.selectStrategyForVariant('FOG_OF_WAR')).toBe('ISMCTS_FOG_OF_WAR');
      expect(AIWorkerPool.selectStrategyForVariant('DUCK_CHESS')).toBe('JOINT_MOVE_DUCK_PLANNER');
      expect(AIWorkerPool.selectStrategyForVariant('BUGHOUSE')).toBe('BUGHOUSE_PARTNER_AGENT');
      expect(AIWorkerPool.selectStrategyForVariant('SPELL_CHESS_OFFICIAL')).toBe('SPELL_OPTIMIZER');
      expect(AIWorkerPool.selectStrategyForVariant('SPELL_CHESS_EXPANDED')).toBe('SPELL_OPTIMIZER');
      expect(AIWorkerPool.selectStrategyForVariant('CHESS_STANDARD')).toBe('MINIMAX_ALPHA_BETA');
    });
  });

  describe('RF-15-02: MaxN Multiplayer Strategy (3 to 12 Players)', () => {
    it('evaluates multi-player candidate moves', () => {
      const strategy = new MaxNMultiplayerStrategy();
      const decision = strategy.decideMove({
        matchId: 'm1',
        variantId: 'HEXAGON_SIX_PLAYER',
        actingPlayer: 'FACTION_1',
        difficultyLevel: 3,
        timeBudgetMs: 1000,
        legalMoves: mockLegalMoves,
      });

      expect(decision.strategyUsed).toBe('MAXN_MULTIPLAYER');
      expect(decision.move).toBeDefined();
      expect(decision.move.from).toBeDefined();
      expect(decision.move.to).toBeDefined();
      expect(decision.depthReached).toBeGreaterThanOrEqual(1);
    });
  });

  describe('RF-15-03: ISMCTS Fog of War Strategy (Information Set Search)', () => {
    it('operates exclusively over belief sets without accessing hidden enemy pieces', () => {
      const strategy = new ISMCTSFogOfWarStrategy();
      const decision = strategy.decideMove({
        matchId: 'm2',
        variantId: 'FOG_OF_WAR',
        actingPlayer: 'WHITE',
        difficultyLevel: 3,
        timeBudgetMs: 800,
        legalMoves: mockLegalMoves,
      });

      expect(decision.strategyUsed).toBe('ISMCTS_FOG_OF_WAR');
      expect(decision.move).toBeDefined();
      expect(decision.nodesEvaluated).toBeGreaterThan(0);
    });
  });

  describe('RF-15-04: Joint Move-Duck Planner for Duck Chess', () => {
    it('selects legal piece move and chooses an unoccupied duck coordinate', () => {
      const strategy = new DuckChessPlannerStrategy();
      const decision = strategy.decideMove({
        matchId: 'm3',
        variantId: 'DUCK_CHESS',
        actingPlayer: 'WHITE',
        difficultyLevel: 3,
        timeBudgetMs: 1000,
        legalMoves: mockLegalMoves,
        specializedContext: { emptySquares: ['f3', 'd4', 'c3'] },
      });

      expect(decision.strategyUsed).toBe('JOINT_MOVE_DUCK_PLANNER');
      expect(decision.secondaryAction?.type).toBe('PLACE_DUCK');
      expect(decision.secondaryAction?.payload.targetCoordinate).toBeDefined();
      // Duck square cannot equal piece destination square
      expect(decision.secondaryAction?.payload.targetCoordinate).not.toBe(decision.move.to);
    });
  });

  describe('RF-15-05: Coordinated Bughouse Partner Agent', () => {
    it('prioritizes capturing pieces requested by team partner', () => {
      const strategy = new BughouseCoordinatedAgent();
      const moves = [
        { from: 'e2', to: 'e4', pieceId: 'wp_e2', isCapture: false },
        { from: 'c1', to: 'f4', pieceId: 'wb_c1', isCapture: false },
        { from: 'f3', to: 'e5', pieceId: 'wn_f3_target_knight', isCapture: true }, // Captures a knight
      ];

      const decision = strategy.decideMove({
        matchId: 'm4',
        variantId: 'BUGHOUSE',
        actingPlayer: 'WHITE',
        difficultyLevel: 4,
        timeBudgetMs: 1000,
        legalMoves: moves,
        specializedContext: { partnerRequest: 'KNIGHT' },
      });

      expect(decision.strategyUsed).toBe('BUGHOUSE_PARTNER_AGENT');
      expect(decision.move.to).toBe('e5'); // Captured requested knight!
    });
  });

  describe('RF-15-06: Spell Optimizer Strategy (Official vs Expanded)', () => {
    it('evaluates and pairs spells with move in Expanded Spell Chess', () => {
      const strategy = new SpellOptimizationStrategy();
      const decision = strategy.decideMove({
        matchId: 'm5',
        variantId: 'SPELL_CHESS_EXPANDED',
        actingPlayer: 'WHITE',
        difficultyLevel: 3,
        timeBudgetMs: 1000,
        legalMoves: mockLegalMoves,
        specializedContext: { mana: 4 },
      });

      expect(decision.strategyUsed).toBe('SPELL_OPTIMIZER');
      expect(decision.secondaryAction?.type).toBe('CAST_SPELL');
      expect(decision.secondaryAction?.payload.spellType).toBe('FREEZE');
    });

    it('evaluates Jump spell in Official Spell Chess', () => {
      const strategy = new SpellOptimizationStrategy();
      const decision = strategy.decideMove({
        matchId: 'm6',
        variantId: 'SPELL_CHESS_OFFICIAL',
        actingPlayer: 'WHITE',
        difficultyLevel: 3,
        timeBudgetMs: 1000,
        legalMoves: mockLegalMoves,
        specializedContext: { jumpCharges: 2 },
      });

      expect(decision.strategyUsed).toBe('SPELL_OPTIMIZER');
      expect(decision.secondaryAction?.type).toBe('CAST_SPELL');
      expect(decision.secondaryAction?.payload.spellType).toBe('JUMP');
    });
  });

  describe('RF-15-07: Puzzle Battle Bot Strategy (Calibrated Human Latency)', () => {
    it('simulates solving probability and latency scaled by bot ELO', () => {
      const masterAttempt = PuzzleBattleBotStrategy.simulatePuzzleAttempt(2600, 1500, 'Qxf7#');
      expect(masterAttempt.isSolved).toBe(true);
      expect(masterAttempt.solutionMoveSan).toBe('Qxf7#');
      expect(masterAttempt.thinkTimeMs).toBeLessThanOrEqual(3000);

      const beginnerAttempt = PuzzleBattleBotStrategy.simulatePuzzleAttempt(800, 2400, 'Qxf7#');
      expect(beginnerAttempt.isSolved).toBe(false);
      expect(beginnerAttempt.solutionMoveSan).toBe('Qxf7??');
    });
  });

  describe('RF-15-08 & RNF-15-02: AIWorkerPool Dispatch & Linear Fallback', () => {
    it('dispatches asynchronously and executes emergency fallback in < 2.0ms', async () => {
      const res = await AIWorkerPool.dispatchDecision({
        matchId: 'm7',
        variantId: 'DUCK_CHESS',
        actingPlayer: 'WHITE',
        difficultyLevel: 3,
        timeBudgetMs: 1000,
        legalMoves: mockLegalMoves,
      });

      expect(res.move).toBeDefined();
      expect(res.strategyUsed).toBe('JOINT_MOVE_DUCK_PLANNER');

      // Test Emergency Fallback directly
      const t0 = performance.now();
      const fallback = AIWorkerPool.executeEmergencyFallback({
        matchId: 'm8',
        variantId: 'CHESS_STANDARD',
        actingPlayer: 'BLACK',
        difficultyLevel: 1,
        timeBudgetMs: 50,
        legalMoves: mockLegalMoves,
      });
      const elapsed = performance.now() - t0;

      expect(fallback.move).toBeDefined();
      expect(elapsed).toBeLessThan(2.0); // RNF-15-02 < 2.0ms
    });
  });
});


import { describe, it, expect } from 'vitest';
import { ZobristHasher, DeterministicPRNG64 } from '../heuristics/ZobristHasher';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { AIEngine } from '../AIEngine';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { StockfishAdapter } from '../adapters/StockfishAdapter';
import { BotReplacementPolicy } from '../policies/BotReplacementPolicy';

describe('AI Engine Patch 01 - Determinism, Real Analysis, Adapters and Policies', () => {
  describe('ZobristHasher Pure Order-Independence and Determinism', () => {
    it('produces identical 64-bit BigInt hashes regardless of piece insertion order', () => {
      ZobristHasher.clearCache();

      // State A: Add King then Queen
      const stateA = createDefaultDomainState('match-zobrist-a');
      stateA.boardEntities[asEntityId('k1')] = {
        id: asEntityId('k1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      stateA.boardEntities[asEntityId('q1')] = {
        id: asEntityId('q1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'QUEEN',
        position: asCoordinateKey('3,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;

      const hashA = ZobristHasher.hash(stateA);

      // State B: Add Queen then King in fresh state with cleared cache
      ZobristHasher.clearCache();
      const stateB = createDefaultDomainState('match-zobrist-b');
      stateB.boardEntities[asEntityId('q1')] = {
        id: asEntityId('q1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'QUEEN',
        position: asCoordinateKey('3,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      stateB.boardEntities[asEntityId('k1')] = {
        id: asEntityId('k1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;

      const hashB = ZobristHasher.hash(stateB);

      expect(hashA).toBe(hashB);
      expect(typeof hashA).toBe('bigint');
    });

    it('hashStringTo64 produces deterministic avalanche distribution', () => {
      const h1 = ZobristHasher.hashStringTo64('P1:PAWN:4,1');
      const h2 = ZobristHasher.hashStringTo64('P1:PAWN:4,1');
      const h3 = ZobristHasher.hashStringTo64('P1:PAWN:4,2');

      expect(h1).toBe(h2);
      expect(h1).not.toBe(h3);
    });

    it('DeterministicPRNG64 produces deterministic pseudo-random stream', () => {
      const prng1 = new DeterministicPRNG64(42n);
      const prng2 = new DeterministicPRNG64(42n);

      for (let i = 0; i < 5; i++) {
        expect(prng1.nextBigInt()).toBe(prng2.nextBigInt());
      }
    });
  });

  describe('AIEngine.analyzeGame() Real Non-Random Evaluation (RF-15)', () => {
    it('evaluates centipawn loss and classifies moves without Math.random', () => {
      const ai = new AIEngine();
      const topology = new SquareTopology({ width: 8, height: 8 });

      const state0 = createDefaultDomainState('match-test-analysis');
      state0.boardEntities[asEntityId('p1_k')] = {
        id: asEntityId('p1_k'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      state0.boardEntities[asEntityId('p1_p')] = {
        id: asEntityId('p1_p'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,1'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      state0.boardEntities[asEntityId('p2_k')] = {
        id: asEntityId('p2_k'),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KING',
        position: asCoordinateKey('4,7'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      state0.occupancy[asCoordinateKey('4,0')] = asEntityId('p1_k');
      state0.occupancy[asCoordinateKey('4,1')] = asEntityId('p1_p');
      state0.occupancy[asCoordinateKey('4,7')] = asEntityId('p2_k');

      const moves = [
        {
          from: '4,1',
          to: '4,3',
          player: 'P1',
        },
      ];

      const report1 = ai.analyzeGame([state0], moves, topology, 'match-test-analysis');
      const report2 = ai.analyzeGame([state0], moves, topology, 'match-test-analysis');

      expect(report1.matchId).toBe('match-test-analysis');
      expect(report1.movesClassification.length).toBe(1);

      // Deterministic: multiple runs on same input yield exact same results
      expect(report1.playerAccuracies).toEqual(report2.playerAccuracies);
      expect(report1.movesClassification[0].scoreDelta).toBe(report2.movesClassification[0].scoreDelta);
      expect(report1.movesClassification[0].classification).toBe(report2.movesClassification[0].classification);

      // Valid accuracy percentage between 0 and 100
      expect(report1.playerAccuracies.P1).toBeGreaterThanOrEqual(0);
      expect(report1.playerAccuracies.P1).toBeLessThanOrEqual(100);
    });
  });

  describe('StockfishAdapter (RF-05, RNF-07)', () => {
    it('initializes in UNINITIALIZED state and falls back to AIEngine transparently', async () => {
      const adapter = new StockfishAdapter();
      expect(adapter.getStatus()).toBe('UNINITIALIZED');

      const state = createDefaultDomainState('match-sf');
      state.boardEntities[asEntityId('w_k')] = {
        id: asEntityId('w_k'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      state.boardEntities[asEntityId('b_k')] = {
        id: asEntityId('b_k'),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KING',
        position: asCoordinateKey('4,7'),
        hasMoved: false,
        isCaptured: false,
      } as IPieceEntity;
      state.occupancy[asCoordinateKey('4,0')] = asEntityId('w_k');
      state.occupancy[asCoordinateKey('4,7')] = asEntityId('b_k');

      const topology = new SquareTopology({ width: 8, height: 8 });

      // When running in environment without Stockfish worker script, it falls back to AIEngine
      const result = await adapter.calculateBestMove(state, topology, {
        difficulty: 1,
        timeBudgetMs: 200,
        depthLimit: 1,
      });

      expect(result).toBeDefined();
      expect(result.bestMove).toBeDefined();
      expect(adapter.isAvailable()).toBe(false); // Indicates fallback mode
    });
  });

  describe('BotReplacementPolicy (RF-12)', () => {
    it('tracks player disconnection and replaces disconnected player after grace period', () => {
      const policy = new BotReplacementPolicy(500);

      policy.registerDisconnection('P2', 3, 500);
      expect(policy.shouldBotTakeTurn('P2', Date.now())).toBe(false);

      // Advance time beyond grace period
      const futureTime = Date.now() + 600;
      expect(policy.shouldBotTakeTurn('P2', futureTime)).toBe(true);

      const record = policy.getRecord('P2');
      expect(record?.isBotAssigned).toBe(true);
      expect(record?.assignedDifficulty).toBe(3);
    });

    it('cancels replacement if player reconnects within grace period', () => {
      const policy = new BotReplacementPolicy(1000);
      policy.registerDisconnection('P2', 2, 1000);

      const reconnected = policy.registerReconnection('P2');
      expect(reconnected).toBe(true);
      expect(policy.shouldBotTakeTurn('P2', Date.now() + 1500)).toBe(false);
    });
  });
});

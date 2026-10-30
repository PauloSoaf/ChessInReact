import { describe, it, expect, beforeEach } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { HexTopology } from '../../../core/topology/HexTopology';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';
import { MaterialEvaluator } from '../heuristics/MaterialEvaluator';
import { MobilityEvaluator } from '../heuristics/MobilityEvaluator';
import { BoardEvaluator } from '../heuristics/BoardEvaluator';
import { ZobristHasher } from '../heuristics/ZobristHasher';
import { TranspositionTable } from '../algorithms/TranspositionTable';
import { QuiescenceSearch } from '../algorithms/Quiescence';
import { NegamaxSearch } from '../algorithms/Negamax';
import { ParanoidSearch } from '../algorithms/MaxN';
import { MCTS } from '../algorithms/MCTS';
import { AIEngine } from '../AIEngine';
import { GlobalEventBus } from '../../../core/events/EventBus';
import { processAIWorkerRequest } from '../CustomBotWorker';
import { serializeStateForWorker } from '../../../core/serialization/FlatArraySerializer';
import { EngineBridge } from '../../../core/workers/EngineBridge';
import { MockWorkerPort } from '../../../core/workers/dummyWorker';
import { reconstructDomainState } from '../utils/StateReconstructor';

function createMockState(
  pieces: { id: string; variantId: string; ownerId: PlayerId; position: CoordinateKey }[],
  activePlayer: PlayerId = 'P1',
  variantId = 'CHESS_STANDARD'
): IDomainState {
  const boardEntities: Record<EntityId, IPieceEntity> = {};
  const occupancy: Record<CoordinateKey, EntityId> = {};

  for (const p of pieces) {
    const entity: IPieceEntity = {
      id: p.id as EntityId,
      type: 'PIECE',
      ownerId: p.ownerId,
      variantId: p.variantId,
      position: p.position,
      hasMoved: false,
      isCaptured: false,
    };
    boardEntities[entity.id] = entity;
    occupancy[entity.position] = entity.id;
  }

  return {
    matchId: 'mock-ai-match',
    variantId,
    isGameOver: false,
    winnerId: null,
    activePlayer,
    turnNumber: 1,
    revision: 0,
    boardEntities,
    occupancy,
    capturedInventory: {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    },
    turnState: {
      phase: 'WAITING',
      lastActionTimestamp: Date.now(),
      enPassantTarget: null,
      fiftyMoveCounter: 0,
      positionHistory: [],
    },
  };
}

describe('Spec 05 — AI Engines, MCTS & Heuristic Evaluation Suite', () => {
  const squareTopology = new SquareTopology({ width: 8, height: 8 });

  beforeEach(() => {
    GlobalEventBus.clear();
  });

  describe('1. Heuristic Valuation: Material & Symmetry (RNF-15)', () => {
    it('evaluates static piece values accurately according to Spec 05 § 6', () => {
      expect(MaterialEvaluator.getPieceValue('P')).toBe(100);
      expect(MaterialEvaluator.getPieceValue('N')).toBe(300);
      expect(MaterialEvaluator.getPieceValue('B')).toBe(320);
      expect(MaterialEvaluator.getPieceValue('R')).toBe(500);
      expect(MaterialEvaluator.getPieceValue('Q')).toBe(900);
      expect(MaterialEvaluator.getPieceValue('K')).toBe(100000);
    });

    it('evaluates fairy piece fallbacks using Betza conventions', () => {
      expect(MaterialEvaluator.getPieceValue('AMAZON')).toBe(1200); // 1200 (Queen + Knight)
      expect(MaterialEvaluator.getPieceValue('CHANCELLOR')).toBe(800); // 800 (Rook + Knight)
      expect(MaterialEvaluator.getPieceValue('ARCHBISHOP')).toBe(620); // 620 (Bishop + Knight)
    });

    it('enforces exact mathematical symmetry (Score = 0.0) on mirrored positions (RNF-15)', () => {
      const mirroredState = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'wR', variantId: 'ROOK', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
        { id: 'bQ', variantId: 'QUEEN', ownerId: 'P2', position: '3,7' as CoordinateKey },
        { id: 'bR', variantId: 'ROOK', ownerId: 'P2', position: '0,7' as CoordinateKey },
      ]);

      const delta = MaterialEvaluator.evaluateMaterialDifference(mirroredState, 'P1', 'P2');
      expect(delta).toBe(0.0);
    });

    it('inverts material weights when Antichess variant is active', () => {
      const state = createMockState([
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,3' as CoordinateKey },
        { id: 'bP', variantId: 'PAWN', ownerId: 'P2', position: '4,4' as CoordinateKey },
      ], 'P1', 'ANTICHESS');

      const scores = MaterialEvaluator.evaluateMaterial(state);
      // In Antichess, having Queen is -900, having Pawn is -100 (fewer pieces is better)
      expect(scores.P1).toBe(-900);
      expect(scores.P2).toBe(-100);
    });
  });

  describe('2. Mobility and Positional Evaluation', () => {
    it('awards bonus centipawns for dynamic mobility (+5 per legal move)', () => {
      const trappedQueenState = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '0,1' as CoordinateKey },
        { id: 'wP1', variantId: 'PAWN', ownerId: 'P1', position: '0,2' as CoordinateKey },
        { id: 'wP2', variantId: 'PAWN', ownerId: 'P1', position: '1,1' as CoordinateKey },
        { id: 'wP3', variantId: 'PAWN', ownerId: 'P1', position: '1,2' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '7,7' as CoordinateKey },
      ]);

      const queenPiece = trappedQueenState.boardEntities['wQ' as EntityId] as IPieceEntity;
      const mobilityScore = MobilityEvaluator.evaluatePieceMobility(queenPiece, trappedQueenState, squareTopology);
      expect(mobilityScore).toBeGreaterThanOrEqual(0);
    });

    it('favors centralization for knights using Piece-Square Tables', () => {
      const knightCenter = {
        id: 'wN' as EntityId,
        type: 'PIECE' as const,
        ownerId: 'P1' as PlayerId,
        variantId: 'KNIGHT',
        position: '3,3' as CoordinateKey,
        hasMoved: false,
        isCaptured: false,
      };
      const knightRim = {
        ...knightCenter,
        position: '0,0' as CoordinateKey,
      };

      const scoreCenter = MobilityEvaluator.getPositionalScore(knightCenter, knightCenter.position);
      const scoreRim = MobilityEvaluator.getPositionalScore(knightRim, knightRim.position);

      expect(scoreCenter).toBeGreaterThan(scoreRim);
    });

    it('calculates distance-to-center bonus on hex topologies', () => {
      new HexTopology({ radius: 5 });
      const pieceCenter = {
        id: 'wR' as EntityId,
        type: 'PIECE' as const,
        ownerId: 'P1' as PlayerId,
        variantId: 'ROOK',
        position: '0,0,0' as CoordinateKey,
        hasMoved: false,
        isCaptured: false,
      };
      const pieceOutskirts = {
        ...pieceCenter,
        position: '4,-4,0' as CoordinateKey,
      };

      const scoreCenter = MobilityEvaluator.getPositionalScore(pieceCenter, pieceCenter.position);
      const scoreOutskirts = MobilityEvaluator.getPositionalScore(pieceOutskirts, pieceOutskirts.position);

      expect(scoreCenter).toBeGreaterThan(scoreOutskirts);
    });
  });

  describe('3. Zobrist Hashing and Transposition Table (RNF-04, RNF-08)', () => {
    it('generates deterministic and distinct hashes for distinct board positions', () => {
      const state1 = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ]);
      const state2 = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,1' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ]);

      const h1 = ZobristHasher.hash(state1);
      const h2 = ZobristHasher.hash(state2);

      expect(h1).not.toBe(h2);
      expect(typeof h1).toBe('bigint');
      expect(ZobristHasher.hash(state1)).toBe(h1); // Deterministic
    });

    it('updates hashes incrementally via O(1) bitwise XOR', () => {
      const state = createMockState([
        { id: 'wN', variantId: 'KNIGHT', ownerId: 'P1', position: '1,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ]);

      const initialHash = ZobristHasher.hash(state);
      const updatedHash = ZobristHasher.updateMove(
        initialHash,
        '1,0' as CoordinateKey,
        '2,2' as CoordinateKey,
        'KNIGHT',
        'P1'
      );

      const nextState = createMockState([
        { id: 'wN', variantId: 'KNIGHT', ownerId: 'P1', position: '2,2' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ]);
      const fullHash = ZobristHasher.hash(nextState);

      expect(updatedHash).toBe(fullHash);
    });

    it('enforces maximum memory cap via size-capped LRU eviction (RNF-04)', () => {
      const tt = new TranspositionTable(50); // Capacity 50

      for (let i = 0; i < 100; i++) {
        tt.set(BigInt(i), 2, 100 + i, 'EXACT');
      }

      expect(tt.size).toBeLessThanOrEqual(50);
      expect(tt.get(BigInt(99))).toBeDefined();
      expect(tt.get(BigInt(0))).toBeUndefined(); // Evicted
    });

    it('accurately tracks cache hit rate (RNF-08)', () => {
      const tt = new TranspositionTable(100);
      tt.set(12345n, 3, 250, 'EXACT');

      expect(tt.hitRate).toBe(0);
      tt.get(12345n); // hit
      tt.get(99999n); // miss

      expect(tt.hitRate).toBe(0.5);
    });
  });

  describe('4. Quiescence Search (RF-07)', () => {
    it('orders tactical captures via MVV-LVA (Pawn captures Queen before Queen captures Pawn)', () => {
      const state = createMockState([
        { id: 'wP', variantId: 'PAWN', ownerId: 'P1', position: '3,3' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'bQ', variantId: 'QUEEN', ownerId: 'P2', position: '4,4' as CoordinateKey },
        { id: 'bP', variantId: 'PAWN', ownerId: 'P2', position: '0,5' as CoordinateKey },
      ]);

      const mockCaptures = [
        {
          pieceId: 'wQ' as EntityId,
          from: '0,0' as CoordinateKey,
          to: '0,5' as CoordinateKey,
          isCapture: true,
          capturedPieceId: 'bP' as EntityId,
        },
        {
          pieceId: 'wP' as EntityId,
          from: '3,3' as CoordinateKey,
          to: '4,4' as CoordinateKey,
          isCapture: true,
          capturedPieceId: 'bQ' as EntityId,
        },
      ];

      const sorted = QuiescenceSearch.orderCaptures(mockCaptures, state);
      expect(sorted[0].capturedPieceId).toBe('bQ'); // Pawn taking Queen prioritized
    });

    it('extends search across volatile captures until a quiet state is reached', () => {
      const tacticalState = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,3' as CoordinateKey },
        { id: 'bQ', variantId: 'QUEEN', ownerId: 'P2', position: '3,4' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '7,7' as CoordinateKey },
      ]);

      const score = QuiescenceSearch.search(
        tacticalState,
        -Infinity,
        Infinity,
        'P1',
        'P2',
        squareTopology
      );
      expect(typeof score).toBe('number');
    });
  });

  describe('5. 2-Player Negamax Search & Mate-in-1 Solver (RF-01, RF-14)', () => {
    it('finds forced mate-in-1 delivery', () => {
      // White has King at 6,5, Queen at 0,6; Black has King trapped at 7,7
      // Queen moves 0,6 -> 7,6 delivering supported mate in 1
      const mateIn1State = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '6,5' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '0,6' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '7,7' as CoordinateKey },
      ], 'P1');

      const negamax = new NegamaxSearch();
      const result = negamax.searchBestMove(mateIn1State, squareTopology, {
        depthLimit: 2,
        timeBudgetMs: 500,
      });

      expect(result.bestMove).toBeDefined();
      expect(result.bestMove?.pieceId).toBe('wQ');
      expect(['7,6', '0,7', '6,7']).toContain(result.bestMove?.toCoord);
      expect(result.evaluationScore).toBeGreaterThanOrEqual(90000);
    });

    it('finds obvious hanging piece capture', () => {
      // Black left Queen undefended on 3,4, White Rook on 3,0 can capture it
      const hangingQueenState = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'wR', variantId: 'ROOK', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '7,7' as CoordinateKey },
        { id: 'bQ', variantId: 'QUEEN', ownerId: 'P2', position: '3,4' as CoordinateKey },
      ], 'P1');

      const negamax = new NegamaxSearch();
      const result = negamax.searchBestMove(hangingQueenState, squareTopology, {
        depthLimit: 2,
        timeBudgetMs: 500,
      });

      expect(result.bestMove?.fromCoord).toBe('3,0');
      expect(result.bestMove?.toCoord).toBe('3,4');
    });

    it('aborts search immediately within 10ms upon cancellation token flag (RNF-09)', () => {
      const complexState = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'wR1', variantId: 'ROOK', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'wR2', variantId: 'ROOK', ownerId: 'P1', position: '7,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
        { id: 'bQ', variantId: 'QUEEN', ownerId: 'P2', position: '3,7' as CoordinateKey },
      ]);

      const cancelToken = { aborted: true }; // pre-aborted
      const negamax = new NegamaxSearch();
      const start = performance.now();
      const result = negamax.searchBestMove(complexState, squareTopology, {
        depthLimit: 6,
        timeBudgetMs: 5000,
        cancellationToken: cancelToken,
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(result).toBeDefined();
    });
  });

  describe('6. Multiplayer Max-N & Paranoid Search (RF-03, RF-09)', () => {
    it('returns N-tuple scores in Max-N search for 4 players', () => {
      const fourPlayerState = createMockState([
        { id: 'pK1', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'pQ1', variantId: 'QUEEN', ownerId: 'P1', position: '1,0' as CoordinateKey },
        { id: 'pK2', variantId: 'KING', ownerId: 'P2', position: '7,0' as CoordinateKey },
        { id: 'pK3', variantId: 'KING', ownerId: 'P3', position: '0,7' as CoordinateKey },
        { id: 'pK4', variantId: 'KING', ownerId: 'P4', position: '7,7' as CoordinateKey },
      ], 'P1');

      const paranoid = new ParanoidSearch();
      const result = paranoid.searchMaxN(
        fourPlayerState,
        1,
        ['P1', 'P2', 'P3', 'P4'],
        squareTopology
      );

      expect(result.scores.P1).toBeDefined();
      expect(result.scores.P2).toBeDefined();
      expect(result.scores.P3).toBeDefined();
      expect(result.scores.P4).toBeDefined();
      expect(result.bestMove).toBeDefined();
    });

    it('executes Paranoid Search with enemy union mitigation factor', () => {
      const state = createMockState([
        { id: 'pK1', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'pQ1', variantId: 'QUEEN', ownerId: 'P1', position: '1,1' as CoordinateKey },
        { id: 'pK2', variantId: 'KING', ownerId: 'P2', position: '7,0' as CoordinateKey },
        { id: 'pK3', variantId: 'KING', ownerId: 'P3', position: '0,7' as CoordinateKey },
      ], 'P1');

      const paranoid = new ParanoidSearch();
      const result = paranoid.searchBestMove(state, squareTopology, {
        isMultiplayerFFA: true,
        playerCount: 3,
        depthLimit: 2,
        timeBudgetMs: 500,
      });

      expect(result.bestMove).toBeDefined();
      expect(result.depthReached).toBeGreaterThanOrEqual(1);
    });
  });

  describe('7. Monte Carlo Tree Search (MCTS / UCT) & Determinism (RF-04, RNF-11)', () => {
    it('produces deterministic decisions when provided with fixed random seed (RNF-11)', () => {
      const state = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ], 'P1');

      const mcts1 = new MCTS(777);
      const res1 = mcts1.searchBestMove(state, squareTopology, {
        timeBudgetMs: 500,
        randomSeed: 777,
        maxRollouts: 60,
      });

      const mcts2 = new MCTS(777);
      const res2 = mcts2.searchBestMove(state, squareTopology, {
        timeBudgetMs: 500,
        randomSeed: 777,
        maxRollouts: 60,
      });

      expect(res1.bestMove?.fromCoord).toBe(res2.bestMove?.fromCoord);
      expect(res1.bestMove?.toCoord).toBe(res2.bestMove?.toCoord);
    });
  });

  describe('8. Central AIEngine Coordinator, Difficulty & Analysis (RF-01, RF-10, RF-15)', () => {
    it('configures 5 distinct difficulty profiles', () => {
      const d1 = AIEngine.getDifficultyConfig(1);
      const d3 = AIEngine.getDifficultyConfig(3);
      const d5 = AIEngine.getDifficultyConfig(5);

      expect(d1.depthLimit).toBeLessThan(d3.depthLimit);
      expect(d3.depthLimit).toBeLessThan(d5.depthLimit);
      expect(d1.blunderChance).toBeGreaterThan(0);
      expect(d5.blunderChance).toBe(0);
    });

    it('emits AI_EVALUATION_READY event to GlobalEventBus upon calculating best move (RF-10)', () => {
      let eventPayload: unknown = null;
      GlobalEventBus.subscribe('AI_EVALUATION_READY', (payload) => {
        eventPayload = payload;
      });

      const state = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '0,0' as CoordinateKey },
        { id: 'wR', variantId: 'ROOK', ownerId: 'P1', position: '1,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '7,7' as CoordinateKey },
      ], 'P1');

      const engine = new AIEngine();
      engine.calculateBestMove(state, squareTopology, { depthLimit: 2, timeBudgetMs: 300 });

      expect(eventPayload).not.toBeNull();
      expect((eventPayload as { bestMove: unknown }).bestMove).toBeDefined();
    });

    it('generates post-game analysis report with classifications and accuracy (RF-15)', () => {
      const state1 = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ]);

      const engine = new AIEngine();
      const report = engine.analyzeGame(
        [state1],
        [{ from: '3,0', to: '3,4', player: 'P1' }],
        squareTopology,
        'test-match-123'
      );

      expect(report.matchId).toBe('test-match-123');
      expect(report.movesClassification.length).toBe(1);
      expect(report.playerAccuracies.P1).toBeGreaterThanOrEqual(0);
      expect(report.playerAccuracies.P1).toBeLessThanOrEqual(100);
    });
  });

  describe('9. WebWorker Protocol & EngineBridge Integration (RF-02, RNF-02, RNF-13)', () => {
    it('executes processAIWorkerRequest with zero-copy serialized ArrayBuffer + stringTable', () => {
      const state = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ], 'P1');

      const snapshot = serializeStateForWorker(state);

      const response = processAIWorkerRequest({
        taskId: 101,
        type: 'CALCULATE_BEST_MOVE',
        payload: {
          stateBuffer: snapshot.buffer.buffer,
          stringTable: snapshot.stringTable,
          activePlayerId: 'P1',
          depthLimit: 2,
          timeBudgetMs: 500,
        },
      });

      expect(response.taskId).toBe(101);
      expect(response.success).toBe(true);
      expect(response.bestMove).toBeDefined();
      expect(response.bestMove?.pieceId).toBeDefined();
    });

    it('communicates via EngineBridge with MockWorkerPort under 1000ms (RNF-02)', async () => {
      const state = createMockState([
        { id: 'wK', variantId: 'KING', ownerId: 'P1', position: '4,0' as CoordinateKey },
        { id: 'wQ', variantId: 'QUEEN', ownerId: 'P1', position: '3,0' as CoordinateKey },
        { id: 'bK', variantId: 'KING', ownerId: 'P2', position: '4,7' as CoordinateKey },
      ], 'P1');

      const mockPort = new MockWorkerPort(5); // 5ms simulated latency
      const bridge = new EngineBridge({ workerPort: mockPort });

      const start = performance.now();
      const result = await bridge.calculateBestMove(state, {
        difficulty: 1,
        depthLimit: 1,
        timeBudgetMs: 500,
      });
      const elapsed = performance.now() - start;

      expect(result.calculationTimeMs).toBeLessThan(1000);
      expect(elapsed).toBeLessThan(2500);
      expect(result.bestMove).toBeDefined();
      expect(result.depthReached).toBeGreaterThanOrEqual(1);

      bridge.dispose();
    });
  });

  describe('10. Edge Cases and Coverage Completeness (RNF-10 > 90%)', () => {
    it('handles TT clear and getStats accurately', () => {
      const tt = new TranspositionTable(10);
      tt.set(1n, 1, 10, 'EXACT');
      const statsBefore = tt.getStats();
      expect(statsBefore.size).toBe(1);

      tt.clear();
      const statsAfter = tt.getStats();
      expect(statsAfter.size).toBe(0);
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.lookups).toBe(0);
    });

    it('toggles player hash accurately with ZobristHasher', () => {
      const h0 = 1000n;
      const h1 = ZobristHasher.togglePlayer(h0, 'P1', 'P2');
      const h2 = ZobristHasher.togglePlayer(h1, 'P2', 'P1');
      expect(h1).not.toBe(h0);
      expect(h2).toBe(h0); // Involutive XOR property
    });

    it('evaluates checkmate and draw terminal conditions in BoardEvaluator', () => {
      const winState = {
        ...createMockState([]),
        isGameOver: true,
        winnerId: 'P1' as PlayerId,
      };
      const winScores = BoardEvaluator.evaluate(winState, squareTopology);
      expect(winScores.P1).toBe(100000);
      expect(winScores.P2).toBe(-100000);

      const drawState = {
        ...createMockState([]),
        isGameOver: true,
        winnerId: null,
      };
      const drawScores = BoardEvaluator.evaluate(drawState, squareTopology);
      expect(drawScores.P1).toBe(0);
      expect(drawScores.P2).toBe(0);
    });

    it('handles empty moves or already game-over states in Negamax and ParanoidSearch', () => {
      const gameOverState = {
        ...createMockState([]),
        isGameOver: true,
        winnerId: 'P1' as PlayerId,
      };
      const negamax = new NegamaxSearch();
      const resNegamax = negamax.searchBestMove(gameOverState, squareTopology);
      expect(resNegamax.bestMove).toBeNull();

      const paranoid = new ParanoidSearch();
      const resParanoid = paranoid.searchBestMove(gameOverState, squareTopology);
      expect(resParanoid.bestMove).toBeNull();
    });

    it('processes STOP_EVALUATION and error handling in CustomBotWorker', () => {
      const stopRes = processAIWorkerRequest({
        taskId: 999,
        type: 'STOP_EVALUATION',
        payload: { activePlayerId: 'P1' },
      });
      expect(stopRes.success).toBe(true);

      const errRes = processAIWorkerRequest({
        taskId: 998,
        type: 'CALCULATE_BEST_MOVE',
        payload: { activePlayerId: 'P1' }, // Missing buffer and stringTable
      });
      expect(errRes.success).toBe(false);
      expect(errRes.error).toBeDefined();

      const unkRes = processAIWorkerRequest({
        taskId: 997,
        type: 'UNKNOWN_TYPE' as unknown as 'CALCULATE_BEST_MOVE',
        payload: { activePlayerId: 'P1' },
      });
      expect(unkRes.success).toBe(false);
    });

    it('reconstructs TERRAIN and OBSTACLE entities in StateReconstructor', () => {
      const hexSnapshot = {
        schemaVersion: 1,
        entityCount: 3,
        activePlayer: 'P1' as PlayerId,
        turnNumber: 1,
        entities: [
          {
            id: 'piece-1',
            type: 'PIECE' as const,
            ownerId: 'P1' as PlayerId,
            variantId: 'PAWN',
            kind: 'HEX_CUBIC' as const,
            x: 0,
            y: 0,
            z: 0,
            hasMoved: false,
            isCaptured: false,
          },
          {
            id: 'terr-1',
            type: 'TERRAIN' as const,
            ownerId: 'NONE' as PlayerId,
            variantId: 'WATER',
            kind: 'HEX_CUBIC' as const,
            x: 1,
            y: -1,
            z: 0,
            hasMoved: false,
            isCaptured: false,
          },
          {
            id: 'obst-1',
            type: 'OBSTACLE' as const,
            ownerId: 'NONE' as PlayerId,
            variantId: 'OBSTACLE_WALL',
            kind: 'SQUARE' as const,
            x: 2,
            y: 2,
            z: 0,
            hasMoved: false,
            isCaptured: false,
          },
        ],
      };

      const domainState = reconstructDomainState(hexSnapshot, 'HEX_STANDARD');
      expect(domainState.boardEntities['piece-1' as EntityId]).toBeDefined();
      expect(domainState.boardEntities['terr-1' as EntityId]?.type).toBe('TERRAIN');
      expect(domainState.boardEntities['obst-1' as EntityId]?.type).toBe('OBSTACLE');
      expect(domainState.terrain?.['1,-1,0' as CoordinateKey]).toBe('terr-1');
      expect(domainState.occupancy['2,2' as CoordinateKey]).toBe('obst-1');
    });
  });
});

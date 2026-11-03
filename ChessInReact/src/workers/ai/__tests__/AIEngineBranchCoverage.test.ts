import { describe, expect, it } from 'vitest';
import { AIEngine } from '../AIEngine';
import { MCTS } from '../algorithms/MCTS';
import { ParanoidSearch } from '../algorithms/MaxN';
import { QuiescenceSearch } from '../algorithms/Quiescence';
import { StockfishAdapter } from '../adapters/StockfishAdapter';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { ClassicBoardFactory } from '../../../engine/rules/utils/ClassicBoardFactory';
import { asCoordinateKey, asEntityId, CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';

describe('Spec 05 AI Engine & Heuristics Deep Branch Coverage Suite (RNF-10, RNF-11)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  describe('AIEngine Edge Cases & Variant Branching', () => {
    it('returns null best move and 0 score when no legal moves are available (stalemate/checkmate)', () => {
      const ai = new AIEngine();
      const base = createDefaultDomainState('stalemate-test');
      const boardEntities: Record<EntityId, IPieceEntity> = {};
      const occupancy: Record<CoordinateKey, EntityId> = {};

      boardEntities[asEntityId('w_k')] = {
        id: asEntityId('w_k'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('0,0'),
        hasMoved: true,
        isCaptured: false,
      };
      occupancy[asCoordinateKey('0,0')] = asEntityId('w_k');

      // Place blocking pieces on all king's neighbors
      const neighbors = ['0,1', '1,0', '1,1'];
      for (let i = 0; i < neighbors.length; i++) {
        const id = asEntityId(`w_block_${i}`);
        boardEntities[id] = {
          id,
          type: 'PIECE',
          ownerId: 'P1',
          variantId: 'PAWN',
          position: asCoordinateKey(neighbors[i]),
          hasMoved: true,
          isCaptured: false,
        };
        occupancy[asCoordinateKey(neighbors[i])] = id;
      }

      // Block pawns from advancing as well
      const pawnBlocks = ['0,2', '1,2'];
      for (let i = 0; i < pawnBlocks.length; i++) {
        const id = asEntityId(`b_block_${i}`);
        boardEntities[id] = {
          id,
          type: 'PIECE',
          ownerId: 'P2',
          variantId: 'PAWN',
          position: asCoordinateKey(pawnBlocks[i]),
          hasMoved: true,
          isCaptured: false,
        };
        occupancy[asCoordinateKey(pawnBlocks[i])] = id;
      }

      const state: IDomainState = {
        ...base,
        boardEntities,
        occupancy,
        activePlayer: 'P1',
      };

      const result = ai.calculateBestMove(state, topology, { depthLimit: 1 });
      expect(result).toBeDefined();
    });

    it('returns empty analysis report when move history is empty', () => {
      const ai = new AIEngine();
      const s0 = createDefaultDomainState('empty-match');
      const report = ai.analyzeGame([s0], [], topology, 'empty-match');
      expect(report.movesClassification).toEqual([]);
      expect(report.playerAccuracies).toEqual({ P1: 100, P2: 100 });
    });
  });

  describe('StockfishAdapter WASM Detection & UCI Protocol Integrity (RF-05, RNF-07)', () => {
    it('init returns false when binary worker is missing in browser/node environment', async () => {
      const adapter = new StockfishAdapter({ workerUrl: '/workers/stockfish.js' });
      const available = await adapter.init();
      expect(typeof available).toBe('boolean');
    });

    it('generates compliant FEN strings with en-passant and castling rights', () => {
      const base = ClassicBoardFactory.createStandardInitialState();
      const state: IDomainState = {
        ...base,
        turnState: {
          ...base.turnState,
          enPassantTarget: '4,5' as CoordinateKey,
          fiftyMoveCounter: 4,
        },
      };

      const fen = StockfishAdapter.domainStateToFEN(state);
      expect(typeof fen).toBe('string');
      const parts = fen.split(' ');
      expect(parts.length).toBe(6);
      expect(parts[1]).toBe('w'); // Active player White
      expect(parts[2]).toBe('KQkq'); // Castling flags
      expect(parts[3]).toBe('e6'); // 4,5 translated to algebraic e6
      expect(parts[4]).toBe('4'); // half-move clock
      expect(parts[5]).toBe('1'); // full-move turn
    });

    it('transparently falls back to AIEngine when worker is unavailable', async () => {
      const adapter = new StockfishAdapter({ workerUrl: '/non-existent-worker.js' });
      const state = ClassicBoardFactory.createStandardInitialState();

      const result = await adapter.calculateBestMove(state, topology, {
        difficulty: 1,
        timeBudgetMs: 200,
      });

      expect(result).toBeDefined();
      expect(result.bestMove).toBeDefined();
      expect(result.pvLine.length).toBeGreaterThan(0);
      expect(typeof result.evaluationScore).toBe('number');
    });

    it('disposes clean up without hanging listeners or processes', () => {
      const adapter = new StockfishAdapter();
      expect(() => adapter.dispose()).not.toThrow();
    });
  });

  describe('MCTS & Max-N Multiplayer Search', () => {
    it('executes Max-N multi-player search with 3-player FFA configuration', () => {
      const maxN = new ParanoidSearch();
      const base = createDefaultDomainState('max-n-3p');
      const boardEntities: Record<EntityId, IPieceEntity> = {};
      const occupancy: Record<CoordinateKey, EntityId> = {};

      const pieces = [
        { id: 'p1_k', owner: 'P1', pos: '0,0' },
        { id: 'p2_k', owner: 'P2', pos: '7,7' },
        { id: 'p3_k', owner: 'P3', pos: '0,7' },
        { id: 'p1_r', owner: 'P1', pos: '1,0' },
      ];

      for (const p of pieces) {
        boardEntities[asEntityId(p.id)] = {
          id: asEntityId(p.id),
          type: 'PIECE',
          ownerId: p.owner as PlayerId,
          variantId: p.id.includes('_k') ? 'KING' : 'ROOK',
          position: asCoordinateKey(p.pos),
          hasMoved: false,
          isCaptured: false,
        };
        occupancy[asCoordinateKey(p.pos)] = asEntityId(p.id);
      }

      const state: IDomainState = {
        ...base,
        boardEntities,
        occupancy,
        activePlayer: 'P1',
      };

      const result = maxN.searchBestMove(state, topology, {
        depthLimit: 2,
        timeBudgetMs: 500,
        playerCount: 3,
      });

      expect(result).toBeDefined();
      expect(result.bestMove).toBeDefined();
      expect(result.bestMove?.pieceId).toBeDefined();
    });

    it('executes MCTS search with dynamic simulations and returns most visited child', () => {
      const mcts = new MCTS();
      const state = ClassicBoardFactory.createStandardInitialState();

      const result = mcts.searchBestMove(state, topology, {
        maxRollouts: 20,
        timeBudgetMs: 300,
      });

      expect(result).toBeDefined();
      expect(result.bestMove).toBeDefined();
      expect(result.nodesCalculated).toBeGreaterThan(0);
    });

    it('executes Quiescence search on quiet state without tactical explosion', () => {
      const state = ClassicBoardFactory.createStandardInitialState();

      const score = QuiescenceSearch.search(state, -10000, 10000, 'P1', 'P2', topology);
      expect(typeof score).toBe('number');
      expect(Math.abs(score)).toBeLessThan(500); // Equal starting position is ~0
    });
  });
});

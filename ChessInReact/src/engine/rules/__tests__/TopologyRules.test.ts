import { describe, it, expect } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { HexTopology } from '../../../core/topology/HexTopology';
import { TriangleTopology } from '../../../core/topology/TriangleTopology';
import { VoronoiTopology } from '../../../core/topology/VoronoiTopology';
import { RulesEngine } from '../RulesEngine';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../core/coordinates';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { VariantRegistry } from '../VariantRegistry';

describe('Multi-Topology Pure Rules Compatibility (Spec 04 RF-07, RF-08)', () => {
  function createBlankState(variantId = 'CHESS_STANDARD'): IDomainState {
    const emptyInventory: Record<PlayerId, string[]> = {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    };
    return {
      matchId: 'topo-match',
      variantId,
      isGameOver: false,
      winnerId: null,
      activePlayer: 'P1',
      turnNumber: 1,
      revision: 1,
      boardEntities: {},
      occupancy: {},
      capturedInventory: emptyInventory,
      turnState: {
        phase: 'COMMIT',
        lastActionTimestamp: Date.now(),
        enPassantTarget: null,
        fiftyMoveCounter: 0,
      },
    };
  }

  it('correctly executes fairy pieces (Amazon, Chancellor, Archbishop) on SquareTopology', () => {
    const topology = new SquareTopology({ width: 8, height: 8 });
    const state = createBlankState();

    // Place an Amazon (Queen + Knight) on e4 (4,3)
    const amazonId = asEntityId('amazon-1');
    const amazon: IPieceEntity = {
      id: amazonId,
      type: 'PIECE',
      position: asCoordinateKey('4,3'),
      ownerId: 'P1',
      variantId: 'AMAZON',
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[amazonId] = amazon;
    state.occupancy[asCoordinateKey('4,3')] = amazonId;

    const moves = RulesEngine.getLegalMovesForPiece(amazon, state, topology);

    // Amazon on e4 has:
    // Queen moves: 27 squares (7 orthogonal files/ranks + 13 diagonal squares on empty 8x8)
    // Knight moves: 8 jump squares
    // Total = 35 moves
    expect(moves.length).toBe(35);

    // Test a knight leap destination (e.g. 4+1, 3+2 = 5,5)
    expect(moves.some((m) => m.to === asCoordinateKey('5,5'))).toBe(true);
    // Test an orthogonal slider destination (e.g. 4,7)
    expect(moves.some((m) => m.to === asCoordinateKey('4,7'))).toBe(true);
    // Test a diagonal slider destination (e.g. 7,6)
    expect(moves.some((m) => m.to === asCoordinateKey('7,6'))).toBe(true);
  });

  it('correctly executes on HexTopology with 6-way edge raycasting and trichromatic colors', () => {
    const hexTopology = new HexTopology({ radius: 4 });
    const state = createBlankState('HEXAGONAL_GLINSKI');

    // Place a Rook on central hex (0,0,0)
    const rookId = asEntityId('hex-rook-1');
    const rook: IPieceEntity = {
      id: rookId,
      type: 'PIECE',
      position: asCoordinateKey('0,0,0'),
      ownerId: 'P1',
      variantId: 'ROOK',
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[rookId] = rook;
    state.occupancy[asCoordinateKey('0,0,0')] = rookId;

    const moves = RulesEngine.getLegalMovesForPiece(rook, state, hexTopology);

    // In a radius 4 hex board, from center (0,0,0), 6 directions extend 4 steps each = 24 moves!
    expect(moves.length).toBe(24);

    // Verify trichromatic cell color index (0, 1, 2)
    const c0 = hexTopology.getCellColorIndex(asCoordinateKey('0,0,0'));
    const c1 = hexTopology.getCellColorIndex(asCoordinateKey('1,-1,0'));
    const c2 = hexTopology.getCellColorIndex(asCoordinateKey('2,-2,0'));
    expect([0, 1, 2]).toContain(c0);
    expect([0, 1, 2]).toContain(c1);
    expect([0, 1, 2]).toContain(c2);
  });

  it('correctly executes on TriangleTopology without throwing errors', () => {
    const triTopology = new TriangleTopology({ boundingRadius: 6 });
    const state = createBlankState();

    const pieceId = asEntityId('tri-piece-1');
    const piece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      position: asCoordinateKey('2,2'),
      ownerId: 'P1',
      variantId: 'WAZIR', // 1 step orthogonal
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[pieceId] = piece;
    state.occupancy[asCoordinateKey('2,2')] = pieceId;

    const moves = RulesEngine.getLegalMovesForPiece(piece, state, triTopology);
    expect(Array.isArray(moves)).toBe(true);
    // Neighbors in triangle topology are valid
    for (const m of moves) {
      expect(triTopology.isValidCoordinate(m.to)).toBe(true);
    }
  });

  it('correctly executes on VoronoiTopology without crashing', () => {
    const voronoiTopology = new VoronoiTopology({ seed: 'test_seed_42', boundingRadius: 10 });
    const state = createBlankState();

    const startCell = asCoordinateKey('cell_0');
    if (voronoiTopology.isValidCoordinate(startCell)) {
      const pieceId = asEntityId('voronoi-piece-1');
      const piece: IPieceEntity = {
        id: pieceId,
        type: 'PIECE',
        position: startCell,
        ownerId: 'P1',
        variantId: 'WAZIR',
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[pieceId] = piece;
      state.occupancy[startCell] = pieceId;

      const moves = RulesEngine.getLegalMovesForPiece(piece, state, voronoiTopology);
      expect(Array.isArray(moves)).toBe(true);
    }
  });

  it('registers and retrieves custom JSON fairy pieces and variants via VariantRegistry', () => {
    // Custom JSON piece definition: "Dragon" (Amazon + Camel)
    VariantRegistry.registerPiece({
      variantId: 'DRAGON',
      betzaNotation: 'QNC',
      vectors: [],
    });

    const registered = VariantRegistry.getPiece('DRAGON');
    expect(registered).toBeDefined();
    expect(registered?.betzaNotation).toBe('QNC');

    const allVariants = VariantRegistry.getAllVariants();
    expect(allVariants.length).toBeGreaterThanOrEqual(5);
    expect(VariantRegistry.getVariant('ATOMIC')).toBeDefined();
    expect(VariantRegistry.getVariant('CRAZYHOUSE')).toBeDefined();
    expect(VariantRegistry.getVariant('ANTICHESS')).toBeDefined();
    expect(VariantRegistry.getVariant('KING_OF_THE_HILL')).toBeDefined();
  });
});

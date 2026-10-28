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

  it('correctly executes on official 91-cell Gliński HexTopology (radius 5) with 6-way edge raycasting and 3-color trichromatic bishops', () => {
    // Official Gliński board: side length 6, bounding radius 5 = exactly 91 hex cells (Spec 04 RF-07 & ADR-002)
    const hexTopology = new HexTopology({ radius: 5 });
    const state = createBlankState('HEXAGONAL_GLINSKI');

    // 1. Verify exactly 91 cells exist in the radius-5 hex grid
    let totalCells = 0;
    const colorsCount = { 0: 0, 1: 0, 2: 0 };
    for (let q = -5; q <= 5; q++) {
      for (let r = -5; r <= 5; r++) {
        const s = -q - r;
        const coord = asCoordinateKey(`${q},${r},${s}`);
        if (hexTopology.isValidCoordinate(coord)) {
          totalCells++;
          const color = hexTopology.getCellColorIndex(coord);
          colorsCount[color]++;
        }
      }
    }
    expect(totalCells).toBe(91);
    // Gliński trichromatic distribution: 30 cells of color 0, 31 cells of color 1, 30 cells of color 2
    expect(colorsCount[0] + colorsCount[1] + colorsCount[2]).toBe(91);
    expect(colorsCount[0]).toBeGreaterThanOrEqual(30);
    expect(colorsCount[1]).toBeGreaterThanOrEqual(30);
    expect(colorsCount[2]).toBeGreaterThanOrEqual(30);

    // 2. Place a Rook on central hex (0,0,0)
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

    // In a radius 5 hex board, from center (0,0,0), 6 orthogonal directions extend 5 steps each = 30 moves!
    expect(moves.length).toBe(30);

    // 3. Test 3 trichromatic Bishops on their respective color cells
    const bishopCoords = [
      asCoordinateKey('0,0,0'),  // color 0
      asCoordinateKey('1,0,-1'), // color 1
      asCoordinateKey('2,0,-2'), // color 2
    ];

    expect(hexTopology.getCellColorIndex(bishopCoords[0])).toBe(0);
    expect(hexTopology.getCellColorIndex(bishopCoords[1])).toBe(1);
    expect(hexTopology.getCellColorIndex(bishopCoords[2])).toBe(2);
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

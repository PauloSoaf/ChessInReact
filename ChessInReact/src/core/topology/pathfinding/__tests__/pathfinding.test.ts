import { describe, expect, it } from 'vitest';
import { SquareTopology, HexTopology, TriangleTopology } from '../../';
import { CoordinateKey } from '../../../coordinates';
import { IDomainState } from '../../../state/gameState';
import { findPathAStar } from '../AStarPathfinder';
import { validateLineOfSight } from '../LineOfSight';
import { buildAdjacencyGraph } from '../AdjacencyGraph';

function createMockState(
  occupancy: Record<string, string> = {},
  entities: Record<string, unknown> = {}
): IDomainState {
  return {
    matchId: 'test-match',
    variantId: 'HEX_CLASSIC',
    isGameOver: false,
    winnerId: null,
    turnNumber: 1,
    revision: 1,
    activePlayer: 'P1',
    boardEntities: entities as unknown as IDomainState['boardEntities'],
    occupancy: occupancy as unknown as IDomainState['occupancy'],
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
      phase: 'COMMIT',
      lastActionTimestamp: Date.now(),
      enPassantTarget: null,
      fiftyMoveCounter: 0,
    },
  };
}

describe('Pathfinding & Line of Sight Subsystem (Spec 02 Verification)', () => {
  const square = new SquareTopology({ width: null, height: null });
  const hex = new HexTopology();
  const tri = new TriangleTopology();

  describe('A* Pathfinder', () => {
    it('finds direct shortest path on SquareTopology', () => {
      const result = findPathAStar(square, '0,0' as CoordinateKey, '0,3' as CoordinateKey);
      expect(result.found).toBe(true);
      expect(result.path).toEqual(['0,0', '0,1', '0,2', '0,3']);
      expect(result.cost).toBe(3);
      expect(result.nodesVisited).toBeGreaterThan(0);
    });

    it('navigates around obstacles on HexTopology', () => {
      // Direct path from (0,0,0) to (2,0,-2) would pass through (1,0,-1)
      const obstacles = new Set<CoordinateKey>(['1,0,-1' as CoordinateKey]);
      const result = findPathAStar(hex, '0,0,0' as CoordinateKey, '2,0,-2' as CoordinateKey, {
        isWalkable: (coord) => !obstacles.has(coord),
      });

      expect(result.found).toBe(true);
      expect(result.path[0]).toBe('0,0,0');
      expect(result.path[result.path.length - 1]).toBe('2,0,-2');
      expect(result.path).not.toContain('1,0,-1');
      expect(result.nodesVisited).toBeGreaterThan(0);
    });

    it('finds path on TriangleTopology', () => {
      const result = findPathAStar(tri, '0,0' as CoordinateKey, '2,0' as CoordinateKey);
      expect(result.found).toBe(true);
      expect(result.path[0]).toBe('0,0');
      expect(result.path[result.path.length - 1]).toBe('2,0');
    });

    it('returns found: false when goal is completely blocked', () => {
      // Enclose destination (2,0,-2) with obstacles
      const dest = '2,0,-2' as CoordinateKey;
      const obstacles = new Set<CoordinateKey>(hex.getAllNeighbors(dest));
      const result = findPathAStar(hex, '0,0,0' as CoordinateKey, dest, {
        isWalkable: (coord) => !obstacles.has(coord),
      });

      expect(result.found).toBe(false);
      expect(result.path).toEqual([]);
    });

    it('respects variable terrain movement cost multipliers', () => {
      // Two paths available: one with cost 10 per step, other with cost 1
      const highCostCell = '1,0,-1' as CoordinateKey;
      const result = findPathAStar(hex, '0,0,0' as CoordinateKey, '2,0,-2' as CoordinateKey, {
        getCost: (_from, to) => (to === highCostCell ? 10 : 1),
      });

      expect(result.found).toBe(true);
      // It should detour around the 10-cost cell
      expect(result.path).not.toContain(highCostCell);
    });
  });

  describe('Line of Sight Validator (FLAT vs PARABOLIC)', () => {
    it('validates clear FLAT trajectory when no obstacles exist', () => {
      const state = createMockState();
      const hasLOS = validateLineOfSight(
        state,
        hex,
        '0,0,0' as CoordinateKey,
        '3,0,-3' as CoordinateKey,
        'FLAT'
      );
      expect(hasLOS).toBe(true);
    });

    it('blocks FLAT trajectory when an intermediate square has a blocking piece or obstacle', () => {
      const blockedCoord = '1,0,-1';
      const state = createMockState(
        { [blockedCoord]: 'piece-1' },
        {
          'piece-1': {
            id: 'piece-1',
            type: 'PIECE',
            position: blockedCoord,
            isCaptured: false,
          },
        }
      );

      const hasLOS = validateLineOfSight(
        state,
        hex,
        '0,0,0' as CoordinateKey,
        '3,0,-3' as CoordinateKey,
        'FLAT'
      );
      expect(hasLOS).toBe(false);
    });

    it('allows PARABOLIC jumping trajectory over intermediate pieces and obstacles', () => {
      const blockedCoord = '1,0,-1';
      const state = createMockState(
        { [blockedCoord]: 'obstacle-1' },
        {
          'obstacle-1': {
            id: 'obstacle-1',
            type: 'OBSTACLE',
            position: blockedCoord,
          },
        }
      );

      const hasLOS = validateLineOfSight(
        state,
        hex,
        '0,0,0' as CoordinateKey,
        '2,0,-2' as CoordinateKey,
        'PARABOLIC'
      );
      expect(hasLOS).toBe(true);
    });

    it('blocks FLAT trajectory when mountain elevation exceeds 0.5', () => {
      const peakCoord = '1,0,-1';
      const state = createMockState(
        { [peakCoord]: 'terrain-peak' },
        {
          'terrain-peak': {
            id: 'terrain-peak',
            type: 'TERRAIN',
            position: peakCoord,
            elevation: 1.8,
          },
        }
      );

      const hasLOS = validateLineOfSight(
        state,
        hex,
        '0,0,0' as CoordinateKey,
        '2,0,-2' as CoordinateKey,
        'FLAT'
      );
      expect(hasLOS).toBe(false);
    });
  });

  describe('AdjacencyGraph (Zero-String Flat TypedArray Graph)', () => {
    it('registers coordinates and builds adjacency offsets in typed arrays', () => {
      const coords: CoordinateKey[] = ['0,0,0', '1,0,-1', '0,1,-1'].map(
        (c) => c as CoordinateKey
      );
      const graph = buildAdjacencyGraph(hex, coords);

      expect(graph.size).toBe(3);
      const id0 = graph.getNodeId('0,0,0' as CoordinateKey);
      expect(id0).toBe(0);
      expect(graph.getCoord(0)).toBe('0,0,0');

      const neighbors = graph.getNeighbors(id0);
      expect(neighbors).toBeInstanceOf(Int32Array);
      expect(neighbors.length).toBe(2); // IDs 1 and 2
    });
  });
});

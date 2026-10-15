import { describe, expect, it } from 'vitest';
import { CoordinateKey } from '../../../coordinates';
import { HexTopology, SquareTopology } from '../../';
import { ITopology } from '../../types';
import { findPathAStar } from '../AStarPathfinder';

/**
 * Independent, brute-force Dijkstra implementation as an authoritative test oracle.
 * Operates purely on edge relaxation with no heuristic (h(n) = 0).
 */
function dijkstraOracle(
  topology: ITopology,
  start: CoordinateKey,
  goal: CoordinateKey,
  isWalkable: (coord: CoordinateKey) => boolean,
  getCost: (from: CoordinateKey, to: CoordinateKey) => number,
  maxVisited = 10000
): { found: boolean; path: CoordinateKey[]; cost: number } {
  if (start === goal) {
    return { found: true, path: [start], cost: 0 };
  }
  if (!isWalkable(start) || !isWalkable(goal)) {
    return { found: false, path: [], cost: Infinity };
  }

  const dist = new Map<CoordinateKey, number>();
  const prev = new Map<CoordinateKey, CoordinateKey>();
  const unvisited = new Set<CoordinateKey>();

  dist.set(start, 0);
  unvisited.add(start);

  let steps = 0;

  while (unvisited.size > 0 && steps < maxVisited) {
    steps++;

    // Find node with minimum distance in unvisited set
    let current: CoordinateKey | null = null;
    let minD = Infinity;
    for (const node of unvisited) {
      const d = dist.get(node) ?? Infinity;
      if (d < minD) {
        minD = d;
        current = node;
      }
    }

    if (!current || minD === Infinity) break;
    unvisited.delete(current);

    if (current === goal) {
      const path: CoordinateKey[] = [goal];
      let curr = goal;
      while (prev.has(curr)) {
        curr = prev.get(curr)!;
        path.push(curr);
      }
      path.reverse();
      return { found: true, path, cost: dist.get(goal) ?? 0 };
    }

    for (const neighbor of topology.getAllNeighbors(current)) {
      if (!isWalkable(neighbor)) continue;

      const edgeCost = getCost(current, neighbor);
      if (edgeCost < 0 || Number.isNaN(edgeCost) || !Number.isFinite(edgeCost)) continue;

      const alt = (dist.get(current) ?? Infinity) + edgeCost;
      if (alt < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, alt);
        prev.set(neighbor, current);
        unvisited.add(neighbor);
      }
    }
  }

  return { found: false, path: [], cost: Infinity };
}

describe('PATCH-02: A* vs Dijkstra Oracle Verification', () => {
  it('solves the adversarial counterexample where old A* returned cost 6 instead of 4', () => {
    const square = new SquareTopology({ width: null, height: null });
    const getCost = (from: CoordinateKey, to: CoordinateKey): number => {
      if (from === '0,0' && to === '1,0') return 5;
      if (from === '0,0' && to === '0,1') return 1;
      if (from === '0,1' && to === '1,1') return 1;
      if (from === '1,1' && to === '1,0') return 1;
      if (from === '1,0' && to === '2,0') return 1;
      return 10;
    };
    const isWalkable = (coord: CoordinateKey) =>
      ['0,0', '1,0', '2,0', '0,1', '1,1'].includes(coord);

    const oracle = dijkstraOracle(square, '0,0' as CoordinateKey, '2,0' as CoordinateKey, isWalkable, getCost);
    expect(oracle.found).toBe(true);
    expect(oracle.cost).toBe(4);

    const astar = findPathAStar(square, '0,0' as CoordinateKey, '2,0' as CoordinateKey, {
      isWalkable,
      getCost,
    });
    expect(astar.found).toBe(true);
    // Must match Dijkstra's optimal cost 4 (not the obsolete 6)
    expect(astar.cost).toBe(oracle.cost);
    expect(astar.path).toEqual(oracle.path);
  });

  it('matches Dijkstra optimal cost across Square grid with variable edge costs', () => {
    const square = new SquareTopology({ width: null, height: null });
    const getCost = (from: CoordinateKey, to: CoordinateKey): number => {
      const p1 = from.split(',').map(Number);
      const p2 = to.split(',').map(Number);
      // Pseudo-random deterministic weight based on coordinates
      const weight = ((Math.abs(p1[0] * 31 + p2[1] * 17) % 7) + 1);
      return weight;
    };
    const isWalkable = (coord: CoordinateKey) => {
      return coord !== '2,2' && coord !== '-1,-1'; // Obstacles
    };

    const start = '-2,-2' as CoordinateKey;
    const goal = '3,3' as CoordinateKey;

    const oracle = dijkstraOracle(square, start, goal, isWalkable, getCost);
    const astar = findPathAStar(square, start, goal, { isWalkable, getCost, minEdgeCost: 1.0 });

    expect(astar.found).toBe(oracle.found);
    expect(astar.cost).toBe(oracle.cost);
  });

  it('matches Dijkstra optimal cost across Hexagonal grid with variable weights', () => {
    const hex = new HexTopology({ radius: 8 });
    const getCost = (from: CoordinateKey, to: CoordinateKey): number => {
      const p1 = from.split(',').map(Number);
      const p2 = to.split(',').map(Number);
      return ((Math.abs(p1[0] * 13 + p2[1] * 7 + p1[2] * 5) % 5) + 1);
    };
    const isWalkable = (coord: CoordinateKey) => {
      return coord !== '1,-1,0' && coord !== '0,1,-1';
    };

    const start = '-3,0,3' as CoordinateKey;
    const goal = '3,0,-3' as CoordinateKey;

    const oracle = dijkstraOracle(hex, start, goal, isWalkable, getCost);
    const astar = findPathAStar(hex, start, goal, { isWalkable, getCost, minEdgeCost: 1.0 });

    expect(astar.found).toBe(oracle.found);
    expect(astar.cost).toBe(oracle.cost);
  });

  it('correctly reports failure for impossible/blocked paths and respects maxNodes', () => {
    const square = new SquareTopology({ width: null, height: null });
    const isWalkable = (coord: CoordinateKey) => coord !== '5,5';

    const astar = findPathAStar(square, '0,0' as CoordinateKey, '5,5' as CoordinateKey, {
      isWalkable,
    });
    expect(astar.found).toBe(false);
    expect(astar.cost).toBe(Infinity);

    // Completely walled-off destination
    const walledWalkable = (coord: CoordinateKey) => {
      const [x, y] = coord.split(',').map(Number);
      if (x === 2 && y >= -2 && y <= 2) return false; // Wall at x=2
      return true;
    };

    const walledResult = findPathAStar(square, '0,0' as CoordinateKey, '5,0' as CoordinateKey, {
      isWalkable: walledWalkable,
      maxNodes: 50,
    });
    expect(walledResult.nodesVisited).toBeLessThanOrEqual(50);
  });

  it('throws on negative edge weights and NaN edge weights', () => {
    const square = new SquareTopology({ width: null, height: null });
    expect(() =>
      findPathAStar(square, '0,0' as CoordinateKey, '2,2' as CoordinateKey, {
        getCost: () => -1,
      })
    ).toThrow(/negative weight/);

    expect(() =>
      findPathAStar(square, '0,0' as CoordinateKey, '2,2' as CoordinateKey, {
        getCost: () => NaN,
      })
    ).toThrow(/NaN/);
  });
});

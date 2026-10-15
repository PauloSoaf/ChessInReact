import { describe, expect, it } from 'vitest';
import { asCoordinateKey, CoordinateKey } from '../../../coordinates';
import { HexTopology } from '../../HexTopology';
import { SquareTopology } from '../../SquareTopology';
import { TriangleTopology } from '../../TriangleTopology';
import { ITopology } from '../../types';
import { findPathAStar } from '../AStarPathfinder';

/**
 * Independent brute-force Dijkstra implementation as authoritative ground-truth oracle.
 */
function dijkstraOracle(
  topology: ITopology,
  start: CoordinateKey,
  goal: CoordinateKey,
  getCost: (from: CoordinateKey, to: CoordinateKey) => number
): { found: boolean; path: CoordinateKey[]; cost: number } {
  if (start === goal) {
    return { found: true, path: [start], cost: 0 };
  }

  const dist = new Map<CoordinateKey, number>();
  const prev = new Map<CoordinateKey, CoordinateKey>();
  const unvisited = new Set<CoordinateKey>();

  dist.set(start, 0);
  unvisited.add(start);

  while (unvisited.size > 0) {
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

    const neighbors = topology.getAllNeighbors(current);
    for (const neighbor of neighbors) {
      const edgeCost = getCost(current, neighbor);
      const newD = minD + edgeCost;
      const oldD = dist.get(neighbor) ?? Infinity;
      if (newD < oldD) {
        dist.set(neighbor, newD);
        prev.set(neighbor, current);
        unvisited.add(neighbor);
      }
    }
  }

  return { found: false, path: [], cost: Infinity };
}

describe('PATCH-14: A* Optimality and Admissibility for Subunit Costs', () => {
  it('finds the optimal alternative path (cost 0.2) over direct path (cost 1.0)', () => {
    const topology = new SquareTopology({ width: 10, height: 10 });
    const start = asCoordinateKey('0,0');
    const goal = asCoordinateKey('1,0');

    // Direct edge 0,0 -> 1,0 costs 1.0
    // Alternative path 0,0 -> 0,1 -> 1,0 costs 0.1 + 0.1 = 0.2
    const getCost = (from: CoordinateKey, to: CoordinateKey): number => {
      if ((from === '0,0' && to === '1,0') || (from === '1,0' && to === '0,0')) {
        return 1.0;
      }
      if (
        (from === '0,0' && to === '0,1') ||
        (from === '0,1' && to === '0,0') ||
        (from === '0,1' && to === '1,0') ||
        (from === '1,0' && to === '0,1')
      ) {
        return 0.1;
      }
      return 1.0;
    };

    // Calling without minEdgeCost: automatically falls back to admissible zero heuristic (Dijkstra)
    const result = findPathAStar(topology, start, goal, { getCost });
    expect(result.found).toBe(true);
    expect(result.cost).toBeCloseTo(0.2);
    expect(result.path).toEqual(['0,0', '0,1', '1,0']);

    // Calling with declared minEdgeCost: 0.1
    const resultWithMinCost = findPathAStar(topology, start, goal, { getCost, minEdgeCost: 0.1 });
    expect(resultWithMinCost.found).toBe(true);
    expect(resultWithMinCost.cost).toBeCloseTo(0.2);
  });

  it('agrees with Dijkstra optimal cost across weight scale: 0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 10.0', () => {
    const square = new SquareTopology({ width: 8, height: 8 });
    const hex = new HexTopology({ orientation: 'POINTY', radius: 8 });
    const tri = new TriangleTopology({ cellSize: 1.0, boundingRadius: 8 });

    const scales = [0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 10.0];

    for (const scale of scales) {
      // 1. Square test
      const sqStart = asCoordinateKey('0,0');
      const sqGoal = asCoordinateKey('3,3');
      const sqCostFn = () => scale;
      const astarSq = findPathAStar(square, sqStart, sqGoal, { getCost: sqCostFn });
      const dijkstraSq = dijkstraOracle(square, sqStart, sqGoal, sqCostFn);
      expect(astarSq.cost).toBeCloseTo(dijkstraSq.cost, 4);

      // 2. Hex test
      const hexStart = asCoordinateKey('0,0,0');
      const hexGoal = asCoordinateKey('2,-1,-1');
      const hexCostFn = () => scale;
      const astarHex = findPathAStar(hex, hexStart, hexGoal, { getCost: hexCostFn });
      const dijkstraHex = dijkstraOracle(hex, hexStart, hexGoal, hexCostFn);
      expect(astarHex.cost).toBeCloseTo(dijkstraHex.cost, 4);

      // 3. Triangle test
      const triStart = asCoordinateKey('0,0');
      const triGoal = asCoordinateKey('1,0');
      const triCostFn = () => scale;
      const astarTri = findPathAStar(tri, triStart, triGoal, { getCost: triCostFn });
      const dijkstraTri = dijkstraOracle(tri, triStart, triGoal, triCostFn);
      expect(astarTri.cost).toBeCloseTo(dijkstraTri.cost, 4);
    }
  });

  it('enforces contract validation and throws when edge cost violates declared minEdgeCost', () => {
    const topology = new SquareTopology({ width: 5, height: 5 });
    const start = asCoordinateKey('0,0');
    const goal = asCoordinateKey('2,2');

    // Declaring minEdgeCost = 1.0, but getCost returns 0.5 violates admissibility
    expect(() =>
      findPathAStar(topology, start, goal, {
        minEdgeCost: 1.0,
        getCost: () => 0.5,
      })
    ).toThrow(/admissibility violation/i);
  });

  it('rejects invalid minEdgeCost values (negative, NaN, non-finite)', () => {
    const topology = new SquareTopology({ width: 5, height: 5 });
    const start = asCoordinateKey('0,0');
    const goal = asCoordinateKey('1,1');

    expect(() => findPathAStar(topology, start, goal, { minEdgeCost: -0.5 })).toThrow(
      /invalid minedgecost/i
    );
    expect(() => findPathAStar(topology, start, goal, { minEdgeCost: NaN })).toThrow(
      /invalid minedgecost/i
    );
    expect(() => findPathAStar(topology, start, goal, { minEdgeCost: Infinity })).toThrow(
      /invalid minedgecost/i
    );
  });

  it('rejects invalid edge costs (NaN and negative weights)', () => {
    const topology = new SquareTopology({ width: 5, height: 5 });
    const start = asCoordinateKey('0,0');
    const goal = asCoordinateKey('1,1');

    expect(() =>
      findPathAStar(topology, start, goal, {
        getCost: () => NaN,
      })
    ).toThrow(/invalid edge cost: nan/i);

    expect(() =>
      findPathAStar(topology, start, goal, {
        getCost: () => -1.0,
      })
    ).toThrow(/negative weight/i);
  });
});

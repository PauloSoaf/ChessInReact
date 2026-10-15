import { describe, expect, it } from 'vitest';
import { TriangleTopology } from '../TriangleTopology';
import { CoordinateKey } from '../../coordinates';

describe('TriangleTopology (Spec 02 Verification)', () => {
  const tri = new TriangleTopology({ triangleSide: 1.0 });

  it('identifies topology type as TRIANGULAR and coordinate format as TRIANGULAR', () => {
    expect(tri.type).toBe('TRIANGULAR');
    expect(tri.coordinateFormat).toBe('TRIANGULAR');
  });

  it('validates 2D integer coordinates and rejects malformed keys (RNF-14)', () => {
    expect(tri.isValidCoordinate('0,0' as CoordinateKey)).toBe(true);
    expect(tri.isValidCoordinate('3,-2' as CoordinateKey)).toBe(true);
    expect(tri.isValidCoordinate('-5,10' as CoordinateKey)).toBe(true);

    expect(tri.isValidCoordinate('' as CoordinateKey)).toBe(false);
    expect(tri.isValidCoordinate('abc' as CoordinateKey)).toBe(false);
    expect(tri.isValidCoordinate('1,2,3' as CoordinateKey)).toBe(false);
    expect(tri.isValidCoordinate('1.5,2' as CoordinateKey)).toBe(false);
  });

  it('correctly determines alternating Up/Down orientation parity', () => {
    // Up: (x + y) % 2 === 0
    expect(tri.isPointingUp('0,0' as CoordinateKey)).toBe(true);
    expect(tri.isPointingUp('1,1' as CoordinateKey)).toBe(true);
    expect(tri.isPointingUp('2,0' as CoordinateKey)).toBe(true);

    // Down: (x + y) % 2 !== 0
    expect(tri.isPointingUp('1,0' as CoordinateKey)).toBe(false);
    expect(tri.isPointingUp('0,1' as CoordinateKey)).toBe(false);
    expect(tri.isPointingUp('2,1' as CoordinateKey)).toBe(false);
  });

  it('provides exactly 3 shared edge neighbors with orientation-dependent geometry', () => {
    // (0,0) is pointing UP -> shares edges with Left (-1,0), Right (1,0), Down (0,-1)
    const upNeighbors = tri.getNeighbors('0,0' as CoordinateKey);
    expect(upNeighbors.length).toBe(3);
    expect(upNeighbors).toContain('-1,0');
    expect(upNeighbors).toContain('1,0');
    expect(upNeighbors).toContain('0,-1');

    // (1,0) is pointing DOWN -> shares edges with Left (0,0), Right (2,0), Up (1,1)
    const downNeighbors = tri.getNeighbors('1,0' as CoordinateKey);
    expect(downNeighbors.length).toBe(3);
    expect(downNeighbors).toContain('0,0');
    expect(downNeighbors).toContain('2,0');
    expect(downNeighbors).toContain('1,1');
  });

  it('enforces neighbor reciprocity: B is a neighbor of A iff A is a neighbor of B', () => {
    const coords: CoordinateKey[] = ['0,0', '1,0', '0,1', '1,1', '-1,0', '0,-1'].map(
      (c) => c as CoordinateKey
    );

    for (const a of coords) {
      const neighborsOfA = tri.getNeighbors(a);
      for (const b of neighborsOfA) {
        const neighborsOfB = tri.getNeighbors(b);
        expect(neighborsOfB).toContain(a);
      }
    }
  });

  it('calculates exact graph distance matching BFS and triangular coordinates (PATCH-03)', () => {
    expect(tri.getDistance('0,0' as CoordinateKey, '0,0' as CoordinateKey)).toBe(0);
    expect(tri.getDistance('0,0' as CoordinateKey, '1,0' as CoordinateKey)).toBe(1);
    expect(tri.getDistance('0,0' as CoordinateKey, '2,0' as CoordinateKey)).toBe(2);
    expect(tri.getDistance('0,0' as CoordinateKey, '1,1' as CoordinateKey)).toBe(2);

    // Verified defect from audit: (0,0) and (0,1) must be 3 steps apart, not 1:
    expect(tri.getDistance('0,0' as CoordinateKey, '0,1' as CoordinateKey)).toBe(3);
    expect(tri.getDistance('0,1' as CoordinateKey, '0,0' as CoordinateKey)).toBe(3);
  });

  it('guarantees distance symmetry and triangle inequality across arbitrary pairs', () => {
    const coords: CoordinateKey[] = [
      '0,0', '1,0', '0,1', '1,1', '-1,0', '0,-1', '-2,2', '3,-3', '4,2'
    ].map((c) => c as CoordinateKey);

    for (const a of coords) {
      for (const b of coords) {
        // Symmetry
        expect(tri.getDistance(a, b)).toBe(tri.getDistance(b, a));

        // Direct neighbors must have distance 1
        if (tri.getAllNeighbors(a).includes(b)) {
          expect(tri.getDistance(a, b)).toBe(1);
        }

        // Triangle Inequality: d(a, c) <= d(a, b) + d(b, c)
        for (const c of coords) {
          expect(tri.getDistance(a, c)).toBeLessThanOrEqual(
            tri.getDistance(a, b) + tri.getDistance(b, c)
          );
        }
      }
    }
  });

  it('matches BFS ground truth across a grid of negative and positive coordinates', () => {
    function bfsDistance(start: CoordinateKey, goal: CoordinateKey): number {
      if (start === goal) return 0;
      const queue: [CoordinateKey, number][] = [[start, 0]];
      const visited = new Set<string>([start]);

      while (queue.length > 0) {
        const [curr, d] = queue.shift()!;
        for (const n of tri.getAllNeighbors(curr)) {
          if (n === goal) return d + 1;
          if (!visited.has(n)) {
            visited.add(n);
            queue.push([n, d + 1]);
          }
        }
      }
      return Infinity;
    }

    const testPoints: CoordinateKey[] = [
      '0,0', '1,0', '-1,0', '0,1', '0,-1', '1,1', '-1,-1', '2,1', '-2,-1', '3,0', '-3,2'
    ].map((c) => c as CoordinateKey);

    for (const p1 of testPoints) {
      for (const p2 of testPoints) {
        const bfsD = bfsDistance(p1, p2);
        const formulaD = tri.getDistance(p1, p2);
        expect(formulaD).toBe(bfsD);
      }
    }
  });

  it('guarantees that every consecutive cell in getLineOfSight is a true adjacent neighbor', () => {
    const los = tri.getLineOfSight('0,0' as CoordinateKey, '0,1' as CoordinateKey);
    expect(los[0]).toBe('0,0');
    expect(los[los.length - 1]).toBe('0,1');
    expect(los.length).toBe(4); // 3 steps: 4 cells

    for (let i = 0; i < los.length - 1; i++) {
      const stepDist = tri.getDistance(los[i], los[i + 1]);
      expect(stepDist).toBe(1); // Must share an edge
      expect(tri.getAllNeighbors(los[i])).toContain(los[i + 1]);
    }
  });

  it('computes world coordinates and validates roundtrip worldToCoordinate', () => {
    const world00 = tri.toWorldPosition('0,0' as CoordinateKey);
    expect(world00.x).toBeCloseTo(0);
    expect(world00.y).toBe(0);

    const world10 = tri.toWorldPosition('1,0' as CoordinateKey);
    expect(world10.x).toBeCloseTo(0.5);

    const coordsToTest: CoordinateKey[] = ['0,0', '1,0', '2,1', '-3,4', '-5,-2'].map(
      (c) => c as CoordinateKey
    );
    for (const c of coordsToTest) {
      const world = tri.toWorldPosition(c);
      const restored = tri.worldToCoordinate(world);
      expect(restored).toBe(c);
    }
  });
});

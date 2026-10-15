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

  it('calculates barycentric distance accurately', () => {
    expect(tri.getDistance('0,0' as CoordinateKey, '0,0' as CoordinateKey)).toBe(0);
    expect(tri.getDistance('0,0' as CoordinateKey, '1,0' as CoordinateKey)).toBe(1);
    expect(tri.getDistance('0,0' as CoordinateKey, '2,0' as CoordinateKey)).toBe(2);
    expect(tri.getDistance('0,0' as CoordinateKey, '1,1' as CoordinateKey)).toBe(2);
  });

  it('computes line of sight across triangle grid', () => {
    const los = tri.getLineOfSight('0,0' as CoordinateKey, '3,0' as CoordinateKey);
    expect(los[0]).toBe('0,0');
    expect(los[los.length - 1]).toBe('3,0');
    expect(los.length).toBeGreaterThanOrEqual(4);
  });

  it('computes world coordinates for triangular tessellation', () => {
    const world00 = tri.toWorldPosition('0,0' as CoordinateKey);
    expect(world00.x).toBeCloseTo(0);
    expect(world00.y).toBe(0);

    const world10 = tri.toWorldPosition('1,0' as CoordinateKey);
    expect(world10.x).toBeCloseTo(0.5);
  });
});

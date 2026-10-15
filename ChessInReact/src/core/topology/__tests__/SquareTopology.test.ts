import { describe, expect, it } from 'vitest';
import { SquareTopology } from '../SquareTopology';
import { CoordinateKey } from '../../coordinates';

describe('SquareTopology (Spec 02 Verification)', () => {
  const topology = new SquareTopology({ width: null, height: null });

  it('identifies topology type as SQUARE and coordinate format as SQUARE', () => {
    expect(topology.type).toBe('SQUARE');
    expect(topology.coordinateFormat).toBe('SQUARE');
  });

  it('validates standard 2D cartesian coordinate keys and rejects malformed keys (RNF-14)', () => {
    expect(topology.isValidCoordinate('0,0' as CoordinateKey)).toBe(true);
    expect(topology.isValidCoordinate('4,7' as CoordinateKey)).toBe(true);
    expect(topology.isValidCoordinate('-12,35' as CoordinateKey)).toBe(true);

    // Malformed coordinates
    expect(topology.isValidCoordinate('' as CoordinateKey)).toBe(false);
    expect(topology.isValidCoordinate('abc' as CoordinateKey)).toBe(false);
    expect(topology.isValidCoordinate('1,2,3' as CoordinateKey)).toBe(false);
    expect(topology.isValidCoordinate('1,' as CoordinateKey)).toBe(false);
    expect(topology.isValidCoordinate('NaN,0' as CoordinateKey)).toBe(false);
  });

  it('enforces bounds when bounded 8x8 options are set', () => {
    const bounded = new SquareTopology({ width: 8, height: 8 });
    expect(bounded.isValidCoordinate('0,0' as CoordinateKey)).toBe(true);
    expect(bounded.isValidCoordinate('7,7' as CoordinateKey)).toBe(true);
    expect(bounded.isValidCoordinate('8,8' as CoordinateKey)).toBe(false);
    expect(bounded.isValidCoordinate('-1,0' as CoordinateKey)).toBe(false);
    expect(bounded.getNeighbor('0,0' as CoordinateKey, 6)).toBeNull(); // West out of bounds
  });

  it('provides 8 standard directions (4 orthogonal, 4 diagonal)', () => {
    const origin = '0,0' as CoordinateKey;
    const neighbors = topology.getNeighbors(origin);
    expect(neighbors.length).toBe(8);

    // Expected neighbors: (0,1), (1,1), (1,0), (1,-1), (0,-1), (-1,-1), (-1,0), (-1,1)
    const expected = ['0,1', '1,1', '1,0', '1,-1', '0,-1', '-1,-1', '-1,0', '-1,1'];
    expect(neighbors).toEqual(expected);

    // Individual getNeighbor by direction index
    expect(topology.getNeighbor(origin, 0)).toBe('0,1');  // N
    expect(topology.getNeighbor(origin, 2)).toBe('1,0');  // E
    expect(topology.getNeighbor(origin, 4)).toBe('0,-1'); // S
    expect(topology.getNeighbor(origin, 6)).toBe('-1,0'); // W
  });

  it('calculates Chebyshev (king) distance correctly', () => {
    expect(topology.getDistance('0,0' as CoordinateKey, '0,0' as CoordinateKey)).toBe(0);
    expect(topology.getDistance('0,0' as CoordinateKey, '3,4' as CoordinateKey)).toBe(4);
    expect(topology.getDistance('-2,-2' as CoordinateKey, '2,2' as CoordinateKey)).toBe(4);
    expect(topology.getDistance('10,5' as CoordinateKey, '12,9' as CoordinateKey)).toBe(4);
  });

  it('supports Manhattan distance option', () => {
    const manhattanTopology = new SquareTopology({ distanceMetric: 'MANHATTAN' });
    expect(manhattanTopology.getDistance('0,0' as CoordinateKey, '3,4' as CoordinateKey)).toBe(7);
    expect(manhattanTopology.getDistance('-2,-2' as CoordinateKey, '2,2' as CoordinateKey)).toBe(8);
  });

  it('computes Bresenham line of sight between two coordinates', () => {
    const path = topology.getLineOfSight('0,0' as CoordinateKey, '0,4' as CoordinateKey);
    expect(path).toEqual(['0,0', '0,1', '0,2', '0,3', '0,4']);

    const diagonalPath = topology.getLineOfSight('0,0' as CoordinateKey, '3,3' as CoordinateKey);
    expect(diagonalPath).toEqual(['0,0', '1,1', '2,2', '3,3']);
  });

  it('generates rings and spirals correctly', () => {
    const origin = '0,0' as CoordinateKey;
    const ring1 = topology.getRing(origin, 1);
    expect(ring1.length).toBe(8);
    expect(new Set(ring1).size).toBe(8);

    const spiral2 = topology.getSpiral(origin, 2);
    // A 5x5 square area centered at (0,0) has 25 squares
    expect(spiral2.length).toBe(25);
    expect(new Set(spiral2).size).toBe(25);
    expect(spiral2[0]).toBe('0,0');
  });

  it('computes 2-color checkerboard colorIndex deterministically', () => {
    expect(topology.getColorIndex('0,0' as CoordinateKey)).toBe(0);
    expect(topology.getColorIndex('0,1' as CoordinateKey)).toBe(1);
    expect(topology.getColorIndex('1,0' as CoordinateKey)).toBe(1);
    expect(topology.getColorIndex('1,1' as CoordinateKey)).toBe(0);
    expect(topology.getColorIndex('7,7' as CoordinateKey)).toBe(0);
  });

  it('supports toroidal wrapping when dimensions are configured', () => {
    const toroidal = new SquareTopology({
      toroidal: true,
      width: 8,
      height: 8,
    });

    // Wrapping at East boundary (7, 0) + East => (0, 0)
    expect(toroidal.getNeighbor('7,0' as CoordinateKey, 2)).toBe('0,0');
    // Wrapping at West boundary (0, 0) + West => (7, 0)
    expect(toroidal.getNeighbor('0,0' as CoordinateKey, 6)).toBe('7,0');
    // Wrapping at North boundary (0, 7) + North => (0, 0)
    expect(toroidal.getNeighbor('0,7' as CoordinateKey, 0)).toBe('0,0');
  });

  it('maintains mathematical precision for coordinates up to 50,000 units (RNF-11)', () => {
    const farA = '45000,45000' as CoordinateKey;
    const farB = '45010,45020' as CoordinateKey;
    expect(topology.getDistance(farA, farB)).toBe(20);

    const neighbors = topology.getNeighbors('50000,50000' as CoordinateKey);
    expect(neighbors).toContain('50001,50000');
    expect(neighbors).toContain('49999,50000');
    expect(neighbors.length).toBe(8);
  });
});

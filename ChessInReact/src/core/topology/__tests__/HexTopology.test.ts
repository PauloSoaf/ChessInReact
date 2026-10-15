import { describe, expect, it } from 'vitest';
import { HexTopology } from '../HexTopology';
import { CoordinateKey } from '../../coordinates';

describe('HexTopology (Spec 02 Verification)', () => {
  const hex = new HexTopology({ hexSize: 1.0 });

  it('identifies topology type as HEXAGONAL and coordinate format as HEX_CUBIC', () => {
    expect(hex.type).toBe('HEXAGONAL');
    expect(hex.coordinateFormat).toBe('HEX_CUBIC');
  });

  it('strictly validates cube coordinate keys satisfying q + r + s = 0 and rejects invalid keys (RNF-14)', () => {
    expect(hex.isValidCoordinate('0,0,0' as CoordinateKey)).toBe(true);
    expect(hex.isValidCoordinate('1,-1,0' as CoordinateKey)).toBe(true);
    expect(hex.isValidCoordinate('2,-5,3' as CoordinateKey)).toBe(true);
    expect(hex.isValidCoordinate('-10,15,-5' as CoordinateKey)).toBe(true);

    // Violates q + r + s = 0
    expect(hex.isValidCoordinate('1,1,1' as CoordinateKey)).toBe(false);
    expect(hex.isValidCoordinate('1,-1,1' as CoordinateKey)).toBe(false);

    // Malformed strings
    expect(hex.isValidCoordinate('0,0' as CoordinateKey)).toBe(false);
    expect(hex.isValidCoordinate('abc' as CoordinateKey)).toBe(false);
    expect(hex.isValidCoordinate('' as CoordinateKey)).toBe(false);
    expect(hex.isValidCoordinate('1,2,NaN' as CoordinateKey)).toBe(false);
  });

  it('provides 6 edge neighbors and 6 vertex neighbors (12 directions total)', () => {
    const origin = '0,0,0' as CoordinateKey;
    const edgeNeighbors = hex.getNeighbors(origin);
    expect(edgeNeighbors.length).toBe(6);

    // Expected 6 edge neighbors:
    // E (1, 0, -1), NE (1, -1, 0), NW (0, -1, 1), W (-1, 0, 1), SW (-1, 1, 0), SE (0, 1, -1)
    expect(edgeNeighbors).toContain('1,0,-1');
    expect(edgeNeighbors).toContain('1,-1,0');
    expect(edgeNeighbors).toContain('0,-1,1');
    expect(edgeNeighbors).toContain('-1,0,1');
    expect(edgeNeighbors).toContain('-1,1,0');
    expect(edgeNeighbors).toContain('0,1,-1');

    // Individual directions (0 to 5: edges)
    expect(hex.getNeighbor(origin, 0)).toBe('1,-1,0');
    expect(hex.getNeighbor(origin, 3)).toBe('-1,1,0');

    // Diagonal/vertex directions (6 to 11)
    expect(hex.getNeighbor(origin, 6)).toBe('2,-1,-1');
    expect(hex.getNeighbor(origin, 9)).toBe('-2,1,1');
  });

  it('calculates Manhattan cube distance formula (|q| + |r| + |s|) / 2', () => {
    expect(hex.getDistance('0,0,0' as CoordinateKey, '0,0,0' as CoordinateKey)).toBe(0);
    expect(hex.getDistance('0,0,0' as CoordinateKey, '1,0,-1' as CoordinateKey)).toBe(1);
    expect(hex.getDistance('0,0,0' as CoordinateKey, '2,-1,-1' as CoordinateKey)).toBe(2);
    expect(hex.getDistance('3,-1,-2' as CoordinateKey, '-2,4,-2' as CoordinateKey)).toBe(5);
  });

  it('computes Cube LERP line of sight with 1e-6 epsilon offset avoiding boundary ambiguity', () => {
    const origin = '0,0,0' as CoordinateKey;
    const dest = '3,0,-3' as CoordinateKey;
    const line = hex.getLineOfSight(origin, dest);

    expect(line).toEqual(['0,0,0', '1,0,-1', '2,0,-2', '3,0,-3']);
    expect(line.length).toBe(4);

    // Diagonal/non-collinear line
    const nonCollinear = hex.getLineOfSight('0,0,0' as CoordinateKey, '2,-3,1' as CoordinateKey);
    expect(nonCollinear[0]).toBe('0,0,0');
    expect(nonCollinear[nonCollinear.length - 1]).toBe('2,-3,1');
    expect(nonCollinear.length).toBe(4); // Distance is 3, so path has 4 points
  });

  it('computes trichromatic coloring ((q - r) % 3 + 3) % 3 deterministically', () => {
    // Canonical 3-color scheme for hexagonal chess
    expect(hex.getColorIndex('0,0,0' as CoordinateKey)).toBe(0);
    expect(hex.getColorIndex('1,0,-1' as CoordinateKey)).toBe(1);
    expect(hex.getColorIndex('0,1,-1' as CoordinateKey)).toBe(2);
    expect(hex.getColorIndex('1,-1,0' as CoordinateKey)).toBe(2);
    expect(hex.getColorIndex('2,-1,-1' as CoordinateKey)).toBe(0);

    // Verify all neighbors of any hex have different colors than the origin
    const origin = '0,0,0' as CoordinateKey;
    const originColor = hex.getColorIndex(origin);
    const neighbors = hex.getNeighbors(origin);
    for (const neighbor of neighbors) {
      expect(hex.getColorIndex(neighbor)).not.toBe(originColor);
    }
  });

  it('generates rings using O(R) boundary traversal algorithm', () => {
    const origin = '0,0,0' as CoordinateKey;
    expect(hex.getRing(origin, 0)).toEqual(['0,0,0']);

    const ring1 = hex.getRing(origin, 1);
    expect(ring1.length).toBe(6);
    expect(new Set(ring1).size).toBe(6);

    const ring2 = hex.getRing(origin, 2);
    expect(ring2.length).toBe(12);
    expect(new Set(ring2).size).toBe(12);

    const ring5 = hex.getRing(origin, 5);
    expect(ring5.length).toBe(30);
    expect(new Set(ring5).size).toBe(30);
  });

  it('generates spirals containing exactly 1 + 3*R*(R+1) hexes', () => {
    const origin = '0,0,0' as CoordinateKey;
    const spiral0 = hex.getSpiral(origin, 0);
    expect(spiral0.length).toBe(1);

    const spiral1 = hex.getSpiral(origin, 1);
    expect(spiral1.length).toBe(7); // 1 + 3*1*2 = 7
    expect(new Set(spiral1).size).toBe(7);

    const spiral2 = hex.getSpiral(origin, 2);
    expect(spiral2.length).toBe(19); // 1 + 3*2*3 = 19
    expect(new Set(spiral2).size).toBe(19);

    const spiral4 = hex.getSpiral(origin, 4);
    expect(spiral4.length).toBe(61); // 1 + 3*4*5 = 61
  });

  it('converts cube coordinates to pointy-topped 3D world space coordinates accurately', () => {
    const centerWorld = hex.toWorldPosition('0,0,0' as CoordinateKey);
    expect(centerWorld.x).toBeCloseTo(0);
    expect(centerWorld.y).toBe(0);
    expect(centerWorld.z).toBeCloseTo(0);

    // Pointy-topped x = size * sqrt(3) * (q + r/2), z = size * 3/2 * r
    const neighborWorld = hex.toWorldPosition('1,0,-1' as CoordinateKey);
    expect(neighborWorld.x).toBeCloseTo(Math.sqrt(3));
    expect(neighborWorld.z).toBeCloseTo(0);

    const neighborR = hex.toWorldPosition('0,1,-1' as CoordinateKey);
    expect(neighborR.x).toBeCloseTo(Math.sqrt(3) / 2);
    expect(neighborR.z).toBeCloseTo(1.5);
  });

  it('maintains coordinate determinism and precision for coordinates up to 50,000 units (RNF-11)', () => {
    const largeA = '30000,-10000,-20000' as CoordinateKey;
    const largeB = '30005,-10003,-20002' as CoordinateKey;
    expect(hex.isValidCoordinate(largeA)).toBe(true);
    expect(hex.isValidCoordinate(largeB)).toBe(true);
    expect(hex.getDistance(largeA, largeB)).toBe(5);

    const neighbors = hex.getNeighbors(largeA);
    expect(neighbors.length).toBe(6);
    for (const n of neighbors) {
      expect(hex.isValidCoordinate(n)).toBe(true);
      expect(hex.getDistance(largeA, n)).toBe(1);
    }
  });

  it('builds a standard 4-player classic hexagonal arena in less than 30ms (RNF-12)', () => {
    const startTime = performance.now();
    // Classic 4-player arena is radius R = 5 (91 hexes)
    const arenaCells = hex.getSpiral('0,0,0' as CoordinateKey, 5);
    const durationMs = performance.now() - startTime;

    expect(arenaCells.length).toBe(91);
    expect(durationMs).toBeLessThan(30);
  });
});

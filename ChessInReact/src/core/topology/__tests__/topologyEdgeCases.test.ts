import { describe, it, expect } from 'vitest';
import { SquareTopology } from '../SquareTopology';
import { HexTopology } from '../HexTopology';
import { TriangleTopology } from '../TriangleTopology';
import { VoronoiTopology } from '../VoronoiTopology';
import { asCoordinateKey } from '../../coordinates';

describe('Topology Edge Cases and High-Coverage Suite (RNF-10 >95%)', () => {
  describe('SquareTopology Edge Cases', () => {
    it('exercises getRay, getRing, getSpiral, toroidal wrapping and color indices', () => {
      const bounded = new SquareTopology({ width: 8, height: 8 });
      const ray = bounded.getRay(asCoordinateKey('4,4'), 0, 10); // Direction 0 = North (y+1)
      expect(ray).toEqual(['4,5', '4,6', '4,7']);

      // Toroidal wrapping in getRing
      const toroidal = new SquareTopology({ width: 4, height: 4, toroidal: true });
      const ring = toroidal.getRing(asCoordinateKey('0,0'), 1);
      expect(ring.length).toBeGreaterThan(0);
      expect(toroidal.getSpiral(asCoordinateKey('0,0'), 1).length).toBeGreaterThan(1);

      // Radius 0
      expect(bounded.getRing(asCoordinateKey('2,2'), 0)).toEqual(['2,2']);

      // Color index
      expect(bounded.getColorIndex(asCoordinateKey('0,0'))).toBe(0);
      expect(bounded.getColorIndex(asCoordinateKey('0,1'))).toBe(1);

      // Toroidal worldToCoordinate
      const wrapped = toroidal.worldToCoordinate({ x: -1, y: 0, z: -1 });
      expect(wrapped).toBe('3,3');
    });
  });

  describe('HexTopology Flat Orientation & Edge Cases', () => {
    it('exercises FLAT orientation projection and round-trip', () => {
      const flatHex = new HexTopology({ orientation: 'FLAT', cellSize: 2.0 });
      const origin = asCoordinateKey('0,0,0');
      const worldOrigin = flatHex.toWorldPosition(origin);
      expect(worldOrigin).toEqual({ x: 0, y: 0, z: 0 });
      expect(flatHex.worldToCoordinate(worldOrigin)).toBe(origin);

      const target = asCoordinateKey('3,-2,-1');
      const worldTarget = flatHex.toWorldPosition(target);
      expect(flatHex.worldToCoordinate(worldTarget)).toBe(target);

      // Ray casting
      const ray = flatHex.getRay(origin, 0, 4);
      expect(ray.length).toBe(4);

      // Color indices
      expect(flatHex.getCellColorIndex(asCoordinateKey('0,0,0'))).toBe(0);
      expect(flatHex.getCellColorIndex(asCoordinateKey('1,0,-1'))).toBe(1);
      expect(flatHex.getCellColorIndex(asCoordinateKey('2,0,-2'))).toBe(2);
    });

    it('handles bounded radius limits for getNeighbor', () => {
      const bounded = new HexTopology({ radius: 2 });
      expect(bounded.getNeighbor(asCoordinateKey('2,0,-2'), 0)).toBeNull(); // Exits radius 2
    });
  });

  describe('TriangleTopology Rays and Color Index', () => {
    it('exercises getRay, getCellColorIndex and boundingRadius', () => {
      const tri = new TriangleTopology({ cellSize: 1.0 });
      const ray = tri.getRay(asCoordinateKey('0,0'), 0, 3);
      expect(ray.length).toBe(3);

      expect(tri.getCellColorIndex(asCoordinateKey('0,0'))).toBe(0); // Up
      expect(tri.getCellColorIndex(asCoordinateKey('0,1'))).toBe(1); // Down

      // Bounding radius
      const boundedTri = new TriangleTopology({ boundingRadius: 1 });
      expect(boundedTri.getNeighbor(asCoordinateKey('1,0'), 2)).toBeNull(); // Out of bounding radius
    });
  });

  describe('VoronoiTopology Ray, Coloring, Line Edge Cases & Far Distances', () => {
    it('exercises getRay, getCellColorIndex, far distance fallback', () => {
      const voronoi = new VoronoiTopology({ seed: '42', cellSize: 2.0 });
      const ray = voronoi.getRay(asCoordinateKey('0,0'), 0, 4);
      expect(ray.length).toBeGreaterThan(0);

      const color0 = voronoi.getCellColorIndex(asCoordinateKey('0,0'));
      expect([0, 1, 2]).toContain(color0);

      // Line of sight
      const los = voronoi.getLineOfSight(asCoordinateKey('0,0'), asCoordinateKey('0,2'));
      expect(los.length).toBeGreaterThan(0);
      expect(los[0]).toBe('0,0');

      // Far distance triggers Chebyshev fallback
      const farDist = voronoi.getDistance(asCoordinateKey('0,0'), asCoordinateKey('50,50'));
      expect(farDist).toBeGreaterThanOrEqual(50);
    });
  });
});

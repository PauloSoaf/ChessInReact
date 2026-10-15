import { describe, expect, it } from 'vitest';
import { CoordinateKey } from '../../coordinates';
import { VoronoiTopology } from '../VoronoiTopology';

describe('RF-01: VoronoiTopology Verification', () => {
  const voronoi = new VoronoiTopology({
    seed: 'test-voronoi-seed-42',
    boundingRadius: 10,
    cellSize: 2.0,
    jitterFactor: 0.25,
  });

  it('identifies type as VORONOI_IRREGULAR', () => {
    expect(voronoi.type).toBe('VORONOI_IRREGULAR');
  });

  it('generates deterministic sites: same seed produces identical coordinates and positions', () => {
    const v2 = new VoronoiTopology({
      seed: 'test-voronoi-seed-42',
      boundingRadius: 10,
      cellSize: 2.0,
      jitterFactor: 0.25,
    });

    const p1 = voronoi.toWorldPosition('3,4' as CoordinateKey);
    const p2 = v2.toWorldPosition('3,4' as CoordinateKey);

    expect(p1.x).toBe(p2.x);
    expect(p1.z).toBe(p2.z);
  });

  it('guarantees neighbor reciprocity (A is neighbor of B iff B is neighbor of A)', () => {
    const testSites: CoordinateKey[] = [
      '0,0', '1,0', '0,1', '1,1', '-2,2', '3,-1', '-1,-2'
    ].map((s) => s as CoordinateKey);

    for (const site of testSites) {
      const neighbors = voronoi.getAllNeighbors(site);
      expect(neighbors.length).toBeGreaterThanOrEqual(4);
      expect(neighbors.length).toBeLessThanOrEqual(8);
      expect(neighbors).not.toContain(site); // No self-loops

      for (const n of neighbors) {
        const reverseNeighbors = voronoi.getAllNeighbors(n);
        expect(reverseNeighbors).toContain(site);
      }
    }
  });

  it('resolves worldToCoordinate back to the originating site', () => {
    const coords: CoordinateKey[] = ['0,0', '2,3', '-4,-2', '5,-1'].map(
      (c) => c as CoordinateKey
    );
    for (const c of coords) {
      const pos = voronoi.toWorldPosition(c);
      const resolved = voronoi.worldToCoordinate(pos);
      expect(resolved).toBe(c);
    }
  });

  it('calculates distance and continuous line of sight across irregular Voronoi cells', () => {
    const start = '0,0' as CoordinateKey;
    const target = '2,2' as CoordinateKey;

    const dist = voronoi.getDistance(start, target);
    expect(dist).toBeGreaterThanOrEqual(2);

    const los = voronoi.getLineOfSight(start, target);
    expect(los[0]).toBe(start);
    expect(los[los.length - 1]).toBe(target);

    // Each step must be adjacent in the Voronoi graph
    for (let i = 0; i < los.length - 1; i++) {
      const neighbors = voronoi.getAllNeighbors(los[i]);
      expect(neighbors).toContain(los[i + 1]);
    }
  });
});

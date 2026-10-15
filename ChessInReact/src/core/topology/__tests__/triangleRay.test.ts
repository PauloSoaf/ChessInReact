import { describe, expect, it } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { TriangleTopology } from '../TriangleTopology';

describe('PATCH-15: Triangular Ray Traversal and Continuity', () => {
  const tri = new TriangleTopology({ cellSize: 1.0 });

  it('generates a 10-step continuous ray from 0,0 (UP triangle) without oscillation', () => {
    const start = asCoordinateKey('0,0');
    const ray = tri.getRay(start, 0, 10);

    expect(ray.length).toBe(10);

    // No cell repetition
    const uniqueCoords = new Set(ray);
    expect(uniqueCoords.size).toBe(10);
    expect(uniqueCoords.has(start)).toBe(false);

    // Adjacency continuity: every cell must be a direct neighbor of the preceding cell
    let prev = start;
    for (const cell of ray) {
      const neighbors = tri.getAllNeighbors(prev);
      expect(neighbors).toContain(cell);
      prev = cell;
    }
  });

  it('generates a continuous ray starting from a DOWN triangle without oscillation', () => {
    // 0,-1 has (0 + (-1)) % 2 = -1 !== 0, so it is a DOWN triangle
    const start = asCoordinateKey('0,-1');
    const ray = tri.getRay(start, 0, 8);

    expect(ray.length).toBe(8);

    const uniqueCoords = new Set(ray);
    expect(uniqueCoords.size).toBe(8);
    expect(uniqueCoords.has(start)).toBe(false);

    let prev = start;
    for (const cell of ray) {
      const neighbors = tri.getAllNeighbors(prev);
      expect(neighbors).toContain(cell);
      prev = cell;
    }
  });

  it('generates horizontal rays (East and West) with straight steps and no oscillation', () => {
    const start = asCoordinateKey('0,0');

    // Direction 1: West
    const rayWest = tri.getRay(start, 1, 6);
    expect(rayWest).toEqual(['-1,0', '-2,0', '-3,0', '-4,0', '-5,0', '-6,0']);

    // Direction 2: East
    const rayEast = tri.getRay(start, 2, 6);
    expect(rayEast).toEqual(['1,0', '2,0', '3,0', '4,0', '5,0', '6,0']);
  });

  it('halts ray propagation when encountering boundingRadius', () => {
    const boundedTri = new TriangleTopology({ cellSize: 1.0, boundingRadius: 3 });
    const ray = boundedTri.getRay(asCoordinateKey('0,0'), 0, 10);

    // Should stop before reaching 10 steps due to bounding radius
    expect(ray.length).toBeLessThan(10);
    for (const coord of ray) {
      const { q, r } = boundedTri.parse(coord);
      expect(Math.abs(q)).toBeLessThanOrEqual(3);
      expect(Math.abs(r)).toBeLessThanOrEqual(3);
    }
  });

  it('works correctly with negative coordinate start positions', () => {
    const start = asCoordinateKey('-4,-4'); // (-4 + -4) % 2 === 0 -> UP
    const ray = tri.getRay(start, 0, 6);

    expect(ray.length).toBe(6);
    const unique = new Set(ray);
    expect(unique.size).toBe(6);

    let prev = start;
    for (const cell of ray) {
      expect(tri.getAllNeighbors(prev)).toContain(cell);
      prev = cell;
    }
  });
});

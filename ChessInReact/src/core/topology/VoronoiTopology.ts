import { asCoordinateKey, CoordinateKey } from '../coordinates';
import { DirectionIndex, ITopology, IWorldPosition, TopologyType } from './types';

export interface IVoronoiTopologyOptions {
  readonly seed?: string;
  readonly boundingRadius?: number;
  readonly cellSize?: number;
  readonly jitterFactor?: number;
}

/**
 * Deterministic pseudo-random hash for spatial coordinates and seeds (Spec 02 RF-01).
 * Returns float in [-1.0, 1.0].
 */
function deterministicSpatialHash(u: number, v: number, seed: string, salt: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (u & 0xffff), 0x01000193);
  h = Math.imul(h ^ (v & 0xffff), 0x01000193);
  h = Math.imul(h ^ (salt & 0xffff), 0x01000193);
  // Convert 32-bit unsigned integer to [-1.0, 1.0]
  return ((h >>> 0) / 2147483647.5) - 1.0;
}

/**
 * Deterministic Voronoi Topology based on perturbed lattice sites (Spec 02 RF-01, Section 19.5).
 * Generates irregular polygonal cells whose adjacencies correspond to planar Delaunay triangulations.
 */
export class VoronoiTopology implements ITopology {
  public readonly type: TopologyType = 'VORONOI_IRREGULAR';
  public readonly coordinateFormat = 'VORONOI_IRREGULAR';
  public readonly isToroidal = false;
  public readonly seed: string;
  public readonly boundingRadius: number | null;
  public readonly cellSize: number;
  public readonly jitterFactor: number;

  constructor(options?: IVoronoiTopologyOptions) {
    this.seed = options?.seed ?? 'voronoi-default-seed';
    this.boundingRadius = options?.boundingRadius !== undefined ? options.boundingRadius : 32;
    this.cellSize = options?.cellSize ?? 1.0;
    this.jitterFactor = Math.min(0.35, Math.max(0.05, options?.jitterFactor ?? 0.3));
  }

  public parse(coord: CoordinateKey): { u: number; v: number } {
    const parts = coord.split(',');
    if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') {
      throw new Error(`Invalid Voronoi coordinate: "${coord}". Expected "u,v".`);
    }
    const u = Number(parts[0]);
    const v = Number(parts[1]);
    if (!Number.isInteger(u) || !Number.isInteger(v)) {
      throw new Error(`Non-integer Voronoi coordinate: "${coord}"`);
    }
    return { u, v };
  }

  public isValidCoordinate(coord: CoordinateKey): boolean {
    try {
      const { u, v } = this.parse(coord);
      if (this.boundingRadius !== null) {
        if (Math.abs(u) > this.boundingRadius || Math.abs(v) > this.boundingRadius) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Continuous world position (centroid / site point) for cell (u, v).
   */
  public toWorldPosition(coord: CoordinateKey): IWorldPosition {
    const { u, v } = this.parse(coord);
    const jx = deterministicSpatialHash(u, v, this.seed, 101) * (this.cellSize * this.jitterFactor);
    const jz = deterministicSpatialHash(u, v, this.seed, 202) * (this.cellSize * this.jitterFactor);

    return {
      x: u * this.cellSize + jx,
      y: 0,
      z: v * this.cellSize + jz,
    };
  }

  /**
   * Resolves continuous 3D world position to the nearest Voronoi site in expected O(1).
   */
  public worldToCoordinate(world: IWorldPosition): CoordinateKey {
    const approxU = Math.round(world.x / this.cellSize);
    const approxV = Math.round(world.z / this.cellSize);

    let closestCoord: CoordinateKey = asCoordinateKey(`${approxU},${approxV}`);
    let minDistSq = Infinity;

    // Check candidate sites in the 3x3 neighborhood around the approximate grid point
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        const candidateKey = asCoordinateKey(`${approxU + du},${approxV + dv}`);
        const sitePos = this.toWorldPosition(candidateKey);
        const distSq = (sitePos.x - world.x) ** 2 + (sitePos.z - world.z) ** 2;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestCoord = candidateKey;
        }
      }
    }

    return closestCoord;
  }

  /**
   * Evaluates if a diagonal Delaunay edge connects (u, v) and (u+du, v+dv)
   * where du in {-1, 1} and dv in {-1, 1}.
   */
  private isDiagonalNeighbor(u: number, v: number, du: number, dv: number): boolean {
    const minU = Math.min(u, u + du);
    const minV = Math.min(v, v + dv);

    // Diagonal 1: (minU, minV) <-> (minU+1, minV+1)
    const p00 = this.toWorldPosition(asCoordinateKey(`${minU},${minV}`));
    const p11 = this.toWorldPosition(asCoordinateKey(`${minU + 1},${minV + 1}`));
    const distSq1 = (p00.x - p11.x) ** 2 + (p00.z - p11.z) ** 2;

    // Diagonal 2: (minU+1, minV) <-> (minU, minV+1)
    const p10 = this.toWorldPosition(asCoordinateKey(`${minU + 1},${minV}`));
    const p01 = this.toWorldPosition(asCoordinateKey(`${minU},${minV + 1}`));
    const distSq2 = (p10.x - p01.x) ** 2 + (p10.z - p01.z) ** 2;

    const connects00to11 = distSq1 <= distSq2;

    if (connects00to11) {
      // Connects (minU, minV) to (minU+1, minV+1)
      if (u === minU && v === minV && du === 1 && dv === 1) return true;
      if (u === minU + 1 && v === minV + 1 && du === -1 && dv === -1) return true;
    } else {
      // Connects (minU+1, minV) to (minU, minV+1)
      if (u === minU + 1 && v === minV && du === -1 && dv === 1) return true;
      if (u === minU && v === minV + 1 && du === 1 && dv === -1) return true;
    }

    return false;
  }

  /**
   * Resolves all valid Delaunay / Voronoi neighbors for the site.
   */
  public getAllNeighbors(coord: CoordinateKey): CoordinateKey[] {
    const { u, v } = this.parse(coord);
    const neighbors: CoordinateKey[] = [];

    // 1. Direct orthogonal neighbors are always adjacent in jittered square lattice:
    const orthogonalOffsets = [
      [1, 0], [0, 1], [-1, 0], [0, -1]
    ];
    for (const [du, dv] of orthogonalOffsets) {
      const neighborKey = asCoordinateKey(`${u + du},${v + dv}`);
      if (this.isValidCoordinate(neighborKey)) {
        neighbors.push(neighborKey);
      }
    }

    // 2. Diagonal Delaunay neighbors:
    const diagonalOffsets = [
      [1, 1], [-1, 1], [-1, -1], [1, -1]
    ];
    for (const [du, dv] of diagonalOffsets) {
      if (this.isDiagonalNeighbor(u, v, du, dv)) {
        const neighborKey = asCoordinateKey(`${u + du},${v + dv}`);
        if (this.isValidCoordinate(neighborKey)) {
          neighbors.push(neighborKey);
        }
      }
    }

    // Sort deterministically by polar angle relative to cell centroid
    const center = this.toWorldPosition(coord);
    neighbors.sort((a, b) => {
      const posA = this.toWorldPosition(a);
      const posB = this.toWorldPosition(b);
      const angleA = Math.atan2(posA.z - center.z, posA.x - center.x);
      const angleB = Math.atan2(posB.z - center.z, posB.x - center.x);
      return angleA - angleB;
    });

    return neighbors;
  }

  public getNeighbors(coord: CoordinateKey): CoordinateKey[] {
    return this.getAllNeighbors(coord);
  }

  public getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null {
    const neighbors = this.getAllNeighbors(coord);
    if (neighbors.length === 0) return null;
    const idx = Math.floor(dir) % neighbors.length;
    return neighbors[idx >= 0 ? idx : idx + neighbors.length] ?? null;
  }

  /**
   * Computes shortest path distance on the Voronoi graph using BFS.
   */
  public getDistance(a: CoordinateKey, b: CoordinateKey): number {
    if (a === b) return 0;
    const { u: u1, v: v1 } = this.parse(a);
    const { u: u2, v: v2 } = this.parse(b);

    // BFS on planar graph
    const queue: [CoordinateKey, number][] = [[a, 0]];
    const visited = new Set<string>([a]);

    while (queue.length > 0) {
      const [curr, d] = queue.shift()!;
      for (const n of this.getAllNeighbors(curr)) {
        if (n === b) return d + 1;
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([n, d + 1]);
        }
      }
    }

    // Fallback: Chebyshev bound if outside search radius
    return Math.max(Math.abs(u1 - u2), Math.abs(v1 - v2));
  }

  public getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[] {
    if (start === target) return [start];
    const path: CoordinateKey[] = [start];
    let current = start;
    const visited = new Set<CoordinateKey>([start]);

    while (current !== target) {
      const neighbors = this.getAllNeighbors(current);
      let next: CoordinateKey | null = null;
      let bestDist = Infinity;

      for (const n of neighbors) {
        if (visited.has(n)) continue;
        const d = this.getDistance(n, target);
        if (d < bestDist) {
          bestDist = d;
          next = n;
        }
      }

      if (!next || bestDist >= this.getDistance(current, target)) {
        break;
      }

      current = next;
      visited.add(current);
      path.push(current);
    }

    return path;
  }

  public getRay(start: CoordinateKey, dir: DirectionIndex | number, maxDistance = 64): CoordinateKey[] {
    const ray: CoordinateKey[] = [];
    let current: CoordinateKey | null = start;

    for (let i = 0; i < maxDistance; i++) {
      current = this.getNeighbor(current, dir);
      if (current === null) break;
      ray.push(current);
    }

    return ray;
  }

  public getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    const { u, v } = this.parse(coord);
    return (((Math.abs(u * 2 + v) % 3) + 3) % 3) as 0 | 1 | 2;
  }
}

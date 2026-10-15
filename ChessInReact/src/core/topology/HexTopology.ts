import { asCoordinateKey, CoordinateKey } from '../coordinates';
import { DirectionIndex, ITopology, IWorldPosition, TopologyType } from './types';

export interface IHexTopologyOptions {
  readonly orientation?: 'POINTY' | 'FLAT';
  readonly radius?: number; // Bounding radius from center (0,0,0) if bounded
  readonly cellSize?: number;
  readonly hexSize?: number; // Alias for cellSize
  readonly toroidal?: boolean;
}

export interface ICubeCoordinate {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

// 6 Edge-sharing directions in clockwise order starting East (q, r, s)
const HEX_EDGE_DELTAS: readonly (readonly [number, number, number])[] = [
  [1, -1, 0],  // HEX_EAST = 0
  [1, 0, -1],  // HEX_NORTHEAST = 1
  [0, 1, -1],  // HEX_NORTHWEST = 2
  [-1, 1, 0],  // HEX_WEST = 3
  [-1, 0, 1],  // HEX_SOUTHWEST = 4
  [0, -1, 1],  // HEX_SOUTHEAST = 5
];

// 6 Vertex-sharing diagonal directions
const HEX_VERTEX_DELTAS: readonly (readonly [number, number, number])[] = [
  [2, -1, -1],
  [1, 1, -2],
  [-1, 2, -1],
  [-2, 1, 1],
  [-1, -1, 2],
  [1, -2, 1],
];

export class HexTopology implements ITopology {
  public readonly type: TopologyType = 'HEXAGONAL';
  public readonly coordinateFormat = 'HEX_CUBIC';
  public readonly isToroidal: boolean;
  public readonly orientation: 'POINTY' | 'FLAT';
  public readonly radius: number | null;
  public readonly cellSize: number;

  constructor(options?: IHexTopologyOptions) {
    this.orientation = options?.orientation ?? 'POINTY';
    this.radius = options?.radius !== undefined ? options.radius : null;
    this.cellSize = options?.cellSize ?? options?.hexSize ?? 1.0;
    this.isToroidal = Boolean(options?.toroidal && this.radius !== null);
  }

  public parse(coord: CoordinateKey): ICubeCoordinate {
    const parts = coord.split(',');
    if (parts.length === 3) {
      if (parts[0].trim() === '' || parts[1].trim() === '' || parts[2].trim() === '') {
        throw new Error(`Invalid hex coordinate: "${coord}"`);
      }
      const q = Number(parts[0]);
      const r = Number(parts[1]);
      const s = Number(parts[2]);
      if (!Number.isInteger(q) || !Number.isInteger(r) || !Number.isInteger(s)) {
        throw new Error(`Non-numeric hex coordinate: "${coord}"`);
      }
      if (q + r + s !== 0) {
        throw new Error(`Invalid cubic hex constraint q + r + s = 0 violated in "${coord}" (sum=${q + r + s})`);
      }
      return { q, r, s };
    }
    throw new Error(`Invalid hex coordinate format: "${coord}". Expected "q,r,s".`);
  }

  public isValidCoordinate(coord: CoordinateKey): boolean {
    try {
      const { q, r, s } = this.parse(coord);
      if (this.radius !== null) {
        const distFromCenter = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
        if (distFromCenter > this.radius) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  public getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null {
    if (dir < 0 || dir >= 12) return null;
    const { q, r, s } = this.parse(coord);

    let nq: number;
    let nr: number;
    let ns: number;

    if (dir < 6) {
      const delta = HEX_EDGE_DELTAS[dir];
      nq = q + delta[0];
      nr = r + delta[1];
      ns = s + delta[2];
    } else {
      const delta = HEX_VERTEX_DELTAS[dir - 6];
      nq = q + delta[0];
      nr = r + delta[1];
      ns = s + delta[2];
    }

    if (this.radius !== null && !this.isToroidal) {
      const dist = Math.max(Math.abs(nq), Math.abs(nr), Math.abs(ns));
      if (dist > this.radius) return null;
    }

    return asCoordinateKey(`${nq},${nr},${ns}`);
  }

  public getAllNeighbors(coord: CoordinateKey): CoordinateKey[] {
    const neighbors: CoordinateKey[] = [];
    for (let d = 0; d < 6; d++) {
      const n = this.getNeighbor(coord, d);
      if (n !== null) {
        neighbors.push(n);
      }
    }
    return neighbors;
  }

  public getDistance(a: CoordinateKey, b: CoordinateKey): number {
    const p1 = this.parse(a);
    const p2 = this.parse(b);
    // Chebyshev metric on cube coordinates (RedBlobGames standard)
    return Math.max(
      Math.abs(p1.q - p2.q),
      Math.abs(p1.r - p2.r),
      Math.abs(p1.s - p2.s)
    );
  }

  public cubeRound(fracQ: number, fracR: number, fracS: number): CoordinateKey {
    let q = Math.round(fracQ);
    let r = Math.round(fracR);
    let s = Math.round(fracS);

    const qDiff = Math.abs(q - fracQ);
    const rDiff = Math.abs(r - fracR);
    const sDiff = Math.abs(s - fracS);

    if (qDiff > rDiff && qDiff > sDiff) {
      q = -r - s;
    } else if (rDiff > sDiff) {
      r = -q - s;
    } else {
      s = -q - r;
    }

    return asCoordinateKey(`${q},${r},${s}`);
  }

  public getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[] {
    const p1 = this.parse(start);
    const p2 = this.parse(target);
    const distance = this.getDistance(start, target);
    if (distance === 0) return [start];

    const path: CoordinateKey[] = [];

    // Apply 1e-6 epsilon perturbation to prevent rays from landing exactly on shared edges
    // (RedBlobGames & Spec 02, Section 14.1, Source 6)
    const q1Nudged = p1.q + 1e-6;
    const r1Nudged = p1.r + 1e-6;
    const s1Nudged = p1.s - 2e-6;

    for (let i = 0; i <= distance; i++) {
      const t = i / distance;
      const q = q1Nudged + (p2.q - q1Nudged) * t;
      const r = r1Nudged + (p2.r - r1Nudged) * t;
      const s = s1Nudged + (p2.s - s1Nudged) * t;
      path.push(this.cubeRound(q, r, s));
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

  public toWorldPosition(coord: CoordinateKey): IWorldPosition {
    const { q, r } = this.parse(coord);
    const size = this.cellSize;

    if (this.orientation === 'POINTY') {
      const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
      const z = size * ((3 / 2) * r);
      return { x, y: 0, z };
    } else {
      // FLAT orientation
      const x = size * ((3 / 2) * q);
      const z = size * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
      return { x, y: 0, z };
    }
  }

  public worldToCoordinate(world: IWorldPosition): CoordinateKey {
    const size = this.cellSize;
    let fracQ: number;
    let fracR: number;

    if (this.orientation === 'POINTY') {
      fracQ = ((Math.sqrt(3) / 3) * world.x - (1 / 3) * world.z) / size;
      fracR = ((2 / 3) * world.z) / size;
    } else {
      fracQ = ((2 / 3) * world.x) / size;
      fracR = ((-1 / 3) * world.x + (Math.sqrt(3) / 3) * world.z) / size;
    }

    const fracS = -fracQ - fracR;
    return this.cubeRound(fracQ, fracR, fracS);
  }

  /**
   * Analytic trichromatic coloring for hex diagonal consistency (Spec 02 Section 16 RF-11).
   * Formula: ((q - r) % 3 + 3) % 3
   */
  public getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    const { q, r } = this.parse(coord);
    return ((((q - r) % 3) + 3) % 3) as 0 | 1 | 2;
  }

  /**
   * Concentric ring traversal in O(R) time without scanning whole grid.
   */
  public getRingCoordinates(center: CoordinateKey, radius: number): CoordinateKey[] {
    if (radius === 0) return [center];
    const { q: cq, r: cr, s: cs } = this.parse(center);
    const results: CoordinateKey[] = [];

    // Start at radius steps in direction 4 (SOUTHWEST: [-1, 0, 1])
    let curQ = cq + HEX_EDGE_DELTAS[4][0] * radius;
    let curR = cr + HEX_EDGE_DELTAS[4][1] * radius;
    let curS = cs + HEX_EDGE_DELTAS[4][2] * radius;

    for (let side = 0; side < 6; side++) {
      const stepDelta = HEX_EDGE_DELTAS[side];
      for (let step = 0; step < radius; step++) {
        if (this.radius === null || Math.max(Math.abs(curQ), Math.abs(curR), Math.abs(curS)) <= this.radius) {
          results.push(asCoordinateKey(`${curQ},${curR},${curS}`));
        }
        curQ += stepDelta[0];
        curR += stepDelta[1];
        curS += stepDelta[2];
      }
    }

    return results;
  }

  /**
   * Spiral traversal from center to maxRadius in O(R^2) time.
   */
  public getSpiralCoordinates(center: CoordinateKey, maxRadius: number): CoordinateKey[] {
    const spiral: CoordinateKey[] = [];
    for (let r = 0; r <= maxRadius; r++) {
      const ring = this.getRingCoordinates(center, r);
      for (const c of ring) {
        spiral.push(c);
      }
    }
    return spiral;
  }

  public getNeighbors(coord: CoordinateKey): CoordinateKey[] {
    return this.getAllNeighbors(coord);
  }

  public getColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    return this.getCellColorIndex(coord);
  }

  public getRing(center: CoordinateKey, radius: number): CoordinateKey[] {
    return this.getRingCoordinates(center, radius);
  }

  public getSpiral(center: CoordinateKey, maxRadius: number): CoordinateKey[] {
    return this.getSpiralCoordinates(center, maxRadius);
  }
}

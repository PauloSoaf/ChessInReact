import { asCoordinateKey, CoordinateKey } from '../coordinates';
import { DirectionIndex, ITopology, IWorldPosition, TopologyType } from './types';

export interface ITriangleTopologyOptions {
  readonly cellSize?: number;
  readonly triangleSide?: number;
  readonly boundingRadius?: number;
}

export class TriangleTopology implements ITopology {
  public readonly type: TopologyType = 'TRIANGULAR';
  public readonly coordinateFormat = 'TRIANGULAR';
  public readonly isToroidal = false;
  public readonly cellSize: number;
  public readonly boundingRadius: number | null;

  constructor(options?: ITriangleTopologyOptions) {
    this.cellSize = options?.cellSize ?? options?.triangleSide ?? 1.0;
    this.boundingRadius = options?.boundingRadius !== undefined ? options.boundingRadius : null;
  }

  public parse(coord: CoordinateKey): { q: number; r: number } {
    const parts = coord.split(',');
    if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') {
      throw new Error(`Invalid triangle coordinate format: "${coord}". Expected "q,r".`);
    }
    const q = Number(parts[0]);
    const r = Number(parts[1]);
    if (!Number.isInteger(q) || !Number.isInteger(r)) {
      throw new Error(`Non-numeric triangle coordinate: "${coord}"`);
    }
    return { q, r };
  }

  /**
   * Evaluates if triangle orientation points UP or DOWN (Spec 02 Section 11.1).
   * Parity dictates direction: (q + r) % 2 === 0 is UP, else DOWN.
   */
  public isPointingUp(qOrCoord: number | CoordinateKey, r?: number): boolean {
    if (typeof qOrCoord === 'string') {
      const parsed = this.parse(qOrCoord);
      return ((((parsed.q + parsed.r) % 2) + 2) % 2) === 0;
    }
    const q = qOrCoord;
    const rVal = r ?? 0;
    return ((((q + rVal) % 2) + 2) % 2) === 0;
  }

  public isValidCoordinate(coord: CoordinateKey): boolean {
    try {
      const { q, r } = this.parse(coord);
      if (this.boundingRadius !== null) {
        if (Math.abs(q) > this.boundingRadius || Math.abs(r) > this.boundingRadius) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  public getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null {
    if (dir < 0 || dir > 2) return null; // Triangles have exactly 3 edge-sharing neighbors
    const { q, r } = this.parse(coord);
    const up = this.isPointingUp(q, r);

    let nq: number;
    let nr: number;

    if (up) {
      switch (dir) {
        case 0: // BOTTOM (inverts R)
          nq = q;
          nr = r - 1;
          break;
        case 1: // LEFT DOWN
          nq = q - 1;
          nr = r;
          break;
        case 2: // RIGHT DOWN
          nq = q + 1;
          nr = r;
          break;
        default:
          return null;
      }
    } else {
      switch (dir) {
        case 0: // TOP
          nq = q;
          nr = r + 1;
          break;
        case 1: // LEFT UP
          nq = q - 1;
          nr = r;
          break;
        case 2: // RIGHT UP
          nq = q + 1;
          nr = r;
          break;
        default:
          return null;
      }
    }

    if (this.boundingRadius !== null) {
      if (Math.abs(nq) > this.boundingRadius || Math.abs(nr) > this.boundingRadius) {
        return null;
      }
    }

    return asCoordinateKey(`${nq},${nr}`);
  }

  public getAllNeighbors(coord: CoordinateKey): CoordinateKey[] {
    const neighbors: CoordinateKey[] = [];
    for (let d = 0; d < 3; d++) {
      const n = this.getNeighbor(coord, d);
      if (n !== null) {
        neighbors.push(n);
      }
    }
    return neighbors;
  }

  public getNeighbors(coord: CoordinateKey): CoordinateKey[] {
    return this.getAllNeighbors(coord);
  }

  /**
   * Projects 2D alternating triangular coordinates (q, r) into canonical
   * 3-axis triangular coordinate space (x, y, z) where each graph step
   * alters exactly one coordinate by 1.
   */
  public toTriangular3D(q: number, r: number): { x: number; y: number; z: number } {
    const up = ((((q + r) % 2) + 2) % 2) === 0;
    const x = up ? (q + r) / 2 : (q + r + 1) / 2;
    const y = up ? (r - q) / 2 : (r - q + 1) / 2;
    const z = r;
    return { x, y, z };
  }

  /**
   * Computes exact minimum step distance in the triangular adjacency graph (RF-03, PATCH-03).
   * Satisfies:
   * - distance(0,0 to 0,1) === 3
   * - distance(n1, n2) === 1 for all direct neighbors
   * - Symmetry: distance(a, b) === distance(b, a)
   * - Triangle Inequality: distance(a, c) <= distance(a, b) + distance(b, c)
   */
  public getDistance(a: CoordinateKey, b: CoordinateKey): number {
    const p1 = this.parse(a);
    const p2 = this.parse(b);
    const t1 = this.toTriangular3D(p1.q, p1.r);
    const t2 = this.toTriangular3D(p2.q, p2.r);
    return Math.abs(t1.x - t2.x) + Math.abs(t1.y - t2.y) + Math.abs(t1.z - t2.z);
  }

  /**
   * Computes continuous Line of Sight where every consecutive cell
   * shares a valid edge (distance = 1) along the shortest path.
   */
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

  public toWorldPosition(coord: CoordinateKey): IWorldPosition {
    const { q, r } = this.parse(coord);
    const side = this.cellSize;
    const height = side * (Math.sqrt(3) / 2);

    const x = q * (side / 2);
    const z = r * height;

    return { x, y: 0, z };
  }

  public worldToCoordinate(world: IWorldPosition): CoordinateKey {
    const side = this.cellSize;
    const height = side * (Math.sqrt(3) / 2);

    const q = Math.round(world.x / (side / 2));
    const r = Math.round(world.z / height);

    return asCoordinateKey(`${q},${r}`);
  }

  public getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    const { q, r } = this.parse(coord);
    return (this.isPointingUp(q, r) ? 0 : 1) as 0 | 1;
  }
}

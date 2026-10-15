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

  public getDistance(a: CoordinateKey, b: CoordinateKey): number {
    const p1 = this.parse(a);
    const p2 = this.parse(b);
    return Math.abs(p1.q - p2.q) + Math.abs(p1.r - p2.r);
  }

  public getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[] {
    const p1 = this.parse(start);
    const p2 = this.parse(target);
    const dist = this.getDistance(start, target);
    if (dist === 0) return [start];

    const path: CoordinateKey[] = [];
    const dq = p2.q - p1.q;
    const dr = p2.r - p1.r;

    for (let i = 0; i <= dist; i++) {
      const t = i / dist;
      const q = Math.round(p1.q + dq * t);
      const r = Math.round(p1.r + dr * t);
      const key = asCoordinateKey(`${q},${r}`);
      if (path.length === 0 || path[path.length - 1] !== key) {
        path.push(key);
      }
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

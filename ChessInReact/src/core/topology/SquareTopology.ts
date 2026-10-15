import { asCoordinateKey, CoordinateKey } from '../coordinates';
import { DirectionIndex, ITopology, IWorldPosition, TopologyType } from './types';

export interface ISquareTopologyOptions {
  readonly width?: number | null;
  readonly height?: number | null;
  readonly cellSize?: number;
  readonly toroidal?: boolean;
  readonly distanceMetric?: 'CHEBYSHEV' | 'MANHATTAN';
}

const SQUARE_DELTAS: readonly (readonly [number, number])[] = [
  [0, 1],   // NORTH = 0
  [1, 1],   // NORTHEAST = 1
  [1, 0],   // EAST = 2
  [1, -1],  // SOUTHEAST = 3
  [0, -1],  // SOUTH = 4
  [-1, -1], // SOUTHWEST = 5
  [-1, 0],  // WEST = 6
  [-1, 1],  // NORTHWEST = 7
];

export class SquareTopology implements ITopology {
  public readonly type: TopologyType = 'SQUARE';
  public readonly coordinateFormat = 'SQUARE';
  public readonly isToroidal: boolean;
  public readonly width: number | null;
  public readonly height: number | null;
  public readonly cellSize: number;
  public readonly distanceMetric: 'CHEBYSHEV' | 'MANHATTAN';

  constructor(options?: ISquareTopologyOptions) {
    this.width = options?.width !== undefined ? options.width : 8;
    this.height = options?.height !== undefined ? options.height : 8;
    this.cellSize = options?.cellSize ?? 1.0;
    this.distanceMetric = options?.distanceMetric ?? 'CHEBYSHEV';
    this.isToroidal = Boolean(options?.toroidal && this.width !== null && this.height !== null);
  }

  public parse(coord: CoordinateKey): { x: number; y: number } {
    const parts = coord.split(',');
    if (parts.length !== 2 || parts[0].trim() === '' || parts[1].trim() === '') {
      throw new Error(`Invalid square coordinate: "${coord}"`);
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Non-numeric square coordinate: "${coord}"`);
    }
    return { x, y };
  }

  public isValidCoordinate(coord: CoordinateKey): boolean {
    try {
      const { x, y } = this.parse(coord);
      if (this.width !== null && (x < 0 || x >= this.width)) return false;
      if (this.height !== null && (y < 0 || y >= this.height)) return false;
      return true;
    } catch {
      return false;
    }
  }

  public getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null {
    if (dir < 0 || dir >= SQUARE_DELTAS.length) return null;
    let { x, y } = this.parse(coord);
    const [dx, dy] = SQUARE_DELTAS[dir];
    x += dx;
    y += dy;

    if (this.isToroidal && this.width !== null && this.height !== null) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
    } else {
      if (this.width !== null && (x < 0 || x >= this.width)) return null;
      if (this.height !== null && (y < 0 || y >= this.height)) return null;
    }

    return asCoordinateKey(`${x},${y}`);
  }

  public getAllNeighbors(coord: CoordinateKey): CoordinateKey[] {
    const neighbors: CoordinateKey[] = [];
    for (let d = 0; d < 8; d++) {
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
    let dx = Math.abs(p1.x - p2.x);
    let dy = Math.abs(p1.y - p2.y);

    if (this.isToroidal && this.width !== null && this.height !== null) {
      dx = Math.min(dx, this.width - dx);
      dy = Math.min(dy, this.height - dy);
    }

    if (this.distanceMetric === 'MANHATTAN') {
      return dx + dy;
    }
    return Math.max(dx, dy); // Chebyshev distance for chess moves
  }

  public getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[] {
    const p1 = this.parse(start);
    const p2 = this.parse(target);

    const path: CoordinateKey[] = [];
    let x0 = p1.x;
    let y0 = p1.y;
    const x1 = p2.x;
    const y1 = p2.y;

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    let inProgress = true;
    while (inProgress) {
      path.push(asCoordinateKey(`${x0},${y0}`));
      if (x0 === x1 && y0 === y1) {
        inProgress = false;
        break;
      }

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
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
    const { x, y } = this.parse(coord);
    return {
      x: x * this.cellSize,
      y: 0,
      z: y * this.cellSize,
    };
  }

  public worldToCoordinate(world: IWorldPosition): CoordinateKey {
    let x = Math.round(world.x / this.cellSize);
    let y = Math.round(world.z / this.cellSize);

    if (this.isToroidal && this.width !== null && this.height !== null) {
      x = ((x % this.width) + this.width) % this.width;
      y = ((y % this.height) + this.height) % this.height;
    }

    return asCoordinateKey(`${x},${y}`);
  }

  public getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    const { x, y } = this.parse(coord);
    return ((((x + y) % 2) + 2) % 2) as 0 | 1;
  }

  public getRingCoordinates(center: CoordinateKey, radius: number): CoordinateKey[] {
    if (radius === 0) return [center];
    const { x: cx, y: cy } = this.parse(center);
    const coords: CoordinateKey[] = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
          let x = cx + dx;
          let y = cy + dy;
          if (this.isToroidal && this.width !== null && this.height !== null) {
            x = ((x % this.width) + this.width) % this.width;
            y = ((y % this.height) + this.height) % this.height;
          } else if (this.width !== null && (x < 0 || x >= this.width || this.height !== null && (y < 0 || y >= this.height))) {
            continue;
          }
          const key = asCoordinateKey(`${x},${y}`);
          if (!coords.includes(key)) {
            coords.push(key);
          }
        }
      }
    }
    return coords;
  }

  public getSpiralCoordinates(center: CoordinateKey, maxRadius: number): CoordinateKey[] {
    const spiral: CoordinateKey[] = [];
    for (let r = 0; r <= maxRadius; r++) {
      const ring = this.getRingCoordinates(center, r);
      for (const c of ring) {
        if (!spiral.includes(c)) {
          spiral.push(c);
        }
      }
    }
    return spiral;
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

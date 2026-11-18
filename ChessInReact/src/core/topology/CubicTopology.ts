/**
 * ChessInReact - Cubic 3D Topology (Spec 02 § 6, Spec 07 § 3, Spec 14 § 4)
 *
 * Models a 6-face cubic chessboard with continuous edge folding.
 * Faces:
 *  0: TOP (+Y)
 *  1: BOTTOM (-Y)
 *  2: FRONT (+Z)
 *  3: BACK (-Z)
 *  4: LEFT (-X)
 *  5: RIGHT (+X)
 *
 * Coordinates are formatted as: "face:x,y" (e.g. "2:3,4").
 */

import { asCoordinateKey, CoordinateKey } from '../coordinates';
import { DirectionIndex, ITopology, IWorldPosition, TopologyType } from './types';

export enum CubeFace {
  TOP = 0,
  BOTTOM = 1,
  FRONT = 2,
  BACK = 3,
  LEFT = 4,
  RIGHT = 5,
}

export interface ICubicTopologyOptions {
  readonly boardSize?: number;
  readonly cellSize?: number;
}

const DELTAS: readonly (readonly [number, number])[] = [
  [0, 1],   // NORTH = 0
  [1, 1],   // NORTHEAST = 1
  [1, 0],   // EAST = 2
  [1, -1],  // SOUTHEAST = 3
  [0, -1],  // SOUTH = 4
  [-1, -1], // SOUTHWEST = 5
  [-1, 0],  // WEST = 6
  [-1, 1],  // NORTHWEST = 7
];

export interface ICubicStep {
  readonly coord: CoordinateKey;
  readonly dir: number;
}

export class CubicTopology implements ITopology {
  public readonly type: TopologyType = 'SQUARE';
  public readonly coordinateFormat = 'CUBIC';
  public readonly isToroidal = false;
  public readonly isCubic = true;
  public readonly isBounded = true;
  public readonly boardSize: number;
  public readonly cellSize: number;

  public get width(): number {
    return this.boardSize;
  }

  public get height(): number {
    return this.boardSize;
  }

  public get faceCount(): number {
    return 6;
  }

  constructor(options?: ICubicTopologyOptions) {
    this.boardSize = options?.boardSize ?? 8;
    this.cellSize = options?.cellSize ?? 1.0;
  }

  public getFaceFromCoordinate(coord: CoordinateKey): number {
    return this.parse(coord).face;
  }

  public parse(coord: CoordinateKey): { face: number; x: number; y: number } {
    const colonIdx = coord.indexOf(':');
    if (colonIdx === -1) {
      // Fallback: assume face 2 (Front)
      const parts = coord.split(',');
      if (parts.length !== 2) throw new Error(`Invalid cubic coordinate: "${coord}"`);
      return { face: 2, x: Number(parts[0]), y: Number(parts[1]) };
    }
    const face = Number(coord.substring(0, colonIdx));
    const [xStr, yStr] = coord.substring(colonIdx + 1).split(',');
    const x = Number(xStr);
    const y = Number(yStr);
    if (!Number.isInteger(face) || !Number.isInteger(x) || !Number.isInteger(y)) {
      throw new Error(`Non-numeric cubic coordinate: "${coord}"`);
    }
    return { face, x, y };
  }

  public isValidCoordinate(coord: CoordinateKey): boolean {
    try {
      const { face, x, y } = this.parse(coord);
      if (face < 0 || face > 5) return false;
      if (x < 0 || x >= this.boardSize) return false;
      if (y < 0 || y >= this.boardSize) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolves adjacent cell crossing edges between cube faces with direction transport.
   */
  public getStepWithDirection(coord: CoordinateKey, dir: DirectionIndex | number): ICubicStep | null {
    if (dir < 0 || dir >= DELTAS.length) return null;
    const { face, x, y } = this.parse(coord);
    const [dx, dy] = DELTAS[dir];
    const nx = x + dx;
    const ny = y + dy;
    const N = this.boardSize;

    // Within same face: coordinate changes, direction remains constant
    if (nx >= 0 && nx < N && ny >= 0 && ny < N) {
      return {
        coord: asCoordinateKey(`${face}:${nx},${ny}`),
        dir,
      };
    }

    const crossX = nx < 0 ? -1 : nx >= N ? 1 : 0;
    const crossY = ny < 0 ? -1 : ny >= N ? 1 : 0;

    let targetFace = face;
    let targetX = nx;
    let targetY = ny;
    let targetDir = dir;

    // Face transitions based on unfolding cube net with direction orientation transport
    // Face 0: TOP, 1: BOTTOM, 2: FRONT, 3: BACK, 4: LEFT, 5: RIGHT
    if (face === 2) {
      // FRONT
      if (crossY === 1) { targetFace = 0; targetY = 0; targetDir = 0; }
      else if (crossY === -1) { targetFace = 1; targetY = N - 1; targetDir = 4; }
      else if (crossX === -1) { targetFace = 4; targetX = N - 1; targetDir = 6; }
      else if (crossX === 1) { targetFace = 5; targetX = 0; targetDir = 2; }
    } else if (face === 0) {
      // TOP
      if (crossY === 1) { targetFace = 3; targetY = N - 1; targetX = N - 1 - nx; targetDir = 4; }
      else if (crossY === -1) { targetFace = 2; targetY = N - 1; targetDir = 4; }
      else if (crossX === -1) { targetFace = 4; targetX = ny; targetY = N - 1; targetDir = 4; }
      else if (crossX === 1) { targetFace = 5; targetX = N - 1 - ny; targetY = N - 1; targetDir = 4; }
    } else if (face === 1) {
      // BOTTOM
      if (crossY === 1) { targetFace = 2; targetY = 0; targetDir = 0; }
      else if (crossY === -1) { targetFace = 3; targetY = 0; targetX = N - 1 - nx; targetDir = 0; }
      else if (crossX === -1) { targetFace = 4; targetX = N - 1 - ny; targetY = 0; targetDir = 0; }
      else if (crossX === 1) { targetFace = 5; targetX = ny; targetY = 0; targetDir = 0; }
    } else if (face === 3) {
      // BACK
      if (crossY === 1) { targetFace = 0; targetY = N - 1; targetX = N - 1 - nx; targetDir = 4; }
      else if (crossY === -1) { targetFace = 1; targetY = 0; targetX = N - 1 - nx; targetDir = 0; }
      else if (crossX === -1) { targetFace = 5; targetX = N - 1; targetDir = 6; }
      else if (crossX === 1) { targetFace = 4; targetX = 0; targetDir = 2; }
    } else if (face === 4) {
      // LEFT
      if (crossY === 1) { targetFace = 0; targetY = nx; targetX = 0; targetDir = 2; }
      else if (crossY === -1) { targetFace = 1; targetY = N - 1 - nx; targetX = 0; targetDir = 2; }
      else if (crossX === -1) { targetFace = 3; targetX = N - 1; targetDir = 6; }
      else if (crossX === 1) { targetFace = 2; targetX = 0; targetDir = 2; }
    } else if (face === 5) {
      // RIGHT
      if (crossY === 1) { targetFace = 0; targetY = N - 1 - nx; targetX = N - 1; targetDir = 6; }
      else if (crossY === -1) { targetFace = 1; targetY = nx; targetX = N - 1; targetDir = 6; }
      else if (crossX === -1) { targetFace = 2; targetX = N - 1; targetDir = 6; }
      else if (crossX === 1) { targetFace = 3; targetX = 0; targetDir = 2; }
    }

    targetX = Math.max(0, Math.min(N - 1, targetX));
    targetY = Math.max(0, Math.min(N - 1, targetY));

    return {
      coord: asCoordinateKey(`${targetFace}:${targetX},${targetY}`),
      dir: targetDir,
    };
  }

  /**
   * Resolves adjacent cell crossing edges between cube faces.
   */
  public getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null {
    const step = this.getStepWithDirection(coord, dir);
    return step ? step.coord : null;
  }

  public getAllNeighbors(coord: CoordinateKey): CoordinateKey[] {
    const list: CoordinateKey[] = [];
    for (let d = 0; d < 8; d++) {
      const n = this.getNeighbor(coord, d);
      if (n) list.push(n);
    }
    return list;
  }

  public getNeighbors(coord: CoordinateKey): CoordinateKey[] {
    return this.getAllNeighbors(coord);
  }

  public distance(a: CoordinateKey, b: CoordinateKey): number {
    if (a === b) return 0;
    const pa = this.parse(a);
    const pb = this.parse(b);
    if (pa.face === pb.face) {
      return Math.max(Math.abs(pa.x - pb.x), Math.abs(pa.y - pb.y));
    }
    for (let d = 0; d < 8; d++) {
      if (this.getNeighbor(a, d) === b) return 1;
    }
    const wa = this.toWorldPosition(a);
    const wb = this.toWorldPosition(b);
    const dx = Math.abs(wa.x - wb.x) / this.cellSize;
    const dy = Math.abs(wa.y - wb.y) / this.cellSize;
    const dz = Math.abs(wa.z - wb.z) / this.cellSize;
    return Math.max(dx, dy, dz);
  }

  public toWorldPosition(coord: CoordinateKey): IWorldPosition {
    const { face, x, y } = this.parse(coord);
    const N = this.boardSize;
    const half = (N - 1) / 2;
    const sx = (x - half) * this.cellSize;
    const sy = (y - half) * this.cellSize;
    const dist = (N * this.cellSize) / 2;

    switch (face) {
      case 0: return { x: sx, y: dist, z: -sy }; // TOP
      case 1: return { x: sx, y: -dist, z: sy }; // BOTTOM
      case 2: return { x: sx, y: sy, z: dist }; // FRONT
      case 3: return { x: -sx, y: sy, z: -dist }; // BACK
      case 4: return { x: -dist, y: sy, z: sx }; // LEFT
      case 5: return { x: dist, y: sy, z: -sx }; // RIGHT
      default: return { x: sx, y: sy, z: 0 };
    }
  }

  public getDistance(a: CoordinateKey, b: CoordinateKey): number {
    return this.distance(a, b);
  }

  public getRay(start: CoordinateKey, dir: DirectionIndex | number, maxDistance = 64): CoordinateKey[] {
    const ray: CoordinateKey[] = [];
    let current: CoordinateKey = start;
    let currentDir = dir;
    const visited = new Set<string>();
    visited.add(`${current}@${currentDir}`);

    for (let i = 0; i < maxDistance; i++) {
      const step = this.getStepWithDirection(current, currentDir);
      if (!step) break;
      const stateKey = `${step.coord}@${step.dir}`;
      if (visited.has(stateKey)) break;
      visited.add(stateKey);
      ray.push(step.coord);
      current = step.coord;
      currentDir = step.dir;
    }

    return ray;
  }

  public getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[] {
    const ray: CoordinateKey[] = [start];
    if (start === target) return ray;
    ray.push(target);
    return ray;
  }

  public worldToCoordinate(world: IWorldPosition): CoordinateKey {
    const N = this.boardSize;
    const half = (N - 1) / 2;
    const x = Math.max(0, Math.min(N - 1, Math.round(world.x / this.cellSize + half)));
    const y = Math.max(0, Math.min(N - 1, Math.round(world.y / this.cellSize + half)));
    return asCoordinateKey(`2:${x},${y}`);
  }

  public getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2 {
    const { face, x, y } = this.parse(coord);
    return (((face + x + y) % 2) as 0 | 1);
  }
}

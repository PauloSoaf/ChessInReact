import { CoordinateKey } from '../coordinates/types';

export type TopologyType = 'SQUARE' | 'HEXAGONAL' | 'TRIANGULAR' | 'VORONOI_IRREGULAR';

/**
 * Standardized direction indices.
 * Topologies map their cardinal/angular directions to these indices.
 */
export const DirectionIndex = {
  // Square 8-way directions
  NORTH: 0,
  NORTHEAST: 1,
  EAST: 2,
  SOUTHEAST: 3,
  SOUTH: 4,
  SOUTHWEST: 5,
  WEST: 6,
  NORTHWEST: 7,

  // Hexagonal 6-way edge directions (Clockwise starting East)
  HEX_EAST: 0,
  HEX_NORTHEAST: 1,
  HEX_NORTHWEST: 2,
  HEX_WEST: 3,
  HEX_SOUTHWEST: 4,
  HEX_SOUTHEAST: 5,

  // Triangular 3-way edge directions
  TRI_EDGE_0: 0, // UP: Bottom / DOWN: Top
  TRI_EDGE_1: 1, // UP: Left-Down / DOWN: Left-Up
  TRI_EDGE_2: 2, // UP: Right-Down / DOWN: Right-Up
} as const;

export type DirectionIndex = typeof DirectionIndex[keyof typeof DirectionIndex] | number;

export interface IWorldPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Core polymorphic topology contract (Spec 02, Section 6).
 * Pure mathematical representation decoupled from rendering and state storage.
 */
export interface ITopology {
  readonly type: TopologyType;
  readonly isToroidal: boolean;

  /** Resolves immediate neighbor in given direction in O(1). Returns null if outside bounds. */
  getNeighbor(coord: CoordinateKey, dir: DirectionIndex | number): CoordinateKey | null;

  /** Returns all valid adjacent edge-sharing neighbors for the cell. */
  getAllNeighbors(coord: CoordinateKey): CoordinateKey[];
  getNeighbors?(coord: CoordinateKey): CoordinateKey[];

  /**
   * Distance between two coordinates in O(1).
   * Respects Chebyshev or Manhattan metric appropriate for the geometry.
   */
  getDistance(a: CoordinateKey, b: CoordinateKey): number;

  /**
   * Discrete Line-of-Sight between start and target (Cube LERP / Bresenham).
   * Returns ordered list of intermediate cells [start, ..., target].
   */
  getLineOfSight(start: CoordinateKey, target: CoordinateKey): CoordinateKey[];

  /** Returns ray of coordinates extending from start in direction up to maxDistance. */
  getRay(start: CoordinateKey, dir: DirectionIndex | number, maxDistance?: number): CoordinateKey[];

  /** Translates discrete board coordinate to 3D world position (X, Y, Z). */
  toWorldPosition(coord: CoordinateKey): IWorldPosition;

  /** Maps continuous 3D world position to nearest discrete coordinate. */
  worldToCoordinate(world: IWorldPosition): CoordinateKey;

  /**
   * Canonical color index for cell:
   * Square: 0 or 1 (Bipartite).
   * Hexagonal: 0, 1, or 2 (Trichromatic: ensures bishops move on same color).
   * Triangular: 0 or 1.
   */
  getCellColorIndex(coord: CoordinateKey): 0 | 1 | 2;

  /** Validates whether string is a syntactically and geometrically valid coordinate. */
  isValidCoordinate(coord: CoordinateKey): boolean;

  /** Returns all coordinates in concentric ring at distance R in O(R) time. */
  getRingCoordinates?(center: CoordinateKey, radius: number): CoordinateKey[];

  /** Returns all coordinates within spiral up to maxRadius in O(R^2) time. */
  getSpiralCoordinates?(center: CoordinateKey, maxRadius: number): CoordinateKey[];
}

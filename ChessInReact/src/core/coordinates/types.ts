/**
 * Branded identifier types for strong type safety throughout the Core engine.
 * Prevents accidental mixing of raw strings with coordinate keys or IDs.
 */
export type CoordinateKey = string & { readonly __brand: unique symbol };
export type EntityId = string & { readonly __brand: unique symbol };
export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'NONE';

/**
 * Creates a branded CoordinateKey from a validated string.
 */
export function asCoordinateKey(key: string): CoordinateKey {
  return key as CoordinateKey;
}

/**
 * Creates a branded EntityId from a raw string.
 */
export function asEntityId(id: string): EntityId {
  return id as EntityId;
}

/**
 * 2D Square grid coordinate (Traditional chess).
 */
export interface SquareCoordinate {
  readonly type: 'square';
  readonly x: number;
  readonly y: number;
}

/**
 * Cube coordinate for hexagonal grids (q + r + s = 0 invariant).
 * Reference: Red Blob Games Hexagonal Grids.
 */
export interface HexCoordinate {
  readonly type: 'hex';
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

/**
 * Unified Coordinate union.
 */
export type Coordinate = SquareCoordinate | HexCoordinate;

/**
 * Codec contract for coordinate transformations.
 */
export interface CoordinateCodec<T extends Coordinate> {
  encode(coord: T): CoordinateKey;
  decode(key: CoordinateKey): T;
  isValid(coord: T): boolean;
  distance(a: T, b: T): number;
}

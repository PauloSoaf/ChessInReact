import {
  CoordinateCodec,
  CoordinateKey,
  HexCoordinate,
  SquareCoordinate,
  asCoordinateKey,
} from './types';

/**
 * Ensures numbers are formatted in standard base 10 without scientific notation,
 * satisfying RNF-11 (Radix 10 determinism for coordinates).
 */
function formatRadix10(n: number): string {
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Coordinate component must be a finite integer, got: ${n}`);
  }
  // Avoid exponential notation for large numbers
  return BigInt(n).toString(10);
}

/**
 * Square Coordinate Codec for 2D Cartesian chessboards (e.g. 8x8, infinite square grids).
 */
export const SquareCodec: CoordinateCodec<SquareCoordinate> = {
  encode(coord: SquareCoordinate): CoordinateKey {
    if (!this.isValid(coord)) {
      throw new Error(`Invalid SquareCoordinate: x=${coord.x}, y=${coord.y}`);
    }
    return asCoordinateKey(`${formatRadix10(coord.x)},${formatRadix10(coord.y)}`);
  },

  decode(key: CoordinateKey): SquareCoordinate {
    const parts = key.split(',');
    if (parts.length !== 2) {
      throw new Error(`Invalid Square CoordinateKey format: "${key}". Expected "x,y"`);
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    const coord: SquareCoordinate = { type: 'square', x, y };
    if (!this.isValid(coord)) {
      throw new Error(`Malformed coordinates decoded from key: "${key}"`);
    }
    return coord;
  },

  isValid(coord: SquareCoordinate): boolean {
    return (
      coord !== null &&
      typeof coord === 'object' &&
      coord.type === 'square' &&
      Number.isInteger(coord.x) &&
      Number.isInteger(coord.y) &&
      Number.isFinite(coord.x) &&
      Number.isFinite(coord.y)
    );
  },

  distance(a: SquareCoordinate, b: SquareCoordinate): number {
    // Chebyshev distance (King move distance in square chess)
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  },
};

/**
 * Hexagonal Cube Coordinate Codec (q, r, s).
 * Invariant: q + r + s === 0.
 */
export const HexCodec: CoordinateCodec<HexCoordinate> = {
  encode(coord: HexCoordinate): CoordinateKey {
    if (!this.isValid(coord)) {
      throw new Error(`Invalid HexCoordinate: q=${coord.q}, r=${coord.r}, s=${coord.s} (must sum to 0)`);
    }
    return asCoordinateKey(`${formatRadix10(coord.q)},${formatRadix10(coord.r)},${formatRadix10(coord.s)}`);
  },

  decode(key: CoordinateKey): HexCoordinate {
    const parts = key.split(',');
    if (parts.length !== 3) {
      throw new Error(`Invalid Hex CoordinateKey format: "${key}". Expected "q,r,s"`);
    }
    const q = Number(parts[0]);
    const r = Number(parts[1]);
    const s = Number(parts[2]);
    const coord: HexCoordinate = { type: 'hex', q, r, s };
    if (!this.isValid(coord)) {
      throw new Error(`Decoded hex coordinate violates q + r + s === 0 constraint: "${key}"`);
    }
    return coord;
  },

  isValid(coord: HexCoordinate): boolean {
    return (
      coord !== null &&
      typeof coord === 'object' &&
      coord.type === 'hex' &&
      Number.isInteger(coord.q) &&
      Number.isInteger(coord.r) &&
      Number.isInteger(coord.s) &&
      Number.isFinite(coord.q) &&
      Number.isFinite(coord.r) &&
      Number.isFinite(coord.s) &&
      coord.q + coord.r + coord.s === 0
    );
  },

  distance(a: HexCoordinate, b: HexCoordinate): number {
    // Hexagonal Manhattan distance in cube coordinates
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.s - b.s));
  },
};

/**
 * Helpers to construct coordinates ergonomically.
 */
export function createSquareCoord(x: number, y: number): SquareCoordinate {
  const coord: SquareCoordinate = { type: 'square', x, y };
  if (!SquareCodec.isValid(coord)) {
    throw new Error(`Invalid square coordinates: (${x}, ${y})`);
  }
  return coord;
}

export function createHexCoord(q: number, r: number, s?: number): HexCoordinate {
  const finalS = s !== undefined ? s : -q - r;
  const coord: HexCoordinate = { type: 'hex', q, r, s: finalS };
  if (!HexCodec.isValid(coord)) {
    throw new Error(`Invalid hex coordinates: (${q}, ${r}, ${finalS})`);
  }
  return coord;
}

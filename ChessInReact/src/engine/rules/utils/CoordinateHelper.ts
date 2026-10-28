import { CoordinateKey, asCoordinateKey } from '../../../core/coordinates';

export interface ICoord2D {
  readonly x: number;
  readonly y: number;
}

/**
 * Parses either algebraic ("e4", "a1") or Cartesian ("4,3", "0,0") coordinate formats.
 * Returns { x, y } in integer board coordinates.
 */
export function parseCoord(coord: string | CoordinateKey): ICoord2D | null {
  if (!coord || typeof coord !== 'string') return null;
  const trimmed = coord.trim();

  // 1. Cartesian "x,y" format
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx !== -1) {
    const x = Number(trimmed.substring(0, commaIdx));
    const y = Number(trimmed.substring(commaIdx + 1));
    if (Number.isInteger(x) && Number.isInteger(y) && Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  }

  // 2. Algebraic notation "a1" through "z99"
  const algMatch = /^([a-zA-Z])([1-9][0-9]?)$/.exec(trimmed);
  if (algMatch) {
    const fileChar = algMatch[1].toLowerCase();
    const rankNum = parseInt(algMatch[2], 10);
    const x = fileChar.charCodeAt(0) - 97; // 'a' -> 0, 'b' -> 1
    const y = rankNum - 1; // '1' -> 0, '2' -> 1
    return { x, y };
  }

  return null;
}

/**
 * Converts { x, y } to standard Cartesian CoordinateKey ("x,y").
 */
export function toCoordKey(x: number, y: number): CoordinateKey {
  return asCoordinateKey(`${Math.trunc(x)},${Math.trunc(y)}`);
}

/**
 * Converts { x, y } to algebraic notation ("e4", "a1").
 */
export function toAlgebraic(x: number, y: number): string {
  const file = String.fromCharCode(97 + x);
  const rank = y + 1;
  return `${file}${rank}`;
}

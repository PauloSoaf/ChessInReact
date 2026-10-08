import { describe, expect, it } from 'vitest';
import {
  HexCodec,
  HexCoordinate,
  SquareCodec,
  SquareCoordinate,
  asCoordinateKey,
  createHexCoord,
  createSquareCoord,
} from '../index';

describe('Coordinate System & Codecs', () => {
  describe('SquareCodec', () => {
    it('encodes and decodes valid square coordinates (roundtrip)', () => {
      const coord = createSquareCoord(3, 7);
      const key = SquareCodec.encode(coord);
      expect(key).toBe('3,7');

      const decoded = SquareCodec.decode(key);
      expect(decoded).toEqual(coord);
    });

    it('handles negative coordinates correctly', () => {
      const coord = createSquareCoord(-4, -12);
      const key = SquareCodec.encode(coord);
      expect(key).toBe('-4,-12');

      const decoded = SquareCodec.decode(key);
      expect(decoded).toEqual(coord);
    });

    it('handles large coordinates without scientific notation (RNF-11)', () => {
      const coord = createSquareCoord(10000000, -20000000);
      const key = SquareCodec.encode(coord);
      expect(key).toBe('10000000,-20000000');
      expect(key).not.toContain('e');
      expect(key).not.toContain('E');

      const decoded = SquareCodec.decode(key);
      expect(decoded).toEqual(coord);
    });

    it('calculates Chebyshev distance accurately', () => {
      const a = createSquareCoord(0, 0);
      const b = createSquareCoord(3, 4);
      expect(SquareCodec.distance(a, b)).toBe(4); // King needs 4 moves diagonally/straight
    });

    it('throws on invalid key formats', () => {
      expect(() => SquareCodec.decode(asCoordinateKey('foo,bar'))).toThrow();
      expect(() => SquareCodec.decode(asCoordinateKey('1,2,3'))).toThrow();
      expect(() => SquareCodec.decode(asCoordinateKey(''))).toThrow();
    });

    it('rejects non-integer coordinates', () => {
      expect(() =>
        SquareCodec.encode({ type: 'square', x: 1.5, y: 2 } as unknown as SquareCoordinate)
      ).toThrow();
    });
  });

  describe('HexCodec', () => {
    it('encodes and decodes valid hex coordinates with q + r + s = 0', () => {
      const coord = createHexCoord(2, -3, 1);
      const key = HexCodec.encode(coord);
      expect(key).toBe('2,-3,1');

      const decoded = HexCodec.decode(key);
      expect(decoded).toEqual(coord);
    });

    it('auto-computes third component s = -q - r', () => {
      const coord = createHexCoord(5, -2);
      expect(coord.s).toBe(-3);
      expect(coord.q + coord.r + coord.s).toBe(0);
    });

    it('rejects coordinates where q + r + s !== 0', () => {
      expect(() =>
        HexCodec.encode({ type: 'hex', q: 1, r: 1, s: 1 } as unknown as HexCoordinate)
      ).toThrow();
      expect(() => HexCodec.decode(asCoordinateKey('1,1,1'))).toThrow();
    });

    it('handles large hex coordinates deterministically without scientific notation', () => {
      const coord = createHexCoord(1500000, -1500000, 0);
      const key = HexCodec.encode(coord);
      expect(key).toBe('1500000,-1500000,0');
      expect(key).not.toContain('e');

      const decoded = HexCodec.decode(key);
      expect(decoded).toEqual(coord);
    });

    it('calculates hexagonal Manhattan distance', () => {
      const a = createHexCoord(0, 0, 0);
      const b = createHexCoord(2, -3, 1);
      // max(|2|, |-3|, |1|) = 3
      expect(HexCodec.distance(a, b)).toBe(3);
    });
  });

  describe('Property: encode -> decode -> encode symmetry', () => {
    it('preserves identity over multiple iterations', () => {
      const testCases = [
        createSquareCoord(0, 0),
        createSquareCoord(-10, 15),
        createSquareCoord(8, 8),
      ];

      for (const tc of testCases) {
        const k1 = SquareCodec.encode(tc);
        const d1 = SquareCodec.decode(k1);
        const k2 = SquareCodec.encode(d1);
        expect(k1).toBe(k2);
      }

      const hexCases = [
        createHexCoord(0, 0, 0),
        createHexCoord(1, -2, 1),
        createHexCoord(-5, 3, 2),
      ];

      for (const tc of hexCases) {
        const k1 = HexCodec.encode(tc);
        const d1 = HexCodec.decode(k1);
        const k2 = HexCodec.encode(d1);
        expect(k1).toBe(k2);
      }
    });
  });
});

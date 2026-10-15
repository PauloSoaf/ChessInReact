import { describe, expect, it } from 'vitest';
import { AleaPRNG } from '../prng/AleaPRNG';
import { SimplexNoise2D } from '../noise/SimplexNoise2D';
import { NoiseGenerator } from '../NoiseGenerator';
import { HexTopology, SquareTopology } from '../../topology';
import { CoordinateKey } from '../../coordinates';

describe('Procedural Generation Subsystem (Spec 02 Verification)', () => {
  describe('AleaPRNG (Deterministic Pseudo-Random Number Generator)', () => {
    it('produces identical sequences given the same seed', () => {
      const rng1 = new AleaPRNG('test-seed-12345');
      const rng2 = new AleaPRNG('test-seed-12345');

      const seq1 = Array.from({ length: 100 }, () => rng1.next());
      const seq2 = Array.from({ length: 100 }, () => rng2.next());

      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences for different seeds', () => {
      const rng1 = new AleaPRNG('seed-alpha');
      const rng2 = new AleaPRNG('seed-beta');

      const val1 = rng1.next();
      const val2 = rng2.next();

      expect(val1).not.toBe(val2);
    });

    it('generates uniform numbers strictly within [0, 1)', () => {
      const rng = new AleaPRNG('uniformity-seed');
      for (let i = 0; i < 500; i++) {
        const val = rng.next();
        expect(val).toBeGreaterThanOrEqual(0.0);
        expect(val).toBeLessThan(1.0);
      }
    });

    it('generates integers within specified inclusive range', () => {
      const rng = new AleaPRNG('range-seed');
      for (let i = 0; i < 100; i++) {
        const val = rng.nextInt(5, 10);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThanOrEqual(10);
        expect(Number.isInteger(val)).toBe(true);
      }
    });
  });

  describe('SimplexNoise2D (Deterministic 2D Continuous Noise)', () => {
    it('produces deterministic output for the same coordinate and seed', () => {
      const noise1 = new SimplexNoise2D('world-42');
      const noise2 = new SimplexNoise2D('world-42');

      expect(noise1.noise2D(12.5, -34.8)).toBe(noise2.noise2D(12.5, -34.8));
      expect(noise1.fbm(10.0, 20.0, 4, 0.5, 0.05)).toBe(
        noise2.fbm(10.0, 20.0, 4, 0.5, 0.05)
      );
    });

    it('exhibits smooth spatial continuity (neighboring samples have small deltas)', () => {
      const noise = new SimplexNoise2D('continuity-seed');
      const v1 = noise.noise2D(1.0, 1.0);
      const v2 = noise.noise2D(1.01, 1.0);
      const delta = Math.abs(v1 - v2);

      expect(delta).toBeLessThan(0.05);
    });

    it('bounds FBM values within [-1.0, 1.0]', () => {
      const noise = new SimplexNoise2D('fbm-bounds');
      for (let x = -50; x <= 50; x += 10) {
        for (let y = -50; y <= 50; y += 10) {
          const val = noise.fbm(x, y, 4, 0.5, 0.1);
          expect(val).toBeGreaterThanOrEqual(-1.0);
          expect(val).toBeLessThanOrEqual(1.0);
        }
      }
    });
  });

  describe('NoiseGenerator & Island Guarantee', () => {
    const hex = new HexTopology();
    const square = new SquareTopology();

    it('enforces Island Guarantee: spawn zone is strictly safe, flat elevation 1.0, and has NO obstacles', () => {
      const generator = new NoiseGenerator({
        seed: 'island-guarantee-seed',
        spawnRadius: 3,
        obstacleThreshold: 0.2, // high obstacle density outside spawn
      });

      // Center (0,0,0) and all hexes within radius 3
      const spawnHexes = hex.getSpiral('0,0,0' as CoordinateKey, 3);
      for (const coord of spawnHexes) {
        const cell = generator.generateCell(coord, hex);
        expect(cell.elevation).toBe(1.0);
        expect(cell.biome).toBe('PLAINS');
        expect(cell.isObstacle).toBe(false);
      }
    });

    it('enforces Island Guarantee on SquareTopology as well', () => {
      const generator = new NoiseGenerator({
        seed: 'square-island-seed',
        spawnRadius: 2,
      });

      const spawnSquares = square.getSpiral('0,0' as CoordinateKey, 2);
      for (const coord of spawnSquares) {
        const cell = generator.generateCell(coord, square);
        expect(cell.elevation).toBe(1.0);
        expect(cell.biome).toBe('PLAINS');
        expect(cell.isObstacle).toBe(false);
      }
    });

    it('generates diverse biomes and obstacles outside the spawn protected radius', () => {
      const generator = new NoiseGenerator({
        seed: 'biome-variety-seed',
        spawnRadius: 2,
        obstacleThreshold: 0.6,
      });

      // Sample coordinates far from origin
      const biomes = new Set<string>();
      let foundObstacle = false;

      for (let q = 10; q <= 25; q++) {
        for (let r = -25; r <= -10; r++) {
          const s = -q - r;
          const coord = `${q},${r},${s}` as CoordinateKey;
          const cell = generator.generateCell(coord, hex);
          biomes.add(cell.biome);
          if (cell.isObstacle) {
            foundObstacle = true;
          }
        }
      }

      // Should have generated more than one biome (e.g. PLAINS, MOUNTAIN, FOREST, WATER)
      expect(biomes.size).toBeGreaterThan(1);
      expect(foundObstacle).toBe(true);
    });
  });
});

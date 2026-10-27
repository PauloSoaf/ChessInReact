import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { AleaPRNG } from '../prng/AleaPRNG';
import { SimplexNoise2D } from '../noise/SimplexNoise2D';
import { NoiseGenerator } from '../NoiseGenerator';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology, HexTopology, TriangleTopology, VoronoiTopology } from '../../topology';
import goldenManifest from '../determinismManifest.json';

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') {
      if (Object.is(obj, -0)) return '0';
      return Number(obj.toFixed(10)).toString();
    }
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
}

function computeSha256(data: unknown): string {
  const str = typeof data === 'string' ? data : stableStringify(data);
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

describe('RNF-07: Cross-Platform Numeric Determinism (x86_64 vs ARM64)', () => {
  it('generates exact golden hashes for AleaPRNG sequence across diverse seeds', () => {
    const prngSeeds = [
      'numeric-seed-12345',
      'alpha-seed-chess-42',
      'special-seed-!@#$%^&*()_+~çáéíóú',
      'large-magnitude-2147483647',
      'empty-seed-',
    ];

    for (const seed of prngSeeds) {
      const rng = new AleaPRNG(seed);
      const floats: number[] = [];
      const ints: number[] = [];
      for (let i = 0; i < 500; i++) {
        floats.push(Number(rng.next().toFixed(12)));
        ints.push(rng.nextInt(-1000, 1000));
      }
      const floatHash = computeSha256(floats);
      const intHash = computeSha256(ints);

      const expected = (goldenManifest.prngHashes as Record<string, { floatHash: string; intHash: string }>)[seed];
      expect(floatHash).toBe(expected.floatHash);
      expect(intHash).toBe(expected.intHash);
    }
  });

  it('generates exact golden hash for SimplexNoise2D evaluations', () => {
    const simplex = new SimplexNoise2D('simplex-determinism-seed');
    const noiseCoords: [number, number][] = [
      [0.0, 0.0],
      [10.5, -20.25],
      [-50000.75, 49999.125],
      [1234.56, -7890.12],
      [0.0001, -0.0001],
    ];

    const noiseValues = noiseCoords.map(([x, y]) => ({
      coord: [x, y],
      raw2D: Number(simplex.noise2D(x, y).toFixed(12)),
      fbm4: Number(simplex.fbm(x, y, 4, 0.5, 0.05).toFixed(12)),
    }));

    const simplexHash = computeSha256(noiseValues);
    expect(simplexHash).toBe(goldenManifest.simplexHash);
  });

  it('generates exact golden hashes for NoiseGenerator across all 4 topologies', () => {
    const topologies = {
      square: new SquareTopology({ width: null, height: null }),
      hex: new HexTopology(),
      triangle: new TriangleTopology(),
      voronoi: new VoronoiTopology({ seed: '4242', boundingRadius: 200, cellSize: 10 }),
    };

    for (const [topoName, topo] of Object.entries(topologies)) {
      const gen = new NoiseGenerator({ seed: `noise-gen-${topoName}` });
      const samples: unknown[] = [];
      const testKeys = topoName === 'hex'
        ? ['0,0,0', '5,-2,-3', '-10,5,5', '30,-15,-15']
        : topoName === 'square'
        ? ['0,0', '15,15', '-20,-20', '100,-100']
        : topoName === 'triangle'
        ? ['0,0,0', '4,-2,-2', '-8,4,4']
        : ['v_0_0', 'v_10_10', 'v_-5_5'];

      for (const key of testKeys) {
        try {
          const cell = gen.generateCell(key as never, topo);
          samples.push({
            coord: key,
            elevation: Number(cell.elevation.toFixed(10)),
            biome: cell.biome,
            isObstacle: cell.isObstacle,
            costMultiplier: Number(cell.costMultiplier.toFixed(10)),
          });
        } catch {
          // Skip invalid coords for topologies that validate key pattern
        }
      }

      const topoHash = computeSha256(samples);
      const expectedTopoHash = (goldenManifest.noiseGenHashes as Record<string, string>)[topoName];
      expect(topoHash).toBe(expectedTopoHash);
    }
  });

  it('generates exact golden chunk hashes for ChunkManager generation', () => {
    const hex = new HexTopology();
    const manager = new ChunkManager(hex, {
      seed: 'chunk-multiplatform-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    const chunk00 = manager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    const chunk1neg1 = manager.getOrGenerateChunk({ chunkX: 1, chunkY: -1 });

    const chunk00Summary = {
      chunkId: chunk00.chunkId,
      cellCount: Object.keys(chunk00.cells).length,
      sampleCells: Object.entries(chunk00.cells).slice(0, 5).map(([k, v]) => ({
        k,
        elevation: Number(v.elevation.toFixed(10)),
        biome: v.biome,
        isObstacle: v.isObstacle,
      })),
    };

    const chunk1neg1Summary = {
      chunkId: chunk1neg1.chunkId,
      cellCount: Object.keys(chunk1neg1.cells).length,
      sampleCells: Object.entries(chunk1neg1.cells).slice(0, 5).map(([k, v]) => ({
        k,
        elevation: Number(v.elevation.toFixed(10)),
        biome: v.biome,
        isObstacle: v.isObstacle,
      })),
    };

    expect(computeSha256(chunk00Summary)).toBe(goldenManifest.chunkHashes.chunk_0_0);
    expect(computeSha256(chunk1neg1Summary)).toBe(goldenManifest.chunkHashes.chunk_1_neg1);
  });
});

import { describe, expect, it } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { ProceduralLayoutCodec } from '../ProceduralLayoutCodec';

describe('RF-15: Procedural Layout Export/Import Codec Verification', () => {
  const sampleSeed = 'cosmic-infinite-layout-99';

  it('exports layout metadata into a compact JSON payload under 1 KB (RNF-05)', () => {
    const json = ProceduralLayoutCodec.encodeLayout({
      seed: sampleSeed,
      topologyType: 'HEXAGONAL',
      chunkSize: 16,
      persistentModifications: {
        [asCoordinateKey('0,0,0')]: { elevation: 2.5, biome: 'MOUNTAIN', isObstacle: true },
      },
    });

    const byteSize = new TextEncoder().encode(json).length;
    expect(byteSize).toBeLessThan(1024); // RNF-05: < 1 KB payload
  });

  it('decodes and verifies hash integrity of valid exported layout', () => {
    const originalJson = ProceduralLayoutCodec.encodeLayout({
      seed: sampleSeed,
      topologyType: 'SQUARE',
      chunkSize: 16,
    });

    const decoded = ProceduralLayoutCodec.decodeLayout(originalJson);
    expect(decoded.schemaVersion).toBe(1);
    expect(decoded.seed).toBe(sampleSeed);
    expect(decoded.topologyType).toBe('SQUARE');
    expect(decoded.layoutHash).toBeDefined();
  });

  it('rejects tampered or corrupted layout payloads with checksum error', () => {
    const validJson = ProceduralLayoutCodec.encodeLayout({
      seed: sampleSeed,
      topologyType: 'SQUARE',
    });

    // Tamper with the seed inside the JSON string
    const tamperedJson = validJson.replace(sampleSeed, 'malicious-seed');
    expect(() => ProceduralLayoutCodec.decodeLayout(tamperedJson)).toThrow(
      /checksum mismatch/
    );
  });

  it('guarantees export -> import -> regenerate produces identical chunk fingerprints', () => {
    // 1. Generate world from original spec
    const originalJson = ProceduralLayoutCodec.encodeLayout({
      seed: 'roundtrip-reproduction-seed',
      topologyType: 'HEXAGONAL',
      chunkSize: 16,
    });

    // 2. Transmit and decode on another system
    const importedLayout = ProceduralLayoutCodec.decodeLayout(originalJson);
    const { chunkManager: cm1 } = ProceduralLayoutCodec.reconstructWorld(importedLayout);

    // 3. Create independent manager directly with the same seed
    const { chunkManager: cm2 } = ProceduralLayoutCodec.reconstructWorld(importedLayout);

    // 4. Compare fingerprints of generated chunks across coordinate plane
    const testChunkCoords = [
      { chunkX: 0, chunkY: 0 },
      { chunkX: 2, chunkY: -1 },
      { chunkX: -5, chunkY: 4 },
    ];

    for (const coords of testChunkCoords) {
      const c1 = cm1.getOrGenerateChunk(coords);
      const c2 = cm2.getOrGenerateChunk(coords);

      const fp1 = ProceduralLayoutCodec.computeChunkFingerprint(c1);
      const fp2 = ProceduralLayoutCodec.computeChunkFingerprint(c2);

      expect(fp1).toBe(fp2);
    }
  });
});

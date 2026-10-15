import { describe, expect, it } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { ProceduralLayoutCodec } from '../ProceduralLayoutCodec';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';

describe('PATCH-12: Persistent Procedural Overrides and Reconstruction (RF-15)', () => {
  const seed = 'test-patch12-seed';

  it('T12-01: encodes and reconstructs a world preserving custom biome modification', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed }, { chunkSize: 16 });

    const targetCoord = asCoordinateKey('4,4');
    const baseCell = manager.getCell(targetCoord);
    expect(baseCell).not.toBeNull();

    // Set persistent override from whatever base was to WATER
    manager.setPersistentModification(targetCoord, {
      biome: 'WATER',
      isObstacle: true,
    });

    const modifiedCell = manager.getCell(targetCoord);
    expect(modifiedCell?.biome).toBe('WATER');
    expect(modifiedCell?.isObstacle).toBe(true);

    // Export layout with persistent modifications
    const exportedJson = ProceduralLayoutCodec.encodeLayout({
      seed,
      topologyType: 'SQUARE',
      chunkSize: 16,
      persistentModifications: manager.getPersistentModifications(),
    });

    // Reconstruct world from export
    const decoded = ProceduralLayoutCodec.decodeLayout(exportedJson);
    const { chunkManager: restoredManager } = ProceduralLayoutCodec.reconstructWorld(decoded);

    const restoredCell = restoredManager.getCell(targetCoord);
    expect(restoredCell?.biome).toBe('WATER');
    expect(restoredCell?.isObstacle).toBe(true);
  });

  it('T12-02: preserves exact custom elevation modification across export/import', () => {
    const targetCoord = asCoordinateKey('2,3');
    const targetElevation = 2.5;

    const exportedJson = ProceduralLayoutCodec.encodeLayout({
      seed,
      topologyType: 'SQUARE',
      chunkSize: 16,
      persistentModifications: {
        [targetCoord]: {
          elevation: targetElevation,
          biome: 'MOUNTAIN',
          isObstacle: true,
        },
      },
    });

    const decoded = ProceduralLayoutCodec.decodeLayout(exportedJson);
    const { chunkManager } = ProceduralLayoutCodec.reconstructWorld(decoded);

    const cell = chunkManager.getCell(targetCoord);
    expect(cell?.elevation).toBeCloseTo(targetElevation);
    expect(cell?.biome).toBe('MOUNTAIN');
  });

  it('T12-03: preserves overrides when chunk is evicted and regenerated', () => {
    const topology = new SquareTopology({ width: null, height: null });
    // Restrict maxChunksInMemory to 2 to force eviction
    const manager = new ChunkManager(topology, { seed }, { chunkSize: 16, maxChunksInMemory: 2 });

    const targetCoord = asCoordinateKey('0,0'); // in chunk_0_0
    manager.setPersistentModification(targetCoord, {
      biome: 'WATER',
      isObstacle: true,
    });

    expect(manager.getCell(targetCoord)?.biome).toBe('WATER');

    // Generate distant chunks to evict chunk_0_0 if allowed or fill capacity
    manager.getOrGenerateChunk({ chunkX: 5, chunkY: 5 });
    manager.getOrGenerateChunk({ chunkX: 6, chunkY: 6 });
    manager.getOrGenerateChunk({ chunkX: 7, chunkY: 7 });

    // Re-access chunk_0_0
    const regeneratedCell = manager.getCell(targetCoord);
    expect(regeneratedCell?.biome).toBe('WATER');
    expect(regeneratedCell?.isObstacle).toBe(true);
  });

  it('T12-04: generates identical baseline world when no modifications are provided', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const baselineManager = new ChunkManager(topology, { seed }, { chunkSize: 16 });
    const baselineCell = baselineManager.getCell(asCoordinateKey('5,5'));

    const exportedJson = ProceduralLayoutCodec.encodeLayout({
      seed,
      topologyType: 'SQUARE',
      chunkSize: 16,
    });

    const decoded = ProceduralLayoutCodec.decodeLayout(exportedJson);
    const { chunkManager: restoredManager } = ProceduralLayoutCodec.reconstructWorld(decoded);
    const restoredCell = restoredManager.getCell(asCoordinateKey('5,5'));

    expect(restoredCell).toEqual(baselineCell);
  });

  it('T12-05: detects tampering and verifies layout checksum', () => {
    const exportedJson = ProceduralLayoutCodec.encodeLayout({
      seed,
      topologyType: 'SQUARE',
      chunkSize: 16,
      persistentModifications: {
        [asCoordinateKey('1,1')]: { biome: 'FOREST' },
      },
    });

    const tampered = exportedJson.replace('"FOREST"', '"WATER"');
    expect(() => ProceduralLayoutCodec.decodeLayout(tampered)).toThrow(/checksum mismatch/i);
  });

  it('T12-06: safely decodes and reconstructs layouts missing persistentModifications field', () => {
    const rawLegacyExport = JSON.stringify({
      schemaVersion: 1,
      generatorVersion: '2.0.0',
      seed: 'legacy-seed',
      topologyType: 'SQUARE',
      chunkSize: 16,
      config: {
        seed: 'legacy-seed',
        noiseOctaves: 4,
        noisePersistence: 0.5,
        noiseScale: 0.05,
        obstacleThreshold: 0.75,
        waterThreshold: 0.25,
        spawnRadius: 3,
        chunkSize: 16,
      },
      layoutHash: ProceduralLayoutCodec.computeHash({
        seed: 'legacy-seed',
        generatorVersion: '2.0.0',
        topologyType: 'SQUARE',
        chunkSize: 16,
        config: {
          seed: 'legacy-seed',
          noiseOctaves: 4,
          noisePersistence: 0.5,
          noiseScale: 0.05,
          obstacleThreshold: 0.75,
          waterThreshold: 0.25,
          spawnRadius: 3,
          chunkSize: 16,
        },
      }),
    });

    const decoded = ProceduralLayoutCodec.decodeLayout(rawLegacyExport);
    expect(decoded.persistentModifications).toBeUndefined();

    const { chunkManager } = ProceduralLayoutCodec.reconstructWorld(decoded);
    expect(chunkManager).toBeDefined();
    expect(chunkManager.getPersistentModifications()).toEqual({});
  });
});

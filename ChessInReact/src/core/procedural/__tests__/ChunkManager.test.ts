import { describe, expect, it } from 'vitest';
import { ChunkManager } from '../ChunkManager';
import { HexTopology, SquareTopology } from '../../topology';
import { CoordinateKey } from '../../coordinates';

describe('ChunkManager (Spec 02 Verification - Macro-Chunking & Streaming)', () => {
  const hex = new HexTopology();
  const square = new SquareTopology();

  it('calculates chunk coordinates accurately for SquareTopology (16x16 macro chunks)', () => {
    const manager = new ChunkManager(square, { chunkSize: 16 });

    expect(manager.getChunkCoord('0,0' as CoordinateKey)).toEqual({ chunkX: 0, chunkY: 0 });
    expect(manager.getChunkCoord('15,15' as CoordinateKey)).toEqual({ chunkX: 0, chunkY: 0 });
    expect(manager.getChunkCoord('16,0' as CoordinateKey)).toEqual({ chunkX: 1, chunkY: 0 });
    expect(manager.getChunkCoord('0,16' as CoordinateKey)).toEqual({ chunkX: 0, chunkY: 1 });
    expect(manager.getChunkCoord('-1,-1' as CoordinateKey)).toEqual({ chunkX: -1, chunkY: -1 });
  });

  it('calculates chunk coordinates accurately for HexTopology', () => {
    const manager = new ChunkManager(hex, { chunkSize: 16 });

    expect(manager.getChunkCoord('0,0,0' as CoordinateKey)).toEqual({ chunkX: 0, chunkY: 0 });
    expect(manager.getChunkCoord('15,-5,-10' as CoordinateKey)).toEqual({ chunkX: 0, chunkY: -1 });
    expect(manager.getChunkCoord('32,-16,-16' as CoordinateKey)).toEqual({ chunkX: 2, chunkY: -1 });
  });

  it('deterministically generates and caches chunks', () => {
    const manager = new ChunkManager(hex, { seed: 'chunk-test-seed', chunkSize: 16 });

    const chunk1 = manager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    expect(chunk1.chunkId).toBe('chunk_0_0');
    expect(chunk1.coords).toEqual({ chunkX: 0, chunkY: 0 });
    expect(Object.keys(chunk1.cells).length).toBe(16 * 16);

    // Island guarantee inside chunk 0,0
    expect(chunk1.cells['0,0,0' as CoordinateKey].elevation).toBe(1.0);
    expect(chunk1.cells['0,0,0' as CoordinateKey].isObstacle).toBe(false);

    // Second fetch returns the cached chunk instance
    const chunk1Again = manager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    expect(chunk1Again).toBe(chunk1);
  });

  it('updates sliding window based on active entity positions and yields loaded/unloaded deltas', () => {
    const manager = new ChunkManager(hex, {
      seed: 'sliding-window-seed',
      chunkSize: 16,
      viewRadiusChunks: 1,
    });

    // Initial position at center
    const activeCoords: CoordinateKey[] = ['0,0,0' as CoordinateKey];
    const delta1 = manager.updateActiveChunks(activeCoords);

    // At viewRadius 1, a 3x3 block of chunks is loaded (9 chunks)
    expect(delta1.loadedChunks.length).toBe(9);
    expect(delta1.unloadedChunkIds.length).toBe(0);
    expect(manager.getLoadedChunkCount()).toBe(9);

    // Move piece far away to chunk (10, 10)
    const newCoords: CoordinateKey[] = ['160,0,-160' as CoordinateKey];
    const delta2 = manager.updateActiveChunks(newCoords);

    expect(delta2.loadedChunks.length).toBe(9);
    // Old 9 chunks are no longer in window and should be unloaded
    expect(delta2.unloadedChunkIds.length).toBe(9);
    expect(manager.getLoadedChunkCount()).toBe(9);
  });

  it('enforces LRU memory eviction when maxChunksInMemory is exceeded', () => {
    const manager = new ChunkManager(square, {
      chunkSize: 16,
      maxChunksInMemory: 5,
    });

    // Generate 5 chunks
    for (let i = 0; i < 5; i++) {
      manager.getOrGenerateChunk({ chunkX: i, chunkY: 0 });
    }
    expect(manager.getLoadedChunkCount()).toBe(5);

    // Generate a 6th chunk -> oldest unpinned chunk (chunk_0_0) is evicted
    manager.getOrGenerateChunk({ chunkX: 5, chunkY: 0 });
    expect(manager.getLoadedChunkCount()).toBe(5);
    expect(manager.hasChunk({ chunkX: 0, chunkY: 0 })).toBe(false);
    expect(manager.hasChunk({ chunkX: 5, chunkY: 0 })).toBe(true);
  });

  it('protects against memory overflow: never loads millions of entities into memory', () => {
    const manager = new ChunkManager(hex, {
      chunkSize: 16,
      maxChunksInMemory: 10,
    });

    // Simulate requesting 50 distinct distant chunks
    for (let x = 0; x < 50; x++) {
      manager.getOrGenerateChunk({ chunkX: x * 5, chunkY: x * 5 });
    }

    // Capacity must remain bounded by maxChunksInMemory (10 chunks * 256 cells = 2,560 cells << 20,000 cap)
    expect(manager.getLoadedChunkCount()).toBeLessThanOrEqual(10);
    expect(manager.getTotalLoadedCellCount()).toBeLessThanOrEqual(10 * 256);
  });

  it('retrieves individual terrain cells on demand transparently loading chunks', () => {
    const manager = new ChunkManager(hex, { seed: 'cell-lookup-seed', chunkSize: 16 });

    const cell = manager.getCell('1,0,-1' as CoordinateKey);
    expect(cell).toBeDefined();
    expect(cell?.coord).toBe('1,0,-1');
    expect(cell?.topology).toBe('HEXAGONAL');
    expect(cell?.elevation).toBe(1.0); // Inside spawn guarantee
  });
});

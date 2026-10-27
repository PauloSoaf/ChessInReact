import { describe, expect, it } from 'vitest';
import { ProceduralBoardInstancedHarness } from '../ProceduralBoardInstancedHarness';
import { SquareTopology, HexTopology } from '../../../core/topology';
import { ChunkManager } from '../../../core/procedural/ChunkManager';
import { CoordinateKey } from '../../../core/coordinates';

describe('RNF-08: WebGL Draw Calls Budget Validation (Spec 02 Verification)', () => {
  it('dispatches at most 3 draw calls per material for a 64-cell board (8x8)', () => {
    const topology = new SquareTopology({ width: 8, height: 8 });
    const harness = new ProceduralBoardInstancedHarness(topology, { maxCapacity: 256, materialName: 'BoardMaterial_64' });

    // Populate a 64-cell dummy chunk
    const cells: Record<string, { elevation: number; biome: string; isObstacle: boolean; costMultiplier: number }> = {};
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        cells[`${x},${y}`] = { elevation: 1.0, biome: 'PLAINS', isObstacle: false, costMultiplier: 1.0 };
      }
    }

    harness.loadChunk({
      chunkId: 'chunk_8x8',
      coords: { chunkX: 0, chunkY: 0 },
      cells: cells as never,
      boundingRadius: 8,
      lastAccessedTimestamp: Date.now(),
    });

    const metrics = harness.computeDrawCallMetrics();
    expect(metrics.activeInstancesCount).toBe(64);
    expect(metrics.totalDrawCalls).toBeLessThanOrEqual(3);
    expect(metrics.drawCallsPerMaterial['BoardMaterial_64']).toBe(1);

    harness.dispose();
  });

  it('dispatches at most 3 draw calls per material for a 256-cell macro-chunk (16x16)', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, { seed: 'draw-call-256', chunkSize: 16 });
    const chunk = chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });

    const harness = new ProceduralBoardInstancedHarness(hex, { maxCapacity: 1000, materialName: 'HexMaterial_256' });
    const loadedCount = harness.loadChunk(chunk);

    expect(loadedCount).toBe(256);
    const metrics = harness.computeDrawCallMetrics();
    expect(metrics.activeInstancesCount).toBe(256);
    expect(metrics.totalDrawCalls).toBe(1);
    expect(metrics.drawCallsPerMaterial['HexMaterial_256']).toBeLessThanOrEqual(3);

    harness.dispose();
  });

  it('dispatches at most 3 draw calls per material for 6,400 visible cells (40 macro-chunks)', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, { seed: 'draw-call-6400', chunkSize: 16, maxChunksInMemory: 50 });
    const harness = new ProceduralBoardInstancedHarness(hex, { maxCapacity: 10000, materialName: 'HexMaterial_6400' });

    // Load 25 chunks (25 * 256 = 6,400 cells)
    let totalLoaded = 0;
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = -2; cy <= 2; cy++) {
        const chunk = chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy });
        totalLoaded += harness.loadChunk(chunk);
      }
    }

    expect(totalLoaded).toBe(25 * 256); // 6,400 cells
    const metrics = harness.computeDrawCallMetrics();
    expect(metrics.activeInstancesCount).toBe(6400);

    // RNF-08 Invariant: <= 3 draw calls per material
    expect(metrics.totalDrawCalls).toBe(1);
    expect(metrics.drawCallsPerMaterial['HexMaterial_6400']).toBe(1);
    expect(metrics.drawCallsPerMaterial['HexMaterial_6400']).toBeLessThanOrEqual(3);

    harness.dispose();
  });

  it('maintains draw call budget invariant during chunk streaming, unloading, and overrides', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, { seed: 'draw-call-streaming', chunkSize: 16, maxChunksInMemory: 50 });
    const harness = new ProceduralBoardInstancedHarness(hex, { maxCapacity: 5000, materialName: 'StreamingMaterial' });

    // Load 4 chunks
    const chunkA = chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    const chunkB = chunkManager.getOrGenerateChunk({ chunkX: 1, chunkY: 0 });
    const chunkC = chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 1 });
    const chunkD = chunkManager.getOrGenerateChunk({ chunkX: 1, chunkY: 1 });

    harness.loadChunk(chunkA);
    harness.loadChunk(chunkB);
    harness.loadChunk(chunkC);
    harness.loadChunk(chunkD);
    expect(harness.getActiveInstanceCount()).toBe(1024);

    // Apply persistent terrain override in place
    const updated = harness.updateCellOverride('0,0,0' as CoordinateKey, 3.0, true);
    expect(updated).toBe(true);

    // Evict 2 chunks (LRU streaming simulation)
    const unloadedB = harness.unloadChunk(chunkB.chunkId);
    const unloadedC = harness.unloadChunk(chunkC.chunkId);
    expect(unloadedB).toBe(256);
    expect(unloadedC).toBe(256);
    expect(harness.getActiveInstanceCount()).toBe(512);

    const metrics = harness.computeDrawCallMetrics();
    expect(metrics.activeInstancesCount).toBe(512);
    expect(metrics.drawCallsPerMaterial['StreamingMaterial']).toBe(1);
    expect(metrics.drawCallsPerMaterial['StreamingMaterial']).toBeLessThanOrEqual(3);

    harness.dispose();
  });
});

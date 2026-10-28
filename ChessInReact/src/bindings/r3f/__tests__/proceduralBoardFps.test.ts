import { describe, expect, it } from 'vitest';
import { ProceduralBoardInstancedHarness } from '../ProceduralBoardInstancedHarness';
import { HexTopology } from '../../../core/topology';
import { ChunkManager } from '../../../core/procedural/ChunkManager';
import { asCoordinateKey } from '../../../core/coordinates';

describe('RNF-04: 60 FPS Procedural Expansion Profile (Spec 02 Verification)', () => {
  it('sustains frame budget under 16.67ms (60 FPS) across 6,400 active cells during chunk updates', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, {
      seed: 'fps-test-seed',
      chunkSize: 16,
      viewRadiusChunks: 2,
      maxChunksInMemory: 35,
    });

    const harness = new ProceduralBoardInstancedHarness(hex, {
      maxCapacity: 10000,
      materialName: 'HexMaterial_FPS',
    });

    // Populate initial 6,400 cells (25 chunks)
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = -2; cy <= 2; cy++) {
        const chunk = chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy });
        harness.loadChunk(chunk);
      }
    }

    expect(harness.getActiveInstanceCount()).toBe(6400);

    // Warm up JIT execution to prevent cold start spike during concurrent test runs
    for (let w = 0; w < 3; w++) {
      const activeCoord = asCoordinateKey(`${w},0,${-w}`);
      const delta = chunkManager.updateActiveChunks([activeCoord]);
      for (const loaded of delta.loadedChunks) harness.loadChunk(loaded);
      for (const unloadedId of delta.unloadedChunkIds) harness.unloadChunk(unloadedId);
    }

    // Profile 30 continuous simulation frames
    const frameTimes: number[] = [];
    let camQ = 0;
    let longTasks = 0;

    for (let f = 0; f < 30; f++) {
      const start = performance.now();

      camQ++;
      const activeCoord = asCoordinateKey(`${camQ},0,${-camQ}`);
      const delta = chunkManager.updateActiveChunks([activeCoord]);

      for (const loaded of delta.loadedChunks) {
        harness.loadChunk(loaded);
      }
      for (const unloadedId of delta.unloadedChunkIds) {
        harness.unloadChunk(unloadedId);
      }

      harness.updateCellOverride(activeCoord, 1.8, false);

      const elapsed = performance.now() - start;
      frameTimes.push(elapsed);
      if (elapsed > 50.0) {
        longTasks++;
      }
    }

    harness.dispose();

    frameTimes.sort((a, b) => a - b);
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const p95 = frameTimes[Math.floor(frameTimes.length * 0.95)];

    // 60 FPS requires frame time < 16.67ms
    expect(avg).toBeLessThan(16.67);
    expect(p95).toBeLessThan(25.0);
    expect(longTasks).toBeLessThanOrEqual(1);
  });
});

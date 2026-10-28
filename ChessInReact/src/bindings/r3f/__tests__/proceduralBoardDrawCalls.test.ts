import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
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

  it('restores instance scale to (1, 1, 1) when loading chunks after unload and across 100 load/unload cycles (S02-03)', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, { seed: 'scale-test', chunkSize: 16 });
    const harness = new ProceduralBoardInstancedHarness(hex, { maxCapacity: 2000 });

    const chunk1 = chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    const chunk2 = chunkManager.getOrGenerateChunk({ chunkX: 1, chunkY: 0 });

    // Step 1: Load chunk 1
    harness.loadChunk(chunk1);

    // Step 2: Unload chunk 1 (tempScale is set to 0,0,0 internally to hide instances)
    harness.unloadChunk(chunk1.chunkId);

    // Step 3: Load chunk 2
    harness.loadChunk(chunk2);

    // Check scale of newly loaded instances
    const mat = new THREE.Matrix4();
    const scale = new THREE.Vector3();

    // Verify all active instances have scale (1, 1, 1), not (0, 0, 0)
    for (let i = 0; i < 256; i++) {
      harness.instancedMesh.getMatrixAt(i, mat);
      scale.setFromMatrixScale(mat);
      expect(scale.x).toBeCloseTo(1, 4);
      expect(scale.y).toBeCloseTo(1, 4);
      expect(scale.z).toBeCloseTo(1, 4);
      expect(mat.elements[0]).toBeGreaterThan(0);
      expect(mat.elements[5]).toBeGreaterThan(0);
      expect(mat.elements[10]).toBeGreaterThan(0);
    }

    // Step 4: Run 100 load/unload cycles
    for (let cycle = 0; cycle < 100; cycle++) {
      harness.unloadChunk(chunk2.chunkId);
      harness.loadChunk(chunk1);
      harness.unloadChunk(chunk1.chunkId);
      harness.loadChunk(chunk2);
    }

    for (let i = 0; i < 256; i++) {
      harness.instancedMesh.getMatrixAt(i, mat);
      scale.setFromMatrixScale(mat);
      expect(scale.x).toBeCloseTo(1, 4);
      expect(scale.y).toBeCloseTo(1, 4);
      expect(scale.z).toBeCloseTo(1, 4);
      expect(mat.elements[0]).toBeGreaterThan(0);
      expect(mat.elements[5]).toBeGreaterThan(0);
      expect(mat.elements[10]).toBeGreaterThan(0);
    }

    harness.dispose();
  });

  it('distinguishes architectural batch estimation from renderer call metrics (S02-02)', () => {
    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, { seed: 'metrics-mode', chunkSize: 16 });
    const harness = new ProceduralBoardInstancedHarness(hex, { maxCapacity: 500, materialName: 'BatchMaterial' });
    const chunk = chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });
    harness.loadChunk(chunk);

    // Architectural estimation
    const estimated = harness.computeDrawCallMetrics();
    expect(estimated.isHardwareMeasured).toBe(false);
    expect(estimated.measurementMode).toBe('ESTIMATED_BATCH_STRUCTURE');
    expect(estimated.totalDrawCalls).toBe(1);

    // Hardware measurement path via WebGLRenderer interface contract
    const mockRenderer = {
      info: {
        reset: () => {},
        render: { calls: 1, triangles: 512, points: 0, lines: 0, frame: 1 },
      },
      render: () => {},
    } as unknown as THREE.WebGLRenderer;

    const dummyScene = new THREE.Scene();
    const dummyCamera = new THREE.PerspectiveCamera();
    const measured = harness.measureWebGLRendererCalls(mockRenderer, dummyScene, dummyCamera);

    expect(measured.isHardwareMeasured).toBe(true);
    expect(measured.measurementMode).toBe('MEASURED_WEBGL_RENDERER');
    expect(measured.totalDrawCalls).toBe(1);
    expect(measured.drawCallsPerMaterial['BatchMaterial']).toBe(1);

    harness.dispose();
  });
});


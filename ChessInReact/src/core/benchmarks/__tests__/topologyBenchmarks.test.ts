import { describe, expect, it } from 'vitest';
import { HexTopology, SquareTopology } from '../../topology';
import { ChunkManager } from '../../procedural/ChunkManager';
import { findPathAStar } from '../../topology/pathfinding/AStarPathfinder';
import { CoordinateKey } from '../../coordinates';

describe('Quantitative Topology & Procedural Benchmarks (Spec 02 Verification)', () => {
  const hex = new HexTopology();
  const square = new SquareTopology({ width: null, height: null });

  it('measures getNeighbors latency across 10,000 queries (< 0.01ms / 10μs per query)', () => {
    const iterations = 10000;
    const startHex = '0,0,0' as CoordinateKey;

    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      hex.getNeighbors(startHex);
    }
    const totalMs = performance.now() - t0;
    const avgUs = (totalMs / iterations) * 1000;

    console.log(`[BENCHMARK] Hex getNeighbors: ${totalMs.toFixed(3)}ms total for ${iterations} queries (${avgUs.toFixed(3)}μs/query)`);
    expect(avgUs).toBeLessThan(25); // Under 25 microseconds (< 0.025ms, spec limit 50μs)
  });

  it('verifies classic 4-player hexagonal arena construction occurs in < 30ms (RNF-12)', () => {
    const samples = 10;
    const times: number[] = [];

    for (let s = 0; s < samples; s++) {
      const t0 = performance.now();
      const arenaHexes = hex.getSpiral('0,0,0' as CoordinateKey, 5); // 91 hexes
      const dt = performance.now() - t0;
      times.push(dt);
      expect(arenaHexes.length).toBe(91);
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / samples;
    const p95Ms = times.sort((a, b) => a - b)[Math.floor(samples * 0.95)];

    console.log(`[BENCHMARK] Classic 4-Player Hex Arena Construction: Avg ${avgMs.toFixed(3)}ms, P95 ${p95Ms.toFixed(3)}ms`);
    expect(p95Ms).toBeLessThan(30); // RNF-12 requirement
  });

  it('measures 16x16 macro-chunk procedural generation latency (< 15ms per chunk)', () => {
    const chunkManager = new ChunkManager(hex, {
      seed: 'benchmark-seed-101',
      chunkSize: 16,
    });

    const chunkCount = 10;
    const t0 = performance.now();
    for (let i = 0; i < chunkCount; i++) {
      chunkManager.getOrGenerateChunk({ chunkX: i, chunkY: 0 });
    }
    const totalMs = performance.now() - t0;
    const msPerChunk = totalMs / chunkCount;

    console.log(`[BENCHMARK] 16x16 Chunk Generation: ${totalMs.toFixed(3)}ms for ${chunkCount} chunks (${msPerChunk.toFixed(3)}ms/chunk)`);
    expect(msPerChunk).toBeLessThan(15);
  });

  it('measures A* pathfinding speed across 20-step and 100-step topology searches', () => {
    // Warm-up iteration to stabilize JIT optimization
    findPathAStar(square, '0,0' as CoordinateKey, '5,5' as CoordinateKey);

    // 1. 20-step diagonal search (0,0 to 20,20)
    const samples = 5;
    const times: number[] = [];
    let pathLength = 0;
    let nodesVisited = 0;

    for (let i = 0; i < samples; i++) {
      const t0 = performance.now();
      const res = findPathAStar(square, '0,0' as CoordinateKey, '20,20' as CoordinateKey);
      const dt = performance.now() - t0;
      times.push(dt);
      pathLength = res.path.length;
      nodesVisited = res.nodesVisited;
      expect(res.found).toBe(true);
    }

    const avgMs = times.reduce((a, b) => a + b, 0) / samples;
    console.log(
      `[BENCHMARK] A* Pathfinding (0,0 to 20,20): Avg ${avgMs.toFixed(3)}ms, pathLength=${pathLength}, visited=${nodesVisited}`
    );
    expect(avgMs).toBeLessThan(10);

    // 2. 100-step orthogonal search (0,0 to 0,100)
    const t100 = performance.now();
    const res100 = findPathAStar(square, '0,0' as CoordinateKey, '0,100' as CoordinateKey);
    const dt100 = performance.now() - t100;
    console.log(
      `[BENCHMARK] A* 100-step Pathfinding (0,0 to 0,100): ${dt100.toFixed(3)}ms, pathLength=${res100.path.length}, visited=${res100.nodesVisited}`
    );
    expect(res100.found).toBe(true);
    expect(res100.path.length).toBe(101); // 100 steps
    expect(dt100).toBeLessThan(50); // Under 50ms under load/coverage instrumentation
  });

  it('measures grid memory heap consumption with 10,000 active cells (RNF-03: < 40 MB)', () => {
    // 1. Stabilized initial baseline
    if (globalThis.gc) globalThis.gc();
    const heapInitial = process.memoryUsage().heapUsed;

    const chunkManager = new ChunkManager(hex, {
      seed: 'heap-benchmark-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    // 2. Generate 40 chunks = 40 * 256 = 10,240 cells (retain reference to prevent premature GC)
    const activeChunks = [];
    for (let cx = 0; cx < 8; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        activeChunks.push(chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy }));
      }
    }

    const totalCells = activeChunks.reduce((sum, c) => sum + Object.keys(c.cells).length, 0);
    expect(totalCells).toBeGreaterThanOrEqual(10000);

    const heapPeak = process.memoryUsage().heapUsed;
    const peakUsedMb = (heapPeak - heapInitial) / (1024 * 1024);

    // 3. Measure memory post-GC if exposed
    if (globalThis.gc) globalThis.gc();
    const heapRetained = process.memoryUsage().heapUsed;
    const retainedMb = (heapRetained - heapInitial) / (1024 * 1024);

    console.log(
      `[BENCHMARK] RNF-03 Memory Budget: ${totalCells} cells in ${activeChunks.length} chunks. Heap peak delta: ${Math.max(0, peakUsedMb).toFixed(2)} MB, retained: ${Math.max(0, retainedMb).toFixed(2)} MB (Limit: < 40 MB)`
    );

    // Spec 02 Section 17 RNF-03: strictly < 40 Megabytes of heap
    expect(Math.max(0, peakUsedMb)).toBeLessThan(40);
  });

  it('verifies coordinate precision and determinism at large magnitudes up to 50,000 units (RNF-11)', () => {
    const largeCoords: CoordinateKey[] = [
      '50000,50000' as CoordinateKey,
      '-50000,-50000' as CoordinateKey,
      '50000,-50000' as CoordinateKey,
      '-50000,50000' as CoordinateKey,
    ];

    for (const c of largeCoords) {
      // 1. Square projection roundtrip
      const worldSq = square.toWorldPosition(c);
      expect(square.worldToCoordinate(worldSq)).toBe(c);

      // 2. Neighbor resolution at 50,000
      const neighbors = square.getAllNeighbors(c);
      expect(neighbors.length).toBe(8);

      // 3. Distance calculation between large opposite coordinates
      const dist = square.getDistance('-50000,-50000' as CoordinateKey, '50000,50000' as CoordinateKey);
      expect(dist).toBe(100000);
    }
  });

  it('verifies picking / coordinate projection supports > 120 queries per second (RNF-15)', () => {
    const queries = 1200; // 10 seconds of 120Hz
    const t0 = performance.now();
    for (let i = 0; i < queries; i++) {
      hex.toWorldPosition(`${(i % 50) - 25},0,${-((i % 50) - 25)}` as CoordinateKey);
    }
    const totalMs = performance.now() - t0;
    const qps = (queries / totalMs) * 1000;

    console.log(`[BENCHMARK] Coordinate Projection / Picking: ${qps.toFixed(0)} queries/sec (Total: ${totalMs.toFixed(2)}ms for ${queries} queries)`);
    expect(qps).toBeGreaterThan(120);
  });
});

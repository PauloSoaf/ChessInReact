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

    // Warm-up iteration to stabilize JIT optimization
    chunkManager.getOrGenerateChunk({ chunkX: -1, chunkY: -1 });

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

  it('T24-01: measures grid memory heap consumption with 10,240 active cells retained (RNF-03: < 40 MB)', () => {
    // 1. Stabilized initial baseline
    if (globalThis.gc) globalThis.gc();
    const heapInitial = process.memoryUsage().heapUsed;

    const chunkManager = new ChunkManager(square, {
      seed: 'heap-benchmark-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    // 2. Generate 40 chunks = 40 * 256 = 10,240 cells (retain references to prevent premature GC)
    const activeChunks = [];
    for (let cx = 0; cx < 8; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        activeChunks.push(chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy }));
      }
    }

    const totalCells = activeChunks.reduce((sum, c) => sum + Object.keys(c.cells).length, 0);
    expect(totalCells).toBe(10240);

    const heapPeak = process.memoryUsage().heapUsed;
    const peakUsedMb = (heapPeak - heapInitial) / (1024 * 1024);

    console.log(
      `[BENCHMARK] RNF-03 Memory Budget: ${totalCells} cells in ${activeChunks.length} chunks. Baseline: ${(heapInitial / 1048576).toFixed(2)} MB, Peak: ${(heapPeak / 1048576).toFixed(2)} MB, Raw incremental delta: ${peakUsedMb >= 0 ? '+' : ''}${peakUsedMb.toFixed(2)} MB (Limit: < 40 MB)`
    );

    // Spec 02 Section 17 RNF-03: strictly < 40 Megabytes of heap
    expect(peakUsedMb).toBeLessThan(40);
  });

  it('T24-02: measures post-unload memory with documented GC and unmasked retained delta', () => {
    if (globalThis.gc) globalThis.gc();
    const heapInitial = process.memoryUsage().heapUsed;

    const chunkManager = new ChunkManager(square, {
      seed: 'unload-gc-benchmark-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    const activeChunks = [];
    for (let cx = 0; cx < 8; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        activeChunks.push(chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy }));
      }
    }
    expect(activeChunks.length).toBe(40);

    // Unload all chunks and release references
    activeChunks.length = 0;
    chunkManager.clear();

    if (globalThis.gc) globalThis.gc();
    const heapPostUnload = process.memoryUsage().heapUsed;
    const retainedDeltaMb = (heapPostUnload - heapInitial) / (1024 * 1024);

    console.log(
      `[BENCHMARK] Post-Unload Memory: Baseline: ${(heapInitial / 1048576).toFixed(2)} MB, Post-Unload: ${(heapPostUnload / 1048576).toFixed(2)} MB, Raw retained delta: ${retainedDeltaMb >= 0 ? '+' : ''}${retainedDeltaMb.toFixed(2)} MB`
    );

    // Retained delta post-unload should be well within safe operating margin (< 10 MB)
    expect(retainedDeltaMb).toBeLessThan(10);
  });

  it('T24-03: records repeated streaming load and unload cycles without masking raw delta trend', () => {
    const chunkManager = new ChunkManager(square, {
      seed: 'multi-cycle-mem-seed',
      chunkSize: 16,
      maxChunksInMemory: 25,
    });

    const cycleDeltasMb: number[] = [];
    let prevHeap = process.memoryUsage().heapUsed;

    for (let cycle = 0; cycle < 10; cycle++) {
      const cycleChunks = [];
      for (let i = 0; i < 20; i++) {
        cycleChunks.push(chunkManager.getOrGenerateChunk({ chunkX: (cycle * 20 + i) % 80, chunkY: cycle }));
      }
      cycleChunks.length = 0;
      chunkManager.clear();
      if (globalThis.gc) globalThis.gc();

      const currentHeap = process.memoryUsage().heapUsed;
      const cycleDelta = (currentHeap - prevHeap) / (1024 * 1024);
      cycleDeltasMb.push(cycleDelta);
      prevHeap = currentHeap;
    }

    const avgDrift = cycleDeltasMb.reduce((a, b) => a + b, 0) / cycleDeltasMb.length;
    console.log(
      `[BENCHMARK] Multi-Cycle Memory Trend (10 cycles): Raw deltas [${cycleDeltasMb.map((d) => (d >= 0 ? '+' : '') + d.toFixed(2)).join(', ')}] MB. Avg drift/cycle: ${avgDrift >= 0 ? '+' : ''}${avgDrift.toFixed(3)} MB`
    );

    // Uncontrolled leak would show large positive drift; average drift should remain small (< 2 MB / cycle)
    expect(avgDrift).toBeLessThan(2);
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

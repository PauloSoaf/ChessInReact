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
    expect(avgUs).toBeLessThan(10); // Less than 10 microseconds (< 0.01ms)
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

  it('measures A* pathfinding speed on 100-step topology search (< 5ms)', () => {
    const t0 = performance.now();
    const result = findPathAStar(
      square,
      '0,0' as CoordinateKey,
      '20,20' as CoordinateKey
    );
    const dt = performance.now() - t0;

    console.log(`[BENCHMARK] A* Pathfinding (0,0 to 20,20): ${dt.toFixed(3)}ms, pathLength=${result.path.length}, visited=${result.nodesVisited}`);
    expect(result.found).toBe(true);
    expect(dt).toBeLessThan(5);
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

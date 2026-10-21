import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// If not running with --expose-gc, re-spawn with --expose-gc for accurate GC measurement
if (typeof globalThis.gc !== 'function' && !process.env.CHILD_BENCHMARK) {
  const currentFile = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, ['--expose-gc', currentFile], {
    stdio: 'inherit',
    env: { ...process.env, CHILD_BENCHMARK: 'true' },
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  runBenchmark();
}

async function runBenchmark() {
  const { createServer } = await import('vite');

  const viteServer = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { SquareTopology } = await viteServer.ssrLoadModule('./src/core/topology/SquareTopology.ts');
    const { ChunkManager } = await viteServer.ssrLoadModule('./src/core/procedural/ChunkManager.ts');

    const square = new SquareTopology({ width: null, height: null });

    // Step 1: Baseline Stabilization
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
      globalThis.gc();
    }
    const baselineHeapBytes = process.memoryUsage().heapUsed;
    const baselineHeapMb = baselineHeapBytes / (1024 * 1024);

    // Step 2: Metric 1 — 10,240 cells actively retained
    const chunkManager = new ChunkManager(square, {
      seed: 'isolated-memory-benchmark-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    const retainedChunks = [];
    for (let cx = 0; cx < 8; cx++) {
      for (let cy = 0; cy < 5; cy++) {
        retainedChunks.push(chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy }));
      }
    }

    const totalCells = retainedChunks.reduce((sum, c) => sum + Object.keys(c.cells).length, 0);
    const peakHeapBytes = process.memoryUsage().heapUsed;
    const peakHeapMb = peakHeapBytes / (1024 * 1024);
    const incrementalDeltaMb = (peakHeapBytes - baselineHeapBytes) / (1024 * 1024);

    // Step 3: Metric 2 — Memory post-unload with documented GC
    retainedChunks.length = 0;
    chunkManager.clear();

    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
      globalThis.gc();
    }
    const postUnloadHeapBytes = process.memoryUsage().heapUsed;
    const postUnloadHeapMb = postUnloadHeapBytes / (1024 * 1024);
    const retainedDeltaMb = (postUnloadHeapBytes - baselineHeapBytes) / (1024 * 1024);

    // Step 4: Metric 3 — Multi-cycle trend without clamping (10 cycles)
    const cycleDeltas = [];
    let prevCycleHeap = process.memoryUsage().heapUsed;

    for (let cycle = 1; cycle <= 10; cycle++) {
      const cycleChunks = [];
      for (let i = 0; i < 20; i++) {
        cycleChunks.push(
          chunkManager.getOrGenerateChunk({ chunkX: (cycle * 20 + i) % 100, chunkY: cycle })
        );
      }
      cycleChunks.length = 0;
      chunkManager.clear();
      if (typeof globalThis.gc === 'function') {
        globalThis.gc();
      }
      const currentHeap = process.memoryUsage().heapUsed;
      const stepDeltaMb = (currentHeap - prevCycleHeap) / (1024 * 1024);
      cycleDeltas.push(stepDeltaMb);
      prevCycleHeap = currentHeap;
    }

    const avgCycleDriftMb =
      cycleDeltas.reduce((acc, d) => acc + d, 0) / cycleDeltas.length;

    const results = {
      specTarget: 'RNF-03 (< 40.0 MB for 10,000 cells)',
      gcAvailable: typeof globalThis.gc === 'function',
      cellsGenerated: totalCells,
      chunksLoaded: 40,
      baselineHeapMb: Number(baselineHeapMb.toFixed(3)),
      peakHeapMb: Number(peakHeapMb.toFixed(3)),
      rawIncrementalDeltaMb: Number(incrementalDeltaMb.toFixed(3)),
      postUnloadHeapMb: Number(postUnloadHeapMb.toFixed(3)),
      rawRetainedDeltaMb: Number(retainedDeltaMb.toFixed(3)),
      multiCycleCount: 10,
      multiCycleDeltasMb: cycleDeltas.map((d) => Number(d.toFixed(3))),
      averageCycleDriftMb: Number(avgCycleDriftMb.toFixed(3)),
      status: incrementalDeltaMb < 40.0 ? 'PASS' : 'FAIL',
    };

    console.log('\n======================================================');
    console.log('   ISOLATED PROCEDURAL GRID MEMORY BENCHMARK (RNF-03) ');
    console.log('======================================================');
    console.log(`GC Enabled:             ${results.gcAvailable ? 'YES (explicit via --expose-gc)' : 'NO'}`);
    console.log(`Active Cells Retained:  ${results.cellsGenerated} cells across 40 macro-chunks`);
    console.log(`Baseline Heap:          ${results.baselineHeapMb.toFixed(2)} MB`);
    console.log(`Peak Heap (Loaded):     ${results.peakHeapMb.toFixed(2)} MB`);
    console.log(`Raw Incremental Delta:  ${results.rawIncrementalDeltaMb >= 0 ? '+' : ''}${results.rawIncrementalDeltaMb.toFixed(2)} MB (Spec Limit: < 40.00 MB)`);
    console.log(`Post-Unload Heap (GC):  ${results.postUnloadHeapMb.toFixed(2)} MB`);
    console.log(`Raw Retained Delta:     ${results.rawRetainedDeltaMb >= 0 ? '+' : ''}${results.rawRetainedDeltaMb.toFixed(2)} MB`);
    console.log(`10-Cycle Avg Drift:     ${results.averageCycleDriftMb >= 0 ? '+' : ''}${results.averageCycleDriftMb.toFixed(4)} MB / cycle`);
    console.log(`Verdict:                ${results.status}`);
    console.log('======================================================\n');

    if (results.status !== 'PASS') {
      process.exitCode = 1;
    }
  } finally {
    await viteServer.close();
  }
}

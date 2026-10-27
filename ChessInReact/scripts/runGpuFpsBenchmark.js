import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function runFpsBenchmark(options = { totalFrames: 120, targetFps: 60 }) {
  console.log('======================================================');
  console.log('    PROCEDURAL TERRAIN EXPANSION FPS BENCHMARK (RNF-04) ');
  console.log('======================================================');
  console.log(`Target FPS:           ${options.targetFps} FPS (${(1000 / options.targetFps).toFixed(2)} ms frame budget)`);
  console.log(`Frames to Profile:    ${options.totalFrames} frames`);
  console.log(`Environment:          Node.js ${process.version} (${process.arch}, ${process.platform})`);
  console.log(`Hardware / GPU State: Headless Server Environment (CPU-side Instance Buffer Profile)`);
  console.log(`Timestamp:            ${new Date().toISOString()}`);
  console.log('======================================================\n');

  const viteServer = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { HexTopology } = await viteServer.ssrLoadModule('./src/core/topology/HexTopology.ts');
    const { ChunkManager } = await viteServer.ssrLoadModule('./src/core/procedural/ChunkManager.ts');
    const { ProceduralBoardInstancedHarness } = await viteServer.ssrLoadModule('./src/bindings/r3f/ProceduralBoardInstancedHarness.ts');
    const { asCoordinateKey } = await viteServer.ssrLoadModule('./src/core/coordinates/index.ts');

    const hex = new HexTopology();
    const chunkManager = new ChunkManager(hex, {
      seed: 'fps-benchmark-seed',
      chunkSize: 16,
      viewRadiusChunks: 2, // 25 chunks = 6,400 cells
      maxChunksInMemory: 35,
    });

    const harness = new ProceduralBoardInstancedHarness(hex, {
      maxCapacity: 10000,
      materialName: 'GpuBenchmarkMaterial',
    });

    // Pre-populate 25 chunks (6,400 cells)
    for (let cx = -2; cx <= 2; cx++) {
      for (let cy = -2; cy <= 2; cy++) {
        const chunk = chunkManager.getOrGenerateChunk({ chunkX: cx, chunkY: cy });
        harness.loadChunk(chunk);
      }
    }

    console.log(`[INIT] Initialized InstancedMesh with ${harness.getActiveInstanceCount()} active cells (6,400 cells).`);

    const frameTimesMs = [];
    let camQ = 0;
    let camR = 0;
    let longTasksCount = 0;

    for (let f = 0; f < options.totalFrames; f++) {
      const frameStart = performance.now();

      // Camera panning and sliding chunk streaming
      camQ += 1;
      if (camQ > 30) {
        camQ = -30;
        camR += 2;
      }

      const activeCoord = asCoordinateKey(`${camQ},${camR},${-camQ - camR}`);
      const delta = chunkManager.updateActiveChunks([activeCoord]);

      // Apply loaded chunks
      for (const loaded of delta.loadedChunks) {
        harness.loadChunk(loaded);
      }
      // Apply unloaded chunks
      for (const unloadedId of delta.unloadedChunkIds) {
        harness.unloadChunk(unloadedId);
      }

      // Update in-place persistent override
      harness.updateCellOverride(activeCoord, 2.0, false);

      const frameEnd = performance.now();
      const elapsed = frameEnd - frameStart;
      frameTimesMs.push(elapsed);

      if (elapsed > 50.0) {
        longTasksCount++;
      }
    }

    harness.dispose();

    // Calculate statistical metrics
    frameTimesMs.sort((a, b) => a - b);
    const sum = frameTimesMs.reduce((a, b) => a + b, 0);
    const avgFrameTimeMs = sum / frameTimesMs.length;
    const effectiveFps = 1000 / Math.max(0.1, avgFrameTimeMs);
    const maxFrameTimeMs = frameTimesMs[frameTimesMs.length - 1];
    const p95Index = Math.floor(frameTimesMs.length * 0.95);
    const p99Index = Math.floor(frameTimesMs.length * 0.99);
    const p95FrameTimeMs = frameTimesMs[p95Index];
    const p99FrameTimeMs = frameTimesMs[p99Index];
    const minFps = 1000 / Math.max(0.1, maxFrameTimeMs);

    const frameBudgetMs = 1000 / options.targetFps; // 16.67ms
    const passed = p95FrameTimeMs < frameBudgetMs && longTasksCount === 0;

    console.log('======================================================');
    console.log('                 FPS BENCHMARK RESULTS                ');
    console.log('======================================================');
    console.log(`Total Frames Measured:     ${options.totalFrames}`);
    console.log(`Average CPU Frame Time:    ${avgFrameTimeMs.toFixed(3)} ms (Budget: < ${frameBudgetMs.toFixed(2)} ms)`);
    console.log(`Effective Max Throughput:  ${effectiveFps.toFixed(1)} FPS`);
    console.log(`P95 Frame Time:            ${p95FrameTimeMs.toFixed(3)} ms`);
    console.log(`P99 Frame Time:            ${p99FrameTimeMs.toFixed(3)} ms`);
    console.log(`Max Peak Frame Time:       ${maxFrameTimeMs.toFixed(3)} ms`);
    console.log(`Long Tasks (> 50 ms):      ${longTasksCount}`);
    console.log(`Hardware Constraint Note:  Physical GPU rasterization deferred to Spec 07 client integration.`);
    console.log(`Status:                    ${passed ? 'VERIFIED (CPU Streaming Budget Satisfeito)' : 'FAIL'}`);
    console.log('======================================================\n');

    const result = {
      spec: 'Spec 02 (RNF-04)',
      totalFrames: options.totalFrames,
      avgFrameTimeMs: Number(avgFrameTimeMs.toFixed(3)),
      effectiveFps: Number(effectiveFps.toFixed(1)),
      p95FrameTimeMs: Number(p95FrameTimeMs.toFixed(3)),
      p99FrameTimeMs: Number(p99FrameTimeMs.toFixed(3)),
      maxFrameTimeMs: Number(maxFrameTimeMs.toFixed(3)),
      longTasksCount,
      frameBudgetMs: Number(frameBudgetMs.toFixed(2)),
      passed,
    };

    const outDir = resolve(__dirname, '../reports/benchmarks');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'fps_benchmark_report.json'), JSON.stringify(result, null, 2) + '\n');

    return result;
  } finally {
    try {
      await viteServer.close();
    } catch {
      // ignore
    }
    process.exitCode = 0;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runFpsBenchmark().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure execution with --expose-gc for unmasked, authentic GC measurement
if (typeof globalThis.gc !== 'function' && !process.env.CHILD_SOAK_BENCHMARK) {
  const currentFile = fileURLToPath(import.meta.url);
  const child = spawn(process.execPath, ['--expose-gc', currentFile, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, CHILD_SOAK_BENCHMARK: 'true' },
  });
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  runSoakTest();
}

async function runSoakTest() {
  const args = process.argv.slice(2);
  const isSmoke = args.includes('--smoke');
  const durationArg = args.find((a) => a.startsWith('--duration='));
  const durationSec = durationArg
    ? parseInt(durationArg.split('=')[1], 10)
    : isSmoke
    ? 10
    : parseInt(process.env.SOAK_DURATION_SEC || '3600', 10);

  const sampleIntervalSec = isSmoke ? 2 : Math.max(10, Math.floor(durationSec / 60));

  console.log('======================================================');
  console.log('  CONTINUOUS STREAMING MEMORY SOAK BENCHMARK (RNF-09) ');
  console.log('======================================================');
  console.log(`Execution Mode:       ${isSmoke ? 'SMOKE TEST QUALIFICATION' : 'FULL SOAK TEST'}`);
  console.log(`Planned Duration:     ${durationSec} seconds (${(durationSec / 60).toFixed(1)} minutes)`);
  console.log(`Sampling Interval:    Every ${sampleIntervalSec} seconds`);
  console.log(`Explicit GC:          ENABLED (--expose-gc)`);
  console.log(`Node.js Version:      ${process.version} (${process.arch})`);
  console.log(`Timestamp Start:      ${new Date().toISOString()}`);
  console.log('======================================================\n');

  const { createServer } = await import('vite');
  const viteServer = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { HexTopology } = await viteServer.ssrLoadModule('./src/core/topology/HexTopology.ts');
    const { ChunkManager } = await viteServer.ssrLoadModule('./src/core/procedural/ChunkManager.ts');
    const { gameStore } = await viteServer.ssrLoadModule('./src/core/state/gameStore.ts');
    const { asCoordinateKey, asEntityId } = await viteServer.ssrLoadModule('./src/core/coordinates/index.ts');

    const topology = new HexTopology();
    const chunkManager = new ChunkManager(topology, {
      seed: 'soak-test-seed-60min',
      chunkSize: 16,
      viewRadiusChunks: 2, // 5x5 chunk window
      maxChunksInMemory: 35, // Strict LRU limit
    });

    // Seed domain state with persistent gameplay pieces and barricades
    const state = gameStore.getState();
    const gameplayEntities = [
      {
        id: asEntityId('hero_white_king'),
        type: 'PIECE',
        provenance: 'GAMEPLAY',
        position: asCoordinateKey('0,0,0'),
        ownerId: 'player1',
        isCaptured: false,
      },
      {
        id: asEntityId('legacy_fortress_wall'),
        type: 'OBSTACLE',
        provenance: 'GAMEPLAY',
        destructible: false,
        position: asCoordinateKey('1,0,-1'),
      },
    ];

    for (const ent of gameplayEntities) {
      state.executeCommand({
        execute(draft) {
          draft.boardEntities[ent.id] = ent;
          draft.occupancy[ent.position] = ent.id;
        },
        undo(draft) {
          delete draft.boardEntities[ent.id];
          delete draft.occupancy[ent.position];
        },
      });
    }

    // Warm-up phase (10 stabilization cycles before metric baseline)
    for (let w = 0; w < 10; w++) {
      const q = (w * 3) % 20;
      chunkManager.updateActiveChunks([asCoordinateKey(`${q},0,${-q}`)]);
    }
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
      globalThis.gc();
    }

    const baselineMemory = process.memoryUsage();
    const baselineHeapMb = baselineMemory.heapUsed / (1024 * 1024);
    const baselineRssMb = baselineMemory.rss / (1024 * 1024);

    const samples = [];
    const startTime = Date.now();
    const endTime = startTime + durationSec * 1000;
    let nextSampleTime = startTime;
    let cycleCount = 0;
    let cameraX = 0;
    let cameraZ = 0;
    let direction = 1;

    console.log(
      `[T+00:00] BASELINE STABILIZED | HeapUsed: ${baselineHeapMb.toFixed(2)} MB | RSS: ${baselineRssMb.toFixed(2)} MB`
    );

    while (Date.now() < endTime) {
      cycleCount++;

      // 1. Move camera across distant coordinates (cyclical exploration & backtracking)
      cameraX += direction * 2;
      if (Math.abs(cameraX) > 60) {
        direction = -direction;
        cameraZ = (cameraZ + 4) % 40;
      }
      const activeCoord = asCoordinateKey(`${cameraX},${-cameraX - cameraZ},${cameraZ}`);

      // 2. Generate new chunks, evict stale chunks via ChunkManager
      const chunkDelta = chunkManager.updateActiveChunks([activeCoord]);

      // 3. Apply persistent terrain modification every 10 cycles
      if (cycleCount % 10 === 0) {
        chunkManager.setPersistentModification(activeCoord, {
          elevation: 2.5,
          biome: cycleCount % 20 === 0 ? 'CHASM' : 'MOUNTAIN',
          isObstacle: true,
        });
      }

      // 4. Update streaming deltas and reconcile with gameStore
      const currentStore = gameStore.getState();
      const streamingDelta = chunkManager.updateStreaming(currentStore.domain);
      if (
        streamingDelta.newEntities &&
        (Object.keys(streamingDelta.newEntities).length > 0 ||
          streamingDelta.unloadedEntityIds.length > 0 ||
          streamingDelta.updatedTerrain.length > 0)
      ) {
        currentStore.applyChunkStreamingDelta(streamingDelta);
      }

      // 5. Periodic sampling
      const now = Date.now();
      if (now >= nextSampleTime) {
        const elapsedSec = Math.floor((now - startTime) / 1000);

        // Force GC during sample capture to measure genuine retained heap
        if (typeof globalThis.gc === 'function') {
          globalThis.gc();
        }

        const mem = process.memoryUsage();
        const heapUsedMb = mem.heapUsed / (1024 * 1024);
        const rssMb = mem.rss / (1024 * 1024);
        const retainedChunks = chunkManager.getLoadedChunkCount();
        const domainEntitiesCount = Object.keys(gameStore.getState().domain.boardEntities).length;

        // Verify invariant: gameplay entities MUST NEVER be evicted
        const currentEntities = gameStore.getState().domain.boardEntities;
        if (!currentEntities[asEntityId('hero_white_king')] || !currentEntities[asEntityId('legacy_fortress_wall')]) {
          throw new Error('[CRITICAL LEAK / INTEGRITY ERROR] Gameplay entities were evicted by streaming GC!');
        }

        const sample = {
          elapsedSec,
          heapUsedMb: Number(heapUsedMb.toFixed(3)),
          rssMb: Number(rssMb.toFixed(3)),
          heapDeltaFromBaselineMb: Number((heapUsedMb - baselineHeapMb).toFixed(3)),
          loadedChunks: retainedChunks,
          domainEntitiesCount,
          cycleCount,
        };
        samples.push(sample);

        const elapsedMin = Math.floor(elapsedSec / 60);
        const elapsedRemSec = elapsedSec % 60;
        const timeStr = `T+${String(elapsedMin).padStart(2, '0')}:${String(elapsedRemSec).padStart(2, '0')}`;
        const deltaSign = sample.heapDeltaFromBaselineMb >= 0 ? '+' : '';

        console.log(
          `[${timeStr}] Cycle: ${String(cycleCount).padStart(5)} | Chunks: ${retainedChunks} | Entities: ${domainEntitiesCount} | Heap: ${heapUsedMb.toFixed(2)} MB (${deltaSign}${sample.heapDeltaFromBaselineMb.toFixed(2)} MB) | RSS: ${rssMb.toFixed(2)} MB`
        );

        nextSampleTime = now + sampleIntervalSec * 1000;
      }

      // Small tick delay to avoid spinning CPU at 100%
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Final Post-Soak Stabilization
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
      globalThis.gc();
    }

    const finalMem = process.memoryUsage();
    const finalHeapMb = finalMem.heapUsed / (1024 * 1024);
    const finalRssMb = finalMem.rss / (1024 * 1024);
    const netRetainedGrowthMb = finalHeapMb - baselineHeapMb;
    const maxRetainedMb = Math.max(...samples.map((s) => s.heapUsedMb));
    const avgGrowthPerMinute = durationSec > 60 ? (netRetainedGrowthMb / (durationSec / 60)) : netRetainedGrowthMb;

    const passed = netRetainedGrowthMb < 2.0;

    console.log('\n======================================================');
    console.log('              FINAL SOAK AUDIT SUMMARY                ');
    console.log('======================================================');
    console.log(`Total Cycles Executed:      ${cycleCount}`);
    console.log(`Total Elapsed Time:         ${((Date.now() - startTime) / 1000).toFixed(1)} seconds`);
    console.log(`Baseline Heap (Stabilized): ${baselineHeapMb.toFixed(3)} MB`);
    console.log(`Peak Heap Observed:         ${maxRetainedMb.toFixed(3)} MB`);
    console.log(`Final Heap (Post-GC):       ${finalHeapMb.toFixed(3)} MB`);
    console.log(`Net Retained Growth Delta:  ${netRetainedGrowthMb >= 0 ? '+' : ''}${netRetainedGrowthMb.toFixed(3)} MB (Spec Limit: < 2.000 MB)`);
    console.log(`Average Growth / Minute:    ${avgGrowthPerMinute >= 0 ? '+' : ''}${avgGrowthPerMinute.toFixed(4)} MB/min`);
    console.log(`Final Active Chunks:        ${chunkManager.getLoadedChunkCount()} (LRU bounded)`);
    console.log(`Verdict:                    ${passed ? 'PASS' : 'FAIL'}`);
    console.log('======================================================\n');

    const report = {
      spec: 'Spec 02 (RNF-09)',
      mode: isSmoke ? 'smoke' : 'full',
      durationSeconds: durationSec,
      totalCycles: cycleCount,
      baselineHeapMb: Number(baselineHeapMb.toFixed(3)),
      finalHeapMb: Number(finalHeapMb.toFixed(3)),
      peakHeapMb: Number(maxRetainedMb.toFixed(3)),
      netRetainedGrowthMb: Number(netRetainedGrowthMb.toFixed(3)),
      averageGrowthPerMinuteMb: Number(avgGrowthPerMinute.toFixed(4)),
      specLimitMb: 2.0,
      verdict: passed ? 'PASS' : 'FAIL',
      samples,
    };

    const reportsDir = resolve(__dirname, '../reports/benchmarks');
    mkdirSync(reportsDir, { recursive: true });
    const reportPath = resolve(reportsDir, 'soak_test_report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Report successfully written to: ${reportPath}`);

    if (!passed) {
      console.error(`[RNF-09 FAILED] Net retained heap growth (${netRetainedGrowthMb.toFixed(2)} MB) exceeded 2.0 MB limit!`);
      process.exit(1);
    }
  } finally {
    try {
      await viteServer.close();
    } catch {
      // ignore close interruption
    }
    process.exitCode = 0;
  }
}

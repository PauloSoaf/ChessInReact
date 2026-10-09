import { performance } from 'node:perf_hooks';
import { asCoordinateKey, asEntityId, createSquareCoord, SquareCodec } from '../coordinates';
import { EntityManager } from '../entities/EntityManager';
import { IPieceEntity } from '../entities/types';
import { serializeStateForWorker } from '../serialization/FlatArraySerializer';
import { SnapshotSerializer } from '../serialization/SnapshotSerializer';
import { createDefaultDomainState } from '../state/initialState';
import { MovePieceCommand } from '../commands/MovePieceCommand';
import { HistoryManager } from '../history/HistoryManager';
import { IDomainState } from '../state/gameState';

export interface BenchmarkMetrics {
  entityCount: number;
  sampleCount: number;
  initTimeMs: number;
  initTimeP95Ms: number;
  lookupByIdTimeUs: number;
  lookupByIdP95Us: number;
  lookupByCoordTimeUs: number;
  lookupByCoordP95Us: number;
  moveEntityTimeUs: number;
  moveEntityP95Us: number;
  dispatchMoveWithHistoryMs: number;
  dispatchMoveWithHistoryP95Ms: number;
  snapshotJsonMs: number;
  snapshotJsonP95Ms: number;
  serializationInt32Ms: number;
  serializationInt32P95Ms: number;
  serializationJsonMs: number;
  serializationJsonP95Ms: number;
  serializationSpeedupFactor: number;
}

interface SingleRunMetrics {
  initTimeMs: number;
  lookupByIdTimeUs: number;
  lookupByCoordTimeUs: number;
  moveEntityTimeUs: number;
  dispatchMoveWithHistoryMs: number;
  snapshotJsonMs: number;
  serializationInt32Ms: number;
  serializationJsonMs: number;
}

function computeMedianAndP95(samples: number[]): { median: number; p95: number } {
  if (samples.length === 0) return { median: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  const p95 = sorted[p95Idx];
  return {
    median: Number(median.toFixed(3)),
    p95: Number(p95.toFixed(3)),
  };
}

function generateBenchmarkEntities(count: number): {
  entities: IPieceEntity[];
  domain: IDomainState;
} {
  const domain = createDefaultDomainState(`bench-${count}`);
  const entities: IPieceEntity[] = new Array(count);
  const gridSize = Math.ceil(Math.sqrt(count));

  for (let i = 0; i < count; i++) {
    const x = i % gridSize;
    const y = Math.floor(i / gridSize);
    const pos = SquareCodec.encode(createSquareCoord(x, y));
    const id = asEntityId(`bench-p-${i}`);

    const piece: IPieceEntity = {
      id,
      type: 'PIECE',
      ownerId: i % 2 === 0 ? 'P1' : 'P2',
      variantId: 'PAWN',
      position: pos,
      hasMoved: false,
      isCaptured: false,
    };

    entities[i] = piece;
    domain.boardEntities[id] = piece;
    domain.occupancy[pos] = id;
  }

  return { entities, domain };
}

function executeSingleRun(count: number): SingleRunMetrics {
  // 1. Init
  const t0 = performance.now();
  const { entities, domain } = generateBenchmarkEntities(count);
  const manager = new EntityManager(entities);
  const initTimeMs = performance.now() - t0;

  // 2. Lookup by ID
  const lookupIterations = 10000;
  const tLookupId0 = performance.now();
  for (let i = 0; i < lookupIterations; i++) {
    const targetIdx = i % count;
    manager.getEntity(entities[targetIdx].id);
  }
  const lookupByIdTimeUs = ((performance.now() - tLookupId0) / lookupIterations) * 1000;

  // 3. Lookup by coordinate
  const tLookupCoord0 = performance.now();
  for (let i = 0; i < lookupIterations; i++) {
    const targetIdx = i % count;
    manager.getOccupant(entities[targetIdx].position);
  }
  const lookupByCoordTimeUs = ((performance.now() - tLookupCoord0) / lookupIterations) * 1000;

  // 4. Move entity
  const moveIterations = Math.min(count, 1000);
  const tMove0 = performance.now();
  for (let i = 0; i < moveIterations; i++) {
    const piece = entities[i];
    const newPos = asCoordinateKey(`99999,${i}`);
    manager.moveEntity(piece.id, newPos);
    manager.moveEntity(piece.id, piece.position);
  }
  const moveEntityTimeUs = ((performance.now() - tMove0) / (moveIterations * 2)) * 1000;

  // 5. Command dispatch with history
  const history = new HistoryManager();
  const testPiece = entities[0];
  const originalPos = testPiece.position;
  const targetPos = asCoordinateKey('8888,8888');

  const cmd = new MovePieceCommand(testPiece.id, originalPos, targetPos, testPiece.ownerId);
  const tDispatch0 = performance.now();
  history.execute(cmd, domain);
  const dispatchMoveWithHistoryMs = performance.now() - tDispatch0;
  history.undo(domain);

  // 6. Snapshot serialization
  const tSnapshot0 = performance.now();
  SnapshotSerializer.serialize(domain);
  const snapshotJsonMs = performance.now() - tSnapshot0;

  // 7. Int32 binary serialization
  const tInt32 = performance.now();
  const workerSnapshot = serializeStateForWorker(domain);
  void workerSnapshot.buffer.byteLength;
  const serializationInt32Ms = performance.now() - tInt32;

  // 8. Raw JSON serialization
  const tJson = performance.now();
  JSON.stringify(domain);
  const serializationJsonMs = performance.now() - tJson;

  return {
    initTimeMs,
    lookupByIdTimeUs,
    lookupByCoordTimeUs,
    moveEntityTimeUs,
    dispatchMoveWithHistoryMs,
    snapshotJsonMs,
    serializationInt32Ms,
    serializationJsonMs,
  };
}

export function runScaleBenchmark(count: number): BenchmarkMetrics {
  const sampleCount = count >= 10000 ? 3 : count >= 1000 ? 5 : 10;

  // Warmup run
  executeSingleRun(Math.min(count, 500));

  const samples: SingleRunMetrics[] = [];
  for (let s = 0; s < sampleCount; s++) {
    samples.push(executeSingleRun(count));
  }

  const initStats = computeMedianAndP95(samples.map((s) => s.initTimeMs));
  const lookupIdStats = computeMedianAndP95(samples.map((s) => s.lookupByIdTimeUs));
  const lookupCoordStats = computeMedianAndP95(samples.map((s) => s.lookupByCoordTimeUs));
  const moveStats = computeMedianAndP95(samples.map((s) => s.moveEntityTimeUs));
  const dispatchStats = computeMedianAndP95(samples.map((s) => s.dispatchMoveWithHistoryMs));
  const snapshotStats = computeMedianAndP95(samples.map((s) => s.snapshotJsonMs));
  const int32Stats = computeMedianAndP95(samples.map((s) => s.serializationInt32Ms));
  const jsonStats = computeMedianAndP95(samples.map((s) => s.serializationJsonMs));

  const speedupFactor =
    int32Stats.median > 0 ? jsonStats.median / int32Stats.median : 1.0;

  return {
    entityCount: count,
    sampleCount,
    initTimeMs: initStats.median,
    initTimeP95Ms: initStats.p95,
    lookupByIdTimeUs: lookupIdStats.median,
    lookupByIdP95Us: lookupIdStats.p95,
    lookupByCoordTimeUs: lookupCoordStats.median,
    lookupByCoordP95Us: lookupCoordStats.p95,
    moveEntityTimeUs: moveStats.median,
    moveEntityP95Us: moveStats.p95,
    dispatchMoveWithHistoryMs: dispatchStats.median,
    dispatchMoveWithHistoryP95Ms: dispatchStats.p95,
    snapshotJsonMs: snapshotStats.median,
    snapshotJsonP95Ms: snapshotStats.p95,
    serializationInt32Ms: int32Stats.median,
    serializationInt32P95Ms: int32Stats.p95,
    serializationJsonMs: jsonStats.median,
    serializationJsonP95Ms: jsonStats.p95,
    serializationSpeedupFactor: Number(speedupFactor.toFixed(2)),
  };
}

export function runAllBenchmarks(): Record<string, BenchmarkMetrics> {
  const scales = [64, 1000, 4000, 10000];
  const results: Record<string, BenchmarkMetrics> = {};

  for (const scale of scales) {
    results[`${scale}_entities`] = runScaleBenchmark(scale);
  }

  return results;
}

// If run directly via node/tsx
if (typeof process !== 'undefined' && process.argv[1]?.includes('coreBenchmarks')) {
  console.log('=== CHESS IN REACT — CORE STATE BENCHMARK SUITE ===\n');
  const results = runAllBenchmarks();
  console.table(results);
}

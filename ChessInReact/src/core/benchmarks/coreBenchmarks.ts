import { performance } from 'node:perf_hooks';
import { asCoordinateKey, asEntityId, createSquareCoord, SquareCodec } from '../coordinates';
import { EntityManager } from '../entities/EntityManager';
import { IPieceEntity } from '../entities/types';
import { serializeStateForWorker } from '../serialization/FlatArraySerializer';
import { createDefaultDomainState } from '../state/initialState';
import { MovePieceCommand } from '../commands/MovePieceCommand';
import { HistoryManager } from '../history/HistoryManager';
import { IDomainState } from '../state/gameState';

export interface BenchmarkMetrics {
  entityCount: number;
  initTimeMs: number;
  lookupByIdTimeUs: number;
  lookupByCoordTimeUs: number;
  moveEntityTimeUs: number;
  dispatchMoveWithHistoryMs: number;
  serializationInt32Ms: number;
  serializationJsonMs: number;
  serializationSpeedupFactor: number;
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

export function runScaleBenchmark(count: number): BenchmarkMetrics {
  // 1. Measure initialization time
  const t0 = performance.now();
  const { entities, domain } = generateBenchmarkEntities(count);
  const manager = new EntityManager(entities);
  const initTimeMs = performance.now() - t0;

  // 2. Measure lookup by ID (10,000 lookups or proportional)
  const lookupIterations = 10000;
  const tLookupId0 = performance.now();
  for (let i = 0; i < lookupIterations; i++) {
    const targetIdx = i % count;
    manager.getEntity(entities[targetIdx].id);
  }
  const lookupByIdTimeUs = ((performance.now() - tLookupId0) / lookupIterations) * 1000;

  // 3. Measure spatial lookup by Coordinate
  const tLookupCoord0 = performance.now();
  for (let i = 0; i < lookupIterations; i++) {
    const targetIdx = i % count;
    manager.getOccupant(entities[targetIdx].position);
  }
  const lookupByCoordTimeUs = ((performance.now() - tLookupCoord0) / lookupIterations) * 1000;

  // 4. Measure atomic movement
  const moveIterations = Math.min(count, 1000);
  const tMove0 = performance.now();
  for (let i = 0; i < moveIterations; i++) {
    const piece = entities[i];
    const newPos = asCoordinateKey(`99999,${i}`);
    manager.moveEntity(piece.id, newPos);
    manager.moveEntity(piece.id, piece.position); // move back
  }
  const moveEntityTimeUs = ((performance.now() - tMove0) / (moveIterations * 2)) * 1000;

  // 5. Measure Command dispatch with History recording (< 1ms target in Spec 01 Seção 17.1)
  const history = new HistoryManager();
  const testPiece = entities[0];
  const originalPos = testPiece.position;
  const targetPos = asCoordinateKey('8888,8888');

  const cmd = new MovePieceCommand(testPiece.id, originalPos, targetPos, 'P1');
  const tDispatch0 = performance.now();
  history.execute(cmd, domain);
  const dispatchMoveWithHistoryMs = performance.now() - tDispatch0;
  // Revert back
  history.undo(domain);

  // 6. Measure FlatArray Int32 serialization vs JSON serialization
  const tInt32 = performance.now();
  const buffer = serializeStateForWorker(domain);
  void buffer.byteLength;
  const serializationInt32Ms = performance.now() - tInt32;

  const tJson = performance.now();
  JSON.stringify(domain);
  const serializationJsonMs = performance.now() - tJson;

  const serializationSpeedupFactor =
    serializationInt32Ms > 0 ? serializationJsonMs / serializationInt32Ms : 1.0;

  return {
    entityCount: count,
    initTimeMs: Number(initTimeMs.toFixed(3)),
    lookupByIdTimeUs: Number(lookupByIdTimeUs.toFixed(3)),
    lookupByCoordTimeUs: Number(lookupByCoordTimeUs.toFixed(3)),
    moveEntityTimeUs: Number(moveEntityTimeUs.toFixed(3)),
    dispatchMoveWithHistoryMs: Number(dispatchMoveWithHistoryMs.toFixed(4)),
    serializationInt32Ms: Number(serializationInt32Ms.toFixed(3)),
    serializationJsonMs: Number(serializationJsonMs.toFixed(3)),
    serializationSpeedupFactor: Number(serializationSpeedupFactor.toFixed(2)),
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

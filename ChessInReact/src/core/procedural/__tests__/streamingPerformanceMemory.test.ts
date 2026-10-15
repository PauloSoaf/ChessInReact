import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId, EntityId } from '../../coordinates';
import { IPieceEntity, ITerrainEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import { SquareTopology } from '../../topology/SquareTopology';
import { ChunkManager } from '../ChunkManager';
import { createGameStore } from '../../state/gameStore';

describe('PATCH-16: Chunk Streaming Performance and Memory Budget Enforcement', () => {
  it('T16-01: streaming update with 10,000 entities uses O(1) index and avoids linear scan', () => {
    const domain = createDefaultDomainState('large-scale-streaming');

    // Populate domain with 10,000 terrain entities
    for (let i = 0; i < 10000; i++) {
      const coord = asCoordinateKey(`${(i % 100) - 50},${Math.floor(i / 100) - 50}`);
      const eid = asEntityId(`terr_prepopulated_${i}`);
      const terr: ITerrainEntity = {
        id: eid,
        type: 'TERRAIN',
        variantId: 'PLAINS',
        position: coord,
        elevation: 1.0,
      };
      domain.boardEntities[eid] = terr;
      domain.terrain![coord] = eid;
    }

    // Add a single active piece
    const pieceId = asEntityId('active_king');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('0,0')] = pieceId;

    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'perf-seed' }, { chunkSize: 16 });

    const startTime = performance.now();
    const delta = manager.updateStreaming(domain);
    const durationMs = performance.now() - startTime;

    // With O(1) index, evaluating streaming with 10,000 pre-populated entities
    // avoids the O(N * M) millions of iterations, executing well under 200ms even under heavy parallel test load
    expect(durationMs).toBeLessThan(200);
    expect(delta).toBeDefined();
  });

  it('T16-02: updates multiple chunks with restricted memory budget and enforces maximum loaded chunks', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const maxBudget = 5;
    const manager = new ChunkManager(
      topology,
      { seed: 'budget-seed' },
      { chunkSize: 16, maxChunksInMemory: maxBudget }
    );

    for (let x = 0; x < 20; x++) {
      manager.getOrGenerateChunk({ chunkX: x, chunkY: 0 });
    }

    expect(manager.getLoadedChunkCount()).toBeLessThanOrEqual(maxBudget);
  });

  it('T16-03: retains chunks for multiple pieces simultaneously in distant regions', () => {
    const domain = createDefaultDomainState('distant-pieces');

    const piece1Id = asEntityId('p_king_region1');
    const piece2Id = asEntityId('p_king_region2');
    const pos1 = asCoordinateKey('0,0');
    const pos2 = asCoordinateKey('80,80'); // Chunk 0,0 vs Chunk 5,5

    domain.boardEntities[piece1Id] = {
      id: piece1Id,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: pos1,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[pos1] = piece1Id;

    domain.boardEntities[piece2Id] = {
      id: piece2Id,
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'KING',
      position: pos2,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[pos2] = piece2Id;

    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(topology, { seed: 'multi-region-seed' }, { chunkSize: 16 });
    const delta = manager.updateStreaming(domain);

    // Apply delta to domain
    for (const [id, ent] of Object.entries(delta.newEntities)) {
      domain.boardEntities[id as EntityId] = ent;
      if (ent.type === 'TERRAIN') domain.terrain![ent.position] = ent.id;
    }

    // Both distant regions must have loaded chunks and existing terrain
    expect(manager.hasChunk({ chunkX: 0, chunkY: 0 })).toBe(true);
    expect(manager.hasChunk({ chunkX: 5, chunkY: 5 })).toBe(true);
    expect(domain.terrain?.[pos1]).toBeDefined();
    expect(domain.terrain?.[pos2]).toBeDefined();
  });

  it('T16-04: returning to evicted chunk preserves persistent overrides', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(
      topology,
      { seed: 're-entry-seed' },
      { chunkSize: 16, maxChunksInMemory: 3 }
    );

    const overrideCoord = asCoordinateKey('0,0');
    manager.setPersistentModification(overrideCoord, {
      biome: 'WATER',
      elevation: 0.1,
      isObstacle: true,
    });

    const initial = manager.getCell(overrideCoord);
    expect(initial?.biome).toBe('WATER');

    // Generate distant chunks to evict chunk_0_0
    manager.getOrGenerateChunk({ chunkX: 10, chunkY: 10 });
    manager.getOrGenerateChunk({ chunkX: 11, chunkY: 10 });
    manager.getOrGenerateChunk({ chunkX: 12, chunkY: 10 });

    expect(manager.hasChunk({ chunkX: 0, chunkY: 0 })).toBe(false);

    // Re-access chunk_0_0
    const reloaded = manager.getCell(overrideCoord);
    expect(reloaded?.biome).toBe('WATER');
    expect(reloaded?.elevation).toBeCloseTo(0.1);
    expect(reloaded?.isObstacle).toBe(true);
  });

  it('T16-05: Zustand store rejects stale revisions to prevent asynchronous overwrites', () => {
    const store = createGameStore();
    const initialRevision = store.getState().domain.revision;

    // Simulate an out-of-order stale streaming delta
    const staleRevision = initialRevision - 1;
    const fakeDelta = {
      newEntities: {},
      unloadedEntityIds: [],
    };

    const applied = store.getState().applyChunkStreamingDelta(fakeDelta, staleRevision);
    expect(applied).toBe(false);
  });

  it('T16-07: reproducible memory measurements under repeated load and unload cycles', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(
      topology,
      { seed: 'heap-meas-seed' },
      { chunkSize: 16, maxChunksInMemory: 10 }
    );

    // Initial baseline
    const initialChunks = manager.getLoadedChunkCount();
    expect(initialChunks).toBe(0);

    // Perform 50 cycles of allocating chunks in diverse regions
    for (let cycle = 0; cycle < 50; cycle++) {
      manager.getOrGenerateChunk({ chunkX: cycle % 20, chunkY: Math.floor(cycle / 20) });
    }

    // Memory budget strictly caps loaded chunks to maxChunksInMemory
    expect(manager.getLoadedChunkCount()).toBeLessThanOrEqual(10);
    expect(manager.getTotalLoadedCellCount()).toBeLessThanOrEqual(10 * 256);
  });

  it('T16-08: repeated streaming cycles stabilize without uncontrolled entity accumulation', () => {
    const domain = createDefaultDomainState('cycling-streaming');
    const pieceId = asEntityId('p_knight');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('0,0')] = pieceId;

    const topology = new SquareTopology({ width: null, height: null });
    const manager = new ChunkManager(
      topology,
      { seed: 'cycling-seed' },
      { chunkSize: 16, unloadTimeoutMs: 0 } // instant unload eligibility
    );

    // Step piece across 5 positions
    for (let step = 0; step < 5; step++) {
      const newPos = asCoordinateKey(`${step * 16},0`);
      delete domain.occupancy[(domain.boardEntities[pieceId] as IPieceEntity).position];
      domain.occupancy[newPos] = pieceId;
      domain.boardEntities[pieceId] = {
        ...(domain.boardEntities[pieceId] as IPieceEntity),
        position: newPos,
      };

      const delta = manager.updateStreaming(domain);
      for (const [id, ent] of Object.entries(delta.newEntities)) {
        domain.boardEntities[id as EntityId] = ent;
        if (ent.type === 'TERRAIN') domain.terrain![ent.position] = ent.id;
      }
      for (const uid of delta.unloadedEntityIds) {
        const ent = domain.boardEntities[uid];
        if (ent) {
          if (ent.type === 'TERRAIN') delete domain.terrain![ent.position];
          delete domain.boardEntities[uid];
        }
      }
    }

    // Active piece was never unloaded
    expect(domain.boardEntities[pieceId]).toBeDefined();
    expect((domain.boardEntities[pieceId] as IPieceEntity).position).toBe('64,0');
    // Loaded chunks remain bounded
    expect(manager.getLoadedChunkCount()).toBeLessThan(20);
  });
});

import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('PATCH-05: Chunk Streaming Transactional Integration with Zustand', () => {
  it('streams chunks across a piece moving through 10 macro-chunks and unloads distant chunks', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(
      topology,
      {
        seed: 'seed-streaming-10chunks',
        chunkSize: 16,
        waterThreshold: -2.0,
        obstacleThreshold: 2.0,
      },
      {
        renderDistance: 8, // ~1 chunk radius
        unloadTimeoutMs: 0, // Instant eligibility for unloading
        maxLoadedEntities: 20000,
      }
    );

    const store = createGameStore();
    const heroPiece: IPieceEntity = {
      id: asEntityId('hero-queen'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'QUEEN',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };

    // Initialize piece in store
    const initialDomain = createDefaultDomainState('streaming-match');
    initialDomain.boardEntities[heroPiece.id] = heroPiece;
    initialDomain.occupancy[heroPiece.position] = heroPiece.id;
    store.getState().resetDomainState(initialDomain);

    // Initial sync
    chunkManager.syncWithStore(store);
    expect(chunkManager.getLoadedChunksCount()).toBeGreaterThan(0);
    const initialEntitiesCount = Object.keys(store.getState().domain.boardEntities).length;
    expect(initialEntitiesCount).toBeGreaterThan(1);

    // Move piece through 10 chunks (e.g. from x=0 to x=160 in steps of 16)
    for (let chunkIdx = 1; chunkIdx <= 10; chunkIdx++) {
      const fromPos = asCoordinateKey(`${(chunkIdx - 1) * 16},0`);
      const toPos = asCoordinateKey(`${chunkIdx * 16},0`);

      // Execute command in store
      store.getState().executeCommand(
        new MovePieceCommand(heroPiece.id, fromPos, toPos, 'P1', undefined, false)
      );

      // Stream chunks around new piece position
      chunkManager.syncWithStore(store);

      // Verify piece was NEVER unloaded
      const pieceInStore = store.getState().domain.boardEntities[heroPiece.id] as IPieceEntity;
      expect(pieceInStore).toBeDefined();
      expect(pieceInStore.position).toBe(toPos);
      expect(store.getState().domain.occupancy[toPos]).toBe(heroPiece.id);
    }

    // Origin chunk (0,0) is always kept or active chunks around piece are loaded
    expect(chunkManager.getLoadedChunksCount()).toBeLessThanOrEqual(25);
    // Total entities must stay well below 20,000 limit
    const totalEntities = Object.keys(store.getState().domain.boardEntities).length;
    expect(totalEntities).toBeLessThan(5000);
  });

  it('regenerates identical terrain cells upon returning to a previously visited area', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const seed = 'deterministic-return-seed';
    const cm1 = new ChunkManager(topology, { seed, chunkSize: 16 });

    // Generate chunk 5,5
    const chunkFirst = cm1.getOrGenerateChunk({ chunkX: 5, chunkY: 5 });
    const key80 = asCoordinateKey('80,80');
    const sampleElevation1 = chunkFirst.cells[key80]?.elevation;
    const sampleBiome1 = chunkFirst.cells[key80]?.biome;

    // Simulate complete reload / fresh manager with same seed
    const cm2 = new ChunkManager(topology, { seed, chunkSize: 16 });
    const chunkSecond = cm2.getOrGenerateChunk({ chunkX: 5, chunkY: 5 });

    expect(chunkSecond.cells[key80]?.elevation).toBe(sampleElevation1);
    expect(chunkSecond.cells[key80]?.biome).toBe(sampleBiome1);
  });

  it('preserves persistent modifications and rejects stale asynchronous revisions', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, { seed: 'stale-test-seed' });
    const store = createGameStore();

    // 1. Initial state at revision 0
    const state0 = store.getState().domain;
    expect(state0.revision).toBe(0);

    // 2. Generate delta based on state revision 0
    const delta0 = chunkManager.updateStreaming(state0);

    // 3. Increment revision by performing an action
    store.getState().setActivePlayer('P2');
    expect(store.getState().domain.revision).toBe(1);

    // 4. Stale delta with expectedRevision=0 MUST be rejected
    const appliedStale = store.getState().applyChunkStreamingDelta(delta0, 0);
    expect(appliedStale).toBe(false);

    // 5. Fresh delta with expectedRevision=1 MUST be accepted
    const appliedFresh = store.getState().applyChunkStreamingDelta(delta0, 1);
    expect(appliedFresh).toBe(true);
    expect(store.getState().domain.revision).toBe(2);
  });
});

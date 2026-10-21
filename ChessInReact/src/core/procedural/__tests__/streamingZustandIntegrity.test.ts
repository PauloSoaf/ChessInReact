import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity, ITerrainEntity } from '../../entities/types';
import { SquareTopology } from '../../topology/SquareTopology';
import { ChunkManager } from '../ChunkManager';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { MovePieceCommand } from '../../commands/MovePieceCommand';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { BiomeType } from '../types';

describe('ChunkManager, Zustand Store, and Snapshot Integrity Integration', () => {
  it('P0: procedural obstacles do not overwrite active piece occupancy and allow piece to move away', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(
      topology,
      { seed: 'obstacle-piece-coexistence' },
      { chunkSize: 16 }
    );
    const store = createGameStore();

    const piecePos = asCoordinateKey('4,4');
    const pieceId = asEntityId('p_knight_safe');
    const knightPiece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };

    const initialDomain = createDefaultDomainState('coexistence-match');
    initialDomain.boardEntities[pieceId] = knightPiece;
    initialDomain.occupancy[piecePos] = pieceId;
    store.getState().resetDomainState(initialDomain);

    // Override the coordinate occupied by the piece to CHASM (which normally turns into an OBSTACLE)
    chunkManager.setPersistentModification(piecePos, {
      biome: 'CHASM',
      isObstacle: true,
    });
    // Ensure destination coordinate is passable PLAINS
    const targetPos = asCoordinateKey('5,6');
    chunkManager.setPersistentModification(targetPos, {
      biome: 'PLAINS',
      isObstacle: false,
    });

    // Synchronize streaming with store
    const { applied } = chunkManager.syncWithStore(store);
    expect(applied).toBe(true);

    const domain = store.getState().domain;

    // Occupancy MUST remain exclusively assigned to the piece, never hijacked by an obstacle entity
    expect(domain.occupancy[piecePos]).toBe(pieceId);
    expect(domain.boardEntities[pieceId]).toBeDefined();

    // The CHASM at the piece coordinate is registered as impassable TERRAIN
    const terrainEntityId = domain.terrain?.[piecePos];
    expect(terrainEntityId).toBeDefined();
    const terrainEntity = domain.boardEntities[terrainEntityId!] as ITerrainEntity;
    expect(terrainEntity).toBeDefined();
    expect(terrainEntity.type).toBe('TERRAIN');
    expect(terrainEntity.variantId).toBe('CHASM');

    // The knight can still move away to an adjacent passable coordinate
    const moveCmd = new MovePieceCommand(pieceId, piecePos, targetPos, 'P1', undefined, false);
    store.getState().executeCommand(moveCmd);

    const updatedDomain = store.getState().domain;
    expect(updatedDomain.occupancy[piecePos]).toBeUndefined();
    expect(updatedDomain.occupancy[targetPos]).toBe(pieceId);
    expect((updatedDomain.boardEntities[pieceId] as IPieceEntity).position).toBe(targetPos);
  });

  it('P0: persistent terrain modification updates loaded tiles in store and MovePiece enforces impassability', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(
      topology,
      { seed: 'terrain-update-seed' },
      { chunkSize: 16 }
    );
    const store = createGameStore();

    const startPos = asCoordinateKey('2,2');
    const destPos = asCoordinateKey('2,3');
    const pieceId = asEntityId('p_rook_1');

    const rookPiece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: startPos,
      hasMoved: false,
      isCaptured: false,
    };

    const initialDomain = createDefaultDomainState('terrain-mod-match');
    initialDomain.boardEntities[pieceId] = rookPiece;
    initialDomain.occupancy[startPos] = pieceId;
    store.getState().resetDomainState(initialDomain);

    // Initial streaming sync loads normal terrain
    chunkManager.syncWithStore(store);

    const domainBeforeMod = store.getState().domain;
    const initialTerrainId = domainBeforeMod.terrain?.[destPos];
    expect(initialTerrainId).toBeDefined();

    // Modify already-loaded tile to WATER (impassable)
    chunkManager.setPersistentModification(destPos, {
      biome: 'WATER',
      isObstacle: true,
      elevation: 0.1,
    });

    // Synchronize again: delta must emit updatedTerrain replacing the loaded terrain entity
    const { delta, applied } = chunkManager.syncWithStore(store);
    expect(applied).toBe(true);
    expect(delta.updatedTerrain).toBeDefined();
    expect(delta.updatedTerrain!.length).toBeGreaterThan(0);
    expect(delta.updatedTerrain!.some((u) => u.previousId === initialTerrainId)).toBe(true);

    const domainAfterMod = store.getState().domain;
    const newTerrainId = domainAfterMod.terrain?.[destPos];
    expect(newTerrainId).toBeDefined();
    expect(newTerrainId).not.toBe(initialTerrainId);

    const newTerrain = domainAfterMod.boardEntities[newTerrainId!] as ITerrainEntity;
    expect(newTerrain.variantId).toBe('WATER');
    expect(domainAfterMod.boardEntities[initialTerrainId!]).toBeUndefined();

    // MovePieceCommand targeting destPos must be rejected because it is impassable WATER
    const invalidMove = new MovePieceCommand(pieceId, startPos, destPos, 'P1', undefined, false);
    expect(() => store.getState().executeCommand(invalidMove)).toThrow(/impassable terrain/);

    // SnapshotSerializer round-trips state with complete spatial integrity
    const serialized = SnapshotSerializer.serialize(domainAfterMod);
    const restored = SnapshotSerializer.deserialize(serialized);
    expect(restored.terrain?.[destPos]).toBe(newTerrainId);
    expect((restored.boardEntities[newTerrainId!] as ITerrainEntity).variantId).toBe('WATER');
  });

  it('P1: LRU eviction protects active piece chunks while unleading evicted distant entities from store', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const maxBudget = 3;
    const chunkManager = new ChunkManager(
      topology,
      { seed: 'lru-protection-seed' },
      { chunkSize: 16, maxChunksInMemory: maxBudget }
    );
    const store = createGameStore();

    const piecePos = asCoordinateKey('0,0'); // chunk_0_0
    const pieceId = asEntityId('p_hero_king');
    const kingPiece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };

    const initialDomain = createDefaultDomainState('lru-match');
    initialDomain.boardEntities[pieceId] = kingPiece;
    initialDomain.occupancy[piecePos] = pieceId;
    store.getState().resetDomainState(initialDomain);

    // Stream initial chunk around king
    chunkManager.syncWithStore(store);
    expect(chunkManager.hasChunk({ chunkX: 0, chunkY: 0 })).toBe(true);

    // Generate distant chunks to exceed cache capacity
    for (let c = 5; c < 15; c++) {
      chunkManager.getOrGenerateChunk({ chunkX: c, chunkY: c });
    }

    // Chunk_0_0 hosts an active piece and is protected from LRU eviction
    expect(chunkManager.hasChunk({ chunkX: 0, chunkY: 0 })).toBe(true);

    // Streaming sync unloads evicted distant chunks and ensures entities do not leak
    chunkManager.syncWithStore(store);

    const activePieceInStore = store.getState().domain.boardEntities[pieceId];
    expect(activePieceInStore).toBeDefined();
    expect(store.getState().domain.occupancy[piecePos]).toBe(pieceId);
  });

  it('P1: metadata persistence and biome validation enforce closed domain types and survive snapshot roundtrip', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, { seed: 'meta-val-seed' });
    const store = createGameStore();
    const coord = asCoordinateKey('3,3');

    // 1. Invalid biome string is rejected
    expect(() => {
      chunkManager.setPersistentModification(coord, {
        biome: 'INVALID_VOLCANO' as unknown as BiomeType,
      });
    }).toThrow(/Invalid biome/);

    // 2. Out-of-range elevation is rejected
    expect(() => {
      chunkManager.setPersistentModification(coord, {
        elevation: 99.0,
      });
    }).toThrow(/Invalid elevation/);

    // 3. Reserved metadata key is rejected
    expect(() => {
      chunkManager.setPersistentModification(coord, {
        metadata: {
          costMultiplier: 10,
        },
      });
    }).toThrow(/reserved by the terrain pipeline/);

    // 4. Valid custom metadata is accepted and propagated
    chunkManager.setPersistentModification(coord, {
      biome: 'FOREST',
      metadata: {
        questId: 'ancient_grove',
        manaDensity: 88,
      },
    });

    const cell = chunkManager.getCell(coord);
    expect(cell?.metadata?.questId).toBe('ancient_grove');
    expect(cell?.metadata?.manaDensity).toBe(88);

    // Sync to store
    chunkManager.syncWithStore(store);
    const domain = store.getState().domain;
    const terrainId = domain.terrain?.[coord];
    expect(terrainId).toBeDefined();
    const terrainEntity = domain.boardEntities[terrainId!] as ITerrainEntity;
    expect(terrainEntity.metadata?.questId).toBe('ancient_grove');
    expect(terrainEntity.metadata?.manaDensity).toBe(88);

    // Snapshot serialization & deserialization retains metadata cleanly
    const json = SnapshotSerializer.serialize(domain);
    const restored = SnapshotSerializer.deserialize(json);
    const restoredEntity = restored.boardEntities[terrainId!] as ITerrainEntity;
    expect(restoredEntity.metadata?.questId).toBe('ancient_grove');
    expect(restoredEntity.metadata?.manaDensity).toBe(88);
  });
});

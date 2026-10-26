import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IObstacleEntity, IPieceEntity, ITerrainEntity, isProceduralEntity } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { IChunkStreamingDelta } from '../types';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('Regression & Invariant Suite: PATCH-29 Streaming Provenance Consistency', () => {
  const square = new SquareTopology();

  const createPiece = (id: string, coord: string): IPieceEntity => ({
    id: asEntityId(id),
    type: 'PIECE',
    variantId: 'PAWN',
    ownerId: 'P1',
    position: asCoordinateKey(coord),
    hasMoved: false,
    isCaptured: false,
  });

  // =========================================================================
  // PATCH-29: Rejection of Ambiguous / Unannotated Obstacles in Streaming
  // =========================================================================
  it('T29-01: OBSTACLE without provenance, indestructible and without CHASM must be rejected by newEntities', () => {
    const store = createGameStore();
    const revBefore = store.getState().domain.revision;
    const wallId = asEntityId('legacy_fortress_01');
    const wallPos = asCoordinateKey('5,5');

    // Unannotated indestructible obstacle without CHASM metadata
    const legacyWallDelta: IChunkStreamingDelta = {
      newEntities: {
        [wallId]: {
          id: wallId,
          type: 'OBSTACLE',
          destructible: false,
          position: wallPos,
          metadata: { kind: 'STONE_RAMPART' },
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(legacyWallDelta);
    }).toThrow(/is not a valid procedural entity/);

    // Invariant: Zero mutation, revision unchanged, entity not admitted
    const domainAfter = store.getState().domain;
    expect(domainAfter.revision).toBe(revBefore);
    expect(domainAfter.boardEntities[wallId]).toBeUndefined();
    expect(domainAfter.occupancy[wallPos]).toBeUndefined();
  });

  it('T29-02: OBSTACLE without provenance, indestructible and without CHASM must be rejected by updatedTerrain', () => {
    const store = createGameStore();
    const initialTerrainId = asEntityId('terr_init_29');
    const coord = asCoordinateKey('5,5');

    // Setup an initial procedural terrain tile
    const initDelta: IChunkStreamingDelta = {
      newEntities: {
        [initialTerrainId]: {
          id: initialTerrainId,
          type: 'TERRAIN',
          provenance: 'PROCEDURAL',
          variantId: 'PLAINS',
          position: coord,
        } as ITerrainEntity,
      },
      unloadedEntityIds: [],
    };
    store.getState().applyChunkStreamingDelta(initDelta);

    const revBefore = store.getState().domain.revision;

    // Delta attempting to update terrain with an unannotated indestructible obstacle without CHASM
    const wallUpdateId = asEntityId('legacy_wall_update');
    const illegalUpdateDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: initialTerrainId,
          entity: {
            id: wallUpdateId,
            type: 'OBSTACLE',
            destructible: false,
            position: coord,
          } as IObstacleEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(illegalUpdateDelta);
    }).toThrow(/is not a valid procedural entity/);

    // Invariant: Zero mutation, initial terrain untouched
    const domainAfter = store.getState().domain;
    expect(domainAfter.revision).toBe(revBefore);
    expect(domainAfter.boardEntities[initialTerrainId]).toBeDefined();
    expect(domainAfter.terrain?.[coord]).toBe(initialTerrainId);
    expect(domainAfter.boardEntities[wallUpdateId]).toBeUndefined();
    expect(domainAfter.occupancy[coord]).toBeUndefined();
  });

  it('T29-03: OBSTACLE with explicit provenance PROCEDURAL must be accepted when structurally valid', () => {
    const store = createGameStore();
    const boulderId = asEntityId('proc_boulder_29');
    const coord = asCoordinateKey('6,6');

    const validProcDelta: IChunkStreamingDelta = {
      newEntities: {
        [boulderId]: {
          id: boulderId,
          type: 'OBSTACLE',
          provenance: 'PROCEDURAL',
          destructible: false,
          position: coord,
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    const applied = store.getState().applyChunkStreamingDelta(validProcDelta);
    expect(applied).toBe(true);

    const domain = store.getState().domain;
    expect(domain.boardEntities[boulderId]).toBeDefined();
    expect(domain.occupancy[coord]).toBe(boulderId);
    expect(isProceduralEntity(domain.boardEntities[boulderId]!)).toBe(true);
  });

  it('T29-04: legacy CHASM without provenance, with verifiable historical signature, must maintain compatibility and be accepted', () => {
    const store = createGameStore();
    const chasmId = asEntityId('terr_chasm_historical');
    const coord = asCoordinateKey('7,7');

    // Historical generator signature: destructible === false && metadata.biome === 'CHASM'
    const legacyChasmDelta: IChunkStreamingDelta = {
      newEntities: {
        [chasmId]: {
          id: chasmId,
          type: 'OBSTACLE',
          destructible: false,
          position: coord,
          metadata: {
            biome: 'CHASM',
            isObstacle: true,
            costMultiplier: 999.0,
          },
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    const applied = store.getState().applyChunkStreamingDelta(legacyChasmDelta);
    expect(applied).toBe(true);

    const domain = store.getState().domain;
    expect(domain.boardEntities[chasmId]).toBeDefined();
    expect(domain.occupancy[coord]).toBe(chasmId);
    expect(isProceduralEntity(domain.boardEntities[chasmId]!)).toBe(true);
  });

  it('T29-05: OBSTACLE with explicit provenance GAMEPLAY must be rejected', () => {
    const store = createGameStore();
    const revBefore = store.getState().domain.revision;
    const gpObstacleId = asEntityId('gp_bunker_29');
    const coord = asCoordinateKey('8,8');

    const illegalDelta: IChunkStreamingDelta = {
      newEntities: {
        [gpObstacleId]: {
          id: gpObstacleId,
          type: 'OBSTACLE',
          provenance: 'GAMEPLAY',
          destructible: false,
          position: coord,
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(illegalDelta);
    }).toThrow(/has GAMEPLAY provenance/);

    expect(store.getState().domain.revision).toBe(revBefore);
    expect(store.getState().domain.boardEntities[gpObstacleId]).toBeUndefined();
  });

  it('T29-06: mixed delta with one invalid operation must be rejected entirely; no entity or index may be altered', () => {
    const store = createGameStore();
    const revBefore = store.getState().domain.revision;
    const initialCount = Object.keys(store.getState().domain.boardEntities).length;

    const validT1 = asEntityId('valid_terrain_1');
    const validT2 = asEntityId('valid_terrain_2');
    const badObstacle = asEntityId('unannotated_wall_bad');

    const mixedDelta: IChunkStreamingDelta = {
      newEntities: {
        [validT1]: {
          id: validT1,
          type: 'TERRAIN',
          variantId: 'PLAINS',
          provenance: 'PROCEDURAL',
          position: asCoordinateKey('1,1'),
        } as ITerrainEntity,
        [validT2]: {
          id: validT2,
          type: 'TERRAIN',
          variantId: 'FOREST',
          provenance: 'PROCEDURAL',
          position: asCoordinateKey('1,2'),
        } as ITerrainEntity,
        [badObstacle]: {
          id: badObstacle,
          type: 'OBSTACLE',
          destructible: false,
          position: asCoordinateKey('1,3'),
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(mixedDelta);
    }).toThrow(/is not a valid procedural entity/);

    // Atomicity assertion: Zero mutation, revision unchanged, none of the valid entities persisted
    const domainAfter = store.getState().domain;
    expect(domainAfter.revision).toBe(revBefore);
    expect(Object.keys(domainAfter.boardEntities).length).toBe(initialCount);
    expect(domainAfter.boardEntities[validT1]).toBeUndefined();
    expect(domainAfter.boardEntities[validT2]).toBeUndefined();
    expect(domainAfter.boardEntities[badObstacle]).toBeUndefined();
    expect(domainAfter.terrain?.[asCoordinateKey('1,1')]).toBeUndefined();
    expect(domainAfter.terrain?.[asCoordinateKey('1,2')]).toBeUndefined();
    expect(domainAfter.occupancy[asCoordinateKey('1,3')]).toBeUndefined();
  });

  it('T29-07: an obstacle accepted by streaming must remain consistently procedural after snapshot, regeneration, and eviction', () => {
    const store = createGameStore();
    const piece = createPiece('w_scout_29', '4,4');
    store.getState().domain.boardEntities[piece.id] = piece;
    store.getState().domain.occupancy[piece.position] = piece.id;

    const chunkManager = new ChunkManager(
      square,
      { seed: 'patch29-t07' },
      {
        chunkSize: 4,
        renderDistance: 0,
        viewRadiusChunks: 0,
        unloadTimeoutMs: 100,
      }
    );

    // Stream procedural terrain around chunk (1,1)
    const initialSync = chunkManager.syncWithStore(store);
    expect(initialSync.applied).toBe(true);

    // Stream a valid procedural obstacle into chunk (1,1) at 4,5
    const procObsId = asEntityId('proc_rock_4_5');
    const procObsDelta: IChunkStreamingDelta = {
      newEntities: {
        [procObsId]: {
          id: procObsId,
          type: 'OBSTACLE',
          provenance: 'PROCEDURAL',
          destructible: false,
          position: asCoordinateKey('4,5'),
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };
    const procApplied = store.getState().applyChunkStreamingDelta(procObsDelta);
    expect(procApplied).toBe(true);

    const domainAfterStream = store.getState().domain;
    expect(domainAfterStream.boardEntities[procObsId]).toBeDefined();
    expect(isProceduralEntity(domainAfterStream.boardEntities[procObsId]!)).toBe(true);

    // Snapshot roundtrip
    const serialized = SnapshotSerializer.serialize(domainAfterStream);
    const restored = SnapshotSerializer.deserialize(serialized);
    expect(restored.boardEntities[procObsId]).toBeDefined();
    expect(isProceduralEntity(restored.boardEntities[procObsId]!)).toBe(true);

    // Move piece far away to chunk (4,4) at 16,16
    const moveCmd = new MovePieceCommand(piece.id, asCoordinateKey('4,4'), asCoordinateKey('16,16'), 'P1', undefined, false);
    store.getState().executeCommand(moveCmd);

    // Trigger eviction of chunk (1,1)
    const futureTime = Date.now() + 500;
    const evictDelta = chunkManager.updateStreaming(store.getState().domain, futureTime);

    // Procedural obstacle at 4,5 is procedural and should be evicted
    expect(evictDelta.unloadedEntityIds).toContain(procObsId);
    expect(evictDelta.unloadedEntityIds).not.toContain(piece.id);

    const evictApplied = store.getState().applyChunkStreamingDelta(evictDelta);
    expect(evictApplied).toBe(true);

    expect(store.getState().domain.boardEntities[procObsId]).toBeUndefined();
    expect(store.getState().domain.occupancy[asCoordinateKey('4,5')]).toBeUndefined();
  });

  it('T29-08: a legacy indestructible wall already stored must continue protected against procedural eviction/unloading', () => {
    const initialDomain = createDefaultDomainState();
    const piece = createPiece('w_guard_29', '4,4');
    // Pre-existing legacy indestructible wall stored in domain
    const storedWall: IObstacleEntity = {
      id: asEntityId('stored_ancient_fortress'),
      type: 'OBSTACLE',
      destructible: false,
      position: asCoordinateKey('5,5'),
      metadata: { structure: 'FORTRESS', builder: 'LEGACY_VARIANT' },
    };

    initialDomain.boardEntities[piece.id] = piece;
    initialDomain.occupancy[piece.position] = piece.id;
    initialDomain.boardEntities[storedWall.id] = storedWall;
    initialDomain.occupancy[storedWall.position] = storedWall.id;

    const store = createGameStore(initialDomain);
    const chunkManager = new ChunkManager(
      square,
      { seed: 'patch29-t08' },
      {
        chunkSize: 4,
        renderDistance: 0,
        viewRadiusChunks: 0,
        unloadTimeoutMs: 100,
      }
    );

    // Stream initial chunk
    const initSync = chunkManager.syncWithStore(store);
    expect(initSync.applied).toBe(true);

    // Move piece far away to chunk (4,4)
    const moveCmd = new MovePieceCommand(piece.id, asCoordinateKey('4,4'), asCoordinateKey('16,16'), 'P1', undefined, false);
    store.getState().executeCommand(moveCmd);

    // Advance time and trigger eviction of chunk (1,1)
    const futureTime = Date.now() + 500;
    const evictDelta = chunkManager.updateStreaming(store.getState().domain, futureTime);

    // Invariant: Legacy indestructible wall is never included in unloadedEntityIds
    expect(evictDelta.unloadedEntityIds).not.toContain(storedWall.id);
    expect(evictDelta.unloadedEntityIds).not.toContain(piece.id);

    const evictApplied = store.getState().applyChunkStreamingDelta(evictDelta);
    expect(evictApplied).toBe(true);

    const domainAfterEvict = store.getState().domain;
    expect(domainAfterEvict.boardEntities[storedWall.id]).toBeDefined();
    expect(domainAfterEvict.occupancy[storedWall.position]).toBe(storedWall.id);

    // Adversarial manual delta attempting to unload the stored legacy wall must be rejected atomically
    const hostileDelta: IChunkStreamingDelta = {
      newEntities: {},
      updatedTerrain: [],
      unloadedEntityIds: [storedWall.id],
    };

    const revBeforeHostile = domainAfterEvict.revision;
    expect(() => {
      store.getState().applyChunkStreamingDelta(hostileDelta);
    }).toThrow(/cannot unload gameplay OBSTACLE "stored_ancient_fortress"/);

    expect(store.getState().domain.revision).toBe(revBeforeHostile);
    expect(store.getState().domain.boardEntities[storedWall.id]).toBeDefined();
  });
});

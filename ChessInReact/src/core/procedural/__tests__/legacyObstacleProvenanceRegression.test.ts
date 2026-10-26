import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IEntity, IObstacleEntity, IPieceEntity, ITerrainEntity, isProceduralEntity } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { IChunkStreamingDelta, IChunkTerrainUpdate } from '../types';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('Regression & Invariant Suite: PATCH-28 Conservative Legacy Obstacle Provenance', () => {
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
  // PATCH-28A: Conservative Provenance for Legacy Entities
  // =========================================================================
  describe('PATCH-28A: isProceduralEntity Conservative Provenance Contract', () => {
    it('T28-01: legacy indestructible obstacle without provenance and without CHASM metadata is treated as gameplay', () => {
      const legacyIndestructibleWall: IObstacleEntity = {
        id: asEntityId('legacy_wall_01'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('2,2'),
        metadata: {
          kind: 'STONE_WALL',
          customProperty: 'castle_ruins',
        },
      };

      // Invariant: Unannotated indestructible obstacles are preserved as gameplay unless positive CHASM evidence exists
      expect(isProceduralEntity(legacyIndestructibleWall)).toBe(false);

      const legacyWallNoMeta: IObstacleEntity = {
        id: asEntityId('legacy_wall_02'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('2,3'),
      };
      expect(isProceduralEntity(legacyWallNoMeta)).toBe(false);
    });

    it('T28-02: legacy CHASM obstacle (destructible === false && metadata.biome === "CHASM") is identified as procedural', () => {
      const legacyProceduralChasm: IObstacleEntity = {
        id: asEntityId('terr_chasm_2_2'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('2,2'),
        metadata: {
          biome: 'CHASM',
          isObstacle: true,
          costMultiplier: 999.0,
        },
      };

      // Invariant: Legacy CHASM obstacle generated prior to explicit provenance tagging is recognized as procedural
      expect(isProceduralEntity(legacyProceduralChasm)).toBe(true);
    });

    it('T28-03: obstacle explicitly marked GAMEPLAY with metadata.biome === "CHASM" is strictly gameplay', () => {
      const explicitGameplayChasm: IObstacleEntity = {
        id: asEntityId('gp_chasm_hazard'),
        type: 'OBSTACLE',
        provenance: 'GAMEPLAY',
        destructible: false,
        position: asCoordinateKey('3,3'),
        metadata: {
          biome: 'CHASM',
          hazardEffect: 'instant_capture',
        },
      };

      // Invariant: Explicit GAMEPLAY provenance takes precedence over metadata heuristics
      expect(isProceduralEntity(explicitGameplayChasm)).toBe(false);
    });

    it('T28-04: obstacle explicitly marked PROCEDURAL is identified as procedural', () => {
      const explicitProceduralObstacle: IObstacleEntity = {
        id: asEntityId('proc_barrier_04'),
        type: 'OBSTACLE',
        provenance: 'PROCEDURAL',
        destructible: false,
        position: asCoordinateKey('4,4'),
      };

      expect(isProceduralEntity(explicitProceduralObstacle)).toBe(true);
    });

    it('T28-05: PIECE entity with contradictory provenance or metadata is strictly classified as gameplay', () => {
      const contradictoryPiece: IEntity = {
        id: asEntityId('pawn_with_proc_tag'),
        type: 'PIECE',
        provenance: 'PROCEDURAL' as unknown as 'GAMEPLAY',
        position: asCoordinateKey('5,5'),
        metadata: { biome: 'CHASM' },
      } as unknown as IEntity;

      // Invariant: PIECE is always non-procedural regardless of tags
      expect(isProceduralEntity(contradictoryPiece)).toBe(false);
    });

    it('T28-06: entity with unrecognized provenance string is treated as non-procedural (gameplay)', () => {
      const alienEntity: IEntity = {
        id: asEntityId('alien_ent'),
        type: 'OBSTACLE',
        provenance: 'UNKNOWN_SOURCE' as unknown as 'PROCEDURAL',
        position: asCoordinateKey('6,6'),
        destructible: false,
        metadata: { biome: 'CHASM' },
      } as unknown as IEntity;

      expect(isProceduralEntity(alienEntity)).toBe(false);
    });

    it('T28-07: legacy TERRAIN entity without provenance is identified as procedural', () => {
      const legacyTerrain: ITerrainEntity = {
        id: asEntityId('terr_grass_7_7'),
        type: 'TERRAIN',
        variantId: 'DEFAULT',
        position: asCoordinateKey('7,7'),
        metadata: { biome: 'PLAINS' },
      };

      expect(isProceduralEntity(legacyTerrain)).toBe(true);
    });
  });

  // =========================================================================
  // PATCH-28B: Mandatory Integration Scenario
  // =========================================================================
  describe('PATCH-28B: End-to-End Protection of Legacy Indestructible Obstacles', () => {
    it('T28-08: game with piece and legacy indestructible wall maintains wall through chunk streaming, eviction, regeneration, and snapshot roundtrip', () => {
      const initialDomain = createDefaultDomainState();
      // Piece at 4,4 (chunk 1,1)
      const piece = createPiece('w_pawn_28', '4,4');
      // Legacy indestructible wall without provenance and without CHASM metadata
      const legacyWall: IObstacleEntity = {
        id: asEntityId('legacy_castle_wall'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('5,5'),
        metadata: {
          structure: 'RAMPART',
          hitPoints: 9999,
        },
      };

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[legacyWall.id] = legacyWall;
      initialDomain.occupancy[legacyWall.position] = legacyWall.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch28-integration' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 100,
        }
      );

      // 1. Initial streaming around piece at 4,4
      const initialDelta = chunkManager.updateStreaming(store.getState().domain);
      const initialApplied = store.getState().applyChunkStreamingDelta(initialDelta);
      expect(initialApplied).toBe(true);

      const cellKeysChunk1 = ['4,5', '4,6', '5,4', '5,6'].map(asCoordinateKey);
      for (const ck of cellKeysChunk1) {
        expect(store.getState().domain.terrain?.[ck]).toBeDefined();
      }

      // 2. Move piece far away to chunk (4,4) at position 16,16
      const moveCmd = new MovePieceCommand(piece.id, asCoordinateKey('4,4'), asCoordinateKey('16,16'), 'P1', undefined, false);
      store.getState().executeCommand(moveCmd);

      // 3. Trigger LRU eviction of chunk (1,1)
      const futureNow = Date.now() + 500;
      const evictionDelta = chunkManager.updateStreaming(store.getState().domain, futureNow);

      // The eviction delta must NEVER schedule the legacy wall or the piece for eviction
      expect(evictionDelta.unloadedEntityIds).not.toContain(legacyWall.id);
      expect(evictionDelta.unloadedEntityIds).not.toContain(piece.id);

      // Apply the eviction delta
      const evictionApplied = store.getState().applyChunkStreamingDelta(evictionDelta);
      expect(evictionApplied).toBe(true);

      const postEvictionDomain = store.getState().domain;
      // Invariant: Legacy indestructible wall is 100% preserved in both boardEntities and occupancy
      expect(postEvictionDomain.boardEntities[legacyWall.id]).toBeDefined();
      expect(postEvictionDomain.boardEntities[legacyWall.id]?.position).toBe('5,5');
      expect(postEvictionDomain.occupancy[legacyWall.position]).toBe(legacyWall.id);

      // Invariant: Procedural terrain from chunk (1,1) was unloaded
      for (const ck of cellKeysChunk1) {
        expect(postEvictionDomain.terrain?.[ck]).toBeUndefined();
      }

      // 4. Move piece back to chunk (1,1) and regenerate chunk
      const returnCmd = new MovePieceCommand(piece.id, asCoordinateKey('16,16'), asCoordinateKey('4,4'), 'P1', undefined, false);
      store.getState().executeCommand(returnCmd);

      const regenDelta = chunkManager.updateStreaming(store.getState().domain);
      const regenApplied = store.getState().applyChunkStreamingDelta(regenDelta);
      expect(regenApplied).toBe(true);

      const postRegenDomain = store.getState().domain;
      // Wall remains intact and is not overwritten or duplicated
      expect(postRegenDomain.boardEntities[legacyWall.id]).toBeDefined();
      expect(postRegenDomain.occupancy[legacyWall.position]).toBe(legacyWall.id);

      // 5. Snapshot roundtrip validation
      const snapshot = SnapshotSerializer.serialize(postRegenDomain);
      const restoredDomain = SnapshotSerializer.deserialize(snapshot);

      expect(restoredDomain.boardEntities[legacyWall.id]).toBeDefined();
      expect(restoredDomain.occupancy[legacyWall.position]).toBe(legacyWall.id);
      expect(isProceduralEntity(restoredDomain.boardEntities[legacyWall.id]!)).toBe(false);

      // 6. Adversarial manual delta attempting to unload the legacy wall must be rejected atomically
      const maliciousDelta: IChunkStreamingDelta = {
        newEntities: {},
        updatedTerrain: [],
        unloadedEntityIds: [legacyWall.id],
      };

      const revisionBefore = store.getState().domain.revision;
      expect(() => {
        store.getState().applyChunkStreamingDelta(maliciousDelta);
      }).toThrow(/cannot unload gameplay OBSTACLE "legacy_castle_wall"/);

      // Confirm domain state remained completely untouched (atomic rejection)
      const domainAfterRejection = store.getState().domain;
      expect(domainAfterRejection.revision).toBe(revisionBefore);
      expect(domainAfterRejection.boardEntities[legacyWall.id]).toBeDefined();
      expect(domainAfterRejection.occupancy[legacyWall.position]).toBe(legacyWall.id);
    });

    it('T28-09: delta attempting to insert a new entity at coordinate occupied by legacy indestructible wall is rejected atomically', () => {
      const initialDomain = createDefaultDomainState();
      const legacyWall: IObstacleEntity = {
        id: asEntityId('ancient_monolith'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('3,3'),
      };
      initialDomain.boardEntities[legacyWall.id] = legacyWall;
      initialDomain.occupancy[legacyWall.position] = legacyWall.id;

      const store = createGameStore(initialDomain);
      const revisionBefore = store.getState().domain.revision;

      // Delta tries to insert a procedural obstacle at the same coordinate
      const procObstacleId = asEntityId('new_proc_obstacle');
      const conflictingDelta: IChunkStreamingDelta = {
        newEntities: {
          [procObstacleId]: {
            id: procObstacleId,
            type: 'OBSTACLE',
            provenance: 'PROCEDURAL',
            destructible: false,
            position: asCoordinateKey('3,3'),
          } as IObstacleEntity,
        },
        updatedTerrain: [],
        unloadedEntityIds: [],
      };

      expect(() => {
        store.getState().applyChunkStreamingDelta(conflictingDelta);
      }).toThrow(/collides with gameplay OBSTACLE/);

      // Monolith must remain intact and revision unchanged
      expect(store.getState().domain.revision).toBe(revisionBefore);
      expect(store.getState().domain.boardEntities[legacyWall.id]).toBeDefined();
      expect(store.getState().domain.occupancy[legacyWall.position]).toBe(legacyWall.id);
      expect(store.getState().domain.boardEntities[procObstacleId]).toBeUndefined();
    });

    it('T28-10: delta attempting to mutate legacy indestructible wall via updatedTerrain is rejected atomically', () => {
      const initialDomain = createDefaultDomainState();
      const legacyWall: IObstacleEntity = {
        id: asEntityId('indestructible_fortress'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('2,2'),
      };
      initialDomain.boardEntities[legacyWall.id] = legacyWall;
      initialDomain.occupancy[legacyWall.position] = legacyWall.id;

      const store = createGameStore(initialDomain);
      const revisionBefore = store.getState().domain.revision;

      const hostileUpdate: IChunkTerrainUpdate = {
        previousId: legacyWall.id,
        entity: {
          id: asEntityId('proc_replacement_fortress'),
          type: 'OBSTACLE',
          provenance: 'PROCEDURAL',
          destructible: false,
          position: legacyWall.position,
        },
      };

      const hostileUpdateDelta: IChunkStreamingDelta = {
        newEntities: {},
        updatedTerrain: [hostileUpdate],
        unloadedEntityIds: [],
      };

      expect(() => {
        store.getState().applyChunkStreamingDelta(hostileUpdateDelta);
      }).toThrow(/updatedTerrain cannot replace gameplay OBSTACLE/);

      expect(store.getState().domain.revision).toBe(revisionBefore);
      const wallInStore = store.getState().domain.boardEntities[legacyWall.id] as IObstacleEntity | undefined;
      expect(wallInStore?.destructible).toBe(false);
    });
  });

  // =========================================================================
  // PATCH-28C: Snapshot Roundtrip Integrity
  // =========================================================================
  describe('PATCH-28C: Snapshot Roundtrip & Provenance Preservation', () => {
    it('T28-11: snapshot roundtrip preserves exact provenance state and conservative legacy classification', () => {
      const domain = createDefaultDomainState();

      // 1. Legacy indestructible gameplay wall (no provenance, no CHASM metadata)
      const legacyWall: IObstacleEntity = {
        id: asEntityId('wall_legacy'),
        type: 'OBSTACLE',
        destructible: false,
        position: asCoordinateKey('1,1'),
        metadata: { label: 'Ancient Wall' },
      };

      // 2. Procedural CHASM obstacle (explicit PROCEDURAL)
      const proceduralChasm: IObstacleEntity = {
        id: asEntityId('chasm_proc'),
        type: 'OBSTACLE',
        provenance: 'PROCEDURAL',
        destructible: false,
        position: asCoordinateKey('1,2'),
        metadata: { biome: 'CHASM' },
      };

      // 3. Destructible gameplay obstacle (explicit GAMEPLAY)
      const gameplayBarricade: IObstacleEntity = {
        id: asEntityId('barricade_gp'),
        type: 'OBSTACLE',
        provenance: 'GAMEPLAY',
        destructible: true,
        position: asCoordinateKey('1,3'),
      };

      // 4. Active piece (type PIECE)
      const piece: IPieceEntity = {
        id: asEntityId('knight_p1'),
        type: 'PIECE',
        variantId: 'KNIGHT',
        ownerId: 'P1',
        position: asCoordinateKey('2,1'),
        hasMoved: true,
        isCaptured: false,
      };

      // 5. Procedural terrain (explicit PROCEDURAL)
      const proceduralTerrain: ITerrainEntity = {
        id: asEntityId('terr_water_2_2'),
        type: 'TERRAIN',
        variantId: 'DEFAULT',
        provenance: 'PROCEDURAL',
        position: asCoordinateKey('2,2'),
        metadata: { biome: 'WATER' },
      };

      // 6. Legacy procedural terrain (no provenance)
      const legacyTerrain: ITerrainEntity = {
        id: asEntityId('terr_grass_2_3'),
        type: 'TERRAIN',
        variantId: 'DEFAULT',
        position: asCoordinateKey('2,3'),
        metadata: { biome: 'PLAINS' },
      };

      // Register all in domain
      domain.boardEntities[legacyWall.id] = legacyWall;
      domain.occupancy[legacyWall.position] = legacyWall.id;

      domain.boardEntities[proceduralChasm.id] = proceduralChasm;
      domain.occupancy[proceduralChasm.position] = proceduralChasm.id;

      domain.boardEntities[gameplayBarricade.id] = gameplayBarricade;
      domain.occupancy[gameplayBarricade.position] = gameplayBarricade.id;

      domain.boardEntities[piece.id] = piece;
      domain.occupancy[piece.position] = piece.id;

      domain.boardEntities[proceduralTerrain.id] = proceduralTerrain;
      domain.terrain![proceduralTerrain.position] = proceduralTerrain.id;

      domain.boardEntities[legacyTerrain.id] = legacyTerrain;
      domain.terrain![legacyTerrain.position] = legacyTerrain.id;

      // Roundtrip serialize & deserialize
      const serialized = SnapshotSerializer.serialize(domain);
      const deserialized = SnapshotSerializer.deserialize(serialized);

      // Verify all entities exist with exact coordinates
      expect(deserialized.boardEntities[legacyWall.id]).toBeDefined();
      expect(deserialized.boardEntities[proceduralChasm.id]).toBeDefined();
      expect(deserialized.boardEntities[gameplayBarricade.id]).toBeDefined();
      expect(deserialized.boardEntities[piece.id]).toBeDefined();
      expect(deserialized.boardEntities[proceduralTerrain.id]).toBeDefined();
      expect(deserialized.boardEntities[legacyTerrain.id]).toBeDefined();

      // Verify spatial maps match
      expect(deserialized.occupancy[legacyWall.position]).toBe(legacyWall.id);
      expect(deserialized.occupancy[proceduralChasm.position]).toBe(proceduralChasm.id);
      expect(deserialized.occupancy[gameplayBarricade.position]).toBe(gameplayBarricade.id);
      expect(deserialized.occupancy[piece.position]).toBe(piece.id);
      expect(deserialized.terrain?.[proceduralTerrain.position]).toBe(proceduralTerrain.id);
      expect(deserialized.terrain?.[legacyTerrain.position]).toBe(legacyTerrain.id);

      // Verify isProceduralEntity classification on restored domain
      expect(isProceduralEntity(deserialized.boardEntities[legacyWall.id]!)).toBe(false);
      expect(isProceduralEntity(deserialized.boardEntities[proceduralChasm.id]!)).toBe(true);
      expect(isProceduralEntity(deserialized.boardEntities[gameplayBarricade.id]!)).toBe(false);
      expect(isProceduralEntity(deserialized.boardEntities[piece.id]!)).toBe(false);
      expect(isProceduralEntity(deserialized.boardEntities[proceduralTerrain.id]!)).toBe(true);
      expect(isProceduralEntity(deserialized.boardEntities[legacyTerrain.id]!)).toBe(true);
    });
  });
});

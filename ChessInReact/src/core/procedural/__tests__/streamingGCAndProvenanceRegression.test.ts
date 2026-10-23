import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId, CoordinateKey } from '../../coordinates';
import { IEntity, IObstacleEntity, IPieceEntity, ITerrainEntity, isProceduralEntity } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { IChunkStreamingDelta } from '../types';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('Regression & Invariant Suite: PATCH-27 Streaming GC, Provenance & Lifecycle', () => {
  const square = new SquareTopology();

  // Helper to construct a standard piece
  const createPiece = (id: string, coord: string): IPieceEntity => ({
    id: asEntityId(id),
    type: 'PIECE',
    variantId: 'PAWN',
    ownerId: 'P1',
    position: asCoordinateKey(coord),
    hasMoved: false,
    isCaptured: false,
  });

  // Helper to construct a gameplay obstacle
  const createGameplayObstacle = (id: string, coord: string, destructible = true, metadata?: Record<string, unknown>): IObstacleEntity => ({
    id: asEntityId(id),
    type: 'OBSTACLE',
    provenance: 'GAMEPLAY',
    destructible,
    position: asCoordinateKey(coord),
    metadata: metadata ? { ...metadata } : undefined,
  });

  // =========================================================================
  // PATCH-27A: Corrigir eviction de obstáculos de gameplay
  // =========================================================================
  describe('PATCH-27A: Gameplay Obstacle Protection during Chunk Eviction', () => {
    it('T27-01: chunk coexists with procedural terrain, an active piece, and a gameplay obstacle', () => {
      const initialDomain = createDefaultDomainState();
      const piece = createPiece('white_pawn_1', '0,0');
      const obstacle = createGameplayObstacle('gameplay_barrier_1', '1,1', true);

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[obstacle.id] = obstacle;
      initialDomain.occupancy[obstacle.position] = obstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t01' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
        }
      );

      // Stream chunk terrain
      const sync = chunkManager.syncWithStore(store);
      expect(sync.applied).toBe(true);

      const domain = store.getState().domain;
      expect(domain.boardEntities[piece.id]).toBeDefined();
      expect(domain.boardEntities[obstacle.id]).toBeDefined();
      expect(domain.occupancy[piece.position]).toBe(piece.id);
      expect(domain.occupancy[obstacle.position]).toBe(obstacle.id);

      // Verify procedural terrain was generated and indexed in terrain map
      const terrainAt01 = domain.terrain?.[asCoordinateKey('0,1')];
      expect(terrainAt01).toBeDefined();
      expect(domain.boardEntities[terrainAt01!].type).toBe('TERRAIN');
      expect(isProceduralEntity(domain.boardEntities[terrainAt01!])).toBe(true);
    });

    it('T27-02: after piece leaves chunk and region is evicted, procedural terrain is unloaded while gameplay obstacle remains in domain', () => {
      const initialDomain = createDefaultDomainState();
      // Place piece and obstacle in chunk (1,1) (coords 4..7, 4..7) so it is not protected by the origin chunk (0,0) invariant
      const piece = createPiece('white_pawn_2', '4,4');
      const obstacle = createGameplayObstacle('gameplay_wall_2', '5,5', false);

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[obstacle.id] = obstacle;
      initialDomain.occupancy[obstacle.position] = obstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t02' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 100, // fast unload for test
        }
      );

      // Stream initial chunk around 4,4
      const initialDelta = chunkManager.updateStreaming(store.getState().domain);
      const initialSync = store.getState().applyChunkStreamingDelta(initialDelta);
      expect(initialSync).toBe(true);

      const cellKeysChunk1 = ['4,5', '4,6', '5,4', '5,6'].map(asCoordinateKey);
      for (const ck of cellKeysChunk1) {
        expect(store.getState().domain.terrain?.[ck]).toBeDefined();
      }

      // Move piece far away to chunk (4,4) at position '16,16'
      const moveCmd = new MovePieceCommand(piece.id, asCoordinateKey('4,4'), asCoordinateKey('16,16'), 'P1', undefined, false);
      store.getState().executeCommand(moveCmd);

      // Advance time beyond unloadTimeoutMs
      const futureNow = Date.now() + 500;
      const delta = chunkManager.updateStreaming(store.getState().domain, futureNow);

      // The delta must unload procedural terrain from chunk (1,1), but NOT the gameplay obstacle
      expect(delta.unloadedEntityIds).not.toContain(obstacle.id);
      expect(delta.unloadedEntityIds).not.toContain(piece.id);

      // Apply delta to store
      const applied = store.getState().applyChunkStreamingDelta(delta);
      expect(applied).toBe(true);

      const updatedDomain = store.getState().domain;
      // Gameplay obstacle must remain 100% intact
      expect(updatedDomain.boardEntities[obstacle.id]).toBeDefined();
      expect(updatedDomain.occupancy[obstacle.position]).toBe(obstacle.id);

      // Procedural terrain from chunk (1,1) must have been unloaded
      for (const ck of cellKeysChunk1) {
        expect(updatedDomain.terrain?.[ck]).toBeUndefined();
      }
    });

    it('T27-03: syncWithStore() does not throw validation error when chunk containing gameplay obstacle is evicted', () => {
      const initialDomain = createDefaultDomainState();
      const piece = createPiece('w_pawn_3', '0,0');
      const obstacle = createGameplayObstacle('gp_gate_3', '2,2', true);

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[obstacle.id] = obstacle;
      initialDomain.occupancy[obstacle.position] = obstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t03' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 50,
        }
      );

      const syncInit = chunkManager.syncWithStore(store);
      expect(syncInit.applied).toBe(true);

      // Move piece away
      const moveCmd = new MovePieceCommand(piece.id, asCoordinateKey('0,0'), asCoordinateKey('12,12'), 'P1');
      store.getState().executeCommand(moveCmd);

      // Evict chunk (0,0) via updateStreaming and delta application with advanced time
      const futureNow = Date.now() + 1000;
      expect(() => {
        const delta = chunkManager.updateStreaming(store.getState().domain, futureNow);
        store.getState().applyChunkStreamingDelta(delta);
      }).not.toThrow();

      // Gameplay obstacle must remain
      expect(store.getState().domain.boardEntities[obstacle.id]).toBeDefined();
      expect(store.getState().domain.occupancy[obstacle.position]).toBe(obstacle.id);
    });

    it('T27-04: after chunk regeneration, gameplay obstacle remains intact without duplicate or overwrite', () => {
      const initialDomain = createDefaultDomainState();
      const piece = createPiece('w_pawn_4', '0,0');
      const obstacle = createGameplayObstacle('gp_shrine_4', '1,1', false);

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[obstacle.id] = obstacle;
      initialDomain.occupancy[obstacle.position] = obstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t04' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 50,
        }
      );

      chunkManager.syncWithStore(store);

      // Step 1: Move away and evict chunk (0,0)
      store.getState().executeCommand(new MovePieceCommand(piece.id, asCoordinateKey('0,0'), asCoordinateKey('16,16'), 'P1', undefined, false));
      const evictDelta = chunkManager.updateStreaming(store.getState().domain, Date.now() + 200);
      store.getState().applyChunkStreamingDelta(evictDelta);

      // Step 2: Move back to '0,0' and regenerate chunk (0,0)
      store.getState().executeCommand(new MovePieceCommand(piece.id, asCoordinateKey('16,16'), asCoordinateKey('0,0'), 'P1', undefined, false));
      const regenDelta = chunkManager.updateStreaming(store.getState().domain, Date.now() + 400);
      store.getState().applyChunkStreamingDelta(regenDelta);

      const finalDomain = store.getState().domain;
      // Gameplay obstacle remains unchanged
      expect(finalDomain.boardEntities[obstacle.id]).toBeDefined();
      expect(finalDomain.boardEntities[obstacle.id].type).toBe('OBSTACLE');
      expect((finalDomain.boardEntities[obstacle.id] as IObstacleEntity).provenance).toBe('GAMEPLAY');
      expect(finalDomain.occupancy[obstacle.position]).toBe(obstacle.id);

      // Procedural terrain around it is restored
      expect(finalDomain.terrain?.[asCoordinateKey('0,1')]).toBeDefined();
    });

    it('T27-05: 100 streaming and eviction cycles confirm zero uncontrolled accumulation of procedural entities', () => {
      const initialDomain = createDefaultDomainState();
      const piece = createPiece('w_scout', '0,0');
      const obstacle = createGameplayObstacle('gp_totem', '1,1', false);

      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;
      initialDomain.boardEntities[obstacle.id] = obstacle;
      initialDomain.occupancy[obstacle.position] = obstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t05-cycles' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 10,
        }
      );

      let simTime = Date.now();

      // Perform 100 alternating movement and eviction cycles between chunk (0,0) and chunk (10,10)
      for (let i = 0; i < 100; i++) {
        simTime += 20;
        const currentPos = store.getState().domain.boardEntities[piece.id].position;
        const targetCoord = i % 2 === 0 ? asCoordinateKey('40,40') : asCoordinateKey('0,0');
        store.getState().executeCommand(new MovePieceCommand(piece.id, currentPos, targetCoord, 'P1', undefined, false));
        const delta = chunkManager.updateStreaming(store.getState().domain, simTime);
        store.getState().applyChunkStreamingDelta(delta);
      }

      const endDomain = store.getState().domain;
      // Active entities must remain bounded: exactly 1 chunk of 16 cells + piece + obstacle
      const totalEntities = Object.keys(endDomain.boardEntities).length;
      expect(totalEntities).toBeLessThanOrEqual(20);

      // Gameplay obstacle was never lost or duplicated
      expect(endDomain.boardEntities[obstacle.id]).toBeDefined();
      expect(endDomain.occupancy[obstacle.position]).toBe(obstacle.id);
    });

    it('T27-06: forcing stale revision rejection leaves state untouched and subsequent reconciliation succeeds', () => {
      const initialDomain = createDefaultDomainState();
      const piece = createPiece('w_pawn_6', '0,0');
      initialDomain.boardEntities[piece.id] = piece;
      initialDomain.occupancy[piece.position] = piece.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t06' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
        }
      );

      const delta = chunkManager.updateStreaming(store.getState().domain);
      const currentRev = store.getState().domain.revision;

      // Pass intentionally stale expectedRevision
      const staleApplied = store.getState().applyChunkStreamingDelta(delta, currentRev + 99);
      expect(staleApplied).toBe(false);

      // Store was not modified
      expect(store.getState().domain.revision).toBe(currentRev);

      // Subsequent reconciliation with correct revision succeeds
      const validApplied = store.getState().applyChunkStreamingDelta(delta, currentRev);
      expect(validApplied).toBe(true);
    });
  });

  // =========================================================================
  // PATCH-27B: Centralizar a identificação de proveniência
  // =========================================================================
  describe('PATCH-27B: Unified Provenance Identification & Consistency', () => {
    it('T27-07: explicit GAMEPLAY obstacle with metadata.biome = "CHASM" is NOT treated as procedural', () => {
      const gpChasmObstacle: IObstacleEntity = {
        id: asEntityId('gameplay_chasm_pit'),
        type: 'OBSTACLE',
        provenance: 'GAMEPLAY',
        destructible: false,
        position: asCoordinateKey('3,3'),
        metadata: {
          biome: 'CHASM',
          customGameplayRule: 'fatal_fall',
        },
      };

      // Invariant: explicit GAMEPLAY provenance must override biome metadata heuristics
      expect(isProceduralEntity(gpChasmObstacle)).toBe(false);

      // In ChunkManager: findExistingTerrainEntity must NOT treat it as a procedural terrain entity
      const store = createGameStore();
      store.getState().domain.boardEntities[gpChasmObstacle.id] = gpChasmObstacle;
      store.getState().domain.occupancy[gpChasmObstacle.position] = gpChasmObstacle.id;

      const chunkManager = new ChunkManager(square, {}, { chunkSize: 4, viewRadiusChunks: 0 });
      const existing = (chunkManager as unknown as { findExistingTerrainEntity: (s: unknown, c: CoordinateKey) => IEntity | undefined })
        .findExistingTerrainEntity(store.getState().domain, asCoordinateKey('3,3'));

      expect(existing).toBeUndefined();
    });

    it('T27-08: explicit PROCEDURAL obstacle is consistently recognized across all modules', () => {
      const proceduralChasm: IObstacleEntity = {
        id: asEntityId('terr_chasm_4_4'),
        type: 'OBSTACLE',
        provenance: 'PROCEDURAL',
        destructible: false,
        position: asCoordinateKey('4,4'),
        metadata: {
          biome: 'CHASM',
        },
      };

      expect(isProceduralEntity(proceduralChasm)).toBe(true);
    });

    it('T27-09: legacy snapshot without provenance field remains compatible when origin can be safely inferred', () => {
      // Legacy procedural CHASM: indestructible with biome: 'CHASM'
      const legacyProceduralChasm: IEntity = {
        id: asEntityId('legacy_chasm_1'),
        type: 'OBSTACLE',
        position: asCoordinateKey('2,2'),
        destructible: false,
        metadata: { biome: 'CHASM' },
      } as IObstacleEntity;

      // Legacy gameplay wall: destructible without procedural CHASM metadata
      const legacyGameplayWall: IEntity = {
        id: asEntityId('legacy_wall_1'),
        type: 'OBSTACLE',
        position: asCoordinateKey('2,3'),
        destructible: true,
      } as IObstacleEntity;

      expect(isProceduralEntity(legacyProceduralChasm)).toBe(true);
      expect(isProceduralEntity(legacyGameplayWall)).toBe(false);

      // Legacy TERRAIN entity without provenance is always procedural
      const legacyTerrain: IEntity = {
        id: asEntityId('legacy_terrain_1'),
        type: 'TERRAIN',
        position: asCoordinateKey('1,1'),
      } as ITerrainEntity;
      expect(isProceduralEntity(legacyTerrain)).toBe(true);
    });

    it('T27-10: a PIECE object with contradictory provenance marker is strictly classified as GAMEPLAY', () => {
      const malformedPiece: IEntity = {
        id: asEntityId('contradictory_piece'),
        type: 'PIECE',
        position: asCoordinateKey('5,5'),
        provenance: 'PROCEDURAL' as unknown as 'GAMEPLAY',
        metadata: { biome: 'CHASM' },
      } as unknown as IEntity;

      // PIECE invariant must override any contradictory provenance or metadata
      expect(isProceduralEntity(malformedPiece)).toBe(false);
    });

    it('T27-11: modifying terrain under a gameplay obstacle cannot remove or replace that obstacle', () => {
      const initialDomain = createDefaultDomainState();
      const gpObstacle = createGameplayObstacle('gp_bunker_11', '1,1', false);
      initialDomain.boardEntities[gpObstacle.id] = gpObstacle;
      initialDomain.occupancy[gpObstacle.position] = gpObstacle.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-t11' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
        }
      );

      // Set persistent tile modification directly on '1,1' to change biome to CHASM
      chunkManager.setPersistentModification(asCoordinateKey('1,1'), { biome: 'CHASM' });

      // Generate delta
      const delta = chunkManager.updateStreaming(store.getState().domain);

      // The delta must NOT target gpObstacle in unloadedEntityIds or updatedTerrain.previousId
      expect(delta.unloadedEntityIds).not.toContain(gpObstacle.id);
      if (delta.updatedTerrain) {
        for (const upd of delta.updatedTerrain) {
          expect(upd.previousId).not.toBe(gpObstacle.id);
          expect(upd.entity.id).not.toBe(gpObstacle.id);
        }
      }

      // Applying the delta must preserve gpObstacle
      store.getState().applyChunkStreamingDelta(delta);
      expect(store.getState().domain.boardEntities[gpObstacle.id]).toBeDefined();
      expect(store.getState().domain.occupancy[asCoordinateKey('1,1')]).toBe(gpObstacle.id);
    });
  });

  // =========================================================================
  // PATCH-27C: Validar a proveniência de entidades recebidas por streaming
  // =========================================================================
  describe('PATCH-27C: Streamed Entity Provenance Validation', () => {
    it('T27-12: newEntities with OBSTACLE explicitly GAMEPLAY must be rejected atomically', () => {
      const store = createGameStore();
      const revBefore = store.getState().domain.revision;
      const entitiesBefore = { ...store.getState().domain.boardEntities };

      const illegalDelta: IChunkStreamingDelta = {
        newEntities: {
          [asEntityId('gp_barrier')]: {
            id: asEntityId('gp_barrier'),
            type: 'OBSTACLE',
            provenance: 'GAMEPLAY',
            position: asCoordinateKey('5,5'),
            destructible: true,
          } as IObstacleEntity,
        },
        unloadedEntityIds: [],
      };

      expect(() => {
        store.getState().applyChunkStreamingDelta(illegalDelta);
      }).toThrow(/GAMEPLAY provenance|procedural/i);

      // Invariant: zero partial mutation
      expect(store.getState().domain.revision).toBe(revBefore);
      expect(store.getState().domain.boardEntities).toEqual(entitiesBefore);
    });

    it('T27-13: updatedTerrain containing replacement explicitly GAMEPLAY must be rejected', () => {
      const store = createGameStore();
      const existingTerrain: ITerrainEntity = {
        id: asEntityId('terr_init_13'),
        type: 'TERRAIN',
        provenance: 'PROCEDURAL',
        variantId: 'PLAINS',
        position: asCoordinateKey('2,2'),
      };
      store.getState().applyChunkStreamingDelta({
        newEntities: { [existingTerrain.id]: existingTerrain },
        unloadedEntityIds: [],
      });

      const revBefore = store.getState().domain.revision;

      const illegalUpdateDelta: IChunkStreamingDelta = {
        newEntities: {},
        unloadedEntityIds: [],
        updatedTerrain: [
          {
            previousId: existingTerrain.id,
            entity: {
              id: asEntityId('terr_init_13_repl'),
              type: 'OBSTACLE',
              provenance: 'GAMEPLAY',
              position: asCoordinateKey('2,2'),
              destructible: true,
            } as IObstacleEntity,
          },
        ],
      };

      expect(() => {
        store.getState().applyChunkStreamingDelta(illegalUpdateDelta);
      }).toThrow(/GAMEPLAY provenance|procedural/i);

      expect(store.getState().domain.revision).toBe(revBefore);
      expect(store.getState().domain.boardEntities[existingTerrain.id]).toBeDefined();
    });

    it('T27-14: valid procedural deltas continue being applied successfully', () => {
      const store = createGameStore();
      const validProceduralTerrain: ITerrainEntity = {
        id: asEntityId('terr_plains_valid'),
        type: 'TERRAIN',
        provenance: 'PROCEDURAL',
        variantId: 'PLAINS',
        position: asCoordinateKey('3,3'),
      };
      const validProceduralChasm: IObstacleEntity = {
        id: asEntityId('terr_chasm_valid'),
        type: 'OBSTACLE',
        provenance: 'PROCEDURAL',
        destructible: false,
        position: asCoordinateKey('3,4'),
        metadata: { biome: 'CHASM' },
      };

      const validDelta: IChunkStreamingDelta = {
        newEntities: {
          [validProceduralTerrain.id]: validProceduralTerrain,
          [validProceduralChasm.id]: validProceduralChasm,
        },
        unloadedEntityIds: [],
      };

      const applied = store.getState().applyChunkStreamingDelta(validDelta);
      expect(applied).toBe(true);

      const domain = store.getState().domain;
      expect(domain.terrain?.[asCoordinateKey('3,3')]).toBe(validProceduralTerrain.id);
      expect(domain.occupancy[asCoordinateKey('3,4')]).toBe(validProceduralChasm.id);
    });

    it('T27-15: zero orphan IDs or inconsistent indices remain after a delta rejection', () => {
      const store = createGameStore();
      const existingId = asEntityId('terr_safe');
      store.getState().applyChunkStreamingDelta({
        newEntities: {
          [existingId]: {
            id: existingId,
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            position: asCoordinateKey('1,1'),
          } as ITerrainEntity,
        },
        unloadedEntityIds: [],
      });

      const snapshotBefore = JSON.stringify(store.getState().domain);

      // Delta combines 1 valid new entity with 1 invalid gameplay entity
      const mixedDelta: IChunkStreamingDelta = {
        newEntities: {
          [asEntityId('valid_terr')]: {
            id: asEntityId('valid_terr'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            position: asCoordinateKey('1,2'),
          } as ITerrainEntity,
          [asEntityId('invalid_gp_obs')]: {
            id: asEntityId('invalid_gp_obs'),
            type: 'OBSTACLE',
            provenance: 'GAMEPLAY',
            position: asCoordinateKey('1,3'),
          } as IObstacleEntity,
        },
        unloadedEntityIds: [],
      };

      expect(() => {
        store.getState().applyChunkStreamingDelta(mixedDelta);
      }).toThrow();

      // State is byte-for-byte identical to before the call
      expect(JSON.stringify(store.getState().domain)).toBe(snapshotBefore);
      expect(store.getState().domain.boardEntities[asEntityId('valid_terr')]).toBeUndefined();
      expect(store.getState().domain.terrain?.[asCoordinateKey('1,2')]).toBeUndefined();
    });
  });

  // =========================================================================
  // Directed End-to-End Integration Scenario
  // =========================================================================
  describe('PATCH-27 Integrated Lifecycle Scenario: ChunkManager & Zustand Store', () => {
    it('executes full end-to-end lifecycle: generation -> movement -> eviction -> modification -> snapshot -> restore -> undo/redo', () => {
      const initialDomain = createDefaultDomainState();

      // 1. Create match with 2 pieces and 1 gameplay obstacle in chunk (1,1) (coords 4..7, 4..7)
      const p1 = createPiece('w_knight_1', '4,4');
      const p2 = createPiece('w_bishop_1', '4,5');
      const gpWall = createGameplayObstacle('gp_fortress_wall', '5,5', false);

      initialDomain.boardEntities[p1.id] = p1;
      initialDomain.occupancy[p1.position] = p1.id;
      initialDomain.boardEntities[p2.id] = p2;
      initialDomain.occupancy[p2.position] = p2.id;
      initialDomain.boardEntities[gpWall.id] = gpWall;
      initialDomain.occupancy[gpWall.position] = gpWall.id;

      const store = createGameStore(initialDomain);
      const chunkManager = new ChunkManager(
        square,
        { seed: 'patch27-e2e' },
        {
          chunkSize: 4,
          renderDistance: 0,
          viewRadiusChunks: 0,
          unloadTimeoutMs: 50,
        }
      );

      // Ensure piece transit tiles are guaranteed walkable PLAINS
      chunkManager.setPersistentModification(asCoordinateKey('4,4'), { biome: 'PLAINS', isObstacle: false });
      chunkManager.setPersistentModification(asCoordinateKey('16,16'), { biome: 'PLAINS', isObstacle: false });
      chunkManager.setPersistentModification(asCoordinateKey('16,17'), { biome: 'PLAINS', isObstacle: false });

      // 2. Generate procedural terrains and 3. Apply streaming around (4,4)
      const delta1 = chunkManager.updateStreaming(store.getState().domain);
      const sync1 = store.getState().applyChunkStreamingDelta(delta1);
      expect(sync1).toBe(true);
      expect(store.getState().domain.terrain?.[asCoordinateKey('4,6')]).toBeDefined();

      // 4. Move a piece to another region (chunk at 16,16)
      const moveCmd = new MovePieceCommand(p1.id, asCoordinateKey('4,4'), asCoordinateKey('16,16'), 'P1', undefined, false);
      store.getState().executeCommand(moveCmd);

      // Move piece 2 as well so chunk (1,1) has NO active pieces
      const moveCmd2 = new MovePieceCommand(p2.id, asCoordinateKey('4,5'), asCoordinateKey('16,17'), 'P1', undefined, false);
      store.getState().executeCommand(moveCmd2);

      // 5. Force eviction of chunk (1,1)
      const evictTime = Date.now() + 500;
      const evictDelta = chunkManager.updateStreaming(store.getState().domain, evictTime);
      const evictApplied = store.getState().applyChunkStreamingDelta(evictDelta);
      expect(evictApplied).toBe(true);

      // 6. Confirm preservation of gameplay obstacle
      const stateAfterEvict = store.getState().domain;
      expect(stateAfterEvict.boardEntities[gpWall.id]).toBeDefined();
      expect(stateAfterEvict.occupancy[asCoordinateKey('5,5')]).toBe(gpWall.id);

      // 7. Confirm unloading of procedural terrain from chunk (1,1)
      expect(stateAfterEvict.terrain?.[asCoordinateKey('4,6')]).toBeUndefined();

      // 8. Apply persistent modification on chunk (1,1)
      chunkManager.setPersistentModification(asCoordinateKey('4,7'), { biome: 'CHASM' });

      // 9. Save snapshot to JSON
      const serializedSnapshot = SnapshotSerializer.serialize(store.getState().domain);
      expect(typeof serializedSnapshot).toBe('string');
      expect(serializedSnapshot).toContain('gp_fortress_wall');

      // 10. Restore snapshot into a clean new store
      const restoredDomain = SnapshotSerializer.deserialize(serializedSnapshot);
      const restoredStore = createGameStore(restoredDomain);

      expect(restoredStore.getState().domain.boardEntities[gpWall.id]).toBeDefined();
      expect(restoredStore.getState().domain.occupancy[asCoordinateKey('5,5')]).toBe(gpWall.id);
      expect(restoredStore.getState().domain.boardEntities[p1.id].position).toBe('16,16');

      // 11. Regenerate chunk (1,1) by moving p1 back
      const returnCmd = new MovePieceCommand(p1.id, asCoordinateKey('16,16'), asCoordinateKey('4,4'), 'P1', undefined, false);
      restoredStore.getState().executeCommand(returnCmd);
      const regenDelta = chunkManager.updateStreaming(restoredStore.getState().domain, evictTime + 1000);
      const regenApplied = restoredStore.getState().applyChunkStreamingDelta(regenDelta);
      expect(regenApplied).toBe(true);

      // Persistent modification at '4,7' must have generated a CHASM obstacle or impassable terrain
      const stateRegen = restoredStore.getState().domain;
      expect(stateRegen.occupancy[asCoordinateKey('4,7')]).toBeDefined();
      expect(stateRegen.boardEntities[gpWall.id]).toBeDefined();
      expect(stateRegen.occupancy[asCoordinateKey('5,5')]).toBe(gpWall.id);

      // 12. Execute Undo / Redo
      const undoOk = restoredStore.getState().undo();
      expect(undoOk).toBe(true);
      expect(restoredStore.getState().domain.boardEntities[p1.id].position).toBe('16,16');

      const redoOk = restoredStore.getState().redo();
      expect(redoOk).toBe(true);
      expect(restoredStore.getState().domain.boardEntities[p1.id].position).toBe('4,4');

      // 13. Validate all indices are completely synchronized
      const finalDomain = restoredStore.getState().domain;
      for (const [id, entity] of Object.entries(finalDomain.boardEntities)) {
        expect(entity.id).toBe(id);
        if (entity.type === 'PIECE' || entity.type === 'OBSTACLE') {
          expect(finalDomain.occupancy[entity.position]).toBe(id);
        }
        if (entity.type === 'TERRAIN') {
          expect(finalDomain.terrain?.[entity.position]).toBe(id);
        }
      }

      // 14. Repeat with revision conflict and verify recovery
      const currentRev = finalDomain.revision;
      const staleDelta = chunkManager.updateStreaming(finalDomain);
      const staleResult = restoredStore.getState().applyChunkStreamingDelta(staleDelta, currentRev + 42);
      expect(staleResult).toBe(false);

      const recoveredResult = restoredStore.getState().applyChunkStreamingDelta(staleDelta, currentRev);
      expect(recoveredResult).toBe(true);
    });
  });
});

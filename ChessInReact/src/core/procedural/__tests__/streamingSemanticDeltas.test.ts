import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity, ITerrainEntity, IObstacleEntity, IEntity, EntityType } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { IChunkStreamingDelta } from '../types';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('PATCH-22: Semantic Validation and Strict Atomicity for Streaming Deltas', () => {
  it('T22-01: illegal insertion of PIECE via streaming delta is strictly rejected', () => {
    const store = createGameStore();
    const stateBefore = store.getState().domain;
    const revisionBefore = stateBefore.revision;

    const fakePieceDelta: IChunkStreamingDelta = {
      newEntities: {
        [asEntityId('invader_pawn')]: {
          id: asEntityId('invader_pawn'),
          type: 'PIECE' as EntityType,
          position: asCoordinateKey('3,3'),
          ownerId: 'P1',
          variantId: 'PAWN',
          hasMoved: false,
          isCaptured: false,
        } as unknown as IEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(fakePieceDelta);
    }).toThrow(/forbidden entity type "PIECE"/);

    // Assert zero store mutation
    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect(stateAfter.boardEntities[asEntityId('invader_pawn')]).toBeUndefined();
    expect(stateAfter.occupancy[asCoordinateKey('3,3')]).toBeUndefined();
  });

  it('T22-02: illegal replacement of existing PIECE via streaming delta is strictly rejected', () => {
    const store = createGameStore();
    const pieceId = asEntityId('active_knight');
    const piecePos = asCoordinateKey('2,2');

    const domain = createDefaultDomainState('replace-piece-match');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[piecePos] = pieceId;
    store.getState().resetDomainState(domain);

    const revisionBefore = store.getState().domain.revision;

    // Delta attempting to replace active_knight with a procedural obstacle at a different location
    const illegalReplacementDelta: IChunkStreamingDelta = {
      newEntities: {
        [pieceId]: {
          id: pieceId,
          type: 'OBSTACLE',
          destructible: false,
          position: asCoordinateKey('5,5'),
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(illegalReplacementDelta);
    }).toThrow(/attempts to replace an existing gameplay PIECE entity/);

    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect((stateAfter.boardEntities[pieceId] as IPieceEntity).type).toBe('PIECE');
    expect(stateAfter.occupancy[piecePos]).toBe(pieceId);
    expect(stateAfter.occupancy[asCoordinateKey('5,5')]).toBeUndefined();
  });

  it('T22-03: updatedTerrain with non-existent previousId is rejected', () => {
    const store = createGameStore();
    const revisionBefore = store.getState().domain.revision;

    const invalidUpdateDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: asEntityId('terr_phantom_id'),
          entity: {
            id: asEntityId('terr_new_water'),
            type: 'TERRAIN',
            variantId: 'WATER',
            position: asCoordinateKey('1,1'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(invalidUpdateDelta);
    }).toThrow(/references non-existent previousId/);

    expect(store.getState().domain.revision).toBe(revisionBefore);
  });

  it('T22-04: updatedTerrain with divergent coordinates between old and new entity is rejected', () => {
    const store = createGameStore();
    const oldId = asEntityId('terr_grass_4_4');
    const oldPos = asCoordinateKey('4,4');

    const domain = createDefaultDomainState('coord-mismatch-match');
    domain.boardEntities[oldId] = {
      id: oldId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: oldPos,
    } as ITerrainEntity;
    domain.terrain![oldPos] = oldId;
    store.getState().resetDomainState(domain);

    const revisionBefore = store.getState().domain.revision;

    // Replacement specifies position 8,8 instead of 4,4
    const mismatchDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: oldId,
          entity: {
            id: asEntityId('terr_water_4_4'),
            type: 'TERRAIN',
            variantId: 'WATER',
            position: asCoordinateKey('8,8'), // Divergent!
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(mismatchDelta);
    }).toThrow(/updatedTerrain coordinate mismatch/);

    expect(store.getState().domain.revision).toBe(revisionBefore);
    expect(store.getState().domain.boardEntities[oldId]).toBeDefined();
  });

  it('T22-05: duplicate IDs across delta operations (new, updated, unloaded) are rejected', () => {
    const store = createGameStore();
    const dupId = asEntityId('shared_dup_id');
    const revisionBefore = store.getState().domain.revision;

    // Delta specifying dupId in both newEntities and unloadedEntityIds
    const duplicateIdDelta: IChunkStreamingDelta = {
      newEntities: {
        [dupId]: {
          id: dupId,
          type: 'TERRAIN',
          variantId: 'PLAINS',
          position: asCoordinateKey('0,1'),
        } as ITerrainEntity,
      },
      unloadedEntityIds: [dupId],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(duplicateIdDelta);
    }).toThrow(/duplicate ID/);

    expect(store.getState().domain.revision).toBe(revisionBefore);
  });

  it('T22-06: procedural OBSTACLE colliding with an active PIECE is rejected', () => {
    const store = createGameStore();
    const pieceId = asEntityId('hero_king');
    const piecePos = asCoordinateKey('0,0');

    const domain = createDefaultDomainState('collision-match');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[piecePos] = pieceId;
    store.getState().resetDomainState(domain);

    const revisionBefore = store.getState().domain.revision;

    // Delta attempting to insert an OBSTACLE directly onto hero_king's square
    const obstacleCollisionDelta: IChunkStreamingDelta = {
      newEntities: {
        [asEntityId('rock_0_0')]: {
          id: asEntityId('rock_0_0'),
          type: 'OBSTACLE',
          destructible: false,
          position: piecePos,
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(obstacleCollisionDelta);
    }).toThrow(/collides with active PIECE/);

    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect(stateAfter.occupancy[piecePos]).toBe(pieceId);
    expect(stateAfter.boardEntities[asEntityId('rock_0_0')]).toBeUndefined();
  });

  it('T22-07: mixed delta containing valid operations plus one semantically invalid operation commits zero changes', () => {
    const store = createGameStore();
    const valid1 = asEntityId('terr_valid_1');
    const valid2 = asEntityId('terr_valid_2');
    const valid3 = asEntityId('terr_valid_3');
    const pieceId = asEntityId('active_pawn_guard');
    const piecePos = asCoordinateKey('1,1');

    const domain = createDefaultDomainState('atomic-mixed-match');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[piecePos] = pieceId;
    store.getState().resetDomainState(domain);

    const revisionBefore = store.getState().domain.revision;
    const initialEntityCount = Object.keys(store.getState().domain.boardEntities).length;

    // 3 valid TERRAIN insertions + 1 invalid operation (OBSTACLE on piece)
    const mixedDelta: IChunkStreamingDelta = {
      newEntities: {
        [valid1]: { id: valid1, type: 'TERRAIN', variantId: 'PLAINS', position: asCoordinateKey('10,10') } as ITerrainEntity,
        [valid2]: { id: valid2, type: 'TERRAIN', variantId: 'FOREST', position: asCoordinateKey('10,11') } as ITerrainEntity,
        [valid3]: { id: valid3, type: 'TERRAIN', variantId: 'WATER', position: asCoordinateKey('10,12') } as ITerrainEntity,
        [asEntityId('invalid_obstacle')]: { id: asEntityId('invalid_obstacle'), type: 'OBSTACLE', destructible: false, position: piecePos } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(mixedDelta);
    }).toThrow(/collides with active PIECE/);

    // Atomicity assertion: NONE of the 3 valid entities must be in the store
    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect(Object.keys(stateAfter.boardEntities).length).toBe(initialEntityCount);
    expect(stateAfter.boardEntities[valid1]).toBeUndefined();
    expect(stateAfter.boardEntities[valid2]).toBeUndefined();
    expect(stateAfter.boardEntities[valid3]).toBeUndefined();
  });

  it('T22-08: legitimate procedural streaming delta successfully creates, updates, and unloads terrain and obstacles', () => {
    const store = createGameStore();
    const initialTerrainId = asEntityId('terr_init_plains');
    const initialCoord = asCoordinateKey('0,0');
    const staleId = asEntityId('terr_stale_edge');
    const staleCoord = asCoordinateKey('99,99');

    const domain = createDefaultDomainState('legit-stream-match');
    domain.boardEntities[initialTerrainId] = {
      id: initialTerrainId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: initialCoord,
    } as ITerrainEntity;
    domain.terrain![initialCoord] = initialTerrainId;

    domain.boardEntities[staleId] = {
      id: staleId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: staleCoord,
    } as ITerrainEntity;
    domain.terrain![staleCoord] = staleId;

    store.getState().resetDomainState(domain);
    const revisionBefore = store.getState().domain.revision;

    const newTerrainId = asEntityId('terr_new_forest');
    const newObstacleId = asEntityId('obs_free_rock');
    const updatedWaterId = asEntityId('terr_mod_water');

    const legitDelta: IChunkStreamingDelta = {
      newEntities: {
        [newTerrainId]: { id: newTerrainId, type: 'TERRAIN', variantId: 'FOREST', position: asCoordinateKey('0,1') } as ITerrainEntity,
        [newObstacleId]: { id: newObstacleId, type: 'OBSTACLE', destructible: false, position: asCoordinateKey('0,2') } as IObstacleEntity,
      },
      unloadedEntityIds: [staleId],
      updatedTerrain: [
        {
          previousId: initialTerrainId,
          entity: { id: updatedWaterId, type: 'TERRAIN', variantId: 'WATER', position: initialCoord } as ITerrainEntity,
        },
      ],
    };

    const applied = store.getState().applyChunkStreamingDelta(legitDelta);
    expect(applied).toBe(true);

    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore + 1);

    // 1. Unloaded entity is removed from boardEntities and terrain index
    expect(stateAfter.boardEntities[staleId]).toBeUndefined();
    expect(stateAfter.terrain?.[staleCoord]).toBeUndefined();

    // 2. Updated terrain replaced the previous entity
    expect(stateAfter.boardEntities[initialTerrainId]).toBeUndefined();
    expect(stateAfter.boardEntities[updatedWaterId]).toBeDefined();
    expect(stateAfter.terrain?.[initialCoord]).toBe(updatedWaterId);

    // 3. New entities were correctly indexed
    expect(stateAfter.boardEntities[newTerrainId]).toBeDefined();
    expect(stateAfter.terrain?.[asCoordinateKey('0,1')]).toBe(newTerrainId);
    expect(stateAfter.boardEntities[newObstacleId]).toBeDefined();
    expect(stateAfter.occupancy[asCoordinateKey('0,2')]).toBe(newObstacleId);
  });

  it('T22-09: domain snapshot roundtrip preserves full spatial index invariants after streaming operations', () => {
    const store = createGameStore();
    const terrainId = asEntityId('terr_hex_shrine');
    const obstacleId = asEntityId('obs_pillar');
    const pieceId = asEntityId('p_queen');

    const domain = createDefaultDomainState('snapshot-stream-match');
    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'QUEEN',
      position: asCoordinateKey('3,3'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,3')] = pieceId;
    store.getState().resetDomainState(domain);

    const delta: IChunkStreamingDelta = {
      newEntities: {
        [terrainId]: { id: terrainId, type: 'TERRAIN', variantId: 'PLAINS', position: asCoordinateKey('3,4') } as ITerrainEntity,
        [obstacleId]: { id: obstacleId, type: 'OBSTACLE', destructible: false, position: asCoordinateKey('3,5') } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    store.getState().applyChunkStreamingDelta(delta);

    // Snapshot serialization & deserialization
    const serialized = SnapshotSerializer.serialize(store.getState().domain);
    const restored = SnapshotSerializer.deserialize(serialized);

    expect(restored.terrain?.[asCoordinateKey('3,4')]).toBe(terrainId);
    expect(restored.occupancy[asCoordinateKey('3,5')]).toBe(obstacleId);
    expect(restored.occupancy[asCoordinateKey('3,3')]).toBe(pieceId);
    expect(restored.boardEntities[terrainId].type).toBe('TERRAIN');
    expect(restored.boardEntities[obstacleId].type).toBe('OBSTACLE');
    expect(restored.boardEntities[pieceId].type).toBe('PIECE');
  });

  it('T22-10: classical chess moves, captures, Undo and Redo function flawlessly alongside streaming operations', () => {
    const store = createGameStore();
    const whiteRook = asEntityId('w_rook');
    const blackPawn = asEntityId('b_pawn');

    const domain = createDefaultDomainState('classical-chess-match');
    domain.boardEntities[whiteRook] = {
      id: whiteRook,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('0,0')] = whiteRook;

    domain.boardEntities[blackPawn] = {
      id: blackPawn,
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'PAWN',
      position: asCoordinateKey('0,5'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('0,5')] = blackPawn;

    store.getState().resetDomainState(domain);

    // 1. Stream surrounding terrain
    const streamDelta: IChunkStreamingDelta = {
      newEntities: {
        [asEntityId('terr_0_0')]: { id: asEntityId('terr_0_0'), type: 'TERRAIN', variantId: 'PLAINS', position: asCoordinateKey('0,0') } as ITerrainEntity,
        [asEntityId('terr_0_5')]: { id: asEntityId('terr_0_5'), type: 'TERRAIN', variantId: 'PLAINS', position: asCoordinateKey('0,5') } as ITerrainEntity,
      },
      unloadedEntityIds: [],
    };
    store.getState().applyChunkStreamingDelta(streamDelta);

    // 2. Execute classical move and capture: Rook moves 0,0 -> 0,5 capturing Pawn
    const captureCmd = new MovePieceCommand(whiteRook, asCoordinateKey('0,0'), asCoordinateKey('0,5'), 'P1', blackPawn, true);
    store.getState().executeCommand(captureCmd);

    let state = store.getState().domain;
    expect(state.occupancy[asCoordinateKey('0,0')]).toBeUndefined();
    expect(state.occupancy[asCoordinateKey('0,5')]).toBe(whiteRook);
    expect((state.boardEntities[blackPawn] as IPieceEntity).isCaptured).toBe(true);

    // 3. Undo the capture
    store.getState().undo();
    state = store.getState().domain;
    expect(state.occupancy[asCoordinateKey('0,0')]).toBe(whiteRook);
    expect(state.occupancy[asCoordinateKey('0,5')]).toBe(blackPawn);
    expect((state.boardEntities[blackPawn] as IPieceEntity).isCaptured).toBe(false);

    // 4. Redo the capture
    store.getState().redo();
    state = store.getState().domain;
    expect(state.occupancy[asCoordinateKey('0,0')]).toBeUndefined();
    expect(state.occupancy[asCoordinateKey('0,5')]).toBe(whiteRook);
    expect((state.boardEntities[blackPawn] as IPieceEntity).isCaptured).toBe(true);
  });
});

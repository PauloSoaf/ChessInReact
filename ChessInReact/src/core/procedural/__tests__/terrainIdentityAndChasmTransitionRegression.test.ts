import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity, ITerrainEntity, IObstacleEntity } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { createDefaultDomainState } from '../../state/initialState';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { IChunkStreamingDelta } from '../types';

describe('Regression & Reproduction: Terrain Identity and CHASM Transition (Spec 02 Audited Defects)', () => {
  it('REPRO-01 (Defect 1): transition from loaded PLAINS to CHASM on unoccupied cell must succeed and update occupancy', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, {
      seed: 'chasm-repro-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    const store = createGameStore();
    const heroPieceId = asEntityId('hero_piece_1');
    const heroPos = asCoordinateKey('0,0');
    const targetPos = asCoordinateKey('0,1'); // Unoccupied tile

    const piece: IPieceEntity = {
      id: heroPieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: heroPos,
      hasMoved: false,
      isCaptured: false,
    };

    const domain = createDefaultDomainState('chasm-repro-match');
    domain.boardEntities[heroPieceId] = piece;
    domain.occupancy[heroPos] = heroPieceId;
    store.getState().resetDomainState(domain);

    // Initial streaming sync loads normal terrain for chunk (0,0)
    chunkManager.syncWithStore(store);

    const stateBeforeMod = store.getState().domain;
    const initialTerrainId = stateBeforeMod.terrain?.[targetPos];
    expect(initialTerrainId).toBeDefined();
    expect(stateBeforeMod.occupancy[targetPos]).toBeUndefined();

    // Modify targetPos (unoccupied) from PLAINS to CHASM
    chunkManager.setPersistentModification(targetPos, {
      biome: 'CHASM',
      isObstacle: true,
      elevation: 0.1,
    });

    // Synchronize streaming: ChunkManager emits updatedTerrain with desired OBSTACLE entity
    const { delta, applied } = chunkManager.syncWithStore(store);

    // This assertion fails on HEAD b36dd870 because validateStreamingDeltaSemantic
    // throws: 'Invalid streaming delta: updatedTerrain replacement "terr_chasm_0_1" must be of type TERRAIN.'
    expect(applied).toBe(true);
    expect(delta.updatedTerrain).toBeDefined();
    expect(delta.updatedTerrain!.length).toBeGreaterThan(0);

    const stateAfterMod = store.getState().domain;
    const chasmEntityId = stateAfterMod.occupancy[targetPos];
    expect(chasmEntityId).toBeDefined();
    const chasmEntity = stateAfterMod.boardEntities[chasmEntityId!] as IObstacleEntity;
    expect(chasmEntity.type).toBe('OBSTACLE');
    expect(chasmEntity.metadata?.biome).toBe('CHASM');

    // Previous terrain entity should be deleted and terrainMap[targetPos] cleaned up
    expect(stateAfterMod.boardEntities[initialTerrainId!]).toBeUndefined();
    expect(stateAfterMod.terrain?.[targetPos]).toBeUndefined();
  });

  it('REPRO-02 (Defect 2): newEntities attempting to reuse an active terrain ID at a different coordinate must be strictly rejected', () => {
    const store = createGameStore();
    const domain = createDefaultDomainState('terrain-id-reuse-match');

    const originalPos = asCoordinateKey('0,0');
    const divergentPos = asCoordinateKey('5,5');
    const terrainId = asEntityId('terr_plains_0_0');

    const existingTerrain: ITerrainEntity = {
      id: terrainId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: originalPos,
      elevation: 1.0,
    };

    domain.boardEntities[terrainId] = existingTerrain;
    if (domain.terrain) {
      domain.terrain[originalPos] = terrainId;
    }
    store.getState().resetDomainState(domain);

    const revisionBefore = store.getState().domain.revision;

    // Delta attempting to insert newEntities reusing terr_plains_0_0 at coordinate 5,5
    const maliciousDelta: IChunkStreamingDelta = {
      newEntities: {
        [terrainId]: {
          id: terrainId,
          type: 'TERRAIN',
          variantId: 'FOREST',
          position: divergentPos,
          elevation: 1.5,
        } as ITerrainEntity,
      },
      unloadedEntityIds: [],
    };

    // This assertion fails on HEAD b36dd870 because validateStreamingDeltaSemantic
    // does not prohibit reusing an existing terrain ID at a different coordinate!
    expect(() => {
      store.getState().applyChunkStreamingDelta(maliciousDelta);
    }).toThrow(/reuses ID of existing entity/i);

    // State must be completely intact
    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect(stateAfter.terrain?.[originalPos]).toBe(terrainId);
    expect(stateAfter.boardEntities[terrainId]?.position).toBe(originalPos);
    expect(stateAfter.terrain?.[divergentPos]).toBeUndefined();
  });

  it('REPRO-03: transition from loaded CHASM back to PLAINS clears occupancy and sets terrain', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, {
      seed: 'chasm-to-plains-seed',
      chunkSize: 16,
      maxChunksInMemory: 50,
    });

    const store = createGameStore();
    const heroPieceId = asEntityId('hero_piece_chasm');
    const heroPos = asCoordinateKey('0,0');
    const targetPos = asCoordinateKey('0,2');

    const domain = createDefaultDomainState('chasm-revert-match');
    domain.boardEntities[heroPieceId] = {
      id: heroPieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: heroPos,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[heroPos] = heroPieceId;
    store.getState().resetDomainState(domain);

    // Initial streaming sync loads normal terrain
    chunkManager.syncWithStore(store);

    // 1. Mod to CHASM
    chunkManager.setPersistentModification(targetPos, {
      biome: 'CHASM',
      isObstacle: true,
      elevation: 0.1,
    });
    chunkManager.syncWithStore(store);

    let state = store.getState().domain;
    const chasmObsId = state.occupancy[targetPos];
    expect(chasmObsId).toBeDefined();
    expect(state.boardEntities[chasmObsId!]?.type).toBe('OBSTACLE');
    expect(state.terrain?.[targetPos]).toBeUndefined();

    // 2. Mod back to PLAINS
    chunkManager.setPersistentModification(targetPos, {
      biome: 'PLAINS',
      isObstacle: false,
      elevation: 1.0,
    });
    const { applied } = chunkManager.syncWithStore(store);
    expect(applied).toBe(true);

    state = store.getState().domain;
    expect(state.occupancy[targetPos]).toBeUndefined(); // Occupancy cleared!
    const newPlainsId = state.terrain?.[targetPos];
    expect(newPlainsId).toBeDefined();
    expect(state.boardEntities[newPlainsId!]?.type).toBe('TERRAIN');
    expect(state.boardEntities[chasmObsId!]).toBeUndefined();
  });

  it('REPRO-04: updatedTerrain attempting to place an OBSTACLE onto an active PIECE is strictly rejected', () => {
    const store = createGameStore();
    const pieceId = asEntityId('active_hero_king');
    const piecePos = asCoordinateKey('2,2');
    const oldTerrainId = asEntityId('terr_plains_2_2');

    const domain = createDefaultDomainState('obstacle-on-piece-match');
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

    domain.boardEntities[oldTerrainId] = {
      id: oldTerrainId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: piecePos,
    } as ITerrainEntity;
    domain.terrain![piecePos] = oldTerrainId;

    store.getState().resetDomainState(domain);
    const revisionBefore = store.getState().domain.revision;

    // Delta attempting to update the terrain at 2,2 to an OBSTACLE while piece is on 2,2
    const maliciousUpdateDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: oldTerrainId,
          entity: {
            id: asEntityId('obs_boulder_2_2'),
            type: 'OBSTACLE',
            destructible: false,
            position: piecePos,
          } as IObstacleEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(maliciousUpdateDelta);
    }).toThrow(/collides with active PIECE/);

    const stateAfter = store.getState().domain;
    expect(stateAfter.revision).toBe(revisionBefore);
    expect(stateAfter.occupancy[piecePos]).toBe(pieceId);
    expect(stateAfter.boardEntities[oldTerrainId]).toBeDefined();
    expect(stateAfter.boardEntities[asEntityId('obs_boulder_2_2')]).toBeUndefined();
  });

  it('REPRO-05: newEntities attempting to re-insert an already existing entity at the same coordinate is rejected', () => {
    const store = createGameStore();
    const domain = createDefaultDomainState('same-coord-reuse-match');
    const pos = asCoordinateKey('3,3');
    const terrId = asEntityId('terr_existing_3_3');

    domain.boardEntities[terrId] = {
      id: terrId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: pos,
    } as ITerrainEntity;
    domain.terrain![pos] = terrId;
    store.getState().resetDomainState(domain);

    const delta: IChunkStreamingDelta = {
      newEntities: {
        [terrId]: {
          id: terrId,
          type: 'TERRAIN',
          variantId: 'PLAINS',
          position: pos,
        } as ITerrainEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(delta);
    }).toThrow(/already exists in domain state/);
  });
});

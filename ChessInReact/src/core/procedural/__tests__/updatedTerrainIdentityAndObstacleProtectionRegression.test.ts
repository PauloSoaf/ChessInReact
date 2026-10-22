import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IObstacleEntity, IPieceEntity, ITerrainEntity, isProceduralEntity } from '../../entities/types';
import { createGameStore } from '../../state/gameStore';
import { ChunkManager } from '../ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { IChunkStreamingDelta } from '../types';
import { SnapshotSerializer } from '../../serialization/SnapshotSerializer';
import { EntityManager } from '../../entities/EntityManager';
import { MovePieceCommand } from '../../commands/MovePieceCommand';

describe('Regression & Reproduction: PATCH-26 UpdatedTerrain Identity & Obstacle Protection', () => {
  // =========================================================================
  // PATCH-26A: Impedir reutilização de IDs em updatedTerrain
  // =========================================================================

  it('T26-01: rejects updatedTerrain attempting to reuse ID of another existing terrain entity at different coordinate', () => {
    const store = createGameStore();
    const terrainA: ITerrainEntity = {
      id: asEntityId('terrain_A'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('1,1'),
    };
    const terrainB: ITerrainEntity = {
      id: asEntityId('terrain_B'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('2,2'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: {
        [terrainA.id]: terrainA,
        [terrainB.id]: terrainB,
      },
      unloadedEntityIds: [],
    });

    const revBefore = store.getState().domain.revision;

    // Delta tries to update terrain_A at 1,1 using the ID of existing terrain_B
    const invalidDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: asEntityId('terrain_A'),
          entity: {
            id: asEntityId('terrain_B'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'WATER',
            position: asCoordinateKey('1,1'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(invalidDelta);
    }).toThrow(/reuses ID of existing entity/i);

    // Invariants preserved: revision unmodified, terrainB still at 2,2, terrainA still at 1,1
    const domain = store.getState().domain;
    expect(domain.revision).toBe(revBefore);
    expect(domain.terrain?.[asCoordinateKey('2,2')]).toBe(asEntityId('terrain_B'));
    expect(domain.terrain?.[asCoordinateKey('1,1')]).toBe(asEntityId('terrain_A'));
    expect(domain.boardEntities[asEntityId('terrain_B')]?.position).toBe(asCoordinateKey('2,2'));
    expect(domain.boardEntities[asEntityId('terrain_A')]?.position).toBe(asCoordinateKey('1,1'));
  });

  it('T26-02: rejects updatedTerrain attempting to reuse ID of an active gameplay piece', () => {
    const store = createGameStore();
    const pieceId = asEntityId('gameplay_piece_pawn_1');
    const piece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('4,1'),
      hasMoved: false,
      isCaptured: false,
    };

    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: { ...state.domain.boardEntities, [piece.id]: piece },
        occupancy: { ...state.domain.occupancy, [piece.position]: piece.id },
      },
    }));

    const terrainTarget: ITerrainEntity = {
      id: asEntityId('terr_target_e3'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('4,2'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: { [terrainTarget.id]: terrainTarget },
      unloadedEntityIds: [],
    });

    const revBefore = store.getState().domain.revision;

    // Delta tries to update terr_target_e3 using the active pieceId
    const deltaWithPieceId: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: terrainTarget.id,
          entity: {
            id: pieceId,
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'FOREST',
            position: asCoordinateKey('4,2'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(deltaWithPieceId);
    }).toThrow(/gameplay PIECE/i);

    expect(store.getState().domain.revision).toBe(revBefore);
    expect(store.getState().domain.boardEntities[pieceId]?.type).toBe('PIECE');
  });

  it('T26-03: rejects batch where two different updatedTerrain operations produce the same entity ID', () => {
    const store = createGameStore();
    const cell1: ITerrainEntity = {
      id: asEntityId('cell_1'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('0,1'),
    };
    const cell2: ITerrainEntity = {
      id: asEntityId('cell_2'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('0,2'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: { [cell1.id]: cell1, [cell2.id]: cell2 },
      unloadedEntityIds: [],
    });

    const revBefore = store.getState().domain.revision;

    const duplicateReplacementDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: cell1.id,
          entity: {
            id: asEntityId('replacement_same_id'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'WATER',
            position: asCoordinateKey('0,1'),
          } as ITerrainEntity,
        },
        {
          previousId: cell2.id,
          entity: {
            id: asEntityId('replacement_same_id'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'WATER',
            position: asCoordinateKey('0,2'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(duplicateReplacementDelta);
    }).toThrow(/duplicate replacement ID/i);

    expect(store.getState().domain.revision).toBe(revBefore);
  });

  it('T26-04: rejects delta atomically when valid operations are combined with an invalid ID reuse', () => {
    const store = createGameStore();
    const validCell: ITerrainEntity = {
      id: asEntityId('cell_valid_a'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('0,3'),
    };
    const targetCell: ITerrainEntity = {
      id: asEntityId('cell_target_b'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('0,4'),
    };
    const foreignCell: ITerrainEntity = {
      id: asEntityId('cell_foreign_c'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('0,5'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: {
        [validCell.id]: validCell,
        [targetCell.id]: targetCell,
        [foreignCell.id]: foreignCell,
      },
      unloadedEntityIds: [],
    });

    const revBefore = store.getState().domain.revision;

    const mixedDelta: IChunkStreamingDelta = {
      newEntities: {
        [asEntityId('cell_new_ok')]: {
          id: asEntityId('cell_new_ok'),
          type: 'TERRAIN',
          provenance: 'PROCEDURAL',
          variantId: 'PLAINS',
          position: asCoordinateKey('0,6'),
        } as ITerrainEntity,
      },
      unloadedEntityIds: [],
      updatedTerrain: [
        // Operation 1: valid
        {
          previousId: validCell.id,
          entity: {
            id: asEntityId('cell_valid_a_updated'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'MOUNTAIN',
            position: asCoordinateKey('0,3'),
          } as ITerrainEntity,
        },
        // Operation 2: invalid ID reuse (reusing cell_foreign_c)
        {
          previousId: targetCell.id,
          entity: {
            id: foreignCell.id,
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'WATER',
            position: asCoordinateKey('0,4'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(mixedDelta);
    }).toThrow(/reuses ID of existing entity/i);

    // Verify 100% atomic rollback: no change to cell_valid_a, no cell_new_ok, revision identical
    const domain = store.getState().domain;
    expect(domain.revision).toBe(revBefore);
    expect(domain.boardEntities[asEntityId('cell_new_ok')]).toBeUndefined();
    expect(domain.boardEntities[asEntityId('cell_valid_a_updated')]).toBeUndefined();
    expect((domain.boardEntities[validCell.id] as ITerrainEntity)?.variantId).toBe('PLAINS');
  });

  it('T26-05: executes legitimate in-place and ID-transition terrain updates (PLAINS -> WATER)', () => {
    const store = createGameStore();
    const cell: ITerrainEntity = {
      id: asEntityId('cell_plains_test'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('2,4'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: { [cell.id]: cell },
      unloadedEntityIds: [],
    });

    const legitimateDelta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: cell.id,
          entity: {
            id: asEntityId('cell_water_test'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'WATER',
            position: asCoordinateKey('2,4'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(legitimateDelta);
    }).not.toThrow();

    const domain = store.getState().domain;
    expect(domain.terrain?.[asCoordinateKey('2,4')]).toBe(asEntityId('cell_water_test'));
    expect((domain.boardEntities[asEntityId('cell_water_test')] as ITerrainEntity)?.variantId).toBe('WATER');
    expect(domain.boardEntities[cell.id]).toBeUndefined();
  });

  it('T26-06: confirms SnapshotSerializer consistency and roundtrip after valid updatedTerrain', () => {
    const store = createGameStore();
    const cell: ITerrainEntity = {
      id: asEntityId('terr_init_snap'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('3,3'),
    };

    store.getState().applyChunkStreamingDelta({
      newEntities: { [cell.id]: cell },
      unloadedEntityIds: [],
    });

    store.getState().applyChunkStreamingDelta({
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: cell.id,
          entity: {
            id: asEntityId('terr_updated_snap'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'FOREST',
            position: asCoordinateKey('3,3'),
          } as ITerrainEntity,
        },
      ],
    });

    const serialized = SnapshotSerializer.serialize(store.getState().domain);
    const restored = SnapshotSerializer.deserialize(serialized);

    expect(restored.terrain?.[asCoordinateKey('3,3')]).toBe(asEntityId('terr_updated_snap'));
    expect((restored.boardEntities[asEntityId('terr_updated_snap')] as ITerrainEntity)?.variantId).toBe('FOREST');
    expect(restored.boardEntities[cell.id]).toBeUndefined();
  });

  // =========================================================================
  // PATCH-26B: Proteger obstáculos de gameplay
  // =========================================================================

  it('T26-07: rejects updatedTerrain attempting to replace a gameplay OBSTACLE', () => {
    const store = createGameStore();
    // Create a gameplay obstacle (e.g. wall placed by player/editor/variant)
    const gameplayWall: IObstacleEntity = {
      id: asEntityId('gameplay_wall_1'),
      type: 'OBSTACLE',
      provenance: 'GAMEPLAY',
      destructible: true,
      hp: 100,
      position: asCoordinateKey('5,5'),
    };

    // Add gameplay wall to domain
    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: {
          ...state.domain.boardEntities,
          [gameplayWall.id]: gameplayWall,
        },
        occupancy: {
          ...state.domain.occupancy,
          [gameplayWall.position]: gameplayWall.id,
        },
      },
    }));

    const revBefore = store.getState().domain.revision;

    // Procedural delta attempts to replace gameplay wall via updatedTerrain
    const delta: IChunkStreamingDelta = {
      newEntities: {},
      unloadedEntityIds: [],
      updatedTerrain: [
        {
          previousId: gameplayWall.id,
          entity: {
            id: asEntityId('terr_chasm_5_5'),
            type: 'TERRAIN',
            provenance: 'PROCEDURAL',
            variantId: 'PLAINS',
            position: asCoordinateKey('5,5'),
          } as ITerrainEntity,
        },
      ],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(delta);
    }).toThrow(/gameplay OBSTACLE/i);

    expect(store.getState().domain.revision).toBe(revBefore);
    expect(store.getState().domain.boardEntities[gameplayWall.id]).toBeDefined();
    expect(store.getState().domain.occupancy[gameplayWall.position]).toBe(gameplayWall.id);
  });

  it('T26-08: rejects newEntities attempting to insert procedural entity on same coordinate as gameplay OBSTACLE', () => {
    const store = createGameStore();
    const gameplayObstacle: IObstacleEntity = {
      id: asEntityId('gameplay_pillar_2'),
      type: 'OBSTACLE',
      provenance: 'GAMEPLAY',
      destructible: false,
      position: asCoordinateKey('5,6'),
    };

    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: {
          ...state.domain.boardEntities,
          [gameplayObstacle.id]: gameplayObstacle,
        },
        occupancy: {
          ...state.domain.occupancy,
          [gameplayObstacle.position]: gameplayObstacle.id,
        },
      },
    }));

    const revBefore = store.getState().domain.revision;

    // Procedural delta tries to spawn procedural OBSTACLE or TERRAIN at 5,6
    const conflictDelta: IChunkStreamingDelta = {
      newEntities: {
        [asEntityId('terr_chasm_5_6')]: {
          id: asEntityId('terr_chasm_5_6'),
          type: 'OBSTACLE',
          provenance: 'PROCEDURAL',
          destructible: false,
          position: asCoordinateKey('5,6'),
          metadata: { biome: 'CHASM', isObstacle: true },
        } as IObstacleEntity,
      },
      unloadedEntityIds: [],
    };

    expect(() => {
      store.getState().applyChunkStreamingDelta(conflictDelta);
    }).toThrow(/gameplay OBSTACLE/i);

    expect(store.getState().domain.revision).toBe(revBefore);
    expect(store.getState().domain.boardEntities[gameplayObstacle.id]).toBeDefined();
    expect(store.getState().domain.occupancy[gameplayObstacle.position]).toBe(gameplayObstacle.id);
  });

  it('T26-09: allows legitimate procedural CHASM to PLAINS conversion', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, {
      seed: 'chasm-to-plains-seed',
      chunkSize: 16,
    });
    chunkManager.setPersistentModification(asCoordinateKey('0,1'), {
      biome: 'CHASM',
      isObstacle: true,
    });

    const store = createGameStore();
    // Anchor piece to trigger chunk streaming
    const anchorPiece: IPieceEntity = {
      id: asEntityId('anchor_p1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: { ...state.domain.boardEntities, [anchorPiece.id]: anchorPiece },
        occupancy: { ...state.domain.occupancy, [anchorPiece.position]: anchorPiece.id },
      },
    }));

    const initialDelta = chunkManager.updateStreaming(store.getState().domain);
    store.getState().applyChunkStreamingDelta(initialDelta);

    expect(store.getState().domain.occupancy[asCoordinateKey('0,1')]).toBeDefined();
    const chasmEntityId = store.getState().domain.occupancy[asCoordinateKey('0,1')]!;
    const chasmEntity = store.getState().domain.boardEntities[chasmEntityId];
    expect(chasmEntity?.type).toBe('OBSTACLE');

    // Convert CHASM back to PLAINS
    chunkManager.setPersistentModification(asCoordinateKey('0,1'), { biome: 'PLAINS' });
    const updateDelta = chunkManager.updateStreaming(store.getState().domain);

    expect(() => {
      store.getState().applyChunkStreamingDelta(updateDelta);
    }).not.toThrow();

    const domain = store.getState().domain;
    expect(domain.occupancy[asCoordinateKey('0,1')]).toBeUndefined();
    expect(domain.terrain?.[asCoordinateKey('0,1')]).toBeDefined();
    const plainsId = domain.terrain![asCoordinateKey('0,1')]!;
    expect(domain.boardEntities[plainsId]?.type).toBe('TERRAIN');
  });

  it('T26-10: allows legitimate procedural PLAINS to CHASM conversion', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, {
      seed: 'plains-to-chasm-seed',
      chunkSize: 16,
    });

    const store = createGameStore();
    // Anchor piece to trigger chunk streaming
    const anchorPiece: IPieceEntity = {
      id: asEntityId('anchor_p2'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: { ...state.domain.boardEntities, [anchorPiece.id]: anchorPiece },
        occupancy: { ...state.domain.occupancy, [anchorPiece.position]: anchorPiece.id },
      },
    }));

    const initialDelta = chunkManager.updateStreaming(store.getState().domain);
    store.getState().applyChunkStreamingDelta(initialDelta);

    expect(store.getState().domain.terrain?.[asCoordinateKey('0,1')]).toBeDefined();

    // Convert PLAINS to CHASM
    chunkManager.setPersistentModification(asCoordinateKey('0,1'), { biome: 'CHASM' });
    const updateDelta = chunkManager.updateStreaming(store.getState().domain);

    expect(() => {
      store.getState().applyChunkStreamingDelta(updateDelta);
    }).not.toThrow();

    const domain = store.getState().domain;
    expect(domain.terrain?.[asCoordinateKey('0,1')]).toBeUndefined();
    expect(domain.occupancy[asCoordinateKey('0,1')]).toBeDefined();
    const chasmId = domain.occupancy[asCoordinateKey('0,1')]!;
    expect(domain.boardEntities[chasmId]?.type).toBe('OBSTACLE');
  });

  it('T26-11: restores snapshot containing both procedural and gameplay obstacles with correct provenance separation', () => {
    const store = createGameStore();
    const proceduralChasm: IObstacleEntity = {
      id: asEntityId('terr_chasm_proc_1'),
      type: 'OBSTACLE',
      provenance: 'PROCEDURAL',
      destructible: false,
      position: asCoordinateKey('7,0'),
      metadata: { biome: 'CHASM', isObstacle: true },
    };
    const gameplayBarrier: IObstacleEntity = {
      id: asEntityId('gameplay_barrier_1'),
      type: 'OBSTACLE',
      provenance: 'GAMEPLAY',
      destructible: true,
      hp: 50,
      position: asCoordinateKey('7,1'),
    };

    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: {
          ...state.domain.boardEntities,
          [proceduralChasm.id]: proceduralChasm,
          [gameplayBarrier.id]: gameplayBarrier,
        },
        occupancy: {
          ...state.domain.occupancy,
          [proceduralChasm.position]: proceduralChasm.id,
          [gameplayBarrier.position]: gameplayBarrier.id,
        },
      },
    }));

    const json = SnapshotSerializer.serialize(store.getState().domain);
    const restoredDomain = SnapshotSerializer.deserialize(json);

    const procRestored = restoredDomain.boardEntities[proceduralChasm.id];
    const gameplayRestored = restoredDomain.boardEntities[gameplayBarrier.id];

    expect(procRestored?.provenance).toBe('PROCEDURAL');
    expect(gameplayRestored?.provenance).toBe('GAMEPLAY');
    expect(isProceduralEntity(procRestored!)).toBe(true);
    expect(isProceduralEntity(gameplayRestored!)).toBe(false);

    // Verify backward compatibility: legacy snapshot without provenance field
    const envelope = JSON.parse(json);
    delete (envelope.state.boardEntities[proceduralChasm.id] as { provenance?: string }).provenance;
    delete (envelope.state.boardEntities[gameplayBarrier.id] as { provenance?: string }).provenance;
    const legacyJson = JSON.stringify(envelope);
    const legacyRestored = SnapshotSerializer.deserialize(legacyJson);
    const legacyProc = legacyRestored.boardEntities[proceduralChasm.id];
    const legacyGameplay = legacyRestored.boardEntities[gameplayBarrier.id];
    expect(isProceduralEntity(legacyProc!)).toBe(true);
    expect(isProceduralEntity(legacyGameplay!)).toBe(false);
  });

  it('T26-12: executes gameplay operations and Undo/Redo without altering procedural or obstacle spatial indices', () => {
    const store = createGameStore();
    const pawnId = asEntityId('test_pawn_e2');
    const fromCoord = asCoordinateKey('4,1');
    const toCoord = asCoordinateKey('4,3');

    const pawn: IPieceEntity = {
      id: pawnId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: fromCoord,
      hasMoved: false,
      isCaptured: false,
    };

    const terrainCell: ITerrainEntity = {
      id: asEntityId('terr_plains_4_4'),
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: 'PLAINS',
      position: asCoordinateKey('4,4'),
    };
    const gameplayObstacle: IObstacleEntity = {
      id: asEntityId('gameplay_block_4_5'),
      type: 'OBSTACLE',
      provenance: 'GAMEPLAY',
      destructible: false,
      position: asCoordinateKey('4,5'),
    };

    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: {
          ...state.domain.boardEntities,
          [pawn.id]: pawn,
          [terrainCell.id]: terrainCell,
          [gameplayObstacle.id]: gameplayObstacle,
        },
        terrain: {
          ...state.domain.terrain,
          [terrainCell.position]: terrainCell.id,
        },
        occupancy: {
          ...state.domain.occupancy,
          [pawn.position]: pawn.id,
          [gameplayObstacle.position]: gameplayObstacle.id,
        },
      },
    }));

    // Move pawn e2 to e4 (4,1 to 4,3)
    const moveCmd = new MovePieceCommand(pawnId, fromCoord, toCoord, 'P1');
    store.getState().executeCommand(moveCmd);

    expect(store.getState().domain.occupancy[toCoord]).toBe(pawnId);
    expect(store.getState().domain.occupancy[gameplayObstacle.position]).toBe(gameplayObstacle.id);
    expect(store.getState().domain.terrain?.[terrainCell.position]).toBe(terrainCell.id);

    // Undo move
    store.getState().undo();

    expect(store.getState().domain.occupancy[fromCoord]).toBe(pawnId);
    expect(store.getState().domain.occupancy[toCoord]).toBeUndefined();
    expect(store.getState().domain.occupancy[gameplayObstacle.position]).toBe(gameplayObstacle.id);
    expect(store.getState().domain.terrain?.[terrainCell.position]).toBe(terrainCell.id);

    // Redo move
    store.getState().redo();

    expect(store.getState().domain.occupancy[toCoord]).toBe(pawnId);
    expect(store.getState().domain.occupancy[gameplayObstacle.position]).toBe(gameplayObstacle.id);
    expect(store.getState().domain.terrain?.[terrainCell.position]).toBe(terrainCell.id);
  });

  // =========================================================================
  // PATCH-26C: Auditoria de invariantes em integração completa
  // =========================================================================

  it('T26-13 (PATCH-26C Integration): validates full lifecycle invariants with EntityManager across generation, streaming, deltas and snapshots', () => {
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, {
      seed: 'full-lifecycle-audit-seed',
      chunkSize: 16,
    });

    const store = createGameStore();
    const anchorPiece: IPieceEntity = {
      id: asEntityId('anchor_p3'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: { ...state.domain.boardEntities, [anchorPiece.id]: anchorPiece },
        occupancy: { ...state.domain.occupancy, [anchorPiece.position]: anchorPiece.id },
      },
    }));

    // 1. Initial streaming
    const delta1 = chunkManager.updateStreaming(store.getState().domain);
    store.getState().applyChunkStreamingDelta(delta1);

    // 2. Add a gameplay obstacle
    const customWall: IObstacleEntity = {
      id: asEntityId('custom_gameplay_wall_10'),
      type: 'OBSTACLE',
      provenance: 'GAMEPLAY',
      destructible: true,
      hp: 200,
      position: asCoordinateKey('10,10'),
    };
    store.setState((state) => ({
      domain: {
        ...state.domain,
        boardEntities: { ...state.domain.boardEntities, [customWall.id]: customWall },
        occupancy: { ...state.domain.occupancy, [customWall.position]: customWall.id },
      },
    }));

    // 3. Persistent modifications (PLAINS -> CHASM and PLAINS -> WATER)
    chunkManager.setPersistentModification(asCoordinateKey('1,2'), { biome: 'CHASM' });
    chunkManager.setPersistentModification(asCoordinateKey('1,3'), { biome: 'WATER' });
    const delta2 = chunkManager.updateStreaming(store.getState().domain);
    store.getState().applyChunkStreamingDelta(delta2);

    // 4. Verify invariants using EntityManager
    const manager = EntityManager.fromSnapshot({
      entityById: store.getState().domain.boardEntities,
      occupancyByCoordinate: store.getState().domain.occupancy,
      terrainByCoordinate: store.getState().domain.terrain,
    });
    const inv1 = manager.validateInvariants();
    expect(inv1.valid).toBe(true);
    expect(inv1.errors).toEqual([]);

    // 5. Attempt invalid deltas and verify rejection + zero corruption
    expect(() => {
      store.getState().applyChunkStreamingDelta({
        newEntities: {},
        unloadedEntityIds: [],
        updatedTerrain: [
          {
            previousId: asEntityId('terr_water_1_3'),
            entity: {
              id: customWall.id, // Trying to steal gameplay wall ID
              type: 'TERRAIN',
              provenance: 'PROCEDURAL',
              variantId: 'FOREST',
              position: asCoordinateKey('1,3'),
            } as ITerrainEntity,
          },
        ],
      });
    }).toThrow(/gameplay OBSTACLE/i);

    // Invariants still 100% valid after rejected delta
    const managerAfterReject = EntityManager.fromSnapshot({
      entityById: store.getState().domain.boardEntities,
      occupancyByCoordinate: store.getState().domain.occupancy,
      terrainByCoordinate: store.getState().domain.terrain,
    });
    expect(managerAfterReject.validateInvariants().valid).toBe(true);

    // 6. Snapshot serialization and restore
    const snapshotStr = SnapshotSerializer.serialize(store.getState().domain);
    const restoredDomain = SnapshotSerializer.deserialize(snapshotStr);
    const managerRestored = EntityManager.fromSnapshot({
      entityById: restoredDomain.boardEntities,
      occupancyByCoordinate: restoredDomain.occupancy,
      terrainByCoordinate: restoredDomain.terrain,
    });
    expect(managerRestored.validateInvariants().valid).toBe(true);
  });
});

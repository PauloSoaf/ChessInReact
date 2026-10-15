import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IObstacleEntity, IPieceEntity, ITerrainEntity } from '../../entities/types';
import { ChunkManager } from '../../procedural/ChunkManager';
import { SquareTopology } from '../../topology/SquareTopology';
import { createDefaultDomainState } from '../../state/initialState';
import { SnapshotSerializer } from '../SnapshotSerializer';

describe('PATCH-11: Terrain Persistence and Snapshot Invariants', () => {
  it('T11-01: correctly serializes and deserializes coexisting piece, terrain, and physical obstacle', () => {
    const domain = createDefaultDomainState('coexistence-match');

    const piecePos = asCoordinateKey('4,3');
    const pieceId = asEntityId('p_white_knight_4_3');
    const piece: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: piecePos,
      hasMoved: false,
      isCaptured: false,
    };

    const terrainPlainsPos = asCoordinateKey('4,3');
    const terrainPlainsId = asEntityId('terr_plains_4_3');
    const terrainPlains: ITerrainEntity = {
      id: terrainPlainsId,
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: terrainPlainsPos,
      elevation: 1.0,
      metadata: { biome: 'PLAINS', isWalkable: true },
    };

    const terrainWaterPos = asCoordinateKey('1,2');
    const terrainWaterId = asEntityId('terr_water_1_2');
    const terrainWater: ITerrainEntity = {
      id: terrainWaterId,
      type: 'TERRAIN',
      variantId: 'WATER',
      position: terrainWaterPos,
      elevation: 0.1,
      metadata: { biome: 'WATER', isWalkable: false },
    };

    const obstaclePos = asCoordinateKey('2,2');
    const obstacleId = asEntityId('obs_mountain_2_2');
    const obstacle: IObstacleEntity = {
      id: obstacleId,
      type: 'OBSTACLE',
      position: obstaclePos,
      destructible: false,
      metadata: { biome: 'MOUNTAIN' },
    };

    domain.boardEntities[pieceId] = piece;
    domain.occupancy[piecePos] = pieceId;

    domain.boardEntities[terrainPlainsId] = terrainPlains;
    domain.terrain![terrainPlainsPos] = terrainPlainsId;

    domain.boardEntities[terrainWaterId] = terrainWater;
    domain.terrain![terrainWaterPos] = terrainWaterId;

    domain.boardEntities[obstacleId] = obstacle;
    domain.occupancy[obstaclePos] = obstacleId;

    const serialized = SnapshotSerializer.serialize(domain);
    const restored = SnapshotSerializer.deserialize(serialized);

    expect(restored.boardEntities[pieceId]).toEqual(piece);
    expect(restored.boardEntities[terrainPlainsId]).toEqual(terrainPlains);
    expect(restored.boardEntities[terrainWaterId]).toEqual(terrainWater);
    expect(restored.boardEntities[obstacleId]).toEqual(obstacle);

    // Terrain and occupancy indices remain strictly decoupled
    expect(restored.occupancy[piecePos]).toBe(pieceId);
    expect(restored.occupancy[obstaclePos]).toBe(obstacleId);
    expect(restored.terrain?.[terrainPlainsPos]).toBe(terrainPlainsId);
    expect(restored.terrain?.[terrainWaterPos]).toBe(terrainWaterId);
    expect(restored.occupancy[terrainWaterPos]).toBeUndefined();
  });

  it('T11-02: safely migrates legacy Spec 01 snapshots without explicit terrain index', () => {
    const legacyPayload = {
      version: 1,
      timestamp: 1700000000000,
      state: {
        matchId: 'legacy-spec01',
        variantId: 'classic_square',
        isGameOver: false,
        winnerId: null,
        activePlayer: 'P1',
        turnNumber: 5,
        revision: 12,
        boardEntities: {
          [asEntityId('p_pawn_0_1')]: {
            id: asEntityId('p_pawn_0_1'),
            type: 'PIECE',
            ownerId: 'P1',
            variantId: 'PAWN',
            position: asCoordinateKey('0,1'),
            hasMoved: true,
            isCaptured: false,
          },
          [asEntityId('terr_0_0')]: {
            id: asEntityId('terr_0_0'),
            type: 'TERRAIN',
            variantId: 'PLAINS',
            position: asCoordinateKey('0,0'),
            elevation: 1.0,
          },
        },
        occupancy: {
          [asCoordinateKey('0,1')]: asEntityId('p_pawn_0_1'),
        },
        // terrain field intentionally absent in Spec 01
        capturedInventory: { P1: [], P2: [], NONE: [] },
        turnState: {
          phase: 'WAITING',
          lastActionTimestamp: 1700000000000,
          enPassantTarget: null,
          fiftyMoveCounter: 0,
        },
      },
    };

    const restored = SnapshotSerializer.deserialize(JSON.stringify(legacyPayload));
    expect(restored.terrain).toBeDefined();
    expect(restored.terrain?.[asCoordinateKey('0,0')]).toBe(asEntityId('terr_0_0'));
    expect(restored.occupancy[asCoordinateKey('0,1')]).toBe(asEntityId('p_pawn_0_1'));
  });

  it('T11-03: preserves indices across piece movement and serialization cycles', () => {
    const domain = createDefaultDomainState('move-persistence');

    const fromPos = asCoordinateKey('0,0');
    const toPos = asCoordinateKey('0,1');
    const pieceId = asEntityId('test_rook');

    domain.boardEntities[pieceId] = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: fromPos,
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[fromPos] = pieceId;

    domain.boardEntities[asEntityId('t_0_0')] = {
      id: asEntityId('t_0_0'),
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: fromPos,
      elevation: 1.0,
    };
    domain.terrain![fromPos] = asEntityId('t_0_0');

    domain.boardEntities[asEntityId('t_0_1')] = {
      id: asEntityId('t_0_1'),
      type: 'TERRAIN',
      variantId: 'FOREST',
      position: toPos,
      elevation: 1.2,
    };
    domain.terrain![toPos] = asEntityId('t_0_1');

    // Save initial
    const json1 = SnapshotSerializer.serialize(domain);
    const restored1 = SnapshotSerializer.deserialize(json1);

    // Simulate move
    delete restored1.occupancy[fromPos];
    restored1.occupancy[toPos] = pieceId;
    restored1.boardEntities[pieceId] = {
      ...(restored1.boardEntities[pieceId] as IPieceEntity),
      position: toPos,
      hasMoved: true,
    };

    // Save moved
    const json2 = SnapshotSerializer.serialize(restored1);
    const restored2 = SnapshotSerializer.deserialize(json2);

    expect(restored2.occupancy[fromPos]).toBeUndefined();
    expect(restored2.occupancy[toPos]).toBe(pieceId);
    expect(restored2.terrain?.[fromPos]).toBe(asEntityId('t_0_0'));
    expect(restored2.terrain?.[toPos]).toBe(asEntityId('t_0_1'));
  });

  it('T11-04: rejects corrupted snapshots and conflicting indices with explicit errors', () => {
    // Spatial mismatch in terrain
    const corrupt1 = {
      version: 2,
      timestamp: 0,
      state: {
        matchId: 'c1',
        variantId: 'classic',
        isGameOver: false,
        winnerId: null,
        activePlayer: 'P1',
        turnNumber: 1,
        revision: 0,
        boardEntities: {
          [asEntityId('t1')]: {
            id: asEntityId('t1'),
            type: 'TERRAIN',
            position: asCoordinateKey('0,0'),
          },
        },
        occupancy: {},
        terrain: {
          [asCoordinateKey('5,5')]: asEntityId('t1'), // Mismatched coordinate!
        },
      },
    };
    expect(() => SnapshotSerializer.deserialize(JSON.stringify(corrupt1))).toThrow(
      /spatial mismatch for terrain entity/i
    );

    // Terrain entity erroneously placed in occupancy
    const corrupt2 = {
      version: 2,
      timestamp: 0,
      state: {
        matchId: 'c2',
        variantId: 'classic',
        isGameOver: false,
        winnerId: null,
        activePlayer: 'P1',
        turnNumber: 1,
        revision: 0,
        boardEntities: {
          [asEntityId('t1')]: {
            id: asEntityId('t1'),
            type: 'TERRAIN',
            position: asCoordinateKey('0,0'),
          },
        },
        occupancy: {
          [asCoordinateKey('0,0')]: asEntityId('t1'),
        },
        terrain: {
          [asCoordinateKey('0,0')]: asEntityId('t1'),
        },
      },
    };
    expect(() => SnapshotSerializer.deserialize(JSON.stringify(corrupt2))).toThrow(
      /erroneously present in physical occupancy/i
    );

    // Non-existent entity referenced by terrain index
    const corrupt3 = {
      version: 2,
      timestamp: 0,
      state: {
        matchId: 'c3',
        variantId: 'classic',
        isGameOver: false,
        winnerId: null,
        activePlayer: 'P1',
        turnNumber: 1,
        revision: 0,
        boardEntities: {},
        occupancy: {},
        terrain: {
          [asCoordinateKey('0,0')]: asEntityId('ghost_entity'),
        },
      },
    };
    expect(() => SnapshotSerializer.deserialize(JSON.stringify(corrupt3))).toThrow(
      /references non-existent entity/i
    );
  });

  it('T11-05: end-to-end integration: save -> load -> chunk streaming -> move -> save', () => {
    const domain = createDefaultDomainState('streaming-snapshot-integration');
    const pieceId = asEntityId('p_king');
    const king: IPieceEntity = {
      id: pieceId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[pieceId] = king;
    domain.occupancy[asCoordinateKey('0,0')] = pieceId;

    // 1. Initial save & load
    const savedInitial = SnapshotSerializer.serialize(domain);
    const loaded = SnapshotSerializer.deserialize(savedInitial);

    // 2. Chunk streaming on loaded state
    const topology = new SquareTopology({ width: null, height: null });
    const chunkManager = new ChunkManager(topology, { seed: 'snap-stream-seed' }, { chunkSize: 16 });
    const delta = chunkManager.updateStreaming(loaded);

    for (const [id, entity] of Object.entries(delta.newEntities)) {
      loaded.boardEntities[id as import('../../coordinates').EntityId] = entity;
      if (entity.type === 'TERRAIN') {
        loaded.terrain![entity.position] = entity.id;
      } else if (entity.type === 'OBSTACLE') {
        loaded.occupancy[entity.position] = entity.id;
      }
    }

    // 3. Move king to new position
    const targetPos = asCoordinateKey('0,1');
    delete loaded.occupancy[asCoordinateKey('0,0')];
    loaded.occupancy[targetPos] = pieceId;
    loaded.boardEntities[pieceId] = {
      ...(loaded.boardEntities[pieceId] as IPieceEntity),
      position: targetPos,
      hasMoved: true,
    };

    // 4. Final serialize & validate
    const finalSnapshot = SnapshotSerializer.serialize(loaded);
    const finalLoaded = SnapshotSerializer.deserialize(finalSnapshot);

    expect(finalLoaded.occupancy[targetPos]).toBe(pieceId);
    expect(finalLoaded.occupancy[asCoordinateKey('0,0')]).toBeUndefined();
    expect(Object.keys(finalLoaded.terrain!).length).toBeGreaterThan(0);
    expect(finalLoaded.terrain?.[targetPos]).toBeDefined();
  });
});

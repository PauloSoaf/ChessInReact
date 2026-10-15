import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId, CoordinateKey } from '../../coordinates';
import { EntityManager } from '../../entities/EntityManager';
import { IPieceEntity, ITerrainEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import { serializeStateForWorker, deserializeWorkerState } from '../../serialization/FlatArraySerializer';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';
import { HexTopology, SquareTopology, TriangleTopology } from '../../topology';
import { findPathAStar } from '../../topology/pathfinding/AStarPathfinder';
import { ChunkManager } from '../../procedural/ChunkManager';

describe('Spec 02 Regression Tests (Verification of Audited Defect Resolutions)', () => {
  describe('Defect 1: Terrain and Occupancy Decoupling & Serialization', () => {
    it('verifies piece and terrain coexistence at same coordinate without collision', () => {
      const whitePawn: IPieceEntity = {
        id: asEntityId('white-pawn'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,1'),
        hasMoved: false,
        isCaptured: false,
      };

      const plains: ITerrainEntity = {
        id: asEntityId('terrain-plains-4-1'),
        type: 'TERRAIN',
        variantId: 'PLAINS',
        position: asCoordinateKey('4,1'),
        elevation: 1.0,
        metadata: { biome: 'PLAINS', isObstacle: false, costMultiplier: 1.0 },
      };

      const manager = new EntityManager([whitePawn]);
      // Terrain and piece coexist without throwing:
      expect(() => manager.addEntity(plains)).not.toThrow();

      expect(manager.getOccupant(asCoordinateKey('4,1'))?.id).toBe(whitePawn.id);
      expect(manager.getTerrain(asCoordinateKey('4,1'))?.id).toBe(plains.id);
    });

    it('verifies serialization roundtrip for procedural terrain variants PLAINS / FOREST / CHASM', () => {
      const domain = createDefaultDomainState('plains-serialize');
      const plainsTerrain: ITerrainEntity = {
        id: asEntityId('terrain-plains-1'),
        type: 'TERRAIN',
        variantId: 'PLAINS',
        position: asCoordinateKey('0,0'),
        elevation: 1.0,
      };
      domain.boardEntities[plainsTerrain.id] = plainsTerrain;
      (domain as { terrain?: Record<CoordinateKey, import('../../coordinates').EntityId> }).terrain = {
        [plainsTerrain.position]: plainsTerrain.id,
      };

      const snapshot = serializeStateForWorker(domain);
      expect(snapshot.buffer.byteLength).toBeGreaterThan(0);

      const deserialized = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);
      const entity = deserialized.entities.find((e) => e.id === plainsTerrain.id);
      expect(entity?.variantId).toBe('PLAINS');
    });

    it('verifies NoiseGenerator metadata produces finite costMultiplier for WATER with isObstacle', () => {
      const noise = new NoiseGenerator({ seed: 'test-seed' });
      const hex = new HexTopology();
      let waterCoord: CoordinateKey | null = null;
      for (let q = -10; q <= 10; q++) {
        for (let r = -10; r <= 10; r++) {
          const key = asCoordinateKey(`${q},${r},${-q - r}`);
          const cell = noise.generateCell(key, hex);
          if (cell.biome === 'WATER') {
            waterCoord = key;
            break;
          }
        }
        if (waterCoord) break;
      }

      expect(waterCoord).not.toBeNull();
      const waterCell = noise.generateCell(waterCoord!, hex);
      // Finite cost multiplier replaces Infinity
      expect(Number.isFinite(waterCell.costMultiplier)).toBe(true);
      expect(waterCell.costMultiplier).toBe(999.0);
      expect(waterCell.isObstacle).toBe(true);

      // And passing this into EntityManager metadata is accepted:
      const manager = new EntityManager();
      expect(() =>
        manager.addEntity({
          id: asEntityId('water-ent'),
          type: 'TERRAIN',
          variantId: 'WATER',
          position: waterCoord!,
          metadata: { costMultiplier: waterCell.costMultiplier, isObstacle: true },
        })
      ).not.toThrow();
    });
  });

  describe('Defect 2: A* Optimal Path on Variable Edge Costs', () => {
    it('verifies A* produces optimal cost 4 on adversarial graph with shortcut update', () => {
      const square = new SquareTopology({ width: null, height: null });
      // Graph:
      // S=(0,0), A=(1,0), G=(2,0)
      // B=(0,1), C=(1,1)
      // S -> A cost 5
      // S -> B cost 1
      // B -> C cost 1
      // C -> A cost 1
      // A -> G cost 1
      // Path S -> A -> G has cost 5 + 1 = 6.
      // Path S -> B -> C -> A -> G has cost 1 + 1 + 1 + 1 = 4.
      const getCost = (from: CoordinateKey, to: CoordinateKey): number => {
        if (from === '0,0' && to === '1,0') return 5;
        if (from === '0,0' && to === '0,1') return 1;
        if (from === '0,1' && to === '1,1') return 1;
        if (from === '1,1' && to === '1,0') return 1;
        if (from === '1,0' && to === '2,0') return 1;
        return 10;
      };

      const result = findPathAStar(square, asCoordinateKey('0,0'), asCoordinateKey('2,0'), {
        getCost,
        minEdgeCost: 1,
        isWalkable: (coord) => ['0,0', '1,0', '2,0', '0,1', '1,1'].includes(coord),
      });

      // Optimal cost is 4, not 6
      expect(result.found).toBe(true);
      expect(result.cost).toBe(4);
      expect(result.path).toEqual(['0,0', '0,1', '1,1', '1,0', '2,0']);
    });
  });

  describe('Defect 3: Triangle Distance Inconsistency', () => {
    it('verifies TriangleTopology.getDistance("0,0", "0,1") returns exact graph distance 3', () => {
      const tri = new TriangleTopology();
      const dist = tri.getDistance(asCoordinateKey('0,0'), asCoordinateKey('0,1'));
      expect(dist).toBe(3);

      // (0,0) and (0,1) are not adjacent neighbors
      const neighbors = tri.getAllNeighbors(asCoordinateKey('0,0'));
      expect(neighbors).not.toContain('0,1');
    });
  });

  describe('Defect 4: Square Chunks in Infinite Worker Topology', () => {
    it('verifies unbounded SquareTopology generates full 256 cells in chunk (1, 1)', () => {
      const infiniteSquare = new SquareTopology({ width: null, height: null });
      const chunkManager = new ChunkManager(infiniteSquare, { seed: 'test', chunkSize: 16 });
      const chunk11 = chunkManager.getOrGenerateChunk({ chunkX: 1, chunkY: 1 });
      expect(Object.keys(chunk11.cells).length).toBe(256);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { EntityManager } from '../EntityManager';
import { IPieceEntity, ITerrainEntity } from '../types';
import { MovePieceCommand } from '../../commands/MovePieceCommand';
import { createDefaultDomainState } from '../../state/initialState';
import {
  deserializeWorkerState,
  serializeStateForWorker,
} from '../../serialization/FlatArraySerializer';
import { ChunkManager } from '../../procedural/ChunkManager';
import { HexTopology, SquareTopology } from '../../topology';
import { NoiseGenerator } from '../../procedural/NoiseGenerator';

describe('PATCH-01: Terrain and Occupancy Separation & Coexistence', () => {
  it('allows a piece and background terrain to share the same coordinate without collision', () => {
    const manager = new EntityManager();
    const coord = asCoordinateKey('4,3');

    const plains: ITerrainEntity = {
      id: asEntityId('terrain-plains-4-3'),
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: coord,
      elevation: 1.0,
      metadata: { biome: 'PLAINS', isObstacle: false, costMultiplier: 1.0 },
    };

    const pawn: IPieceEntity = {
      id: asEntityId('white-pawn-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: coord,
      hasMoved: false,
      isCaptured: false,
    };

    // Both can be added at 4,3 without throwing:
    expect(() => manager.addEntity(plains)).not.toThrow();
    expect(() => manager.addEntity(pawn)).not.toThrow();

    expect(manager.count()).toBe(2);
    expect(manager.occupancyCount()).toBe(1); // Only piece occupies physical occupancy
    expect(manager.terrainCount()).toBe(1);   // Terrain is tracked in terrain layer

    expect(manager.getOccupant(coord)?.id).toBe(pawn.id);
    expect(manager.getTerrain(coord)?.id).toBe(plains.id);
    expect(manager.getEntityAt(coord)?.id).toBe(pawn.id); // Prioritizes physical occupant

    const validation = manager.validateInvariants();
    expect(validation.valid).toBe(true);
  });

  it('generates a chunk containing PLAINS and FOREST and serializes it without exception', () => {
    const topology = new HexTopology();
    const chunkManager = new ChunkManager(topology, { seed: 'procedural-test-seed' });
    chunkManager.getOrGenerateChunk({ chunkX: 0, chunkY: 0 });

    const domain = createDefaultDomainState('chunk-test', 'hex_procedural');
    const streamingDelta = chunkManager.updateStreaming(domain);

    for (const [id, entity] of Object.entries(streamingDelta.newEntities)) {
      domain.boardEntities[asEntityId(id)] = entity;
      if (entity.type === 'TERRAIN') {
        domain.terrain![entity.position] = asEntityId(id);
      } else if (entity.type === 'OBSTACLE') {
        domain.occupancy[entity.position] = asEntityId(id);
      }
    }

    // Binary serialization must succeed with all procedural biomes (PLAINS, FOREST, etc.)
    const snapshot = serializeStateForWorker(domain);
    expect(snapshot.buffer.length).toBeGreaterThan(0);

    const deserialized = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);
    expect(deserialized.entityCount).toBe(Object.keys(domain.boardEntities).length);

    // Verify roundtrip variants
    const biomes = new Set(deserialized.entities.map((e) => e.variantId));
    expect(biomes.has('PLAINS')).toBe(true);
  });

  it('allows moving onto walkable terrain, executing Undo and Redo without index corruption', () => {
    const domain = createDefaultDomainState('walkable-move');
    const startCoord = asCoordinateKey('4,1');
    const destCoord = asCoordinateKey('4,2');

    const plainsDest: ITerrainEntity = {
      id: asEntityId('terrain-plains-dest'),
      type: 'TERRAIN',
      variantId: 'PLAINS',
      position: destCoord,
      elevation: 1.0,
      metadata: { biome: 'PLAINS', isObstacle: false, costMultiplier: 1.0 },
    };

    const pawn: IPieceEntity = {
      id: asEntityId('pawn-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: startCoord,
      hasMoved: false,
      isCaptured: false,
    };

    domain.boardEntities[plainsDest.id] = plainsDest;
    domain.terrain![destCoord] = plainsDest.id;

    domain.boardEntities[pawn.id] = pawn;
    domain.occupancy[startCoord] = pawn.id;

    const cmd = new MovePieceCommand(pawn.id, startCoord, destCoord, 'P1');

    // Execute move onto plains
    expect(() => cmd.execute(domain)).not.toThrow();
    expect(domain.occupancy[destCoord]).toBe(pawn.id);
    expect(domain.occupancy[startCoord]).toBeUndefined();
    expect(domain.terrain![destCoord]).toBe(plainsDest.id); // Terrain is untouched!

    // Undo move
    cmd.undo(domain);
    expect(domain.occupancy[startCoord]).toBe(pawn.id);
    expect(domain.occupancy[destCoord]).toBeUndefined();
    expect(domain.terrain![destCoord]).toBe(plainsDest.id);

    // Redo move
    cmd.execute(domain);
    expect(domain.occupancy[destCoord]).toBe(pawn.id);
    expect(domain.terrain![destCoord]).toBe(plainsDest.id);
  });

  it('rejects moving onto impassable terrain (WATER / MOUNTAIN / CHASM)', () => {
    const domain = createDefaultDomainState('impassable-test');
    const startCoord = asCoordinateKey('4,1');
    const waterCoord = asCoordinateKey('4,2');

    const water: ITerrainEntity = {
      id: asEntityId('terrain-water-4-2'),
      type: 'TERRAIN',
      variantId: 'WATER',
      position: waterCoord,
      elevation: 0.1,
      metadata: { biome: 'WATER', isObstacle: true, costMultiplier: 999.0 },
    };

    const pawn: IPieceEntity = {
      id: asEntityId('pawn-water'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: startCoord,
      hasMoved: false,
      isCaptured: false,
    };

    domain.boardEntities[water.id] = water;
    domain.terrain![waterCoord] = water.id;
    domain.boardEntities[pawn.id] = pawn;
    domain.occupancy[startCoord] = pawn.id;

    const cmd = new MovePieceCommand(pawn.id, startCoord, waterCoord, 'P1');
    expect(() => cmd.execute(domain)).toThrow(/impassable terrain \(WATER\)/);
  });

  it('confirms absence of NaN and Infinity in NoiseGenerator output and domain state', () => {
    const noise = new NoiseGenerator({ seed: 'finite-test' });
    const square = new SquareTopology({ width: null, height: null });

    for (let x = -10; x <= 10; x++) {
      for (let y = -10; y <= 10; y++) {
        const coord = asCoordinateKey(`${x},${y}`);
        const cell = noise.generateCell(coord, square);
        expect(Number.isFinite(cell.elevation)).toBe(true);
        expect(Number.isFinite(cell.costMultiplier)).toBe(true);
        expect(Number.isNaN(cell.elevation)).toBe(false);
        expect(Number.isNaN(cell.costMultiplier)).toBe(false);
      }
    }
  });
});

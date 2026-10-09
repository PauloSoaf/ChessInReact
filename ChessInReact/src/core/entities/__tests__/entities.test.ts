import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { EntityManager, EntityUpdatePatch } from '../EntityManager';
import { IPieceEntity, ITerrainEntity } from '../types';

describe('EntityManager & Spatial Dual Index', () => {
  let manager: EntityManager;

  const piece1: IPieceEntity = {
    id: asEntityId('white-pawn-1'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('0,1'),
    hasMoved: false,
    isCaptured: false,
  };

  const piece2: IPieceEntity = {
    id: asEntityId('black-knight-1'),
    type: 'PIECE',
    ownerId: 'P2',
    variantId: 'KNIGHT',
    position: asCoordinateKey('1,2'),
    hasMoved: false,
    isCaptured: false,
  };

  const terrain1: ITerrainEntity = {
    id: asEntityId('mountain-hex-1'),
    type: 'TERRAIN',
    variantId: 'MOUNTAIN',
    position: asCoordinateKey('4,5'),
    elevation: 3,
  };

  beforeEach(() => {
    manager = new EntityManager();
  });

  it('adds and retrieves entities by ID and coordinate (RF-01)', () => {
    manager.addEntity(piece1);
    expect(manager.getEntity(piece1.id)).toEqual(piece1);
    expect(manager.getOccupant(piece1.position)).toEqual(piece1);
    expect(manager.count()).toBe(1);
    expect(manager.occupancyCount()).toBe(1);
  });

  it('rejects adding entity with duplicate ID', () => {
    manager.addEntity(piece1);
    expect(() => manager.addEntity(piece1)).toThrow(/already exists/);
  });

  it('rejects adding entity on already occupied coordinate (Collision detection)', () => {
    manager.addEntity(piece1);
    const collidingPiece: IPieceEntity = {
      ...piece2,
      id: asEntityId('other-piece'),
      position: piece1.position, // same position!
    };
    expect(() => manager.addEntity(collidingPiece)).toThrow(/already occupied/);
  });

  it('atomically moves entity, updating position and spatial occupancy', () => {
    manager.addEntity(piece1);
    const newPos = asCoordinateKey('0,3');

    manager.moveEntity(piece1.id, newPos);

    expect(manager.getOccupant(piece1.position)).toBeUndefined();
    expect(manager.getOccupant(newPos)?.id).toBe(piece1.id);

    const updated = manager.getEntity(piece1.id) as IPieceEntity;
    expect(updated.position).toBe(newPos);
    expect(updated.hasMoved).toBe(true);

    const invariantCheck = manager.validateInvariants();
    expect(invariantCheck.valid).toBe(true);
  });

  it('captures piece: marks captured and frees spatial occupancy while retaining entity record (RF-09)', () => {
    manager.addEntity(piece1);
    manager.capturePiece(piece1.id);

    expect(manager.getOccupant(piece1.position)).toBeUndefined();
    const retrieved = manager.getEntity(piece1.id) as IPieceEntity;
    expect(retrieved.isCaptured).toBe(true);

    // Can now occupy the freed coordinate
    const replacingPiece: IPieceEntity = {
      ...piece2,
      position: piece1.position,
    };
    expect(() => manager.addEntity(replacingPiece)).not.toThrow();

    const invariantCheck = manager.validateInvariants();
    expect(invariantCheck.valid).toBe(true);
  });

  it('filters entities by owner and type (RF-13)', () => {
    manager.addEntities([piece1, piece2, terrain1]);

    const p1Pieces = manager.getEntitiesByOwner('P1');
    expect(p1Pieces).toHaveLength(1);
    expect(p1Pieces[0].id).toBe(piece1.id);

    const terrainEntities = manager.getEntitiesByType('TERRAIN');
    expect(terrainEntities).toHaveLength(1);
    expect(terrainEntities[0].id).toBe(terrain1.id);
  });

  it('detects corrupted invariants if state is forcibly damaged', () => {
    manager.addEntity(piece1);
    // Artificially corrupt internal map for testing invariant detector
    (
      manager as unknown as {
        occupancyByCoordinate: Map<unknown, unknown>;
      }
    ).occupancyByCoordinate.set(asCoordinateKey('9,9'), piece1.id);

    const result = manager.validateInvariants();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('reconstructs state seamlessly from snapshot', () => {
    manager.addEntities([piece1, piece2]);
    const snapshot = manager.toSnapshot();

    const reconstructed = EntityManager.fromSnapshot(snapshot);
    expect(reconstructed.count()).toBe(2);
    expect(reconstructed.getEntity(piece1.id)).toEqual(piece1);
    expect(reconstructed.validateInvariants().valid).toBe(true);
  });

  it('queries active pieces, updates position via updateEntity, and clears all entities', () => {
    manager.addEntities([piece1, piece2]);
    expect(manager.getActivePieces()).toHaveLength(2);

    manager.capturePiece(piece1.id);
    expect(manager.getActivePieces()).toHaveLength(1);

    // moveEntity with position change
    manager.moveEntity(piece2.id, asCoordinateKey('5,5'));
    expect(manager.getEntity(piece2.id)?.position).toBe('5,5');

    // removeEntity
    manager.removeEntity(piece2.id);
    expect(manager.getEntity(piece2.id)).toBeUndefined();

    // clear
    manager.clear();
    expect(manager.count()).toBe(0);
    expect(manager.occupancyCount()).toBe(0);
  });

  it('rolls back batch addEntities atomically if any entity fails', () => {
    const validPiece: IPieceEntity = { ...piece1, id: asEntityId('batch-valid') };
    const invalidPiece: IPieceEntity = { ...piece1, id: asEntityId('batch-collision') }; // Collides with batch-valid's position

    expect(() => manager.addEntities([validPiece, invalidPiece])).toThrow(/already occupied/);
    // validPiece was rolled back
    expect(manager.getEntity(validPiece.id)).toBeUndefined();
    expect(manager.count()).toBe(0);
  });

  describe('AUDIT-01 Regression: Structural Mutation Safeguards', () => {
    it('forbids mutating entity ID via updateEntity to prevent index corruption', () => {
      manager.addEntity(piece1);
      expect(() =>
        manager.updateEntity(piece1.id, { id: asEntityId('hacked-id') } as unknown as EntityUpdatePatch)
      ).toThrow(/Entity ID is immutable/);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('forbids mutating entity type via updateEntity', () => {
      manager.addEntity(piece1);
      expect(() =>
        manager.updateEntity(piece1.id, { type: 'TERRAIN' } as unknown as EntityUpdatePatch)
      ).toThrow(/Entity type is immutable/);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('forbids mutating position via updateEntity to enforce specialized moveEntity() (FASE 3)', () => {
      manager.addEntity(piece1);
      expect(() =>
        manager.updateEntity(piece1.id, { position: asCoordinateKey('7,7') } as unknown as EntityUpdatePatch)
      ).toThrow(/Direct mutation of position is not allowed via updateEntity/);
      // Index remained untouched
      expect(manager.getOccupant(piece1.position)?.id).toBe(piece1.id);
      expect(manager.getOccupant(asCoordinateKey('7,7'))).toBeUndefined();
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('forbids mutating isCaptured directly via updateEntity', () => {
      manager.addEntity(piece1);
      expect(() =>
        manager.updateEntity(piece1.id, { isCaptured: true } as unknown as EntityUpdatePatch)
      ).toThrow(/Direct mutation of isCaptured is not allowed/);
      // Index remained untouched
      expect(manager.getOccupant(piece1.position)?.id).toBe(piece1.id);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('safely updates entity metadata without affecting spatial indices', () => {
      manager.addEntity(piece1);
      manager.updateEntityMetadata(piece1.id, { customHp: 100, fairyBuff: 'flying' });

      const updated = manager.getEntity(piece1.id);
      expect(updated?.metadata?.customHp).toBe(100);
      expect(updated?.metadata?.fairyBuff).toBe('flying');
      expect(manager.getOccupant(piece1.position)?.id).toBe(piece1.id);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('restores captured entity to a free coordinate and updates occupancy index', () => {
      manager.addEntity(piece1);
      manager.captureEntity(piece1.id);

      expect(manager.getOccupant(piece1.position)).toBeUndefined();

      // Restore to a new coordinate
      const restoreCoord = asCoordinateKey('7,7');
      manager.restoreEntity(piece1.id, restoreCoord);

      expect(manager.getOccupant(restoreCoord)?.id).toBe(piece1.id);
      expect(manager.getEntity(piece1.id)?.position).toBe(restoreCoord);
      expect((manager.getEntity(piece1.id) as IPieceEntity).isCaptured).toBe(false);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('rejects restoring entity to an already occupied coordinate', () => {
      manager.addEntities([piece1, piece2]);
      manager.captureEntity(piece1.id);

      // Attempt restoring onto piece2's position
      expect(() => manager.restoreEntity(piece1.id, piece2.position)).toThrow(/already occupied/);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('replaces an entity atomically using replaceEntity', () => {
      manager.addEntity(piece1);
      const promotedPiece: IPieceEntity = {
        ...piece1,
        id: asEntityId('promoted-queen'),
        variantId: 'QUEEN',
      };

      manager.replaceEntity(piece1.id, promotedPiece);

      expect(manager.getEntity(piece1.id)).toBeUndefined();
      expect((manager.getEntity(promotedPiece.id) as IPieceEntity | undefined)?.variantId).toBe('QUEEN');
      expect(manager.getOccupant(piece1.position)?.id).toBe(promotedPiece.id);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('guarantees atomic replaceEntity transaction: preserves original entity when target ID collides (FASE 1)', () => {
      manager.addEntity(piece1);
      manager.addEntity(piece2);

      // entityA and entityB have distinct IDs and positions.
      // Replacing entityA by an entity with ID of entityB MUST fail.
      const replacementWithEntityBId: IPieceEntity = {
        ...piece1,
        id: piece2.id,
        variantId: 'QUEEN',
      };

      expect(() => {
        manager.replaceEntity(piece1.id, replacementWithEntityBId);
      }).toThrow(/already exists/);

      // A falha NÃO pode apagar A
      expect(manager.getEntity(piece1.id)).toEqual(piece1);
      // B também deve continuar intacta
      expect(manager.getEntity(piece2.id)).toEqual(piece2);
      // Os índices precisam permanecer íntegros
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('guarantees atomic replaceEntity transaction: preserves state when target coordinate is occupied', () => {
      manager.addEntities([piece1, piece2]);

      const collidingPosPiece: IPieceEntity = {
        ...piece1,
        id: asEntityId('new-promoted-piece'),
        position: piece2.position, // Occupied by piece2!
        variantId: 'QUEEN',
      };

      expect(() => manager.replaceEntity(piece1.id, collidingPosPiece)).toThrow(/already occupied/);

      expect(manager.getEntity(piece1.id)).toEqual(piece1);
      expect(manager.getEntity(piece2.id)).toEqual(piece2);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('throws when attempting replaceEntity on non-existent original entity', () => {
      expect(() => manager.replaceEntity(asEntityId('non-existent'), piece1)).toThrow(
        /non-existent entity with ID: non-existent/
      );
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('successfully replaces entity with same ID (pawn promotion)', () => {
      manager.addEntity(piece1);

      const sameIdQueen: IPieceEntity = {
        ...piece1,
        variantId: 'QUEEN',
      };
      manager.replaceEntity(piece1.id, sameIdQueen);

      const retrieved = manager.getEntity(piece1.id) as IPieceEntity;
      expect(retrieved.variantId).toBe('QUEEN');
      expect(retrieved.position).toBe(piece1.position);
      expect(manager.getOccupant(piece1.position)?.id).toBe(piece1.id);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('successfully replaces captured entity with another captured entity without spatial collision', () => {
      manager.addEntity(piece1);
      manager.captureEntity(piece1.id);

      const promotedCapturedQueen: IPieceEntity = {
        ...piece1,
        variantId: 'QUEEN',
        isCaptured: true,
      };
      manager.replaceEntity(piece1.id, promotedCapturedQueen);

      const retrieved = manager.getEntity(piece1.id) as IPieceEntity;
      expect(retrieved.variantId).toBe('QUEEN');
      expect(retrieved.isCaptured).toBe(true);
      expect(manager.getOccupant(piece1.position)).toBeUndefined();
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('protects internal store objects against external reference mutations across all read APIs (FASE 2)', () => {
      const pieceWithMeta: IPieceEntity = {
        ...piece1,
        metadata: { tier: 1, buff: { speed: 10 } },
      };
      manager.addEntity(pieceWithMeta);

      // 1. getEntity() defensive copy
      const exposed1 = manager.getEntity(pieceWithMeta.id) as IPieceEntity;
      (exposed1 as unknown as { position: string }).position = '99,99';
      (exposed1 as unknown as { id: string }).id = 'hacked-id';
      (exposed1.metadata as { tier: number }).tier = 999;
      (exposed1.metadata as { buff: { speed: number } }).buff.speed = 999;

      const fresh1 = manager.getEntity(pieceWithMeta.id) as IPieceEntity;
      expect(fresh1.position).toBe('0,1');
      expect(fresh1.id).toBe(pieceWithMeta.id);
      expect(fresh1.metadata?.tier).toBe(1);
      expect((fresh1.metadata?.buff as { speed: number })?.speed).toBe(10);
      expect(manager.getOccupant(asCoordinateKey('0,1'))?.id).toBe(pieceWithMeta.id);
      expect(manager.getOccupant(asCoordinateKey('99,99'))).toBeUndefined();

      // 2. getOccupant() defensive copy
      const exposedOcc = manager.getOccupant(pieceWithMeta.position) as IPieceEntity;
      (exposedOcc as unknown as { position: string }).position = '88,88';
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');

      // 3. getEntitiesByOwner() defensive copies
      const ownerPieces = manager.getEntitiesByOwner('P1');
      (ownerPieces[0] as unknown as { position: string }).position = '77,77';
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');

      // 4. getEntitiesByType() defensive copies
      const typePieces = manager.getEntitiesByType('PIECE');
      (typePieces[0] as unknown as { position: string }).position = '66,66';
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');

      // 5. getActivePieces() defensive copies
      const activePieces = manager.getActivePieces();
      (activePieces[0] as unknown as { position: string }).position = '55,55';
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');

      // 6. getAllEntities() defensive copies
      const allEntities = manager.getAllEntities();
      (allEntities[0] as unknown as { position: string }).position = '44,44';
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');

      // 7. toSnapshot() defensive copies
      const snapshot = manager.toSnapshot();
      (snapshot.entityById[pieceWithMeta.id] as unknown as { position: string }).position = '33,33';
      delete (snapshot.entityById as Record<string, unknown>)[pieceWithMeta.id];
      expect(manager.getEntity(pieceWithMeta.id)?.position).toBe('0,1');
      expect(manager.count()).toBe(1);

      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('completely clears all maps and preserves invariant validity (FASE 4)', () => {
      manager.addEntities([piece1, piece2]);
      expect(manager.count()).toBe(2);
      expect(manager.occupancyCount()).toBe(2);

      manager.clear();

      expect(manager.count()).toBe(0);
      expect(manager.occupancyCount()).toBe(0);
      expect(manager.getEntity(piece1.id)).toBeUndefined();
      expect(manager.getEntity(piece2.id)).toBeUndefined();
      expect(manager.getOccupant(piece1.position)).toBeUndefined();
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('rejects capturing an entity that is already captured', () => {
      manager.addEntity(piece1);
      manager.captureEntity(piece1.id);

      expect(() => manager.captureEntity(piece1.id)).toThrow(/already captured/);
      expect(manager.validateInvariants().valid).toBe(true);
    });

    it('rejects restoring an entity that is not captured', () => {
      manager.addEntity(piece1);

      expect(() => manager.restoreEntity(piece1.id, asCoordinateKey('4,4'))).toThrow(
        /because it is not captured/
      );
      expect(manager.validateInvariants().valid).toBe(true);
    });
  });
});


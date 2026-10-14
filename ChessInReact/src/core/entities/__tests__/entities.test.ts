import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { EntityManager, EntityUpdatePatch } from '../EntityManager';
import { IEntity, IPieceEntity, ITerrainEntity } from '../types';

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

    describe('PATCH-01: Transactional Entity Replacement & Addition', () => {
      it('preserves complete state and indices when replaceEntity fails due to invalid metadata', () => {
        manager.addEntities([piece1, piece2]);
        const initialCount = manager.count();
        const initialOccupancy = manager.occupancyCount();

        // Circular metadata object
        const circularMeta: Record<string, unknown> = { key: 'value' };
        circularMeta.self = circularMeta;

        const badReplacement: IPieceEntity = {
          ...piece1,
          metadata: circularMeta,
        };

        expect(() => manager.replaceEntity(piece1.id, badReplacement)).toThrow(/circular reference/i);

        expect(manager.getEntity(piece1.id)).toEqual(piece1);
        expect(manager.getOccupant(piece1.position)?.id).toBe(piece1.id);
        expect(manager.count()).toBe(initialCount);
        expect(manager.occupancyCount()).toBe(initialOccupancy);
        expect(manager.validateInvariants().valid).toBe(true);
      });

      it('preserves complete state and indices when addEntity fails due to invalid metadata or BigInt', () => {
        manager.addEntity(piece1);
        const initialOccupancy = manager.occupancyCount();

        const badEntity: IPieceEntity = {
          id: asEntityId('bigint-piece'),
          type: 'PIECE',
          ownerId: 'P1',
          variantId: 'PAWN',
          position: asCoordinateKey('5,5'),
          hasMoved: false,
          isCaptured: false,
          metadata: { amount: BigInt(123) } as unknown as Record<string, unknown>,
        };

        expect(() => manager.addEntity(badEntity)).toThrow(/BigInt is not allowed/i);

        // Occupancy for 5,5 must NOT have been registered
        expect(manager.getOccupant(asCoordinateKey('5,5'))).toBeUndefined();
        expect(manager.count()).toBe(1);
        expect(manager.occupancyCount()).toBe(initialOccupancy);
        expect(manager.validateInvariants().valid).toBe(true);
      });

      it('handles replacing an active entity with a captured entity transactionally', () => {
        manager.addEntity(piece1);
        expect(manager.occupancyCount()).toBe(1);

        const capturedReplacement: IPieceEntity = {
          ...piece1,
          isCaptured: true,
        };

        manager.replaceEntity(piece1.id, capturedReplacement);

        expect(manager.count()).toBe(1);
        // Captured entity has no spatial occupancy
        expect(manager.occupancyCount()).toBe(0);
        expect(manager.getOccupant(piece1.position)).toBeUndefined();
        expect((manager.getEntity(piece1.id) as IPieceEntity).isCaptured).toBe(true);
        expect(manager.validateInvariants().valid).toBe(true);
      });

      it('handles replacing a captured entity with an active entity transactionally', () => {
        manager.addEntity(piece1);
        manager.captureEntity(piece1.id);
        expect(manager.occupancyCount()).toBe(0);

        const activeReplacement: IPieceEntity = {
          ...piece1,
          position: asCoordinateKey('2,2'),
          isCaptured: false,
        };

        manager.replaceEntity(piece1.id, activeReplacement);

        expect(manager.count()).toBe(1);
        expect(manager.occupancyCount()).toBe(1);
        expect(manager.getOccupant(asCoordinateKey('2,2'))?.id).toBe(piece1.id);
        expect(manager.validateInvariants().valid).toBe(true);
      });
    });

    describe('PATCH-02: Strict Runtime Whitelist for updateEntity', () => {
      it('rejects forbidden structural properties even if value is undefined', () => {
        manager.addEntity(piece1);

        expect(() =>
          manager.updateEntity(piece1.id, { position: undefined } as unknown as EntityUpdatePatch)
        ).toThrow(/Property "position" is structural/);

        expect(() =>
          manager.updateEntity(piece1.id, { id: undefined } as unknown as EntityUpdatePatch)
        ).toThrow(/Property "id" is structural/);

        expect(() =>
          manager.updateEntity(piece1.id, { isCaptured: undefined } as unknown as EntityUpdatePatch)
        ).toThrow(/Property "isCaptured" is structural/);

        expect(() =>
          manager.updateEntity(piece1.id, { type: 'TERRAIN' } as unknown as EntityUpdatePatch)
        ).toThrow(/Property "type" is structural/);

        expect(() =>
          manager.updateEntity(piece1.id, { ownerId: 'P2' } as unknown as EntityUpdatePatch)
        ).toThrow(/Property "ownerId" is structural/);

        expect(() =>
          manager.updateEntity(piece1.id, { unknownProperty: 123 } as unknown as EntityUpdatePatch)
        ).toThrow(/Unknown or disallowed property "unknownProperty"/);

        expect(manager.getEntity(piece1.id)).toEqual(piece1);
        expect(manager.validateInvariants().valid).toBe(true);
      });

      it('permits valid whitelisted updates for each entity type and validates bounds', () => {
        manager.addEntity(piece1);

        // Valid PIECE update
        manager.updateEntity(piece1.id, { hasMoved: true, variantId: 'QUEEN' });
        const updatedPiece = manager.getEntity(piece1.id) as IPieceEntity;
        expect(updatedPiece.hasMoved).toBe(true);
        expect(updatedPiece.variantId).toBe('QUEEN');

        // Rejection of empty variantId
        expect(() =>
          manager.updateEntity(piece1.id, { variantId: '' })
        ).toThrow(/variantId must be a non-empty string/);

        // Add OBSTACLE entity
        const obstacle: IEntity = {
          id: asEntityId('obs-1'),
          type: 'OBSTACLE',
          position: asCoordinateKey('3,3'),
          destructible: true,
          hp: 50,
        };
        manager.addEntity(obstacle);

        // Valid OBSTACLE update
        manager.updateEntity(obstacle.id, { hp: 30, destructible: false });
        const updatedObs = manager.getEntity(obstacle.id) as Extract<IEntity, { type: 'OBSTACLE' }>;
        expect(updatedObs.hp).toBe(30);
        expect(updatedObs.destructible).toBe(false);

        // Invalid hp
        expect(() =>
          manager.updateEntity(obstacle.id, { hp: -5 })
        ).toThrow(/hp must be a finite non-negative number/);

        expect(manager.validateInvariants().valid).toBe(true);
      });
    });

    describe('PATCH-03: Defensive Metadata Isolation', () => {
      it('guarantees deep isolation of nested metadata objects and arrays on write and read', () => {
        const metadata = {
          stats: { health: 100, tags: ['armored', 'boss'] },
        };
        const pieceWithMeta: IPieceEntity = {
          ...piece1,
          metadata,
        };
        manager.addEntity(pieceWithMeta);

        // 1. External mutation of source metadata after addEntity does NOT change stored state
        metadata.stats.health = 0;
        metadata.stats.tags.push('dead');

        const read1 = manager.getEntity(piece1.id);
        expect((read1?.metadata?.stats as { health: number }).health).toBe(100);
        expect((read1?.metadata?.stats as { tags: string[] }).tags).toEqual(['armored', 'boss']);

        // 2. External mutation via updateEntityMetadata
        const patchMeta = { stats: { health: 80, tags: ['wounded'] } };
        manager.updateEntityMetadata(piece1.id, patchMeta);
        patchMeta.stats.health = 10;

        const read2 = manager.getEntity(piece1.id);
        expect((read2?.metadata?.stats as { health: number }).health).toBe(80);

        // 3. Mutation on object returned by getEntity does NOT mutate internal state
        const exposed = manager.getEntity(piece1.id);
        (exposed?.metadata?.stats as { health: number }).health = 999;
        const read3 = manager.getEntity(piece1.id);
        expect((read3?.metadata?.stats as { health: number }).health).toBe(80);

        // 4. Rejection of unsupported values (functions, symbols, NaN)
        expect(() =>
          manager.updateEntityMetadata(piece1.id, { fn: () => {} })
        ).toThrow(/values of type "function" are not allowed/);

        expect(() =>
          manager.updateEntityMetadata(piece1.id, { nan: NaN })
        ).toThrow(/is not finite/);

        expect(manager.validateInvariants().valid).toBe(true);
      });
    });
  });
});

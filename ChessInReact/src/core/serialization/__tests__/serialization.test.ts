import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity, ITerrainEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import {
  SnapshotSerializer,
  deserializeWorkerState,
  serializeStateForWorker,
} from '../index';


describe('Serialization Subsystem (FlatArray Int32 & Snapshot JSON)', () => {
  it('serializes and deserializes domain state to Int32Array with full fidelity and stringTable identity preservation (AUDIT-03)', () => {
    const domain = createDefaultDomainState('match-serialize-test');

    const p1: IPieceEntity = {
      id: asEntityId('white-knight-b1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('1,0'),
      hasMoved: true,
      isCaptured: false,
    };

    const p2: IPieceEntity = {
      id: asEntityId('black-queen-d8'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'QUEEN',
      position: asCoordinateKey('3,7'),
      hasMoved: false,
      isCaptured: false,
    };

    const t1: ITerrainEntity = {
      id: asEntityId('hex-mountain-center'),
      type: 'TERRAIN',
      variantId: 'MOUNTAIN',
      position: asCoordinateKey('0,0,0'),
    };

    domain.boardEntities[p1.id] = p1;
    domain.boardEntities[p2.id] = p2;
    domain.boardEntities[t1.id] = t1;

    const snapshot = serializeStateForWorker(domain);

    expect(snapshot.buffer).toBeInstanceOf(Int32Array);
    // Header (4) + 3 entities * stride (5) = 19 ints
    expect(snapshot.buffer.length).toBe(4 + 3 * 5);
    expect(snapshot.stringTable).toEqual([
      'white-knight-b1',
      'black-queen-d8',
      'hex-mountain-center',
    ]);

    const deserialized = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);
    expect(deserialized.entityCount).toBe(3);
    expect(deserialized.activePlayer).toBe('P1');
    expect(deserialized.turnNumber).toBe(1);

    // AUDIT-03: Verify exact entity IDs are preserved (zero hash loss)
    const knight = deserialized.entities.find((e) => e.variantId === 'KNIGHT');
    expect(knight).toBeDefined();
    expect(knight?.id).toBe('white-knight-b1');
    expect(knight?.ownerId).toBe('P1');
    expect(knight?.hasMoved).toBe(true);
    expect(knight?.isCaptured).toBe(false);
    expect(knight?.x).toBe(1);
    expect(knight?.y).toBe(0);

    const queen = deserialized.entities.find((e) => e.variantId === 'QUEEN');
    expect(queen?.id).toBe('black-queen-d8');

    const mountain = deserialized.entities.find((e) => e.variantId === 'MOUNTAIN');
    expect(mountain).toBeDefined();
    expect(mountain?.id).toBe('hex-mountain-center');
    expect(mountain?.type).toBe('TERRAIN');
  });

  it('guarantees zero hash collisions for arbitrary entity IDs (AUDIT-03 & ADR-002)', () => {
    const domain = createDefaultDomainState('collision-test');

    // Create entities with arbitrary, complex IDs
    const idList = [
      'piece_alpha_#1_unique',
      'piece_alpha_#2_unique',
      'weird_id_🚀_unicode',
      'custom-mod-uuid-123e4567-e89b-12d3-a456-426614174000',
    ];

    idList.forEach((id, idx) => {
      const piece: IPieceEntity = {
        id: asEntityId(id),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey(`${idx},0`),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[piece.id] = piece;
    });

    const snapshot = serializeStateForWorker(domain);
    const restored = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);

    // Verify all IDs match identically
    const restoredIds = restored.entities.map((e) => e.id);
    expect(restoredIds).toEqual(idList);
  });

  it('strictly rejects worker deserialization when stringTable is omitted, incomplete, or contains duplicates (AUDIT-03)', () => {
    const domain = createDefaultDomainState();
    const p1: IPieceEntity = {
      id: asEntityId('p-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    const p2: IPieceEntity = {
      id: asEntityId('p-2'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('0,1'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[p1.id] = p1;
    domain.boardEntities[p2.id] = p2;

    const snapshot = serializeStateForWorker(domain);

    // 1. Omitted / non-array stringTable
    expect(() => deserializeWorkerState(snapshot.buffer, undefined as unknown as string[])).toThrow(
      /stringTable is mandatory/
    );

    // 2. Incomplete stringTable (length mismatch)
    expect(() => deserializeWorkerState(snapshot.buffer, ['p-1'])).toThrow(
      /stringTable integrity failure: stringTable has 1 entries, expected 2/
    );

    // 3. Duplicate IDs in stringTable
    expect(() => deserializeWorkerState(snapshot.buffer, ['p-dup', 'p-dup'])).toThrow(
      /duplicate entity ID "p-dup"/
    );

    // 4. Empty or invalid ID in stringTable
    expect(() => deserializeWorkerState(snapshot.buffer, ['p-1', ''])).toThrow(
      /entry at index 1 is empty or not a string/
    );
  });

  it('rejects corrupted buffers with out-of-bounds stringTable index or invalid codes', () => {
    const domain = createDefaultDomainState();
    const p: IPieceEntity = {
      id: asEntityId('p-1'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('2,2'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[p.id] = p;

    const snapshot = serializeStateForWorker(domain);

    // Corrupt the string index in buffer to out of bounds
    const corruptedBuffer = new Int32Array(snapshot.buffer);
    // Entity stride offset for string index is 4 (EntityFieldOffset.ID_STRING_INDEX)
    corruptedBuffer[4 + 4] = 999;
    expect(() => deserializeWorkerState(corruptedBuffer, snapshot.stringTable)).toThrow(
      /out-of-bounds stringTable index 999/
    );

    // Corrupt type code
    const badTypeBuffer = new Int32Array(snapshot.buffer);
    // Overwrite type bits with invalid code 0x50000000
    badTypeBuffer[4] = 0x50000000;
    expect(() => deserializeWorkerState(badTypeBuffer, snapshot.stringTable)).toThrow(
      /unrecognized entity type code/
    );
  });

  it('preserves negative coordinates and signed 32-bit int extrema', () => {
    const domain = createDefaultDomainState();
    const negPiece: IPieceEntity = {
      id: asEntityId('deep-space-probe'),
      type: 'PIECE',
      ownerId: 'P4',
      variantId: 'ROOK',
      position: asCoordinateKey('-42,-1337,1379'), // Valid hex cubic: -42 + -1337 + 1379 === 0
      hasMoved: false,
      isCaptured: false,
    };
    const extremaPiece: IPieceEntity = {
      id: asEntityId('extrema-piece'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('-2147483648,2147483647'), // Exact MIN_INT32 and MAX_INT32
      hasMoved: false,
      isCaptured: false,
    };

    domain.boardEntities[negPiece.id] = negPiece;
    domain.boardEntities[extremaPiece.id] = extremaPiece;

    const snapshot = serializeStateForWorker(domain);
    const result = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);

    const probe = result.entities.find((e) => e.id === 'deep-space-probe');
    expect(probe).toBeDefined();
    expect(probe?.x).toBe(-42);
    expect(probe?.y).toBe(-1337);
    expect(probe?.z).toBe(1379);

    const extrema = result.entities.find((e) => e.id === 'extrema-piece');
    expect(extrema).toBeDefined();
    expect(extrema?.x).toBe(-2147483648);
    expect(extrema?.y).toBe(2147483647);
    expect(extrema?.z).toBe(0);
  });

  it('strictly validates coordinate formats and rejects out-of-bound or invalid values', () => {
    const domain = createDefaultDomainState();
    const overflowPiece: IPieceEntity = {
      id: asEntityId('overflow'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('2147483648,0'), // Beyond MAX_INT32
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[overflowPiece.id] = overflowPiece;

    expect(() => serializeStateForWorker(domain)).toThrow(RangeError);

    // Non-integer coordinate
    const nonIntPiece: IPieceEntity = {
      id: asEntityId('non-int'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('3.14,2'),
      hasMoved: false,
      isCaptured: false,
    };
    const nonIntDomain = createDefaultDomainState();
    nonIntDomain.boardEntities[nonIntPiece.id] = nonIntPiece;
    expect(() => serializeStateForWorker(nonIntDomain)).toThrow(/Must be a valid integer/);

    // Invalid cubic hex sum (q + r + s !== 0)
    const badHexPiece: IPieceEntity = {
      id: asEntityId('bad-hex'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('1,2,3'), // 1 + 2 + 3 = 6 !== 0
      hasMoved: false,
      isCaptured: false,
    };
    const badHexDomain = createDefaultDomainState();
    badHexDomain.boardEntities[badHexPiece.id] = badHexPiece;
    expect(() => serializeStateForWorker(badHexDomain)).toThrow(/sum of q\+r\+s must equal 0/);
  });

  it('rejects unsupported entity types and variants with explicit errors', () => {
    const domain = createDefaultDomainState();
    const badVariantPiece = {
      id: asEntityId('laser-tank'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'LASER_TANK_UNKNOWN',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    } as unknown as IPieceEntity;
    domain.boardEntities[badVariantPiece.id] = badVariantPiece;

    expect(() => serializeStateForWorker(domain)).toThrow(/Unsupported piece\/terrain variant/);

    const badTypeEntity = {
      id: asEntityId('npc-goblin'),
      type: 'MONSTER',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('0,0'),
    } as unknown as IPieceEntity;
    const badTypeDomain = createDefaultDomainState();
    badTypeDomain.boardEntities[badTypeEntity.id] = badTypeEntity;

    expect(() => serializeStateForWorker(badTypeDomain)).toThrow(/Unsupported entity type/);
  });

  it('rejects buffers with schema version mismatch or truncated data', () => {
    const validSnapshot = serializeStateForWorker(createDefaultDomainState());

    // Corrupt schema version
    const badVersionBuffer = new Int32Array(validSnapshot.buffer);
    badVersionBuffer[0] = 999;
    expect(() => deserializeWorkerState(badVersionBuffer, validSnapshot.stringTable)).toThrow(
      /Schema version mismatch/
    );

    // Truncated buffer
    const truncatedBuffer = validSnapshot.buffer.slice(0, 2);
    expect(() => deserializeWorkerState(truncatedBuffer, validSnapshot.stringTable)).toThrow(
      /Malformed buffer/
    );

    // Buffer length mismatch with entityCount
    const sizeCorruptedBuffer = new Int32Array(validSnapshot.buffer.length + 2);
    sizeCorruptedBuffer.set(validSnapshot.buffer);
    expect(() => deserializeWorkerState(sizeCorruptedBuffer, validSnapshot.stringTable)).toThrow(
      /Buffer corruption: length is/
    );
  });

  it('serializes snapshot JSON and verifies size is well under 25KB for 64 pieces (RNF-10)', () => {
    const domain = createDefaultDomainState('fide-64-pieces');

    // Create 64 chess pieces simulating a full board
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const id = asEntityId(`piece-${c}-${r}`);
        const pos = asCoordinateKey(`${c},${r}`);
        const piece: IPieceEntity = {
          id,
          type: 'PIECE',
          ownerId: r < 2 ? 'P1' : r > 5 ? 'P2' : 'NONE',
          variantId: r === 1 || r === 6 ? 'PAWN' : 'KNIGHT',
          position: pos,
          hasMoved: false,
          isCaptured: false,
        };
        domain.boardEntities[id] = piece;
        domain.occupancy[pos] = id;
      }
    }

    const json = SnapshotSerializer.serialize(domain);
    const byteLength = new TextEncoder().encode(json).length;

    // RNF-10: < 25 KB (25,600 bytes)
    expect(byteLength).toBeLessThan(25600);

    const restored = SnapshotSerializer.deserialize(json);
    expect(Object.keys(restored.boardEntities).length).toBe(64);
    expect(restored.matchId).toBe('fide-64-pieces');
  });

  describe('PATCH-06: Distinction Between Square and Hex Coordinates', () => {
    it('round-trips and preserves exact coordinate geometry without ambiguous z=0 fallback', () => {
      const domain = createDefaultDomainState('coord-geometry-test');

      const sq1: IPieceEntity = {
        id: asEntityId('sq-zero'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };

      const sq2: IPieceEntity = {
        id: asEntityId('sq-normal'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'ROOK',
        position: asCoordinateKey('5,7'),
        hasMoved: false,
        isCaptured: false,
      };

      const hex1: ITerrainEntity = {
        id: asEntityId('hex-zero-cubic'),
        type: 'TERRAIN',
        variantId: 'MOUNTAIN',
        position: asCoordinateKey('0,0,0'),
      };

      const hex2: ITerrainEntity = {
        id: asEntityId('hex-z-zero'),
        type: 'TERRAIN',
        variantId: 'WATER',
        position: asCoordinateKey('1,-1,0'), // Valid cubic hex with z=0
      };

      const hex3: ITerrainEntity = {
        id: asEntityId('hex-three-dim'),
        type: 'TERRAIN',
        variantId: 'MOUNTAIN',
        position: asCoordinateKey('-2,1,1'),
      };

      domain.boardEntities[sq1.id] = sq1;
      domain.boardEntities[sq2.id] = sq2;
      domain.boardEntities[hex1.id] = hex1;
      domain.boardEntities[hex2.id] = hex2;
      domain.boardEntities[hex3.id] = hex3;

      const snapshot = serializeStateForWorker(domain);
      const restored = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);

      const rSq1 = restored.entities.find((e) => e.id === 'sq-zero');
      expect(rSq1?.kind).toBe('SQUARE');
      expect(rSq1?.x).toBe(0);
      expect(rSq1?.y).toBe(0);
      expect(rSq1?.z).toBe(0);

      const rSq2 = restored.entities.find((e) => e.id === 'sq-normal');
      expect(rSq2?.kind).toBe('SQUARE');
      expect(rSq2?.x).toBe(5);
      expect(rSq2?.y).toBe(7);
      expect(rSq2?.z).toBe(0);

      const rHex1 = restored.entities.find((e) => e.id === 'hex-zero-cubic');
      expect(rHex1?.kind).toBe('HEX_CUBIC');
      expect(rHex1?.x).toBe(0);
      expect(rHex1?.y).toBe(0);
      expect(rHex1?.z).toBe(0);

      const rHex2 = restored.entities.find((e) => e.id === 'hex-z-zero');
      expect(rHex2?.kind).toBe('HEX_CUBIC');
      expect(rHex2?.x).toBe(1);
      expect(rHex2?.y).toBe(-1);
      expect(rHex2?.z).toBe(0);

      const rHex3 = restored.entities.find((e) => e.id === 'hex-three-dim');
      expect(rHex3?.kind).toBe('HEX_CUBIC');
      expect(rHex3?.x).toBe(-2);
      expect(rHex3?.y).toBe(1);
      expect(rHex3?.z).toBe(1);
    });
  });

  describe('PATCH-07: Strict Validation of Entire Binary Protocol', () => {
    it('rejects duplicate stringTable index references within binary buffer', () => {
      const domain = createDefaultDomainState();
      const p1: IPieceEntity = {
        id: asEntityId('p-1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };
      const p2: IPieceEntity = {
        id: asEntityId('p-2'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'ROOK',
        position: asCoordinateKey('1,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[p1.id] = p1;
      domain.boardEntities[p2.id] = p2;

      const snapshot = serializeStateForWorker(domain);
      const corruptedBuf = new Int32Array(snapshot.buffer);

      // Make entity 1 reference stringTable index 0 (same as entity 0)
      corruptedBuf[4 + 1 * 5 + 4] = 0;

      expect(() => deserializeWorkerState(corruptedBuf, snapshot.stringTable)).toThrow(
        /duplicate stringTable index 0 referenced.*Bijection required/
      );
    });

    it('rejects unsupported flag bits in entity record', () => {
      const domain = createDefaultDomainState();
      const p1: IPieceEntity = {
        id: asEntityId('p-1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[p1.id] = p1;

      const snapshot = serializeStateForWorker(domain);
      const corruptedBuf = new Int32Array(snapshot.buffer);

      // Inject unsupported flag bit (e.g. 0x80 << 16)
      corruptedBuf[4] |= (0x80 << 16);

      expect(() => deserializeWorkerState(corruptedBuf, snapshot.stringTable)).toThrow(
        /unsupported flag bits/
      );
    });

    it('rejects invalid owner codes in entity record', () => {
      const domain = createDefaultDomainState();
      const p1: IPieceEntity = {
        id: asEntityId('p-1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[p1.id] = p1;

      const snapshot = serializeStateForWorker(domain);
      const corruptedBuf = new Int32Array(snapshot.buffer);

      // Set ownerCode to invalid value 15 (0x0f << 24)
      corruptedBuf[4] = (corruptedBuf[4] & ~(0x0f << 24)) | (15 << 24);

      expect(() => deserializeWorkerState(corruptedBuf, snapshot.stringTable)).toThrow(
        /unrecognized player code 15/
      );
    });

    it('rejects PIECE with owner NONE or TERRAIN with owner P1', () => {
      const domain = createDefaultDomainState();
      const p1: IPieceEntity = {
        id: asEntityId('p-1'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[p1.id] = p1;

      const snapshot = serializeStateForWorker(domain);
      const corruptedBuf = new Int32Array(snapshot.buffer);

      // Set owner to NONE (0 << 24)
      corruptedBuf[4] = corruptedBuf[4] & ~(0x0f << 24);

      expect(() => deserializeWorkerState(corruptedBuf, snapshot.stringTable)).toThrow(
        /PIECE entity at index 0 has owner NONE/
      );
    });

    it('rejects invalid header metadata (activePlayer NONE or turnNumber < 1)', () => {
      const domain = createDefaultDomainState();
      const snapshot = serializeStateForWorker(domain);

      // Header activePlayer = 0 (NONE)
      const badPlayerBuf = new Int32Array(snapshot.buffer);
      badPlayerBuf[2] = 0;
      expect(() => deserializeWorkerState(badPlayerBuf, snapshot.stringTable)).toThrow(
        /Player NONE is not allowed/
      );

      // Header turnNumber = 0
      const badTurnBuf = new Int32Array(snapshot.buffer);
      badTurnBuf[3] = 0;
      expect(() => deserializeWorkerState(badTurnBuf, snapshot.stringTable)).toThrow(
        /invalid turnNumber 0/
      );
    });
  });
});

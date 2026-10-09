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

  it('falls back safely to ordinal identifiers when stringTable is omitted', () => {
    const domain = createDefaultDomainState();
    const p: IPieceEntity = {
      id: asEntityId('my-special-id'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('0,0'),
      hasMoved: false,
      isCaptured: false,
    };
    domain.boardEntities[p.id] = p;

    const snapshot = serializeStateForWorker(domain);
    // Omitting stringTable simulates headless math-only worker
    const restored = deserializeWorkerState(snapshot.buffer);

    expect(restored.entities[0].id).toBe('entity_0');
  });

  it('preserves negative coordinates and large values in signed 32-bit ints', () => {
    const domain = createDefaultDomainState();
    const negPiece: IPieceEntity = {
      id: asEntityId('deep-space-probe'),
      type: 'PIECE',
      ownerId: 'P4',
      variantId: 'ROOK',
      position: asCoordinateKey('-42,-1337,2048'),
      hasMoved: false,
      isCaptured: false,
    };

    domain.boardEntities[negPiece.id] = negPiece;

    const snapshot = serializeStateForWorker(domain);
    const result = deserializeWorkerState(snapshot.buffer, snapshot.stringTable);

    const entity = result.entities[0];
    expect(entity.id).toBe('deep-space-probe');
    expect(entity.x).toBe(-42);
    expect(entity.y).toBe(-1337);
    expect(entity.z).toBe(2048);
  });

  it('rejects buffers with schema version mismatch or truncated data', () => {
    const validSnapshot = serializeStateForWorker(createDefaultDomainState());

    // Corrupt schema version
    const badVersionBuffer = new Int32Array(validSnapshot.buffer);
    badVersionBuffer[0] = 999;
    expect(() => deserializeWorkerState(badVersionBuffer)).toThrow(/Schema version mismatch/);

    // Truncated buffer
    const truncatedBuffer = validSnapshot.buffer.slice(0, 2);
    expect(() => deserializeWorkerState(truncatedBuffer)).toThrow(/Malformed buffer/);
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
});


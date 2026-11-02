import { describe, it, expect } from 'vitest';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import {
  serializeStateForWorker,
  deserializeWorkerState,
} from '../../../core/serialization/FlatArraySerializer';
import { reconstructDomainState } from '../utils/StateReconstructor';
import { IPieceEntity } from '../../../core/entities/types';
import { BINARY_SCHEMA_VERSION_V2, PlayerBinary } from '../../../core/serialization/types';
import { IDomainState } from '../../../core/state/gameState';

describe('StateReconstructor & Worker Binary Contract Lossless Round-Trip (P0 Audit)', () => {
  it('preserves enPassant, fiftyMoveCounter, and positionHistory across worker serialization', () => {
    const base = createDefaultDomainState('match-roundtrip-1');
    const original: IDomainState = {
      ...base,
      variantId: 'CHESS_STANDARD',
      activePlayer: 'P2',
      turnNumber: 14,
      boardEntities: {
        ...base.boardEntities,
        [asEntityId('p1')]: {
          id: asEntityId('p1'),
          type: 'PIECE',
          ownerId: 'P1',
          variantId: 'PAWN',
          position: asCoordinateKey('3,3'),
          hasMoved: true,
          isCaptured: false,
        } as IPieceEntity,
      },
      occupancy: {
        ...base.occupancy,
        [asCoordinateKey('3,3')]: asEntityId('p1'),
      },
      turnState: {
        ...base.turnState,
        enPassantTarget: asCoordinateKey('3,2'),
        fiftyMoveCounter: 27,
        positionHistory: ['pos-hash-1', 'pos-hash-2', 'pos-hash-3'],
      },
    };

    // 1. Serialize for Worker (V2 Binary Protocol + Sidecar Metadata)
    const snapshot = serializeStateForWorker(original, BINARY_SCHEMA_VERSION_V2);
    expect(snapshot.metadata).toBeDefined();
    expect(snapshot.metadata?.turnState?.enPassantTarget).toBe('3,2');
    expect(snapshot.metadata?.turnState?.fiftyMoveCounter).toBe(27);
    expect(snapshot.metadata?.turnState?.positionHistory).toEqual(['pos-hash-1', 'pos-hash-2', 'pos-hash-3']);

    // 2. Deserialize in Worker
    const deserialized = deserializeWorkerState(
      snapshot.buffer,
      snapshot.stringTable,
      snapshot.metadata
    );
    expect(deserialized.schemaVersion).toBe(BINARY_SCHEMA_VERSION_V2);
    expect(deserialized.activePlayer).toBe('P2');
    expect(deserialized.turnNumber).toBe(14);
    expect(deserialized.enPassantTarget).toBe('3,2');
    expect(deserialized.fiftyMoveCounter).toBe(27);

    // 3. Reconstruct full domain state in AI Engine
    const reconstructed = reconstructDomainState(deserialized, snapshot.metadata);

    expect(reconstructed.variantId).toBe('CHESS_STANDARD');
    expect(reconstructed.matchId).toBe('match-roundtrip-1');
    expect(reconstructed.activePlayer).toBe('P2');
    expect(reconstructed.turnNumber).toBe(14);
    expect(reconstructed.turnState.enPassantTarget).toBe('3,2');
    expect(reconstructed.turnState.fiftyMoveCounter).toBe(27);
    expect(reconstructed.turnState.positionHistory).toEqual(['pos-hash-1', 'pos-hash-2', 'pos-hash-3']);
    expect(reconstructed.isGameOver).toBe(false);
    expect(reconstructed.winnerId).toBeNull();
  });

  it('preserves Crazyhouse captured piece inventory across serialization', () => {
    const base = createDefaultDomainState('match-crazyhouse-1');
    const original: IDomainState = {
      ...base,
      variantId: 'CRAZYHOUSE',
      capturedInventory: {
        ...base.capturedInventory,
        P1: ['PAWN', 'KNIGHT', 'QUEEN'],
        P2: ['ROOK', 'BISHOP'],
      },
    };

    const snapshot = serializeStateForWorker(original);
    expect(snapshot.metadata?.capturedInventory).toBeDefined();
    expect(snapshot.metadata?.capturedInventory?.P1).toEqual(['PAWN', 'KNIGHT', 'QUEEN']);
    expect(snapshot.metadata?.capturedInventory?.P2).toEqual(['ROOK', 'BISHOP']);

    const deserialized = deserializeWorkerState(
      snapshot.buffer,
      snapshot.stringTable,
      snapshot.metadata
    );
    const reconstructed = reconstructDomainState(deserialized, snapshot.metadata);

    expect(reconstructed.capturedInventory).toBeDefined();
    expect(reconstructed.capturedInventory?.P1).toEqual(['PAWN', 'KNIGHT', 'QUEEN']);
    expect(reconstructed.capturedInventory?.P2).toEqual(['ROOK', 'BISHOP']);
  });

  it('preserves Atomic variant and GameOver metadata across serialization', () => {
    const base = createDefaultDomainState('match-atomic-over');
    const original: IDomainState = {
      ...base,
      variantId: 'ATOMIC',
      isGameOver: true,
      winnerId: 'P1',
    };

    const snapshot = serializeStateForWorker(original);
    const deserialized = deserializeWorkerState(
      snapshot.buffer,
      snapshot.stringTable,
      snapshot.metadata
    );
    const reconstructed = reconstructDomainState(deserialized, snapshot.metadata);

    expect(reconstructed.variantId).toBe('ATOMIC');
    expect(reconstructed.isGameOver).toBe(true);
    expect(reconstructed.winnerId).toBe('P1');
  });

  it('maintains backwards compatibility with V1 binary frames (4-int header, no metadata)', () => {
    // Construct a legacy V1 binary frame
    const v1Header = new Int32Array(4);
    v1Header[0] = 1; // V1 schema
    v1Header[1] = 0; // 0 entities
    v1Header[2] = PlayerBinary.P1; // P1
    v1Header[3] = 1; // turn 1

    const deserialized = deserializeWorkerState(v1Header, []);
    expect(deserialized.schemaVersion).toBe(1);
    expect(deserialized.activePlayer).toBe('P1');
    expect(deserialized.turnNumber).toBe(1);

    const reconstructed = reconstructDomainState(deserialized, 'CHESS_STANDARD');
    expect(reconstructed.turnState.enPassantTarget).toBeNull();
    expect(reconstructed.turnState.fiftyMoveCounter).toBe(0);
    expect(reconstructed.isGameOver).toBe(false);
  });
});

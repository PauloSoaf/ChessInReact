import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { createDefaultDomainState } from '../../state/initialState';
import { IDomainState } from '../../state/gameState';
import { CompositeCommand, MovePieceCommand } from '../index';

describe('Command Pattern: MovePieceCommand & CompositeCommand', () => {
  let domain: IDomainState;

  const whitePawn: IPieceEntity = {
    id: asEntityId('white-pawn-e2'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('4,1'),
    hasMoved: false,
    isCaptured: false,
  };

  const blackPawn: IPieceEntity = {
    id: asEntityId('black-pawn-d3'),
    type: 'PIECE',
    ownerId: 'P2',
    variantId: 'PAWN',
    position: asCoordinateKey('3,2'),
    hasMoved: false,
    isCaptured: false,
  };

  beforeEach(() => {
    domain = createDefaultDomainState('match-cmd-test');
    domain.boardEntities[whitePawn.id] = { ...whitePawn };
    domain.occupancy[whitePawn.position] = whitePawn.id;

    domain.boardEntities[blackPawn.id] = { ...blackPawn };
    domain.occupancy[blackPawn.position] = blackPawn.id;
  });

  it('executes simple move and updates position, occupancy and hasMoved', () => {
    const cmd = new MovePieceCommand(
      whitePawn.id,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );

    cmd.execute(domain);

    expect(domain.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
    expect(domain.occupancy[asCoordinateKey('4,3')]).toBe(whitePawn.id);
    expect(domain.boardEntities[whitePawn.id].position).toBe('4,3');
    expect((domain.boardEntities[whitePawn.id] as IPieceEntity).hasMoved).toBe(true);
  });

  it('preserves fundamental undo invariant: S0 -> execute -> undo => S0 (Section M & Critério 3)', () => {
    const snapshotInitial = JSON.stringify(domain);

    const cmd = new MovePieceCommand(
      whitePawn.id,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );

    cmd.execute(domain);
    expect(JSON.stringify(domain)).not.toBe(snapshotInitial);

    cmd.undo(domain);
    expect(domain).toEqual(JSON.parse(snapshotInitial));
  });

  it('handles capture with crazyhouse inventory and undo restoration', () => {
    const snapshotInitial = JSON.stringify(domain);

    // White pawn captures black pawn at 3,2
    const captureCmd = new MovePieceCommand(
      whitePawn.id,
      asCoordinateKey('4,1'),
      asCoordinateKey('3,2'),
      'P1'
    );

    captureCmd.execute(domain);

    // Capturing piece now at 3,2
    expect(domain.occupancy[asCoordinateKey('3,2')]).toBe(whitePawn.id);
    // Captured piece marked captured
    const captured = domain.boardEntities[blackPawn.id] as IPieceEntity;
    expect(captured.isCaptured).toBe(true);
    // Crazyhouse inventory updated for P1
    expect(domain.capturedInventory['P1']).toContain('PAWN');

    // Undo capture
    captureCmd.undo(domain);

    // State matches S0 identically
    expect(domain).toEqual(JSON.parse(snapshotInitial));
  });

  it('executes composite command atomically (Castling scenario)', () => {
    const whiteKing: IPieceEntity = {
      id: asEntityId('white-king'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('4,0'),
      hasMoved: false,
      isCaptured: false,
    };
    const whiteRook: IPieceEntity = {
      id: asEntityId('white-rook'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('7,0'),
      hasMoved: false,
      isCaptured: false,
    };

    domain.boardEntities[whiteKing.id] = whiteKing;
    domain.occupancy[whiteKing.position] = whiteKing.id;
    domain.boardEntities[whiteRook.id] = whiteRook;
    domain.occupancy[whiteRook.position] = whiteRook.id;

    const snapshotInitial = JSON.stringify(domain);

    const kingMove = new MovePieceCommand(
      whiteKing.id,
      asCoordinateKey('4,0'),
      asCoordinateKey('6,0'),
      'P1'
    );
    const rookMove = new MovePieceCommand(
      whiteRook.id,
      asCoordinateKey('7,0'),
      asCoordinateKey('5,0'),
      'P1'
    );

    const castling = new CompositeCommand([kingMove, rookMove], 'P1', 'Kingside Castling');

    castling.execute(domain);

    expect(domain.occupancy[asCoordinateKey('6,0')]).toBe(whiteKing.id);
    expect(domain.occupancy[asCoordinateKey('5,0')]).toBe(whiteRook.id);
    expect(domain.occupancy[asCoordinateKey('4,0')]).toBeUndefined();
    expect(domain.occupancy[asCoordinateKey('7,0')]).toBeUndefined();

    // Undo composite command
    castling.undo(domain);
    expect(domain).toEqual(JSON.parse(snapshotInitial));
  });

  it('rejects move if source coordinate or piece identity does not match (RF-03)', () => {
    const badCmd = new MovePieceCommand(
      whitePawn.id,
      asCoordinateKey('0,0'), // Incorrect origin!
      asCoordinateKey('0,1'),
      'P1'
    );

    expect(() => badCmd.execute(domain)).toThrow(/Invalid move/);
  });

  it('rolls back CompositeCommand child executions if a subsequent child command fails', () => {
    const validMove = new MovePieceCommand(
      whitePawn.id,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,2'),
      'P1'
    );
    const failingMove = new MovePieceCommand(
      blackPawn.id,
      asCoordinateKey('9,9'), // Invalid position!
      asCoordinateKey('9,8'),
      'P2'
    );

    const composite = new CompositeCommand([validMove, failingMove], 'P1');
    expect(() => composite.execute(domain)).toThrow();

    // Verify validMove was rolled back
    expect(domain.boardEntities[whitePawn.id].position).toBe('4,1');
    expect(domain.occupancy[asCoordinateKey('4,1')]).toBe(whitePawn.id);
  });
});

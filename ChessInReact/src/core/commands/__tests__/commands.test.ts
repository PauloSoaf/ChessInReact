import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IEntity, IPieceEntity } from '../../entities/types';
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

  describe('AUDIT-02 Core Invariants Enforcement', () => {
    it('rejects moving an entity that is not of type PIECE', () => {
      const obstacleEntity: IEntity = {
        id: asEntityId('obstacle-4-1'),
        type: 'OBSTACLE',
        position: asCoordinateKey('4,1'),
        destructible: false,
        hp: 100,
      };
      domain.boardEntities[obstacleEntity.id] = obstacleEntity;

      const cmd = new MovePieceCommand(
        obstacleEntity.id,
        asCoordinateKey('4,1'),
        asCoordinateKey('4,2'),
        'P1'
      );

      expect(() => cmd.execute(domain)).toThrow(/only "PIECE" entities can be moved/);
    });

    it('rejects moving an opponent piece (player authorization invariant)', () => {
      // P1 attempting to move P2's piece
      const cmd = new MovePieceCommand(
        blackPawn.id,
        asCoordinateKey('3,2'),
        asCoordinateKey('3,3'),
        'P1'
      );

      expect(() => cmd.execute(domain)).toThrow(/belongs to player "P2", not acting player "P1"/);
    });

    it('rejects moving a piece that is already captured', () => {
      const capturedPawn: IPieceEntity = {
        id: asEntityId('white-pawn-captured'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('1,1'),
        hasMoved: true,
        isCaptured: true,
      };
      domain.boardEntities[capturedPawn.id] = capturedPawn;
      domain.occupancy[capturedPawn.position] = capturedPawn.id;

      const cmd = new MovePieceCommand(
        capturedPawn.id,
        asCoordinateKey('1,1'),
        asCoordinateKey('1,2'),
        'P1'
      );

      expect(() => cmd.execute(domain)).toThrow(/because it is already captured/);
    });

    it('rejects friendly fire / self-capture', () => {
      const secondWhitePawn: IPieceEntity = {
        id: asEntityId('white-pawn-e3'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,2'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.boardEntities[secondWhitePawn.id] = secondWhitePawn;
      domain.occupancy[secondWhitePawn.position] = secondWhitePawn.id;

      const friendlyCaptureCmd = new MovePieceCommand(
        whitePawn.id,
        asCoordinateKey('4,1'),
        asCoordinateKey('4,2'), // Destination occupied by friendly piece
        'P1'
      );

      expect(() => friendlyCaptureCmd.execute(domain)).toThrow(/Self-capture is forbidden/);
    });

    describe('PATCH-04: Complete Turn-State Undo/Redo & Atomic Progression', () => {
      it('atomically advances activePlayer and turnNumber on valid move, and restores them on undo', () => {
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);

        const moveCmd = new MovePieceCommand(
          whitePawn.id,
          asCoordinateKey('4,1'),
          asCoordinateKey('4,3'),
          'P1'
        );

        // Execute: P1 moves -> P2 active, turn 2
        moveCmd.execute(domain);
        expect(domain.activePlayer).toBe('P2');
        expect(domain.turnNumber).toBe(2);
        expect(domain.occupancy[asCoordinateKey('4,3')]).toBe(whitePawn.id);

        // Undo: restores P1 active, turn 1
        moveCmd.undo(domain);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
        expect(domain.occupancy[asCoordinateKey('4,1')]).toBe(whitePawn.id);
        expect(domain.occupancy[asCoordinateKey('4,3')]).toBeUndefined();

        // Redo: re-execute
        moveCmd.execute(domain);
        expect(domain.activePlayer).toBe('P2');
        expect(domain.turnNumber).toBe(2);
      });

      it('rejects move if command actingPlayer does not match draft.activePlayer, preserving turn state', () => {
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);

        // P2 attempts to move out of turn
        const outOfTurnCmd = new MovePieceCommand(
          blackPawn.id,
          asCoordinateKey('3,2'),
          asCoordinateKey('3,3'),
          'P2'
        );

        expect(() => outOfTurnCmd.execute(domain)).toThrow(/It is player "P1"'s turn, not acting player "P2"/);

        // State remains intact
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
        expect(domain.boardEntities[blackPawn.id].position).toBe('3,2');
      });

      it('supports consecutive moves by both players with complete turn and capture restoration', () => {
        // Move 1: P1 moves white pawn 4,1 -> 4,3
        const move1 = new MovePieceCommand(whitePawn.id, asCoordinateKey('4,1'), asCoordinateKey('4,3'), 'P1');
        move1.execute(domain);
        expect(domain.activePlayer).toBe('P2');
        expect(domain.turnNumber).toBe(2);

        // Move 2: P2 moves black pawn 3,2 -> 3,3
        const move2 = new MovePieceCommand(blackPawn.id, asCoordinateKey('3,2'), asCoordinateKey('3,3'), 'P2');
        move2.execute(domain);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(3);

        // Undo Move 2
        move2.undo(domain);
        expect(domain.activePlayer).toBe('P2');
        expect(domain.turnNumber).toBe(2);
        expect(domain.boardEntities[blackPawn.id].position).toBe('3,2');

        // Undo Move 1
        move1.undo(domain);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
        expect(domain.boardEntities[whitePawn.id].position).toBe('4,1');
      });
    });

    describe('PATCH-05: Prevent Invalid Capture of Terrain and Obstacles', () => {
      it('rejects moving onto TERRAIN entity, preserving state and turn', () => {
        const mountain: IEntity = {
          id: asEntityId('terrain-mountain-1'),
          type: 'TERRAIN',
          variantId: 'MOUNTAIN',
          position: asCoordinateKey('4,2'),
          elevation: 5,
        };
        domain.boardEntities[mountain.id] = mountain;
        domain.occupancy[mountain.position] = mountain.id;

        const cmd = new MovePieceCommand(whitePawn.id, asCoordinateKey('4,1'), asCoordinateKey('4,2'), 'P1');

        expect(() => cmd.execute(domain)).toThrow(/occupied by TERRAIN entity/);

        // Verify terrain remains intact in both indices
        expect(domain.occupancy[mountain.position]).toBe(mountain.id);
        expect(domain.boardEntities[mountain.id]).toEqual(mountain);
        expect(domain.occupancy[whitePawn.position]).toBe(whitePawn.id);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
      });

      it('rejects moving onto OBSTACLE entity, preserving state and turn', () => {
        const wall: IEntity = {
          id: asEntityId('obstacle-wall-1'),
          type: 'OBSTACLE',
          position: asCoordinateKey('4,2'),
          destructible: false,
          hp: 100,
        };
        domain.boardEntities[wall.id] = wall;
        domain.occupancy[wall.position] = wall.id;

        const cmd = new MovePieceCommand(whitePawn.id, asCoordinateKey('4,1'), asCoordinateKey('4,2'), 'P1');

        expect(() => cmd.execute(domain)).toThrow(/occupied by OBSTACLE entity/);

        expect(domain.occupancy[wall.position]).toBe(wall.id);
        expect(domain.boardEntities[wall.id]).toEqual(wall);
        expect(domain.occupancy[whitePawn.position]).toBe(whitePawn.id);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
      });

      it('rejects moving onto a coordinate with corrupted occupancy referencing missing entity', () => {
        domain.occupancy[asCoordinateKey('4,2')] = asEntityId('ghost-entity');

        const cmd = new MovePieceCommand(whitePawn.id, asCoordinateKey('4,1'), asCoordinateKey('4,2'), 'P1');

        expect(() => cmd.execute(domain)).toThrow(/references occupant ID "ghost-entity", but entity does not exist/);

        expect(domain.occupancy[whitePawn.position]).toBe(whitePawn.id);
        expect(domain.activePlayer).toBe('P1');
        expect(domain.turnNumber).toBe(1);
      });
    });
  });
});


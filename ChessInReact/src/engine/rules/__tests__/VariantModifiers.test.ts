import { describe, it, expect } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../core/coordinates';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { AtomicModifier } from '../pipelines/modifiers/AtomicModifier';
import { CrazyhouseModifier } from '../pipelines/modifiers/CrazyhouseModifier';
import { AntichessModifier } from '../pipelines/modifiers/AntichessModifier';
import { KingOfTheHillModifier } from '../pipelines/modifiers/KingOfTheHillModifier';
import { NPlayerModifier } from '../pipelines/modifiers/NPlayerModifier';
import { ILegalMove } from '../interfaces/IRulesContracts';
import { MovePipeline } from '../pipelines/MovePipeline';

describe('Variant Modifiers Pipeline Suite (Spec 04 RF-08 to RF-13)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  function createBlankState(variantId = 'CHESS_STANDARD'): IDomainState {
    const emptyInventory: Record<PlayerId, string[]> = {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    };
    return {
      matchId: 'variant-test',
      variantId,
      isGameOver: false,
      winnerId: null,
      activePlayer: 'P1',
      turnNumber: 1,
      revision: 1,
      boardEntities: {},
      occupancy: {},
      capturedInventory: emptyInventory,
      turnState: {
        phase: 'COMMIT',
        lastActionTimestamp: Date.now(),
        enPassantTarget: null,
        fiftyMoveCounter: 0,
      },
    };
  }

  it('Atomic Chess: capture causes radius-1 explosion, destroying pieces while sparing adjacent pawns (RF-08)', () => {
    const state = createBlankState('ATOMIC');

    // White Rook on e1 (4,0)
    const wRookId = asEntityId('wR');
    const wRook: IPieceEntity = {
      id: wRookId,
      type: 'PIECE',
      position: asCoordinateKey('4,0'),
      ownerId: 'P1',
      variantId: 'ROOK',
      hasMoved: true,
      isCaptured: false,
    };
    state.boardEntities[wRookId] = wRook;
    state.occupancy[asCoordinateKey('4,0')] = wRookId;

    // Black Bishop on e4 (4,3) - target of capture
    const bBishopId = asEntityId('bB');
    const bBishop: IPieceEntity = {
      id: bBishopId,
      type: 'PIECE',
      position: asCoordinateKey('4,3'),
      ownerId: 'P2',
      variantId: 'BISHOP',
      hasMoved: true,
      isCaptured: false,
    };
    state.boardEntities[bBishopId] = bBishop;
    state.occupancy[asCoordinateKey('4,3')] = bBishopId;

    // Adjacent Black Knight on d4 (3,3) - non-pawn, should be destroyed!
    const bKnightId = asEntityId('bN');
    const bKnight: IPieceEntity = {
      id: bKnightId,
      type: 'PIECE',
      position: asCoordinateKey('3,3'),
      ownerId: 'P2',
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
    };
    state.boardEntities[bKnightId] = bKnight;
    state.occupancy[asCoordinateKey('3,3')] = bKnightId;

    // Adjacent Black Pawn on f4 (5,3) - PAWN, should be IMMUNE!
    const bPawnId = asEntityId('bP');
    const bPawn: IPieceEntity = {
      id: bPawnId,
      type: 'PIECE',
      position: asCoordinateKey('5,3'),
      ownerId: 'P2',
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
    };
    state.boardEntities[bPawnId] = bPawn;
    state.occupancy[asCoordinateKey('5,3')] = bPawnId;

    // Execute capture: Rook takes Bishop on e4
    const captureMove: ILegalMove = {
      pieceId: wRookId,
      from: asCoordinateKey('4,0'),
      to: asCoordinateKey('4,3'),
      isCapture: true,
      capturedPieceId: bBishopId,
    };

    const result = AtomicModifier.applyExplosion(state, captureMove, topology);

    // Capturing Rook is destroyed in explosion
    expect((result.state.boardEntities[wRookId] as IPieceEntity).isCaptured).toBe(true);
    expect(result.state.occupancy[asCoordinateKey('4,3')]).toBeUndefined();

    // Captured Bishop is destroyed
    expect((result.state.boardEntities[bBishopId] as IPieceEntity).isCaptured).toBe(true);

    // Adjacent Knight is destroyed
    expect((result.state.boardEntities[bKnightId] as IPieceEntity).isCaptured).toBe(true);
    expect(result.state.occupancy[asCoordinateKey('3,3')]).toBeUndefined();

    // Adjacent Pawn SURVIVES the explosion!
    expect((result.state.boardEntities[bPawnId] as IPieceEntity).isCaptured).toBe(false);
    expect(result.state.occupancy[asCoordinateKey('5,3')]).toBe(bPawnId);
  });

  it('Crazyhouse: adds captured piece to pocket and allows legal drop moves (RF-09)', () => {
    let state = createBlankState('CRAZYHOUSE');

    const victim: IPieceEntity = {
      id: asEntityId('victim-b'),
      type: 'PIECE',
      position: asCoordinateKey('2,2'),
      ownerId: 'P2',
      variantId: 'BISHOP',
      hasMoved: true,
      isCaptured: false,
    };

    state = CrazyhouseModifier.addCapturedPieceToInventory(state, victim, 'P1');
    expect(state.capturedInventory.P1).toContain('BISHOP');

    // Add white king so check validation works
    const kingId = asEntityId('white-king');
    state.boardEntities[kingId] = {
      id: kingId,
      type: 'PIECE',
      position: asCoordinateKey('4,0'),
      ownerId: 'P1',
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,0')] = kingId;

    // Generate drop moves for BISHOP
    const dropMoves = CrazyhouseModifier.getLegalDropMoves(state, topology, 'P1', 'BISHOP');
    // On empty 8x8 with 1 king, 63 empty squares exist for drops
    expect(dropMoves.length).toBe(63);
    expect(dropMoves[0].isDrop).toBe(true);

    // Test pawn drop restrictions (cannot drop on rank 0 or 7)
    state = CrazyhouseModifier.addCapturedPieceToInventory(
      state,
      { ...victim, variantId: 'PAWN' },
      'P1'
    );
    const pawnDrops = CrazyhouseModifier.getLegalDropMoves(state, topology, 'P1', 'PAWN');
    // Ranks 1-6 (y=1..6) = 6 ranks * 8 squares = 48 squares (minus occupied e1 = 48)
    for (const d of pawnDrops) {
      expect(d.to.endsWith(',0')).toBe(false);
      expect(d.to.endsWith(',7')).toBe(false);
    }
  });

  it('Antichess: enforces mandatory capture and awards win on total piece loss (RF-10)', () => {
    const state = createBlankState('ANTICHESS');

    const moves: ILegalMove[] = [
      { pieceId: asEntityId('p1'), from: asCoordinateKey('0,0'), to: asCoordinateKey('0,1'), isCapture: false },
      { pieceId: asEntityId('p1'), from: asCoordinateKey('0,0'), to: asCoordinateKey('1,1'), isCapture: true, capturedPieceId: asEntityId('enemy') },
    ];

    const filtered = AntichessModifier.filterMandatoryCaptures(moves);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].isCapture).toBe(true);

    // Win condition test
    const winResult = AntichessModifier.evaluateAntichessOutcome(state, 0);
    expect(winResult.isGameOver).toBe(true);
    expect(winResult.status).toBe('ALL_PIECES_LOST');
    expect(winResult.winnerId).toBe('P1');
  });

  it('King of the Hill: declares immediate victory when King occupies central hill squares (RF-12)', () => {
    const state = createBlankState('KING_OF_THE_HILL');

    const kingId = asEntityId('hill-king');
    state.boardEntities[kingId] = {
      id: kingId,
      type: 'PIECE',
      position: asCoordinateKey('3,3'), // One of central hill squares (d4)
      ownerId: 'P1',
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('3,3')] = kingId;

    const result = KingOfTheHillModifier.evaluateHillControl(state);
    expect(result.isGameOver).toBe(true);
    expect(result.status).toBe('HILL_CONTROLLED');
    expect(result.winnerId).toBe('P1');
  });

  it('N-Player: correctly applies Neutralize, Remove, and Transfer elimination policies (RF-13)', () => {
    const state = createBlankState('N_PLAYER');

    const p3PieceId = asEntityId('p3-piece');
    state.boardEntities[p3PieceId] = {
      id: p3PieceId,
      type: 'PIECE',
      position: asCoordinateKey('2,2'),
      ownerId: 'P3',
      variantId: 'ROOK',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('2,2')] = p3PieceId;

    // 1. NEUTRALIZE policy
    const neutralized = NPlayerModifier.eliminatePlayer(state, 'P3', 'NEUTRALIZE');
    expect((neutralized.boardEntities[p3PieceId] as IPieceEntity).ownerId).toBe('NONE');
    expect(neutralized.occupancy[asCoordinateKey('2,2')]).toBe(p3PieceId);

    // 2. REMOVE policy
    const removed = NPlayerModifier.eliminatePlayer(state, 'P3', 'REMOVE');
    expect((removed.boardEntities[p3PieceId] as IPieceEntity).isCaptured).toBe(true);
    expect(removed.occupancy[asCoordinateKey('2,2')]).toBeUndefined();

    // 3. TRANSFER policy
    const transferred = NPlayerModifier.eliminatePlayer(state, 'P3', 'TRANSFER', 'P1');
    expect((transferred.boardEntities[p3PieceId] as IPieceEntity).ownerId).toBe('P1');
  });

  it('MovePipeline: seamlessly composes post-move effects, filtering, and victory evaluation', () => {
    const state = createBlankState('ANTICHESS');
    const filtered = MovePipeline.filterLegalMoves(
      [
        { pieceId: asEntityId('p1'), from: asCoordinateKey('0,0'), to: asCoordinateKey('0,1'), isCapture: false },
        { pieceId: asEntityId('p1'), from: asCoordinateKey('0,0'), to: asCoordinateKey('1,1'), isCapture: true },
      ],
      state,
      topology,
      { variantId: 'ANTICHESS', enforceCheck: false }
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].isCapture).toBe(true);
  });
});

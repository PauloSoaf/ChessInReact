import { describe, it, expect } from 'vitest';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { computePositionKey } from '../utils/PositionHasher';
import { GameOverDetector } from '../GameOverDetector';
import { RulesEngine } from '../RulesEngine';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { ClassicBoardFactory } from '../utils/ClassicBoardFactory';
import { asCoordinateKey, asEntityId, CoordinateKey } from '../../../core/coordinates/types';
import { IPieceEntity } from '../../../core/entities/types';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';

describe('SPEC04-PATCH-02: FIDE Position Key Canonical Equivalence & Repetition (RF-11)', () => {
  const sqTopology = new SquareTopology({ width: 8, height: 8 });

  it('treats knight returning to origin as identical position (does not rely on generic hasMoved)', () => {
    const state1 = createDefaultDomainState('fide-rep-1');
    const knightId = asEntityId('w-knight-b1');
    const knight1: IPieceEntity = {
      id: knightId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('1,0'), // b1
      hasMoved: false,
      isCaptured: false,
    };
    state1.boardEntities[knightId] = knight1;
    state1.occupancy[knight1.position] = knightId;

    const keyInitial = computePositionKey(state1);

    // Simulate knight moving b1 -> c3 and then back c3 -> b1
    // The piece now has hasMoved: true
    const state2 = createDefaultDomainState('fide-rep-1');
    const knight2: IPieceEntity = {
      id: knightId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('1,0'), // b1
      hasMoved: true, // Has moved before, but is now back at b1!
      isCaptured: false,
    };
    state2.boardEntities[knightId] = knight2;
    state2.occupancy[knight2.position] = knightId;

    const keyReturned = computePositionKey(state2);

    // FIDE Article 9.2: Positions ARE identical because piece placement and player to move are identical
    expect(keyReturned).toBe(keyInitial);
  });

  it('distinguishes visually identical positions when castling rights are lost', () => {
    // Initial state with King and Rooks untouched (Castling available)
    const stateWithCastling = createDefaultDomainState('castling-fide-test');
    const wKing: IPieceEntity = {
      id: asEntityId('w-king'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('4,0'),
      hasMoved: false,
      isCaptured: false,
    };
    const wRookK: IPieceEntity = {
      id: asEntityId('w-rook-k'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('7,0'),
      hasMoved: false,
      isCaptured: false,
    };
    stateWithCastling.boardEntities[wKing.id] = wKing;
    stateWithCastling.boardEntities[wRookK.id] = wRookK;
    stateWithCastling.occupancy[wKing.position] = wKing.id;
    stateWithCastling.occupancy[wRookK.position] = wRookK.id;

    const keyWithCastling = computePositionKey(stateWithCastling);
    expect(keyWithCastling).toContain('|K|'); // Castling rights for White kingside present

    // State where King stepped out e1 -> e2 and returned e2 -> e1 (hasMoved = true)
    const stateWithoutCastling = createDefaultDomainState('castling-fide-test');
    const wKingMoved: IPieceEntity = {
      ...wKing,
      hasMoved: true, // King moved and returned
    };
    stateWithoutCastling.boardEntities[wKingMoved.id] = wKingMoved;
    stateWithoutCastling.boardEntities[wRookK.id] = wRookK;
    stateWithoutCastling.occupancy[wKingMoved.position] = wKingMoved.id;
    stateWithoutCastling.occupancy[wRookK.position] = wRookK.id;

    const keyWithoutCastling = computePositionKey(stateWithoutCastling);
    expect(keyWithoutCastling).toContain('|-|'); // No castling rights

    // FIDE Article 9.2: Positions are NOT identical because castling rights changed
    expect(keyWithoutCastling).not.toBe(keyWithCastling);
  });

  it('includes en passant target only when an opposing pawn can actually capture it (effective en passant)', () => {
    // Case A: White pushes e2-e4, enPassantTarget is '4,2'.
    // Black has NO pawn on d4 ('3,3') or f4 ('5,3').
    const stateNoCaptor = createDefaultDomainState('ep-fide-test');
    (stateNoCaptor as { activePlayer: string }).activePlayer = 'P2'; // Black's turn to respond
    (stateNoCaptor.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = asCoordinateKey('4,2');

    const keyNoCaptor = computePositionKey(stateNoCaptor);
    // Effective ep must be '-' because no black pawn can capture it
    expect(keyNoCaptor.split('|')[2]).toBe('-');

    // Case B: Black has a pawn on d4 ('3,3') that CAN capture en passant
    const stateWithCaptor = createDefaultDomainState('ep-fide-test');
    (stateWithCaptor as { activePlayer: string }).activePlayer = 'P2';
    (stateWithCaptor.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = asCoordinateKey('4,2');

    const bPawn: IPieceEntity = {
      id: asEntityId('b-pawn-d4'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'PAWN',
      position: asCoordinateKey('3,3'),
      hasMoved: true,
      isCaptured: false,
    };
    stateWithCaptor.boardEntities[bPawn.id] = bPawn;
    stateWithCaptor.occupancy[bPawn.position] = bPawn.id;

    const keyWithCaptor = computePositionKey(stateWithCaptor);
    // Effective ep is '4,2' because Black can legally capture
    expect(keyWithCaptor.split('|')[2]).toBe('4,2');
  });

  it('automatically triggers 3-fold repetition and 5-fold repetition draw in GameOverDetector', () => {
    const state = createDefaultDomainState('rep-detector-test');
    // Add sufficient material (Queens and Kings)
    const q1: IPieceEntity = {
      id: asEntityId('w-q'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'QUEEN',
      position: asCoordinateKey('3,0'),
      hasMoved: false,
      isCaptured: false,
    };
    const q2: IPieceEntity = {
      id: asEntityId('b-q'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'QUEEN',
      position: asCoordinateKey('3,7'),
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[q1.id] = q1;
    state.boardEntities[q2.id] = q2;
    state.occupancy[q1.position] = q1.id;
    state.occupancy[q2.position] = q2.id;

    const posKey = 'P1|KQkq|-|4,0:P1:KING';

    // 2 occurrences -> not game over
    const history2 = [posKey, 'other1', posKey];
    const res2 = GameOverDetector.evaluateGameResult(state, sqTopology, 10, undefined, history2);
    expect(res2.isGameOver).toBe(false);

    // 3 occurrences -> THREEFOLD_REPETITION Draw
    const history3 = [posKey, 'other1', posKey, 'other2', posKey];
    const res3 = GameOverDetector.evaluateGameResult(state, sqTopology, 10, undefined, history3);
    expect(res3.isGameOver).toBe(true);
    expect(res3.status).toBe('THREEFOLD_REPETITION');
    expect(res3.winnerId).toBeNull();

    // 5 occurrences -> FIVEFOLD_REPETITION Draw
    const history5 = [posKey, 'a', posKey, 'b', posKey, 'c', posKey, 'd', posKey];
    const res5 = GameOverDetector.evaluateGameResult(state, sqTopology, 10, undefined, history5);
    expect(res5.isGameOver).toBe(true);
    expect(res5.status).toBe('FIVEFOLD_REPETITION');
    expect(res5.winnerId).toBeNull();
  });

  it('MovePieceCommand tracks initial position and appends positions across plies with lossless undo', () => {
    const state = createDefaultDomainState('cmd-history-test');

    const knightId = asEntityId('w-knight-1');
    const knight: IPieceEntity = {
      id: knightId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('1,0'), // b1
      hasMoved: false,
      isCaptured: false,
    };
    state.boardEntities[knightId] = knight;
    state.occupancy[knight.position] = knightId;

    expect(state.turnState.positionHistory?.length ?? 0).toBe(0);

    // Ply 1: White moves b1 -> c3
    const move1 = new MovePieceCommand(knightId, asCoordinateKey('1,0'), asCoordinateKey('2,2'), 'P1');
    move1.execute(state);

    // Initial position was seeded, then move 1 was appended -> length 2
    expect(state.turnState.positionHistory?.length).toBe(2);
    const keyInitial = state.turnState.positionHistory![0];
    const key1 = state.turnState.positionHistory![1];
    expect(keyInitial).toBeDefined();
    expect(key1).toBeDefined();
    expect(keyInitial).not.toBe(key1);

    // Undo ply 1: restores exact initial empty history
    move1.undo(state);
    expect(state.turnState.positionHistory?.length).toBe(0);
    expect(state.occupancy[asCoordinateKey('1,0')]).toBe(knightId);
    expect(state.occupancy[asCoordinateKey('2,2')]).toBeUndefined();
  });

  it('triggers operational THREEFOLD_REPETITION game over in real match move cycles', () => {
    // Set up a clean standard board
    const state = createDefaultDomainState('match-repetition');
    const wKnightId = asEntityId('w-knight-g1');
    const bKnightId = asEntityId('b-knight-g8');
    const wKingId = asEntityId('w-king');
    const bKingId = asEntityId('b-king');

    state.boardEntities[wKnightId] = {
      id: wKnightId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KNIGHT',
      position: asCoordinateKey('6,0'), // g1
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('6,0')] = wKnightId;

    state.boardEntities[bKnightId] = {
      id: bKnightId,
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'KNIGHT',
      position: asCoordinateKey('6,7'), // g8
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('6,7')] = bKnightId;

    state.boardEntities[wKingId] = {
      id: wKingId,
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('4,0'),
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,0')] = wKingId;

    state.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'KING',
      position: asCoordinateKey('4,7'),
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,7')] = bKingId;

    // Cycle 1:
    // Move 1: White g1 -> f3
    new MovePieceCommand(wKnightId, asCoordinateKey('6,0'), asCoordinateKey('5,2'), 'P1', undefined, undefined, true).execute(state);
    // Move 2: Black g8 -> f6
    new MovePieceCommand(bKnightId, asCoordinateKey('6,7'), asCoordinateKey('5,5'), 'P2', undefined, undefined, true).execute(state);
    // Move 3: White f3 -> g1 (returned)
    new MovePieceCommand(wKnightId, asCoordinateKey('5,2'), asCoordinateKey('6,0'), 'P1', undefined, undefined, true).execute(state);
    // Move 4: Black f6 -> g8 (returned -> 2nd occurrence of initial position S0)
    new MovePieceCommand(bKnightId, asCoordinateKey('5,5'), asCoordinateKey('6,7'), 'P2', undefined, undefined, true).execute(state);

    expect(state.isGameOver).toBe(false);

    // Cycle 2:
    // Move 5: White g1 -> f3
    new MovePieceCommand(wKnightId, asCoordinateKey('6,0'), asCoordinateKey('5,2'), 'P1', undefined, undefined, true).execute(state);
    // Move 6: Black g8 -> f6
    new MovePieceCommand(bKnightId, asCoordinateKey('6,7'), asCoordinateKey('5,5'), 'P2', undefined, undefined, true).execute(state);
    // Move 7: White f3 -> g1
    new MovePieceCommand(wKnightId, asCoordinateKey('5,2'), asCoordinateKey('6,0'), 'P1', undefined, undefined, true).execute(state);
    // Move 8: Black f6 -> g8 (returned -> 3rd occurrence of initial position S0!)
    new MovePieceCommand(bKnightId, asCoordinateKey('5,5'), asCoordinateKey('6,7'), 'P2', undefined, undefined, true).execute(state);

    // Match automatically terminates on 3-fold repetition in standard casual mode
    expect(state.isGameOver).toBe(true);
    expect(state.winnerId).toBeNull();
  });

  it('distinguishes claimable draw from mandatory draw when claimableDrawRules is active', () => {
    const state = createDefaultDomainState('fide-claimable-test');
    const posKey = 'P1|KQkq|-|4,0:P1:KING';

    // 3 occurrences:
    const history3 = [posKey, 'other1', posKey, 'other2', posKey];

    // Casual / automatic mode (claimableDrawRules: false / undefined)
    const autoResult = GameOverDetector.evaluateGameResult(state, sqTopology, 5, undefined, history3);
    expect(autoResult.isGameOver).toBe(true);
    expect(autoResult.status).toBe('THREEFOLD_REPETITION');

    // Official FIDE match mode (claimableDrawRules: true)
    const claimableConfig = { variantId: 'CHESS_STANDARD', claimableDrawRules: true };
    const fideResult = GameOverDetector.evaluateGameResult(state, sqTopology, 5, claimableConfig, history3);
    expect(fideResult.isGameOver).toBe(false); // Does NOT terminate automatically!
    expect(fideResult.canClaimDraw).toBe(true);
    expect(fideResult.status).toBe('THREEFOLD_REPETITION');

    // 5 occurrences: Mandatory game over regardless of claimableDrawRules
    const history5 = [posKey, 'a', posKey, 'b', posKey, 'c', posKey, 'd', posKey];
    const mandatory5Result = GameOverDetector.evaluateGameResult(state, sqTopology, 5, claimableConfig, history5);
    expect(mandatory5Result.isGameOver).toBe(true);
    expect(mandatory5Result.status).toBe('FIVEFOLD_REPETITION');

    // 50-move rule vs 75-move rule:
    const state50 = {
      ...state,
      turnState: { ...state.turnState, fiftyMoveCounter: 100 }, // 50 full moves
    };
    const res50Claimable = GameOverDetector.evaluateGameResult(state50, sqTopology, 5, claimableConfig, []);
    expect(res50Claimable.isGameOver).toBe(false); // Claimable
    expect(res50Claimable.canClaimDraw).toBe(true);
    expect(res50Claimable.status).toBe('FIFTY_MOVE_RULE');

    const state75 = {
      ...state,
      turnState: { ...state.turnState, fiftyMoveCounter: 150 }, // 75 full moves
    };
    const res75Mandatory = GameOverDetector.evaluateGameResult(state75, sqTopology, 5, claimableConfig, []);
    expect(res75Mandatory.isGameOver).toBe(true); // Mandatory
    expect(res75Mandatory.status).toBe('SEVENTYFIVE_MOVE_RULE');
  });

  it('RulesEngine.canClaimDraw and RulesEngine.claimDraw process formal draw claims', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const posKey = state.turnState.positionHistory?.[0] ?? 'P1|KQkq|-|4,0:P1:KING';

    // When no repetition exists:
    expect(RulesEngine.canClaimDraw(state, sqTopology, undefined, [posKey])).toBe(false);
    const unclaimableRes = RulesEngine.claimDraw(state, sqTopology, undefined, [posKey]);
    expect(unclaimableRes.isGameOver).toBe(false);

    // When 3-fold repetition exists:
    const history3 = [posKey, 'other1', posKey, 'other2', posKey];
    expect(RulesEngine.canClaimDraw(state, sqTopology, undefined, history3)).toBe(true);
    const claimRes = RulesEngine.claimDraw(state, sqTopology, undefined, history3);
    expect(claimRes.isGameOver).toBe(true);
    expect(claimRes.status).toBe('THREEFOLD_REPETITION');
    expect(claimRes.reason).toContain('Draw claimed by player P1');

    // When 50 moves without capture:
    const state50 = {
      ...state,
      turnState: { ...state.turnState, fiftyMoveCounter: 100 },
    };
    expect(RulesEngine.canClaimDraw(state50, sqTopology)).toBe(true);
    const claim50Res = RulesEngine.claimDraw(state50, sqTopology);
    expect(claim50Res.isGameOver).toBe(true);
    expect(claim50Res.status).toBe('FIFTY_MOVE_RULE');
  });
});

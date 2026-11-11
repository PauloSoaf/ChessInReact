import { describe, it, expect } from 'vitest';
import { DuckChessEngine, IDuckChessState } from '../DuckChessEngine';

describe('Spec 12 - DuckChessEngine (S12-RF08, S12-RNF-11)', () => {
  it('initializes match state correctly with White active, no duck placed, and phase PIECE_MOVE', () => {
    const state: IDuckChessState = DuckChessEngine.createInitialState();
    expect(state.activePlayer).toBe('WHITE');
    expect(state.duckCoordinate).toBeNull();
    expect(state.currentPhase).toBe('PIECE_MOVE');
    expect(state.lastPieceMove).toBeNull();
    expect(state.isGameOver).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.fullmoveNumber).toBe(1);
  });

  it('completes Phase 1 (PIECE_MOVE) and transitions cleanly to Phase 2 (PLACE_DUCK)', () => {
    let state = DuckChessEngine.createInitialState();

    state = DuckChessEngine.executePieceMove(state, {
      from: 'e2',
      to: 'e4',
      pieceId: 'pawn_w_e2',
    });

    expect(state.currentPhase).toBe('PLACE_DUCK');
    expect(state.activePlayer).toBe('WHITE');
    expect(state.lastPieceMove).toEqual({
      from: 'e2',
      to: 'e4',
      pieceId: 'pawn_w_e2',
    });
    expect(state.isGameOver).toBe(false);
  });

  it('completes Phase 2 (PLACE_DUCK), places the duck, toggles turn to Black, and resets phase to PIECE_MOVE', () => {
    let state = DuckChessEngine.createInitialState();

    state = DuckChessEngine.executePieceMove(state, {
      from: 'e2',
      to: 'e4',
      pieceId: 'pawn_w_e2',
    });

    const occupied = new Set(['e4', 'd2', 'e7', 'd7', 'e1', 'e8']);
    const canPlaceE5 = DuckChessEngine.canPlaceDuck(state, 'e5', occupied);
    expect(canPlaceE5.allowed).toBe(true);

    state = DuckChessEngine.executePlaceDuck(state, 'e5', occupied);

    expect(state.duckCoordinate).toBe('e5');
    expect(state.activePlayer).toBe('BLACK');
    expect(state.currentPhase).toBe('PIECE_MOVE');
    expect(state.fullmoveNumber).toBe(1);
  });

  it('increments fullmove counter when Black completes Phase 2 (PLACE_DUCK)', () => {
    let state = DuckChessEngine.createInitialState();
    const occupied = new Set(['e4', 'e5']);

    // White turn
    state = DuckChessEngine.executePieceMove(state, { from: 'e2', to: 'e4', pieceId: 'p_w' });
    state = DuckChessEngine.executePlaceDuck(state, 'd5', occupied);
    expect(state.fullmoveNumber).toBe(1);
    expect(state.activePlayer).toBe('BLACK');

    // Black turn
    state = DuckChessEngine.executePieceMove(state, { from: 'e7', to: 'e5', pieceId: 'p_b' });
    state = DuckChessEngine.executePlaceDuck(state, 'd4', occupied);
    expect(state.fullmoveNumber).toBe(2);
    expect(state.activePlayer).toBe('WHITE');
  });

  it('enforces Absolute Blocker invariant: pieces cannot move to or through the duck square', () => {
    let state = DuckChessEngine.createInitialState();
    const occupied = new Set(['e2', 'e7']);

    // White plays e4 and puts duck on e5
    state = DuckChessEngine.executePieceMove(state, { from: 'e2', to: 'e4', pieceId: 'p_w' });
    state = DuckChessEngine.executePlaceDuck(state, 'e5', occupied);

    // Black tries to move to e5 (where the duck is)
    const directMove = DuckChessEngine.canExecutePieceMove(state, 'e7', 'e5');
    expect(directMove.allowed).toBe(false);
    expect(directMove.reason).toContain('O Pato de borracha é neutro e intransponível');

    // Black tries to slide through e5 (e7 to e4 passing through e5)
    const slideThrough = DuckChessEngine.canExecutePieceMove(state, 'e7', 'e3', ['e6', 'e5', 'e4']);
    expect(slideThrough.allowed).toBe(false);
    expect(slideThrough.reason).toContain('Trajetória bloqueada pelo Pato de borracha');

    // Attempting executePieceMove through the duck throws an error
    expect(() =>
      DuckChessEngine.executePieceMove(state, {
        from: 'e7',
        to: 'e3',
        pieceId: 'rook_b',
        pathCoords: ['e6', 'e5', 'e4'],
      })
    ).toThrow('Trajetória bloqueada');
  });

  it('rejects duck placement on occupied squares and requires moving to a different square', () => {
    let state = DuckChessEngine.createInitialState();
    const occupied = new Set(['e4', 'e8']);

    state = DuckChessEngine.executePieceMove(state, { from: 'e2', to: 'e4', pieceId: 'p_w' });

    // Cannot place duck on occupied square e4
    const placeOnOccupied = DuckChessEngine.canPlaceDuck(state, 'e4', occupied);
    expect(placeOnOccupied.allowed).toBe(false);
    expect(placeOnOccupied.reason).toContain('casas completamente desocupadas');

    // Place duck on d4
    state = DuckChessEngine.executePlaceDuck(state, 'd4', occupied);

    // Now Black moves
    state = DuckChessEngine.executePieceMove(state, { from: 'd7', to: 'd5', pieceId: 'p_b' });

    // Duck cannot remain on d4 (must be moved to a different square)
    const placeSameSquare = DuckChessEngine.canPlaceDuck(state, 'd4', occupied);
    expect(placeSameSquare.allowed).toBe(false);
    expect(placeSameSquare.reason).toContain('casa diferente da atual');
  });

  it('enforces Physical King Capture: capturing the enemy king ends game immediately without duck phase', () => {
    let state = DuckChessEngine.createInitialState();

    // White captures Black's King
    state = DuckChessEngine.executePieceMove(state, {
      from: 'd1',
      to: 'e8',
      pieceId: 'queen_w',
      capturedPieceType: 'king',
    });

    expect(state.isGameOver).toBe(true);
    expect(state.winner).toBe('WHITE');
    expect(state.currentPhase).toBe('TURN_COMPLETED');

    // Any subsequent moves are disallowed
    const furtherMove = DuckChessEngine.canExecutePieceMove(state, 'e7', 'e6');
    expect(furtherMove.allowed).toBe(false);
    expect(furtherMove.reason).toContain('Partida já finalizada por captura física');

    const furtherDuck = DuckChessEngine.canPlaceDuck(state, 'e5', new Set());
    expect(furtherDuck.allowed).toBe(false);
    expect(furtherDuck.reason).toContain('Partida já finalizada');
  });

  it('enforces turn phase ordering constraints', () => {
    const state = DuckChessEngine.createInitialState();

    // Trying to place duck during PIECE_MOVE phase throws
    expect(() => DuckChessEngine.executePlaceDuck(state, 'e4', new Set())).toThrow(
      'A fase atual não é de posicionamento do pato'
    );

    // Move piece to advance to PLACE_DUCK phase
    const stateInDuckPhase = DuckChessEngine.executePieceMove(state, {
      from: 'e2',
      to: 'e4',
      pieceId: 'p_w',
    });

    // Trying to move another piece during PLACE_DUCK phase throws
    expect(() =>
      DuckChessEngine.executePieceMove(stateInDuckPhase, {
        from: 'd2',
        to: 'd4',
        pieceId: 'p_w2',
      })
    ).toThrow('Fase atual requer colocação do pato');
  });
});

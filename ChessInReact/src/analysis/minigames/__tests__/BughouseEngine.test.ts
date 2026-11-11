import { describe, it, expect } from 'vitest';
import { BughouseEngine, IBughouseMatchState } from '../BughouseEngine';

describe('Spec 12 - BughouseEngine (S12-RF10, S12-RF11)', () => {
  const players = {
    team1WhiteA: 'alice',
    team1BlackB: 'bob',
    team2BlackA: 'charlie',
    team2WhiteB: 'diana',
  };

  it('initializes a clean 2v2 twin-board match according to Spec 12 § 5.4', () => {
    const state: IBughouseMatchState = BughouseEngine.createMatch(players, 'bug_test_01');

    expect(state.matchId).toBe('bug_test_01');
    expect(state.isGameOver).toBe(false);
    expect(state.winningTeam).toBeNull();

    // Board A
    expect(state.boardA.boardId).toBe('BOARD_A');
    expect(state.boardA.activeColor).toBe('WHITE');
    expect(state.boardA.fullmoveNumber).toBe(1);

    // Board B
    expect(state.boardB.boardId).toBe('BOARD_B');
    expect(state.boardB.activeColor).toBe('WHITE');
    expect(state.boardB.fullmoveNumber).toBe(1);

    // Players
    expect(state.players['alice']?.team).toBe('TEAM_1');
    expect(state.players['alice']?.boardId).toBe('BOARD_A');
    expect(state.players['alice']?.color).toBe('WHITE');

    expect(state.players['bob']?.team).toBe('TEAM_1');
    expect(state.players['bob']?.boardId).toBe('BOARD_B');
    expect(state.players['bob']?.color).toBe('BLACK');

    expect(state.players['charlie']?.team).toBe('TEAM_2');
    expect(state.players['charlie']?.boardId).toBe('BOARD_A');
    expect(state.players['charlie']?.color).toBe('BLACK');

    expect(state.players['diana']?.team).toBe('TEAM_2');
    expect(state.players['diana']?.boardId).toBe('BOARD_B');
    expect(state.players['diana']?.color).toBe('WHITE');
  });

  it('correctly maps teammates across boards via getPartnerId', () => {
    const state = BughouseEngine.createMatch(players);

    expect(BughouseEngine.getPartnerId(state, 'alice')).toBe('bob');
    expect(BughouseEngine.getPartnerId(state, 'bob')).toBe('alice');
    expect(BughouseEngine.getPartnerId(state, 'charlie')).toBe('diana');
    expect(BughouseEngine.getPartnerId(state, 'diana')).toBe('charlie');
    expect(BughouseEngine.getPartnerId(state, 'unknown')).toBeNull();
  });

  it('transfers captured pieces cross-board to partner reserve immediately', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice on Board A moves and captures a knight ('n')
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
      from: 'e2',
      to: 'e4',
      capturedPieceType: 'n',
    });

    // Alice's turn advanced to Black on Board A
    expect(state.boardA.activeColor).toBe('BLACK');

    // Partner Bob on Board B receives the knight in his reserve!
    expect(state.players['bob']?.reservePieces).toEqual(['n']);
    // Alice's reserve remains empty
    expect(state.players['alice']?.reservePieces).toEqual([]);

    // Diana on Board B moves and captures a bishop ('b')
    state = BughouseEngine.executeMove(state, 'BOARD_B', 'diana', {
      from: 'd2',
      to: 'd4',
      capturedPieceType: 'b',
    });

    // Partner Charlie on Board A receives the bishop in his reserve!
    expect(state.players['charlie']?.reservePieces).toEqual(['b']);
  });

  it('validates and executes Drop Moves from reserve onto empty squares', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice captures a pawn for Bob
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
      from: 'e2',
      to: 'e4',
      capturedPieceType: 'p',
    });

    // Diana moves on Board B so it becomes Bob's turn (Black)
    state = BughouseEngine.executeMove(state, 'BOARD_B', 'diana', {
      from: 'e2',
      to: 'e4',
    });
    expect(state.boardB.activeColor).toBe('BLACK');

    const occupied = new Set(['e2', 'e4', 'd2', 'd7']);

    // Bob drops pawn on e5
    const canDropE5 = BughouseEngine.canDropPiece(
      state,
      'BOARD_B',
      'bob',
      'p',
      'e5',
      occupied
    );
    expect(canDropE5.allowed).toBe(true);

    state = BughouseEngine.executeDrop(
      state,
      'BOARD_B',
      'bob',
      'p',
      'e5',
      occupied
    );

    // Bob's reserve should now be empty
    expect(state.players['bob']?.reservePieces).toEqual([]);
    // Board B fullmove advanced to 2 and activeColor to WHITE
    expect(state.boardB.fullmoveNumber).toBe(2);
    expect(state.boardB.activeColor).toBe('WHITE');
  });

  it('rejects invalid drop moves: occupied squares, unavailable pieces, and rank 1/8 pawns', () => {
    let state = BughouseEngine.createMatch(players);

    // Give Bob a pawn and queen in reserve
    state = {
      ...state,
      boardB: { ...state.boardB, activeColor: 'BLACK' },
      players: {
        ...state.players,
        bob: { ...state.players['bob']!, reservePieces: ['p', 'q'] },
      },
    };

    const occupied = new Set(['e4', 'e5']);

    // Cannot drop on occupied square
    const dropOccupied = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'q', 'e4', occupied);
    expect(dropOccupied.allowed).toBe(false);
    expect(dropOccupied.reason).toContain('já está ocupada');

    // Cannot drop piece not in reserve
    const dropRook = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'r', 'a5', occupied);
    expect(dropRook.allowed).toBe(false);
    expect(dropRook.reason).toContain('não disponível na reserva');

    // Cannot drop pawn on rank 1 or rank 8
    const dropPawnRank1 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'p', 'c1', occupied);
    expect(dropPawnRank1.allowed).toBe(false);
    expect(dropPawnRank1.reason).toContain('primeira ou oitava fileira');

    const dropPawnRank8 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'p', 'c8', occupied);
    expect(dropPawnRank8.allowed).toBe(false);
    expect(dropPawnRank8.reason).toContain('primeira ou oitava fileira');
  });

  it('enforces shared victory invariant: checkmate on either board terminates match immediately', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice checkmates Charlie on Board A
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
      from: 'd1',
      to: 'h5',
      isCheckmate: true,
    });

    expect(state.isGameOver).toBe(true);
    expect(state.winningTeam).toBe('TEAM_1');
    expect(state.winReason).toContain('Vitória da TEAM_1');
    expect(state.boardA.isCheckmate).toBe(true);

    // Subsequent move on Board B throws error
    expect(() =>
      BughouseEngine.executeMove(state, 'BOARD_B', 'diana', {
        from: 'e2',
        to: 'e4',
      })
    ).toThrow('já foi encerrada');
  });

  it('enforces shared victory invariant on resignation', () => {
    let state = BughouseEngine.createMatch(players);

    // Charlie resigns on Board A
    state = BughouseEngine.resign(state, 'charlie');

    expect(state.isGameOver).toBe(true);
    expect(state.winningTeam).toBe('TEAM_1');
    expect(state.winReason).toContain('charlie abandonou a partida');
    expect(state.boardA.isResigned).toBe(true);
  });

  it('enforces turn order and board ownership', () => {
    const state = BughouseEngine.createMatch(players);

    // Charlie (Black) tries to move on Board A when activeColor is WHITE
    expect(() =>
      BughouseEngine.executeMove(state, 'BOARD_A', 'charlie', {
        from: 'e7',
        to: 'e5',
      })
    ).toThrow('Não é o turno');

    // Alice tries to move on Board B (she plays on Board A)
    expect(() =>
      BughouseEngine.executeMove(state, 'BOARD_B', 'alice', {
        from: 'e2',
        to: 'e4',
      })
    ).toThrow('não pertence a este tabuleiro');
  });
});

import { describe, it, expect } from 'vitest';
import { BughouseEngine, IBughouseMatchState } from '../BughouseEngine';
import { asCoordinateKey } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';

describe('Spec 12 - BughouseEngine Authoritative & Security Hardening (S12-RF10, S12-RF11)', () => {
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

  it('authoritatively detects captures and transfers pieces cross-board to partner reserve', () => {
    let state = BughouseEngine.createMatch(players);

    // Board A sequence: 1. e4 d5 2. exd5 (authoritative capture of black pawn)
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'e2', to: 'e4' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'charlie', { from: 'd7', to: 'd5' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'e4', to: 'd5' });

    // Partner Bob (Team 1 Black on Board B) authoritatively receives 'p' in his reserve!
    expect(state.players['bob']?.reservePieces).toEqual(['p']);
    expect(state.players['alice']?.reservePieces).toEqual([]);
  });

  it('rejects forged captures: passing capturedPieceType when no piece was captured is safely ignored', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice moves e2 -> e4 (destination is empty) but attacker caller sends capturedPieceType: 'q'
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
      from: 'e2',
      to: 'e4',
      capturedPieceType: 'q',
    });

    // Bob must NOT receive the forged Queen in his reserve!
    expect(state.players['bob']?.reservePieces).toEqual([]);
  });

  it('rejects forged checkmate: caller cannot spoof isCheckmate: true to force early win', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice moves e2 -> e4 with forged isCheckmate: true
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
      from: 'e2',
      to: 'e4',
      isCheckmate: true,
    });

    // The game must remain active because 1. e4 is NOT checkmate!
    expect(state.isGameOver).toBe(false);
    expect(state.boardA.isCheckmate).toBe(false);
    expect(state.winningTeam).toBeNull();
  });

  it('validates and executes Drop Moves, inserting dropped pieces authoritatively into domainState', () => {
    let state = BughouseEngine.createMatch(players);

    // Alice captures a pawn for Bob: 1. e4 d5 2. exd5
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'e2', to: 'e4' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'charlie', { from: 'd7', to: 'd5' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'e4', to: 'd5' });

    expect(state.players['bob']?.reservePieces).toEqual(['p']);

    // Board B: Diana moves 1. e4 so it becomes Bob's turn
    state = BughouseEngine.executeMove(state, 'BOARD_B', 'diana', { from: 'e2', to: 'e4' });
    expect(state.boardB.activeColor).toBe('BLACK');

    // Bob drops pawn on e5 (empty square)
    const canDropE5 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'p', 'e5');
    expect(canDropE5.allowed).toBe(true);

    state = BughouseEngine.executeDrop(state, 'BOARD_B', 'bob', 'p', 'e5');

    // Bob's reserve should now be empty
    expect(state.players['bob']?.reservePieces).toEqual([]);

    // Authoritative domain state on Board B now contains the dropped piece at e5 (4,4)
    const boardBDomain = state.boardB.domainState;
    expect(boardBDomain).toBeDefined();
    const dropCoordKey = asCoordinateKey('4,4');
    const droppedPieceId = boardBDomain?.occupancy[dropCoordKey];
    expect(droppedPieceId).toBeDefined();
    const droppedEntity = boardBDomain?.boardEntities[droppedPieceId!] as IPieceEntity | undefined;
    expect(droppedEntity?.variantId).toBe('PAWN');

    // Board B fullmove advanced to 2 and activeColor to WHITE
    expect(state.boardB.fullmoveNumber).toBe(2);
    expect(state.boardB.activeColor).toBe('WHITE');
  });

  it('authoritatively rejects drops onto occupied squares even without external occupiedCoords', () => {
    let state = BughouseEngine.createMatch(players);

    // Give Bob a queen in reserve
    state = {
      ...state,
      boardB: { ...state.boardB, activeColor: 'BLACK' },
      players: {
        ...state.players,
        bob: { ...state.players['bob']!, reservePieces: ['q'] },
      },
    };

    // e7 is occupied by Black's pawn in domainState
    const dropOnE7 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'q', 'e7');
    expect(dropOnE7.allowed).toBe(false);
    expect(dropOnE7.reason).toContain('já está ocupada');

    // Attempting executeDrop throws error
    expect(() =>
      BughouseEngine.executeDrop(state, 'BOARD_B', 'bob', 'q', 'e7')
    ).toThrow('já está ocupada');
  });

  it('rejects invalid drop moves: unavailable pieces and rank 1/8 pawns', () => {
    let state = BughouseEngine.createMatch(players);

    state = {
      ...state,
      boardB: { ...state.boardB, activeColor: 'BLACK' },
      players: {
        ...state.players,
        bob: { ...state.players['bob']!, reservePieces: ['p'] },
      },
    };

    // Cannot drop piece not in reserve
    const dropRook = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'r', 'a5');
    expect(dropRook.allowed).toBe(false);
    expect(dropRook.reason).toContain('não disponível na reserva');

    // Cannot drop pawn on rank 1 or rank 8
    const dropPawnRank1 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'p', 'c1');
    expect(dropPawnRank1.allowed).toBe(false);
    expect(dropPawnRank1.reason).toContain('primeira ou oitava fileira');

    const dropPawnRank8 = BughouseEngine.canDropPiece(state, 'BOARD_B', 'bob', 'p', 'c8');
    expect(dropPawnRank8.allowed).toBe(false);
    expect(dropPawnRank8.reason).toContain('primeira ou oitava fileira');
  });

  it('authoritatively verifies checkmate (Fool\'s Mate) via RulesEngine and awards shared victory', () => {
    let state = BughouseEngine.createMatch(players);

    // Board A Fool's Mate sequence: 1. f3 e5 2. g4 Qh4#
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'f2', to: 'f3' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'charlie', { from: 'e7', to: 'e5' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'alice', { from: 'g2', to: 'g4' });
    state = BughouseEngine.executeMove(state, 'BOARD_A', 'charlie', { from: 'd8', to: 'h4' });

    expect(state.isGameOver).toBe(true);
    expect(state.winningTeam).toBe('TEAM_2');
    expect(state.boardA.isCheckmate).toBe(true);
    expect(state.winReason).toContain('Xeque-mate');

    // Subsequent move on Board B throws error because match is over
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

  it('enforces turn order, piece ownership, and board membership', () => {
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

    // Alice tries to move an opponent piece (e7) on Board A
    expect(() =>
      BughouseEngine.executeMove(state, 'BOARD_A', 'alice', {
        from: 'e7',
        to: 'e5',
      })
    ).toThrow('não pertence ao jogador ativo');
  });
});

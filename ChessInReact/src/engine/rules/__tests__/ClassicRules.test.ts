import { describe, it, expect } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { ClassicBoardFactory } from '../utils/ClassicBoardFactory';
import { RulesEngine } from '../RulesEngine';
import { asCoordinateKey } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { computePositionKey } from '../utils/PositionHasher';

describe('Classic FIDE Chess Rules Suite (Spec 04 RF-02 to RF-07, RF-11, RF-14, RF-15)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  it('detects Scholar\'s Mate checkmate correctly (RF-05)', () => {
    // Scholar's Mate: 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
    // FEN after 4. Qxf7# with Black to move
    const fen = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const legalMoves = RulesEngine.getLegalMoves(state, topology);
    expect(legalMoves).toHaveLength(0);

    const isCheck = RulesEngine.isSquareAttacked(
      asCoordinateKey('4,7'), // Black King at e8
      'P1',
      state,
      topology
    );
    expect(isCheck).toBe(true);

    const result = RulesEngine.getGameResult(state, topology);
    expect(result.isGameOver).toBe(true);
    expect(result.status).toBe('CHECKMATE');
    expect(result.winnerId).toBe('P1');
  });

  it('detects Stalemate correctly (RF-05)', () => {
    // Stalemate position: White King at b6 (1,5), White Queen at c7 (2,6), Black King at a8 (0,7)
    // Black King is NOT in check and has no legal moves
    const fen = 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const legalMoves = RulesEngine.getLegalMoves(state, topology);
    expect(legalMoves).toHaveLength(0);

    const result = RulesEngine.getGameResult(state, topology);
    expect(result.isGameOver).toBe(true);
    expect(result.status).toBe('STALEMATE');
    expect(result.winnerId).toBeNull();
  });

  it('enforces absolute pin: pinned piece cannot expose king (RF-04, RNF-13)', () => {
    // White King at e1 (4,0), White Bishop at e2 (4,1), Black Rook at e8 (4,7)
    // The bishop on e2 is absolutely pinned along the e-file and cannot move sideways
    const fen = '4r3/8/8/8/8/8/4B3/4K3 w - - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const bishop = Object.values(state.boardEntities).find(
      (e) => e.type === 'PIECE' && e.variantId === 'BISHOP'
    ) as IPieceEntity;

    const moves = RulesEngine.getLegalMovesForPiece(bishop, state, topology);
    // Since bishop moves diagonally, moving diagonally would break e-file pin, so it has 0 legal moves!
    expect(moves).toHaveLength(0);
  });

  it('prohibits castling when transit squares are attacked (RF-06)', () => {
    // White King at e1 (4,0), Rooks at a1 (0,0) and h1 (7,0).
    // Black Rook at f8 (5,7) attacks f1 (5,0) (transit square for kingside castling).
    const fen = '5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const king = Object.values(state.boardEntities).find(
      (e) => e.type === 'PIECE' && e.variantId === 'KING'
    ) as IPieceEntity;

    const moves = RulesEngine.getLegalMovesForPiece(king, state, topology);
    // Queenside castling destination c1 (2,0) is allowed because d1 and c1 are not attacked
    expect(moves.some((m) => m.isCastling === 'QUEENSIDE')).toBe(true);
    // Kingside castling destination g1 (6,0) is BLOCKED because f1 (5,0) is attacked by Rf8
    expect(moves.some((m) => m.isCastling === 'KINGSIDE')).toBe(false);
  });

  it('handles en passant execution correctly (RF-07)', () => {
    // White Pawn at e5 (4,4), Black Pawn just double-stepped to d5 (3,4), enPassantTarget is d6 (3,5)
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const whitePawn = state.boardEntities[state.occupancy[asCoordinateKey('4,4')]] as IPieceEntity;
    const moves = RulesEngine.getLegalMovesForPiece(whitePawn, state, topology);

    const epMove = moves.find((m) => m.to === asCoordinateKey('3,5'));
    expect(epMove).toBeDefined();
    expect(epMove?.isEnPassant).toBe(true);
    expect(epMove?.isCapture).toBe(true);
    expect(epMove?.capturedPieceId).toBe(state.occupancy[asCoordinateKey('3,4')]);
  });

  it('flags pawn promotion and provides Q, R, B, N options (RF-14)', () => {
    // White Pawn at e7 (4,6), ready to promote on e8 (4,7) into empty square; Black King at a8 (0,7)
    const fen = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
    const state = ClassicBoardFactory.createFromFEN(fen);

    const pawn = state.boardEntities[state.occupancy[asCoordinateKey('4,6')]] as IPieceEntity;
    const moves = RulesEngine.getLegalMovesForPiece(pawn, state, topology);

    const promoMove = moves.find((m) => m.to === asCoordinateKey('4,7'));
    expect(promoMove).toBeDefined();
    expect(promoMove?.isPromotion).toBe(true);
    expect(promoMove?.promotionOptions).toEqual(['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT']);
  });

  it('detects insufficient material draws for K vs K, K+B vs K, K+N vs K (RF-15)', () => {
    // King vs King
    const kvk = ClassicBoardFactory.createFromFEN('8/8/4k3/8/8/4K3/8/8 w - - 0 1');
    expect(RulesEngine.getGameResult(kvk, topology).status).toBe('INSUFFICIENT_MATERIAL');

    // King + Bishop vs King
    const kvkb = ClassicBoardFactory.createFromFEN('8/8/4k3/8/8/4K3/4B3/8 w - - 0 1');
    expect(RulesEngine.getGameResult(kvkb, topology).status).toBe('INSUFFICIENT_MATERIAL');

    // King + Knight vs King
    const kvkn = ClassicBoardFactory.createFromFEN('8/8/4k3/8/8/4K3/4N3/8 w - - 0 1');
    expect(RulesEngine.getGameResult(kvkn, topology).status).toBe('INSUFFICIENT_MATERIAL');

    // King + Bishop vs King + Bishop (same color squares -> draw)
    // Both bishops on color 1 (e.g. e2 = 4,1 -> 5%2 = 1; d7 = 3,6 -> 9%2 = 1)
    const kvk_same_b = ClassicBoardFactory.createFromFEN('8/3b4/4k3/8/8/4K3/4B3/8 w - - 0 1');
    expect(RulesEngine.getGameResult(kvk_same_b, topology).status).toBe('INSUFFICIENT_MATERIAL');
  });

  it('detects 50-move and 75-move rules (RF-11)', () => {
    // 50 fullmoves = 100 halfmoves
    const state50 = ClassicBoardFactory.createFromFEN('8/8/4k3/8/8/4K3/4Q3/8 w - - 100 51');
    expect(RulesEngine.getGameResult(state50, topology).status).toBe('FIFTY_MOVE_RULE');

    // 75 fullmoves = 150 halfmoves
    const state75 = ClassicBoardFactory.createFromFEN('8/8/4k3/8/8/4K3/4Q3/8 w - - 150 76');
    expect(RulesEngine.getGameResult(state75, topology).status).toBe('SEVENTYFIVE_MOVE_RULE');
  });

  it('detects threefold and fivefold repetition via position keys (RF-11)', () => {
    const state = ClassicBoardFactory.createStandardInitialState();
    const key = computePositionKey(state);

    const history3 = [key, 'other1', key, 'other2', key];
    expect(RulesEngine.getGameResult(state, topology, undefined, history3).status).toBe('THREEFOLD_REPETITION');

    const history5 = [key, 'other1', key, 'other2', key, 'other3', key, 'other4', key];
    expect(RulesEngine.getGameResult(state, topology, undefined, history5).status).toBe('FIVEFOLD_REPETITION');
  });

  it('rejects moves with structured rejection codes (RF-01, RNF-02)', () => {
    const state = ClassicBoardFactory.createStandardInitialState();

    // 1. Moving an opponent piece
    const blackPawnId = state.occupancy[asCoordinateKey('4,6')];
    const invalidOwner = RulesEngine.validateMove(
      state,
      {
        pieceId: blackPawnId,
        from: asCoordinateKey('4,6'),
        to: asCoordinateKey('4,5'),
        actingPlayer: 'P1',
      },
      topology
    );
    expect(invalidOwner.valid).toBe(false);
    expect(invalidOwner.code).toBe('NOT_PLAYER_PIECE');

    // 2. Geometrically invalid move (e.g. Rook moving like knight)
    const whiteRookId = state.occupancy[asCoordinateKey('0,0')];
    const invalidGeom = RulesEngine.validateMove(
      state,
      {
        pieceId: whiteRookId,
        from: asCoordinateKey('0,0'),
        to: asCoordinateKey('1,2'),
        actingPlayer: 'P1',
      },
      topology
    );
    expect(invalidGeom.valid).toBe(false);
    expect(invalidGeom.code).toBe('GEOMETRICALLY_INVALID');

    // 3. Valid move achieves < 0.05ms average latency with V8 warmup (RNF-02)
    const whitePawnId = state.occupancy[asCoordinateKey('4,1')];
    const intent = {
      pieceId: whitePawnId,
      from: asCoordinateKey('4,1'),
      to: asCoordinateKey('4,3'),
      actingPlayer: 'P1' as const,
    };
    // Warmup
    for (let w = 0; w < 100; w++) {
      RulesEngine.validateMove(state, intent, topology);
    }
    const iterations = 1000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      RulesEngine.validateMove(state, intent, topology);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;
    expect(avgMs).toBeLessThan(0.05);
  });
});

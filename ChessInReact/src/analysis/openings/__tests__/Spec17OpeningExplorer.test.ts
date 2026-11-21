/**
 * ChessInReact - Spec 17 Test Suite: Opening Explorer & ECO Classification Engine
 * Spec 17: RF-17-01, RF-17-02, RF-17-03, RF-17-04, RF-17-05, RNF-17-01, RNF-17-02
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ECOClassificationEngine } from '../ECOClassificationEngine';
import { OpeningExplorerEngine } from '../OpeningExplorerEngine';
import { RepertoireTrainerEngine } from '../RepertoireTrainerEngine';

describe('Spec 17: ECOClassificationEngine', () => {
  it('normalizes FEN by stripping halfmove clock and move number (Transposition Invariance)', () => {
    const fenA = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const fenB = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 14 25';

    const normA = ECOClassificationEngine.normalizeFen(fenA);
    const normB = ECOClassificationEngine.normalizeFen(fenB);

    expect(normA).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3');
    expect(normA).toBe(normB);
  });

  it('classifies starting position correctly as A00 Posição Inicial', () => {
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = ECOClassificationEngine.classifyFen(initialFen);

    expect(result.eco).toBe('A00');
    expect(result.name).toBe('Posição Inicial');
  });

  it('classifies Ruy Lopez (C60) by move sequence and FEN', () => {
    const moves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'];
    const byMoves = ECOClassificationEngine.classifyMoves(moves);
    expect(byMoves.eco).toBe('C60');
    expect(byMoves.name).toContain('Ruy Lopez');

    const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';
    const byFen = ECOClassificationEngine.classifyFen(fen);
    expect(byFen.eco).toBe('C60');
    expect(byFen.name).toContain('Ruy Lopez');
  });

  it('classifies Sicilian Najdorf (B90) accurately', () => {
    const moves = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
    const result = ECOClassificationEngine.classifyMoves(moves);
    expect(result.eco).toBe('B90');
    expect(result.name).toContain('Najdorf');
  });

  it('classifies Italian Game (C50) and French Defense (C00)', () => {
    const italian = ECOClassificationEngine.classifyMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(italian.eco).toBe('C50');
    expect(italian.name).toContain('Italiana');

    const french = ECOClassificationEngine.classifyMoves(['e4', 'e6']);
    expect(french.eco).toBe('C00');
    expect(french.name).toContain('Francesa');
  });

  it('classifies Queen Gambit Declined (D30) and King Indian Defense (E60)', () => {
    const qgd = ECOClassificationEngine.classifyMoves(['d4', 'd5', 'c4', 'e6']);
    expect(qgd.eco).toBe('D30');
    expect(qgd.name).toContain('Gambito da Dama Recusado');

    const kid = ECOClassificationEngine.classifyMoves(['d4', 'Nf6', 'c4', 'g6']);
    expect(kid.eco).toBe('E60');
    expect(kid.name).toContain('Índia do Rei');
  });

  it('falls back gracefully to A00 Customizada for out-of-book positions', () => {
    const weirdFen = '8/8/8/4k3/4K3/8/8/8 w - - 0 1';
    const result = ECOClassificationEngine.classifyFen(weirdFen);
    expect(result.eco).toBe('A00');
    expect(result.name).toContain('Customizada');
  });
});

describe('Spec 17: OpeningExplorerEngine', () => {
  it('returns candidate moves and win percentages for initial position', () => {
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const node = OpeningExplorerEngine.getOpeningNode(initialFen);

    expect(node.eco).toBe('A00');
    expect(node.candidateMoves.length).toBeGreaterThanOrEqual(4);

    const topMove = node.candidateMoves[0];
    expect(topMove.san).toBe('e4');
    expect(topMove.totalGames).toBeGreaterThan(1000000);
    expect(topMove.whiteWinPct + topMove.drawPct + topMove.blackWinPct).toBe(100);
  });

  it('allows registering and retrieving custom candidate move statistics', () => {
    const customFen = 'rnbqkbnr/pppppppp/8/8/8/7N/PPPPPPPP/RNBQKB1R b KQkq - 1 1';
    OpeningExplorerEngine.registerCandidateMove(customFen, {
      san: 'd5',
      uci: 'd7d5',
      totalGames: 1200,
      whiteWins: 300,
      draws: 400,
      blackWins: 500,
      whiteWinPct: 25,
      drawPct: 33,
      blackWinPct: 42,
      averageRating: 2450
    });

    const node = OpeningExplorerEngine.getOpeningNode(customFen);
    expect(node.candidateMoves.length).toBe(1);
    expect(node.candidateMoves[0].san).toBe('d5');
    expect(node.candidateMoves[0].blackWinPct).toBe(42);
  });
});

describe('Spec 17: RepertoireTrainerEngine (SM-2 Spaced Repetition)', () => {
  beforeEach(() => {
    // Ensure cards are loaded
    RepertoireTrainerEngine.createStudySession();
  });

  it('loads default seeded repertoire cards for White and Black', () => {
    const allCards = RepertoireTrainerEngine.getAllCards();
    expect(allCards.length).toBeGreaterThanOrEqual(4);

    const whiteCards = allCards.filter(c => c.color === 'WHITE');
    const blackCards = allCards.filter(c => c.color === 'BLACK');

    expect(whiteCards.length).toBeGreaterThanOrEqual(2);
    expect(blackCards.length).toBeGreaterThanOrEqual(2);
  });

  it('advances box level and calculates next interval on correct move', () => {
    const feedback = RepertoireTrainerEngine.verifyMove('rep_white_italian_e4', 'e4');

    expect(feedback.isCorrect).toBe(true);
    expect(feedback.updatedCard.boxLevel).toBe(2);
    expect(feedback.updatedCard.timesReviewed).toBe(1);
    expect(feedback.updatedCard.intervalDays).toBe(3);
    expect(feedback.feedbackText).toContain('Excelente');
  });

  it('accepts alternative moves when defined on card', () => {
    const feedback = RepertoireTrainerEngine.verifyMove('rep_white_italian_e4', 'd4');

    expect(feedback.isCorrect).toBe(true);
    expect(feedback.isAlternative).toBe(true);
    expect(feedback.feedbackText).toContain('alternativa válida');
  });

  it('resets to Box 1 and increments timesFailed on incorrect move', () => {
    const feedback = RepertoireTrainerEngine.verifyMove('rep_white_italian_e4', 'h4');

    expect(feedback.isCorrect).toBe(false);
    expect(feedback.updatedCard.boxLevel).toBe(1);
    expect(feedback.updatedCard.timesFailed).toBe(1);
    expect(feedback.feedbackText).toContain('Incorreto');
  });

  it('exports and imports repertoire JSON correctly', () => {
    const exportedJson = RepertoireTrainerEngine.exportRepertoireJson();
    expect(exportedJson).toContain('schemaVersion');
    expect(exportedJson).toContain('cards');

    const importSuccess = RepertoireTrainerEngine.importRepertoireJson(exportedJson);
    expect(importSuccess).toBe(true);
  });

  it('creates study session filtered by color', () => {
    const whiteSession = RepertoireTrainerEngine.createStudySession('WHITE');
    expect(whiteSession.cardsDue.every(c => c.color === 'WHITE')).toBe(true);
    expect(whiteSession.totalCards).toBeGreaterThanOrEqual(2);
  });
});

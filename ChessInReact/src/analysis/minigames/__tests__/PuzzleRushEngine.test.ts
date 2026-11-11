import { describe, it, expect } from 'vitest';
import {
  PuzzleRushEngine,
  ITacticalPuzzle,
  IPuzzleRushSession,
} from '../PuzzleRushEngine';

describe('Spec 12 - PuzzleRushEngine (S12-RF09, S12-RNF-11)', () => {
  const mockPuzzles: readonly ITacticalPuzzle[] = [
    {
      id: 'pz_1',
      rating: 600,
      fen: '8/8/8/8/8/8/4QPPP/6K1 w - - 0 1',
      solutionMoves: ['e2e8'],
      theme: 'Back Rank Mate',
    },
    {
      id: 'pz_2',
      rating: 1200,
      fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
      solutionMoves: ['c4f7', 'e8f7'],
      theme: 'Fork / Sacrifice',
    },
    {
      id: 'pz_3',
      rating: 1800,
      fen: 'r1b2rk1/pp3ppp/2n1p3/q2n4/8/2NBPN2/PP3PPP/R2QK2R w KQ - 0 12',
      solutionMoves: ['d3h7', 'g8h7', 'f3g5'],
      theme: 'Greek Gift',
    },
  ];

  it('creates clean initial sessions for all modes adhering to Spec 12 § 5.3', () => {
    // Survival Mode
    const survival = PuzzleRushEngine.createSession('SURVIVAL');
    expect(survival.mode).toBe('SURVIVAL');
    expect(survival.lives).toBe(3);
    expect(survival.maxLives).toBe(3);
    expect(survival.timeRemainingMs).toBe(Infinity);
    expect(survival.score).toBe(0);
    expect(survival.isGameOver).toBe(false);

    // Timed 3 Min Mode
    const timed3 = PuzzleRushEngine.createSession('TIMED_3MIN');
    expect(timed3.mode).toBe('TIMED_3MIN');
    expect(timed3.lives).toBe(Infinity);
    expect(timed3.timeRemainingMs).toBe(180000);

    // Timed 5 Min Mode
    const timed5 = PuzzleRushEngine.createSession('TIMED_5MIN');
    expect(timed5.mode).toBe('TIMED_5MIN');
    expect(timed5.timeRemainingMs).toBe(300000);

    // Battle Mode
    const battle = PuzzleRushEngine.createSession('BATTLE');
    expect(battle.mode).toBe('BATTLE');
    expect(battle.battleOpponentScore).toBe(0);
    expect(battle.timeRemainingMs).toBe(180000);
  });

  it('handles single-move puzzle resolution and advances score and puzzle index', () => {
    let session = PuzzleRushEngine.createSession('SURVIVAL');

    const result = PuzzleRushEngine.submitMove(session, mockPuzzles, 'e2e8', 1500);
    expect(result.isCorrect).toBe(true);
    expect(result.isPuzzleCompleted).toBe(true);
    expect(result.botReplyMove).toBeUndefined();

    session = result.nextSession;
    expect(session.score).toBe(1);
    expect(session.currentPuzzleIndex).toBe(1);
    expect(session.lives).toBe(3);
    expect(session.history).toHaveLength(1);
    expect(session.history[0]).toEqual({
      puzzleId: 'pz_1',
      solved: true,
      timeSpentMs: 1500,
      movesAttempted: ['e2e8'],
    });
  });

  it('handles multi-move puzzle with automated opponent counter-move', () => {
    let session: IPuzzleRushSession = {
      ...PuzzleRushEngine.createSession('SURVIVAL'),
      currentPuzzleIndex: 1, // 'pz_2' with ['c4f7', 'e8f7']
    };

    const result = PuzzleRushEngine.submitMove(session, mockPuzzles, 'c4f7', 2200);
    expect(result.isCorrect).toBe(true);
    expect(result.isPuzzleCompleted).toBe(true);
    expect(result.botReplyMove).toBe('e8f7');

    session = result.nextSession;
    expect(session.score).toBe(1);
    expect(session.currentPuzzleIndex).toBe(2);
    expect(session.history).toHaveLength(1);
    expect(session.history[0]?.movesAttempted).toEqual(['c4f7', 'e8f7']);
  });

  it('handles 3-move complex puzzle sequence', () => {
    let session: IPuzzleRushSession = {
      ...PuzzleRushEngine.createSession('SURVIVAL'),
      currentPuzzleIndex: 2, // 'pz_3' with ['d3h7', 'g8h7', 'f3g5']
    };

    // Move 1
    const step1 = PuzzleRushEngine.submitMove(session, mockPuzzles, 'd3h7', 1000);
    expect(step1.isCorrect).toBe(true);
    expect(step1.isPuzzleCompleted).toBe(false);
    expect(step1.botReplyMove).toBe('g8h7');

    session = step1.nextSession;
    expect(session.currentMoveIndex).toBe(2); // next is 'f3g5'

    // Move 2
    const step2 = PuzzleRushEngine.submitMove(session, mockPuzzles, 'f3g5', 800);
    expect(step2.isCorrect).toBe(true);
    expect(step2.isPuzzleCompleted).toBe(true);

    session = step2.nextSession;
    expect(session.score).toBe(1);
    expect(session.currentPuzzleIndex).toBe(3);
  });

  it('deducts lives on blunders in Survival Mode and terminates when lives reach 0', () => {
    let session = PuzzleRushEngine.createSession('SURVIVAL');

    // Mistake 1 on pz_1
    const blunder1 = PuzzleRushEngine.submitMove(session, mockPuzzles, 'a2a4', 800);
    expect(blunder1.isCorrect).toBe(false);
    expect(blunder1.nextSession.lives).toBe(2);
    expect(blunder1.nextSession.score).toBe(0);
    expect(blunder1.nextSession.currentPuzzleIndex).toBe(1);
    expect(blunder1.nextSession.isGameOver).toBe(false);

    // Mistake 2 on pz_2
    session = blunder1.nextSession;
    const blunder2 = PuzzleRushEngine.submitMove(session, mockPuzzles, 'd2d4', 900);
    expect(blunder2.nextSession.lives).toBe(1);
    expect(blunder2.nextSession.isGameOver).toBe(false);

    // Mistake 3 on pz_3
    session = blunder2.nextSession;
    const blunder3 = PuzzleRushEngine.submitMove(session, mockPuzzles, 'a1b1', 1200);
    expect(blunder3.nextSession.lives).toBe(0);
    expect(blunder3.nextSession.isGameOver).toBe(true);

    // Any move attempted after game over is ignored
    const postOver = PuzzleRushEngine.submitMove(blunder3.nextSession, mockPuzzles, 'e2e8');
    expect(postOver.isCorrect).toBe(false);
    expect(postOver.nextSession.score).toBe(0);
  });

  it('decrements timer and terminates session on time expiration in Timed Modes', () => {
    let session = PuzzleRushEngine.createSession('TIMED_3MIN'); // 180,000 ms

    session = PuzzleRushEngine.tickTimer(session, 10000);
    expect(session.timeRemainingMs).toBe(170000);
    expect(session.isGameOver).toBe(false);

    // Expire timer
    session = PuzzleRushEngine.tickTimer(session, 170000);
    expect(session.timeRemainingMs).toBe(0);
    expect(session.isGameOver).toBe(true);

    // Ticking already expired timer is a no-op
    const noopTick = PuzzleRushEngine.tickTimer(session, 5000);
    expect(noopTick.timeRemainingMs).toBe(0);
  });

  it('synchronizes opponent score updates in real-time Puzzle Battle Mode', () => {
    let session = PuzzleRushEngine.createSession('BATTLE');
    expect(session.battleOpponentScore).toBe(0);

    session = PuzzleRushEngine.updateOpponentScore(session, 3);
    expect(session.battleOpponentScore).toBe(3);

    session = PuzzleRushEngine.updateOpponentScore(session, 7);
    expect(session.battleOpponentScore).toBe(7);

    // Non-battle session ignores opponent score update
    const survival = PuzzleRushEngine.createSession('SURVIVAL');
    const unchanged = PuzzleRushEngine.updateOpponentScore(survival, 5);
    expect(unchanged.battleOpponentScore).toBeUndefined();
  });

  it('verifies that the canonical puzzle catalog spans ratings from 600 to 2600+ with valid FEN and moves', () => {
    const catalog = PuzzleRushEngine.getCanonicalPuzzleCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(10);

    let previousRating = 0;
    for (const puzzle of catalog) {
      expect(puzzle.id).toBeDefined();
      expect(puzzle.rating).toBeGreaterThanOrEqual(previousRating);
      expect(puzzle.fen.length).toBeGreaterThan(15);
      expect(puzzle.solutionMoves.length).toBeGreaterThanOrEqual(1);
      expect(puzzle.theme.length).toBeGreaterThan(0);
      previousRating = puzzle.rating;
    }

    expect(catalog[0]?.rating).toBe(600);
    expect(catalog[catalog.length - 1]?.rating).toBeGreaterThanOrEqual(2600);
  });
});

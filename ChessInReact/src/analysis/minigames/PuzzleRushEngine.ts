/**
 * ChessInReact - Puzzle Rush & Tactical Battle Engine (Spec 12 § 5.3, § 8 RF-09)
 *
 * Implements:
 * 1. Survival Mode:
 *    - 3 lives, rating progression from 600 to 2600+.
 *    - Each blunder consumes 1 life. Game ends at 0 lives.
 * 2. Timed Modes (3 Minutes / 180s & 5 Minutes / 300s):
 *    - Timed countdown with unlimited lives.
 *    - Tracks streak, total solved, and accuracy score.
 * 3. Puzzle Battle (1v1 Real-Time Synchronization):
 *    - Identical puzzle stream between opponents.
 *    - Synchronous dual-progress tracking and delta telemetry.
 */

export type PuzzleRushMode = 'SURVIVAL' | 'TIMED_3MIN' | 'TIMED_5MIN' | 'BATTLE';

export interface ITacticalPuzzle {
  readonly id: string;
  readonly rating: number;
  readonly fen: string;
  readonly solutionMoves: readonly string[]; // UCI format e.g. ['e2e4', 'e7e5']
  readonly theme: string;
}

export interface IPuzzleHistoryEntry {
  readonly puzzleId: string;
  readonly solved: boolean;
  readonly timeSpentMs: number;
  readonly movesAttempted: readonly string[];
}

export interface IPuzzleRushSession {
  readonly sessionId: string;
  readonly mode: PuzzleRushMode;
  readonly currentPuzzleIndex: number;
  readonly currentMoveIndex: number;
  readonly score: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly timeRemainingMs: number;
  readonly isGameOver: boolean;
  readonly isPaused: boolean;
  readonly history: readonly IPuzzleHistoryEntry[];
  readonly battleOpponentScore?: number;
}

export class PuzzleRushEngine {
  /**
   * Initializes a Puzzle Rush session according to mode specifications.
   */
  public static createSession(
    mode: PuzzleRushMode,
    sessionId: string = `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  ): IPuzzleRushSession {
    let initialLives = 3;
    let initialTimeMs = Infinity;

    switch (mode) {
      case 'SURVIVAL':
        initialLives = 3;
        initialTimeMs = Infinity;
        break;
      case 'TIMED_3MIN':
        initialLives = Infinity;
        initialTimeMs = 180 * 1000;
        break;
      case 'TIMED_5MIN':
        initialLives = Infinity;
        initialTimeMs = 300 * 1000;
        break;
      case 'BATTLE':
        initialLives = Infinity;
        initialTimeMs = 180 * 1000;
        break;
    }

    return {
      sessionId,
      mode,
      currentPuzzleIndex: 0,
      currentMoveIndex: 0,
      score: 0,
      lives: initialLives,
      maxLives: initialLives === Infinity ? 0 : initialLives,
      timeRemainingMs: initialTimeMs,
      isGameOver: false,
      isPaused: false,
      history: [],
      battleOpponentScore: mode === 'BATTLE' ? 0 : undefined,
    };
  }

  /**
   * Advances time in timed and battle modes. Ends session when time expires.
   */
  public static tickTimer(session: IPuzzleRushSession, deltaMs: number): IPuzzleRushSession {
    if (session.isGameOver || session.isPaused || session.timeRemainingMs === Infinity) {
      return session;
    }

    const nextTime = Math.max(0, session.timeRemainingMs - deltaMs);
    const isTimeExpired = nextTime === 0;

    return {
      ...session,
      timeRemainingMs: nextTime,
      isGameOver: session.isGameOver || isTimeExpired,
    };
  }

  /**
   * Submits a player move for the current puzzle in the sequence.
   */
  public static submitMove(
    session: IPuzzleRushSession,
    puzzleSet: readonly ITacticalPuzzle[],
    moveUci: string,
    elapsedMs: number = 0
  ): {
    readonly nextSession: IPuzzleRushSession;
    readonly isCorrect: boolean;
    readonly isPuzzleCompleted: boolean;
    readonly botReplyMove?: string;
  } {
    if (session.isGameOver) {
      return { nextSession: session, isCorrect: false, isPuzzleCompleted: false };
    }

    const currentPuzzle = puzzleSet[session.currentPuzzleIndex];
    if (!currentPuzzle) {
      // Completed all puzzles in set
      return {
        nextSession: { ...session, isGameOver: true },
        isCorrect: false,
        isPuzzleCompleted: false,
      };
    }

    const expectedMove = currentPuzzle.solutionMoves[session.currentMoveIndex];
    const isCorrect = moveUci.toLowerCase().trim() === expectedMove?.toLowerCase().trim();
    const timeAfterMove =
      session.timeRemainingMs === Infinity
        ? Infinity
        : Math.max(0, session.timeRemainingMs - Math.max(0, elapsedMs));

    if (!isCorrect) {
      // Incorrect move: deduct life in survival, register failure in history, move to next puzzle
      const nextLives = session.lives === Infinity ? Infinity : Math.max(0, session.lives - 1);
      const isGameOver = nextLives === 0;

      const updatedHistory: readonly IPuzzleHistoryEntry[] = [
        ...session.history,
        {
          puzzleId: currentPuzzle.id,
          solved: false,
          timeSpentMs: elapsedMs,
          movesAttempted: [moveUci],
        },
      ];

      const nextPuzzleIndex = session.currentPuzzleIndex + 1;
      const allPuzzlesDone = nextPuzzleIndex >= puzzleSet.length;

      return {
        nextSession: {
          ...session,
          lives: nextLives,
          currentPuzzleIndex: nextPuzzleIndex,
          currentMoveIndex: 0,
          timeRemainingMs: timeAfterMove,
          isGameOver: isGameOver || allPuzzlesDone || timeAfterMove === 0,
          history: updatedHistory,
        },
        isCorrect: false,
        isPuzzleCompleted: false,
      };
    }

    // Correct player move
    const nextMoveIndex = session.currentMoveIndex + 1;

    // Check if puzzle requires automated opponent response move
    if (nextMoveIndex < currentPuzzle.solutionMoves.length) {
      const botResponse = currentPuzzle.solutionMoves[nextMoveIndex];
      const moveAfterBot = nextMoveIndex + 1;

      if (moveAfterBot >= currentPuzzle.solutionMoves.length) {
        // The bot move finishes the puzzle setup and player completes puzzle
        const nextPuzzleIndex = session.currentPuzzleIndex + 1;
        const allDone = nextPuzzleIndex >= puzzleSet.length;

        const updatedHistory: readonly IPuzzleHistoryEntry[] = [
          ...session.history,
          {
            puzzleId: currentPuzzle.id,
            solved: true,
            timeSpentMs: elapsedMs,
            movesAttempted: [moveUci, botResponse],
          },
        ];

        return {
          nextSession: {
            ...session,
            score: session.score + 1,
            currentPuzzleIndex: nextPuzzleIndex,
            currentMoveIndex: 0,
            timeRemainingMs: timeAfterMove,
            isGameOver: session.isGameOver || allDone || timeAfterMove === 0,
            history: updatedHistory,
          },
          isCorrect: true,
          isPuzzleCompleted: true,
          botReplyMove: botResponse,
        };
      }

      // Multi-step puzzle: bot replies, player has another turn
      return {
        nextSession: {
          ...session,
          currentMoveIndex: moveAfterBot,
          timeRemainingMs: timeAfterMove,
          isGameOver: timeAfterMove === 0,
        },
        isCorrect: true,
        isPuzzleCompleted: false,
        botReplyMove: botResponse,
      };
    }

    // Puzzle completed with single move
    const nextPuzzleIndex = session.currentPuzzleIndex + 1;
    const allDone = nextPuzzleIndex >= puzzleSet.length;

    const updatedHistory: readonly IPuzzleHistoryEntry[] = [
      ...session.history,
      {
        puzzleId: currentPuzzle.id,
        solved: true,
        timeSpentMs: elapsedMs,
        movesAttempted: [moveUci],
      },
    ];

    return {
      nextSession: {
        ...session,
        score: session.score + 1,
        currentPuzzleIndex: nextPuzzleIndex,
        currentMoveIndex: 0,
        timeRemainingMs: timeAfterMove,
        isGameOver: session.isGameOver || allDone || timeAfterMove === 0,
        history: updatedHistory,
      },
      isCorrect: true,
      isPuzzleCompleted: true,
    };
  }

  /**
   * Updates opponent score in real-time Puzzle Battle 1v1.
   */
  public static updateOpponentScore(
    session: IPuzzleRushSession,
    opponentScore: number
  ): IPuzzleRushSession {
    if (session.mode !== 'BATTLE') {
      return session;
    }
    return {
      ...session,
      battleOpponentScore: opponentScore,
    };
  }

  /**
   * Provides a calibrated canonical set of tactical puzzles covering rating brackets from 600 to 2600+.
   */
  public static getCanonicalPuzzleCatalog(): readonly ITacticalPuzzle[] {
    return [
      {
        id: 'pz_600_01',
        rating: 600,
        fen: 'r1bqkb1r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
        solutionMoves: ['c4f7', 'e8f7'],
        theme: 'Fork / Sacrifice',
      },
      {
        id: 'pz_800_02',
        rating: 800,
        fen: '6k1/5ppp/8/8/8/8/4QPPP/6K1 w - - 0 1',
        solutionMoves: ['e2e8'],
        theme: 'Back Rank Mate',
      },
      {
        id: 'pz_1000_03',
        rating: 1000,
        fen: 'r1b1k2r/ppppqppp/2n5/4P3/1bB2B2/2P2N2/P4PPP/R2Q1RK1 b kq - 0 9',
        solutionMoves: ['b4c3'],
        theme: 'Hanging Piece',
      },
      {
        id: 'pz_1200_04',
        rating: 1200,
        fen: 'r4rk1/pp3ppp/2n5/2qp4/4n3/2P2N2/PP1N1PPP/R2Q1RK1 w - - 0 13',
        solutionMoves: ['d2e4', 'd5e4'],
        theme: 'Simplification',
      },
      {
        id: 'pz_1400_05',
        rating: 1400,
        fen: 'r1b2rk1/pp1n1ppp/2p1pn2/q2p2B1/2PP4/2N1PN2/PPQ2PPP/R3KB1R w KQ - 0 9',
        solutionMoves: ['c4d5', 'c6d5'],
        theme: 'Pawn Structure Break',
      },
      {
        id: 'pz_1600_06',
        rating: 1600,
        fen: 'r2q1rk1/1pp1bppp/p1np1n2/4p3/B3P1b1/2PP1N2/PP3PPP/RNBQ1RK1 w - - 0 9',
        solutionMoves: ['a4c6', 'b7c6'],
        theme: 'Pin Exploitation',
      },
      {
        id: 'pz_1800_07',
        rating: 1800,
        fen: '2r2rk1/1b2qppp/p3pn2/1p1p4/3P4/PQN1PB2/1P3PPP/2R2RK1 w - - 0 17',
        solutionMoves: ['c3a4', 'c8c1'],
        theme: 'Outpost Navigation',
      },
      {
        id: 'pz_2000_08',
        rating: 2000,
        fen: '3r2k1/pp3ppp/8/3p1q2/3Q4/1P2P1P1/P4PKP/3R4 b - - 2 24',
        solutionMoves: ['f5e4', 'd4e4'],
        theme: 'Queen Deflection',
      },
      {
        id: 'pz_2200_09',
        rating: 2200,
        fen: 'r1b2rk1/pp3ppp/2n1p3/q2n4/8/2NBPN2/PP3PPP/R2QK2R w KQ - 0 12',
        solutionMoves: ['d3h7', 'g8h7', 'f3g5'],
        theme: 'Greek Gift Sacrifice',
      },
      {
        id: 'pz_2400_10',
        rating: 2400,
        fen: '2r3k1/1p3pp1/p2p1b1p/3P4/P3RP2/1P1Q4/2P3PP/1K2B2q w - - 0 28',
        solutionMoves: ['d3e2', 'c8c3', 'e4e8'],
        theme: 'Deep Clearance',
      },
      {
        id: 'pz_2600_11',
        rating: 2600,
        fen: 'r2q1rk1/1bp1bpp1/ppn1p2p/3n4/3PN2B/P2B1N2/1PP1QPPP/R4RK1 w - - 1 14',
        solutionMoves: ['h4e7', 'd8e7', 'g2g3'],
        theme: 'Grandmaster Positional Clamp',
      },
    ];
  }
}

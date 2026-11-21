/**
 * ChessInReact - Master Opening Explorer Engine
 * Spec 17: RF-17-02 & RF-17-03
 *
 * Provides statistical opening book navigation, candidate move exploration,
 * win/draw/loss distributions, and transposition-invariant graph lookups.
 */

import { ECOClassificationEngine } from './ECOClassificationEngine';
import { IOpeningCandidateMove, IOpeningNode } from './types';

export class OpeningExplorerEngine {
  private static masterTree = new Map<string, IOpeningCandidateMove[]>();

  static {
    this.seedDefaultMasterStats();
  }

  /**
   * Returns opening information and master candidate moves for any given FEN position.
   */
  public static getOpeningNode(fen: string): IOpeningNode {
    const normalized = ECOClassificationEngine.normalizeFen(fen);
    const classification = ECOClassificationEngine.classifyFen(fen);
    const candidates = this.masterTree.get(normalized) ?? [];

    let totalGames = 0;
    let whiteWins = 0;
    let draws = 0;
    let blackWins = 0;

    for (const move of candidates) {
      totalGames += move.totalGames;
      whiteWins += move.whiteWins;
      draws += move.draws;
      blackWins += move.blackWins;
    }

    const whiteWinPct = totalGames > 0 ? Math.round((whiteWins / totalGames) * 100) : 38;
    const drawPct = totalGames > 0 ? Math.round((draws / totalGames) * 100) : 34;
    const blackWinPct = totalGames > 0 ? Math.round((blackWins / totalGames) * 100) : 28;

    return {
      eco: classification.eco,
      name: classification.name,
      normalizedFen: normalized,
      candidateMoves: [...candidates].sort((a, b) => b.totalGames - a.totalGames),
      totalGames,
      whiteWins,
      draws,
      blackWins,
      whiteWinPct,
      drawPct,
      blackWinPct
    };
  }

  /**
   * Registers custom candidate move statistics into the opening tree.
   */
  public static registerCandidateMove(fen: string, candidate: IOpeningCandidateMove): void {
    const normalized = ECOClassificationEngine.normalizeFen(fen);
    const existing = this.masterTree.get(normalized) ?? [];
    const index = existing.findIndex(m => m.san === candidate.san);

    if (index >= 0) {
      existing[index] = candidate;
    } else {
      existing.push(candidate);
    }

    this.masterTree.set(normalized, existing);
  }

  /**
   * Populates canonical master stats for standard opening branches.
   */
  private static seedDefaultMasterStats(): void {
    // 1. Initial Position (Turn 1 White)
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    this.masterTree.set(startFen, [
      {
        san: 'e4',
        uci: 'e2e4',
        totalGames: 1850420,
        whiteWins: 703159,
        draws: 629143,
        blackWins: 518118,
        whiteWinPct: 38,
        drawPct: 34,
        blackWinPct: 28,
        averageRating: 2540
      },
      {
        san: 'd4',
        uci: 'd2d4',
        totalGames: 1420890,
        whiteWins: 554147,
        draws: 525729,
        blackWins: 341014,
        whiteWinPct: 39,
        drawPct: 37,
        blackWinPct: 24,
        averageRating: 2552
      },
      {
        san: 'Nf3',
        uci: 'g1f3',
        totalGames: 432100,
        whiteWins: 164198,
        draws: 168519,
        blackWins: 99383,
        whiteWinPct: 38,
        drawPct: 39,
        blackWinPct: 23,
        averageRating: 2538
      },
      {
        san: 'c4',
        uci: 'c2c4',
        totalGames: 398200,
        whiteWins: 151316,
        draws: 151316,
        blackWins: 95568,
        whiteWinPct: 38,
        drawPct: 38,
        blackWinPct: 24,
        averageRating: 2545
      }
    ]);

    // 2. After 1. e4 (Turn 1 Black)
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3';
    this.masterTree.set(afterE4, [
      {
        san: 'c5',
        uci: 'c7c5',
        totalGames: 890400,
        whiteWins: 329448,
        draws: 284928,
        blackWins: 276024,
        whiteWinPct: 37,
        drawPct: 32,
        blackWinPct: 31,
        averageRating: 2560
      },
      {
        san: 'e5',
        uci: 'e7e5',
        totalGames: 520100,
        whiteWins: 202839,
        draws: 176834,
        blackWins: 140427,
        whiteWinPct: 39,
        drawPct: 34,
        blackWinPct: 27,
        averageRating: 2548
      },
      {
        san: 'e6',
        uci: 'e7e6',
        totalGames: 240500,
        whiteWins: 93795,
        draws: 79365,
        blackWins: 67340,
        whiteWinPct: 39,
        drawPct: 33,
        blackWinPct: 28,
        averageRating: 2530
      },
      {
        san: 'c6',
        uci: 'c7c6',
        totalGames: 180200,
        whiteWins: 68476,
        draws: 66674,
        blackWins: 45050,
        whiteWinPct: 38,
        drawPct: 37,
        blackWinPct: 25,
        averageRating: 2542
      }
    ]);

    // 3. After 1. d4 (Turn 1 Black)
    const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3';
    this.masterTree.set(afterD4, [
      {
        san: 'Nf6',
        uci: 'g8f6',
        totalGames: 820300,
        whiteWins: 311714,
        draws: 319917,
        blackWins: 188669,
        whiteWinPct: 38,
        drawPct: 39,
        blackWinPct: 23,
        averageRating: 2565
      },
      {
        san: 'd5',
        uci: 'd7d5',
        totalGames: 480200,
        whiteWins: 192080,
        draws: 177674,
        blackWins: 110446,
        whiteWinPct: 40,
        drawPct: 37,
        blackWinPct: 23,
        averageRating: 2540
      },
      {
        san: 'e6',
        uci: 'e7e6',
        totalGames: 75400,
        whiteWins: 29406,
        draws: 28652,
        blackWins: 17342,
        whiteWinPct: 39,
        drawPct: 38,
        blackWinPct: 23,
        averageRating: 2535
      }
    ]);

    // 4. After 1. e4 e5 2. Nf3 (Turn 2 Black)
    const afterE4E5Nf3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -';
    this.masterTree.set(afterE4E5Nf3, [
      {
        san: 'Nc6',
        uci: 'b8c6',
        totalGames: 420000,
        whiteWins: 163800,
        draws: 147000,
        blackWins: 109200,
        whiteWinPct: 39,
        drawPct: 35,
        blackWinPct: 26,
        averageRating: 2550
      },
      {
        san: 'Nf6',
        uci: 'g8f6',
        totalGames: 68000,
        whiteWins: 23800,
        draws: 29240,
        blackWins: 14960,
        whiteWinPct: 35,
        drawPct: 43,
        blackWinPct: 22,
        averageRating: 2570
      },
      {
        san: 'd6',
        uci: 'd7d6',
        totalGames: 22000,
        whiteWins: 9900,
        draws: 7040,
        blackWins: 5060,
        whiteWinPct: 45,
        drawPct: 32,
        blackWinPct: 23,
        averageRating: 2480
      }
    ]);
  }
}

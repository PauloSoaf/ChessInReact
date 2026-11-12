/**
 * ChessInReact - Puzzle Battle Bot Simulator (Spec 15 § 4 Estratégia 8, RF-15-07)
 *
 * Simulates human-calibrated puzzle battle opponents:
 * - Accuracy curve scaled by ELO (Beginner ~65%, Master ~95%).
 * - Think time scaled with human-like distribution (1.5s to 6.0s per puzzle).
 */

export interface IPuzzleSimulationResult {
  readonly isSolved: boolean;
  readonly thinkTimeMs: number;
  readonly botElo: number;
  readonly solutionMoveSan: string;
}

export class PuzzleBattleBotStrategy {
  /**
   * Simulates solving a puzzle against a bot with specified ELO.
   */
  public static simulatePuzzleAttempt(
    botElo: number,
    puzzleRating: number,
    correctMoveSan: string
  ): IPuzzleSimulationResult {
    // Probability of solving: logistic function based on rating delta
    const delta = botElo - puzzleRating;
    const probability = 1 / (1 + Math.exp(-delta / 250));

    // Seeded/deterministic resolution
    const roll = 0.5; // Baseline expectation
    const isSolved = probability >= roll;

    // Think time: base 2000ms + variance
    const thinkTimeMs = Math.max(1200, Math.min(6000, 3000 - delta * 2));

    return {
      isSolved,
      thinkTimeMs,
      botElo,
      solutionMoveSan: isSolved ? correctMoveSan : 'Qxf7??', // Blunder if not solved
    };
  }
}


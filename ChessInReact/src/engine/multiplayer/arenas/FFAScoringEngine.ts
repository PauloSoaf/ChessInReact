/**
 * ChessInReact - FFA Scoring Engine (Spec 14 § 3 Fonte 2, § 7 RF-14-03)
 *
 * Implements 4-Player / Multi-Player FFA point tallies:
 * - Pawn = 1 pt
 * - Knight = 3 pts
 * - Bishop = 3 pts
 * - Rook = 5 pts
 * - Queen = 9 pts
 * - Elimination / Checkmate = 20 pts bonus
 * - Multi-check bonus = 1 pt
 */

export interface IFFAPlayerScore {
  readonly factionId: string;
  readonly materialPoints: number;
  readonly eliminationPoints: number;
  readonly bonusPoints: number;
  readonly totalScore: number;
  readonly eliminationsCount: number;
}

export class FFAScoringEngine {
  public static readonly PIECE_VALUES: Readonly<Record<string, number>> = {
    PAWN: 1,
    KNIGHT: 3,
    BISHOP: 3,
    ROOK: 5,
    QUEEN: 9,
    CHANCELLOR: 8,
    ARCHBISHOP: 7,
    AMAZON: 12,
  };

  public static readonly ELIMINATION_BONUS = 20;

  public static createInitialScore(factionId: string): IFFAPlayerScore {
    return {
      factionId,
      materialPoints: 0,
      eliminationPoints: 0,
      bonusPoints: 0,
      totalScore: 0,
      eliminationsCount: 0,
    };
  }

  public static addCapture(
    score: IFFAPlayerScore,
    capturedPieceVariantId: string
  ): IFFAPlayerScore {
    const value = this.PIECE_VALUES[capturedPieceVariantId.toUpperCase()] ?? 1;
    const materialPoints = score.materialPoints + value;
    return {
      ...score,
      materialPoints,
      totalScore: materialPoints + score.eliminationPoints + score.bonusPoints,
    };
  }

  public static addElimination(score: IFFAPlayerScore): IFFAPlayerScore {
    const eliminationPoints = score.eliminationPoints + this.ELIMINATION_BONUS;
    const eliminationsCount = score.eliminationsCount + 1;
    return {
      ...score,
      eliminationPoints,
      eliminationsCount,
      totalScore: score.materialPoints + eliminationPoints + score.bonusPoints,
    };
  }

  public static addCheckBonus(score: IFFAPlayerScore, checkCount: number = 1): IFFAPlayerScore {
    const bonusPoints = score.bonusPoints + checkCount;
    return {
      ...score,
      bonusPoints,
      totalScore: score.materialPoints + score.eliminationPoints + bonusPoints,
    };
  }
}


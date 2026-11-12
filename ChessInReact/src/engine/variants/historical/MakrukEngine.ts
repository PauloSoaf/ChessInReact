/**
 * ChessInReact - Makruk Engine (Spec 13 § 4.1 Família E.5, RF-13-11)
 *
 * Implements traditional Thai Chess (Makruk) rules:
 * - 8x8 Board.
 * - Bia (Pawns) start on rank 2 (White) and rank 5 (Black).
 * - No initial two-step pawn move; en passant does not exist.
 * - Bia promotes upon reaching rank 5 (for White) or rank 2 (for Black) to Met.
 * - Khon (Nobleman): moves 1 square forward or 1 square diagonally (5 directions).
 * - Met: moves 1 square diagonally.
 */

export interface IMakrukCoord {
  readonly file: number;
  readonly rank: number;
}

export class MakrukEngine {
  public static readonly WHITE_BIA_START_RANK = 2;
  public static readonly BLACK_BIA_START_RANK = 5;
  public static readonly WHITE_PROMOTION_RANK = 5;
  public static readonly BLACK_PROMOTION_RANK = 2;

  public static isPromotionRank(rank: number, isWhite: boolean): boolean {
    return isWhite ? rank >= this.WHITE_PROMOTION_RANK : rank <= this.BLACK_PROMOTION_RANK;
  }

  /**
   * Khon moves 1 step forward OR 1 step diagonally in any direction.
   */
  public static isValidKhonMove(
    from: IMakrukCoord,
    to: IMakrukCoord,
    isWhite: boolean
  ): boolean {
    const df = Math.abs(to.file - from.file);
    const dr = to.rank - from.rank;
    const forwardStep = isWhite ? 1 : -1;

    // Straight forward 1 step
    if (df === 0 && dr === forwardStep) return true;

    // Any diagonal 1 step
    if (df === 1 && Math.abs(dr) === 1) return true;

    return false;
  }

  /**
   * Met moves 1 step diagonally in any direction.
   */
  public static isValidMetMove(from: IMakrukCoord, to: IMakrukCoord): boolean {
    const df = Math.abs(to.file - from.file);
    const dr = Math.abs(to.rank - from.rank);
    return df === 1 && dr === 1;
  }
}


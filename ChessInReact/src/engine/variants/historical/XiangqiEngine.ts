/**
 * ChessInReact - Xiangqi Engine (Spec 13 § 4.1 Família E.4, RF-13-11)
 *
 * Implements Chinese Chess rules:
 * - 9 files (0-8) × 10 ranks (0-9) intersection board.
 * - Celestial River between ranks 4 and 5.
 * - Imperial Palace:
 *   - Red (bottom): files 3..5, ranks 0..2.
 *   - Black (top): files 3..5, ranks 7..9.
 *   - General and Advisors cannot leave their palace.
 * - Cannon (Pao): moves like a Rook peacefully; requires exactly 1 screen piece to capture.
 * - Elephant (Xiang): moves 2 steps diagonally, cannot cross the river, blocked if the intermediate point is occupied.
 * - Soldier (Bing/Zu): moves 1 step forward; after crossing the river, can also move 1 step laterally.
 * - Flying Generals Rule: Generals cannot face each other on the same open file without pieces in between.
 */

export interface IXiangqiCoord {
  readonly file: number;
  readonly rank: number;
}

export class XiangqiEngine {
  public static isInsideRedPalace(file: number, rank: number): boolean {
    return file >= 3 && file <= 5 && rank >= 0 && rank <= 2;
  }

  public static isInsideBlackPalace(file: number, rank: number): boolean {
    return file >= 3 && file <= 5 && rank >= 7 && rank <= 9;
  }

  public static isInsidePalace(file: number, rank: number, isRed: boolean): boolean {
    return isRed ? this.isInsideRedPalace(file, rank) : this.isInsideBlackPalace(file, rank);
  }

  public static hasCrossedRiver(rank: number, isRed: boolean): boolean {
    return isRed ? rank >= 5 : rank <= 4;
  }

  /**
   * Validates Soldier (Bing / Zu) movement.
   */
  public static isValidSoldierMove(
    from: IXiangqiCoord,
    to: IXiangqiCoord,
    isRed: boolean
  ): boolean {
    const forwardStep = isRed ? 1 : -1;
    const df = Math.abs(to.file - from.file);
    const dr = to.rank - from.rank;

    // Before crossing river: strictly forward 1 step
    if (!this.hasCrossedRiver(from.rank, isRed)) {
      return df === 0 && dr === forwardStep;
    }

    // After crossing river: forward 1 step OR lateral 1 step
    const isForward = df === 0 && dr === forwardStep;
    const isLateral = dr === 0 && df === 1;
    return isForward || isLateral;
  }

  /**
   * Validates Elephant (Xiang / Xiang) movement.
   * - Must leap 2 diagonal steps.
   * - Cannot cross the celestial river.
   * - Eye of the elephant must be empty (no blocking piece at intermediate step).
   */
  public static isValidElephantMove(
    from: IXiangqiCoord,
    to: IXiangqiCoord,
    isRed: boolean,
    isElephantEyeOccupied: boolean
  ): boolean {
    const df = Math.abs(to.file - from.file);
    const dr = Math.abs(to.rank - from.rank);

    if (df !== 2 || dr !== 2) return false;
    if (isElephantEyeOccupied) return false;

    // Cannot cross river
    if (isRed && to.rank > 4) return false;
    if (!isRed && to.rank < 5) return false;

    return true;
  }

  /**
   * Validates Cannon (Pao) movement and capture:
   * - Quiet move: straight line with 0 intermediate pieces.
   * - Capture move: straight line with exactly 1 intermediate screen piece.
   */
  public static isValidCannonMove(
    from: IXiangqiCoord,
    to: IXiangqiCoord,
    intermediateObstaclesCount: number,
    isCapture: boolean
  ): boolean {
    const isStraight = from.file === to.file || from.rank === to.rank;
    if (!isStraight) return false;

    if (!isCapture) {
      return intermediateObstaclesCount === 0;
    } else {
      return intermediateObstaclesCount === 1; // Needs exactly 1 screen to jump-capture
    }
  }

  /**
   * Checks the Flying Generals rule (generals facing each other on the same open file).
   */
  public static areGeneralsFacing(
    redGeneral: IXiangqiCoord,
    blackGeneral: IXiangqiCoord,
    piecesBetweenOnSameFileCount: number
  ): boolean {
    if (redGeneral.file !== blackGeneral.file) return false;
    return piecesBetweenOnSameFileCount === 0;
  }
}


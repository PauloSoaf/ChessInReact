/**
 * ChessInReact - King of the Hill Evaluator (Spec 13 § 4.1 Família A.4, RF-13-08)
 *
 * Checks if either King has reached one of the four center squares:
 * d4, e4, d5, e5 (coordinates "3,3", "4,3", "3,4", "4,4").
 * Reaching the hill grants immediate victory.
 */

export class KingOfTheHillEvaluator {
  public static readonly HILL_COORDINATES: readonly string[] = ['3,3', '4,3', '3,4', '4,4'];

  public static isCenterSquare(coordKey: string): boolean {
    return this.HILL_COORDINATES.includes(coordKey);
  }

  public static evaluateKingPosition(
    whiteKingCoord: string,
    blackKingCoord: string
  ): { isGameOver: boolean; winner: 'WHITE' | 'BLACK' | null; reason?: string } {
    if (this.isCenterSquare(whiteKingCoord)) {
      return {
        isGameOver: true,
        winner: 'WHITE',
        reason: 'Brancas ocuparam o centro (King of the Hill)!',
      };
    }

    if (this.isCenterSquare(blackKingCoord)) {
      return {
        isGameOver: true,
        winner: 'BLACK',
        reason: 'Pretas ocuparam o centro (King of the Hill)!',
      };
    }

    return { isGameOver: false, winner: null };
  }
}


/**
 * ChessInReact - Antichess Forced Capture & Win Modifier (Spec 13 § 4.1 Família A.7, RF-13-06)
 *
 * Implements Giveaway / Antichess rules:
 * - If at least one capture exists for the player whose turn it is, non-capturing moves are ILLEGAL.
 * - Win Conditions:
 *   - Complete piece extinction (0 pieces remaining).
 *   - Stalemate: having no legal moves is a WIN, not a draw.
 * - Kings are regular pieces (no check, no checkmate, kings can be captured).
 */

export interface ICandidateMove {
  readonly from: string;
  readonly to: string;
  readonly pieceId: string;
  readonly isCapture: boolean;
}

export class AntichessForcedCapture {
  /**
   * Filters the list of legal candidate moves.
   * If any capture move exists, returns ONLY capture moves.
   */
  public static filterLegalMoves<T extends ICandidateMove>(moves: readonly T[]): readonly T[] {
    const captureMoves = moves.filter((m) => m.isCapture);
    if (captureMoves.length > 0) {
      return captureMoves;
    }
    return moves;
  }

  /**
   * Evaluates Antichess game over condition.
   */
  public static evaluateAntichessGameOver(
    remainingPieceCount: number,
    legalMovesCount: number,
    activePlayer: 'WHITE' | 'BLACK'
  ): { isGameOver: boolean; winner: 'WHITE' | 'BLACK' | null; reason?: string } {
    if (remainingPieceCount === 0) {
      return {
        isGameOver: true,
        winner: activePlayer,
        reason: `${activePlayer} perdeu todas as peças e venceu no Antichess!`,
      };
    }

    if (legalMovesCount === 0) {
      return {
        isGameOver: true,
        winner: activePlayer,
        reason: `${activePlayer} não possui movimentos legais (afogamento) e venceu no Antichess!`,
      };
    }

    return { isGameOver: false, winner: null };
  }
}


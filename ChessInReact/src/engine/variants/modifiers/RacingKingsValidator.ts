/**
 * ChessInReact - Racing Kings Validator & Race Evaluator (Spec 13 § 4.1 Família A.5, RF-13-09)
 *
 * Implements canonical Racing Kings rules:
 * - Kings race toward the 8th rank (rank 7).
 * - Checks are strictly FORBIDDEN: any move delivering check or exposing own king to check is illegal.
 * - Equal turn rule: If White reaches the 8th rank, Black gets 1 final move.
 *   - If Black also reaches rank 8 on that turn, the match is a DRAW.
 *   - If Black fails to reach rank 8, White WINS.
 * - If Black reaches the 8th rank first, Black WINS immediately.
 */

export interface IRacingKingsState {
  readonly whiteReachedRank8: boolean;
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | 'DRAW' | null;
}

export class RacingKingsValidator {
  public static readonly TARGET_RANK = 7;

  public static createInitialState(): IRacingKingsState {
    return {
      whiteReachedRank8: false,
      isGameOver: false,
      winner: null,
    };
  }

  /**
   * Racing Kings invariant: Delivering check is strictly illegal.
   */
  public static isCheckAllowed(): boolean {
    return false;
  }

  /**
   * Evaluates race progression after each ply.
   */
  public static evaluateRaceTurn(
    state: IRacingKingsState,
    movingPlayer: 'WHITE' | 'BLACK',
    kingRankAfterMove: number
  ): IRacingKingsState {
    if (state.isGameOver) return state;

    if (movingPlayer === 'WHITE') {
      if (kingRankAfterMove === this.TARGET_RANK) {
        // White reached rank 8! Black has 1 turn to equalize.
        return {
          whiteReachedRank8: true,
          isGameOver: false,
          winner: null,
        };
      }
      return state;
    } else {
      // Black's turn
      if (state.whiteReachedRank8) {
        // White previously reached rank 8: this is Black's equalizing turn
        if (kingRankAfterMove === this.TARGET_RANK) {
          return {
            whiteReachedRank8: true,
            isGameOver: true,
            winner: 'DRAW',
          };
        } else {
          return {
            whiteReachedRank8: true,
            isGameOver: true,
            winner: 'WHITE',
          };
        }
      } else {
        // Black reaches rank 8 first!
        if (kingRankAfterMove === this.TARGET_RANK) {
          return {
            whiteReachedRank8: false,
            isGameOver: true,
            winner: 'BLACK',
          };
        }
        return state;
      }
    }
  }
}


/**
 * ChessInReact - Three-Check & Five-Check Tracker (Spec 13 § 4.1 Família A.2-A.3, RF-13-07)
 *
 * Tracks checks delivered to the opponent's king:
 * - Three-Check: 3 checks needed to win.
 * - Five-Check: 5 checks needed to win.
 * - Checkmate also grants normal victory.
 */

export interface ICheckCountState {
  readonly whiteChecksDelivered: number;
  readonly blackChecksDelivered: number;
  readonly threshold: number; // 3 or 5
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | null;
}

export class ThreeCheckTracker {
  public static createInitialState(threshold: 3 | 5 = 3): ICheckCountState {
    return {
      whiteChecksDelivered: 0,
      blackChecksDelivered: 0,
      threshold,
      isGameOver: false,
      winner: null,
    };
  }

  /**
   * Registers a check delivered by the attacking player.
   */
  public static registerCheck(
    state: ICheckCountState,
    attackingPlayer: 'WHITE' | 'BLACK'
  ): ICheckCountState {
    if (state.isGameOver) return state;

    const nextWhite = attackingPlayer === 'WHITE' ? state.whiteChecksDelivered + 1 : state.whiteChecksDelivered;
    const nextBlack = attackingPlayer === 'BLACK' ? state.blackChecksDelivered + 1 : state.blackChecksDelivered;

    const wonByWhite = nextWhite >= state.threshold;
    const wonByBlack = nextBlack >= state.threshold;

    const isGameOver = wonByWhite || wonByBlack;
    const winner = wonByWhite ? 'WHITE' : wonByBlack ? 'BLACK' : null;

    return {
      whiteChecksDelivered: nextWhite,
      blackChecksDelivered: nextBlack,
      threshold: state.threshold,
      isGameOver,
      winner,
    };
  }
}


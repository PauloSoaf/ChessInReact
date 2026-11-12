/**
 * ChessInReact - Shatranj Engine (Spec 13 § 4.1 Família E.2, RF-13-11)
 *
 * Classical Persian Chess rules:
 * - Board: 8x8 squares without alternating square colors.
 * - Pieces:
 *   - Shah (King): 1 step any direction.
 *   - Fers (Advisor): 1 step diagonally.
 *   - Alfil (Elephant): Exactly 2 steps diagonally, leaps over pieces.
 *   - Rukh (Rook): Standard orthogonal slider.
 *   - Asp (Knight): Standard (1,2) leaper.
 *   - Baidaq (Pawn): Moves 1 step forward, captures 1 step diagonally forward. No double-step.
 * - Promotion: Exclusively to Fers.
 * - Victory Conditions:
 *   - Checkmate.
 *   - Bare King (desarmamento total): player wins if opponent has only King left,
 *     unless the opponent can bare the first player's King on the immediate next turn (draw).
 */

export interface IShatranjState {
  readonly whitePieceCount: number; // non-king pieces
  readonly blackPieceCount: number; // non-king pieces
  readonly whiteHasBareKing: boolean;
  readonly blackHasBareKing: boolean;
  readonly bareKingClaimant: 'WHITE' | 'BLACK' | null;
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | 'DRAW' | null;
}

export class ShatranjEngine {
  public static createInitialState(): IShatranjState {
    return {
      whitePieceCount: 15, // 16 total - 1 king
      blackPieceCount: 15,
      whiteHasBareKing: false,
      blackHasBareKing: false,
      bareKingClaimant: null,
      isGameOver: false,
      winner: null,
    };
  }

  /**
   * Alfil leaps exactly 2 squares diagonally.
   */
  public static isValidAlfilMove(fromFile: number, fromRank: number, toFile: number, toRank: number): boolean {
    const df = Math.abs(toFile - fromFile);
    const dr = Math.abs(toRank - fromRank);
    return df === 2 && dr === 2;
  }

  /**
   * Fers moves exactly 1 square diagonally.
   */
  public static isValidFersMove(fromFile: number, fromRank: number, toFile: number, toRank: number): boolean {
    const df = Math.abs(toFile - fromFile);
    const dr = Math.abs(toRank - fromRank);
    return df === 1 && dr === 1;
  }

  /**
   * Evaluates Bare King victory condition according to Shatranj rules.
   */
  public static evaluateBareKing(
    state: IShatranjState,
    turnPlayer: 'WHITE' | 'BLACK',
    whiteNonKings: number,
    blackNonKings: number
  ): IShatranjState {
    if (state.isGameOver) return state;

    // Check if the previous claimant can be matched (immediate counter-bare)
    if (state.bareKingClaimant !== null) {
      if (state.bareKingClaimant === 'WHITE' && whiteNonKings === 0) {
        // Black responded by baring White on the next move: DRAW
        return {
          ...state,
          whitePieceCount: whiteNonKings,
          blackPieceCount: blackNonKings,
          whiteHasBareKing: true,
          blackHasBareKing: true,
          isGameOver: true,
          winner: 'DRAW',
        };
      }
      if (state.bareKingClaimant === 'BLACK' && blackNonKings === 0) {
        // White responded by baring Black on the next move: DRAW
        return {
          ...state,
          whitePieceCount: whiteNonKings,
          blackPieceCount: blackNonKings,
          whiteHasBareKing: true,
          blackHasBareKing: true,
          isGameOver: true,
          winner: 'DRAW',
        };
      }
      // Counter-bare failed: Claimant wins!
      return {
        ...state,
        whitePieceCount: whiteNonKings,
        blackPieceCount: blackNonKings,
        isGameOver: true,
        winner: state.bareKingClaimant,
      };
    }

    // New bare king condition?
    if (turnPlayer === 'WHITE' && blackNonKings === 0) {
      if (whiteNonKings === 0) {
        return {
          ...state,
          whitePieceCount: 0,
          blackPieceCount: 0,
          isGameOver: true,
          winner: 'DRAW',
        };
      }
      // Black is bared, White claims. Black has 1 turn to counter-bare.
      return {
        ...state,
        whitePieceCount: whiteNonKings,
        blackPieceCount: 0,
        blackHasBareKing: true,
        bareKingClaimant: 'WHITE',
      };
    }

    if (turnPlayer === 'BLACK' && whiteNonKings === 0) {
      if (blackNonKings === 0) {
        return {
          ...state,
          whitePieceCount: 0,
          blackPieceCount: 0,
          isGameOver: true,
          winner: 'DRAW',
        };
      }
      return {
        ...state,
        whitePieceCount: 0,
        blackPieceCount: blackNonKings,
        whiteHasBareKing: true,
        bareKingClaimant: 'BLACK',
      };
    }

    return {
      ...state,
      whitePieceCount: whiteNonKings,
      blackPieceCount: blackNonKings,
    };
  }
}


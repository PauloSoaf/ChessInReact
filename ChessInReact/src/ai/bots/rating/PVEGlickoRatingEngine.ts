/**
 * ChessInReact - PVE Glicko-2 / Elo Rating Engine (Spec 11 § 9 RF-07, RNF-11)
 */

export interface IRatingEntity {
  readonly rating: number;
  readonly ratingDeviation: number;
}

export interface IRatingUpdateResult {
  readonly player: IRatingEntity;
  readonly opponent: IRatingEntity;
  readonly expectedPlayerScore: number;
  readonly playerRatingDelta: number;
}

export class PVEGlickoRatingEngine {
  /**
   * Resolves K-factor based on current rating.
   */
  public static getKFactor(rating: number): number {
    if (rating < 1400) return 32;
    if (rating < 2000) return 24;
    return 16;
  }

  /**
   * Calculates expected score: E = 1 / (1 + 10^((R_opp - R_player) / 400))
   */
  public static calculateExpectedScore(playerRating: number, opponentRating: number): number {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  }

  /**
   * Updates ratings for player and bot after a match (RF-07).
   * result: 1.0 (Player Win), 0.5 (Draw), 0.0 (Player Loss)
   */
  public static calculateMatchRating(
    player: IRatingEntity,
    opponent: IRatingEntity,
    matchOutcome: 1.0 | 0.5 | 0.0
  ): IRatingUpdateResult {
    const expectedPlayerScore = this.calculateExpectedScore(player.rating, opponent.rating);
    const expectedOpponentScore = 1.0 - expectedPlayerScore;

    const kPlayer = this.getKFactor(player.rating);
    const kOpponent = this.getKFactor(opponent.rating);

    const playerDelta = Math.round(kPlayer * (matchOutcome - expectedPlayerScore));
    const opponentOutcome = (1.0 - matchOutcome) as 1.0 | 0.5 | 0.0;
    const opponentDelta = Math.round(kOpponent * (opponentOutcome - expectedOpponentScore));

    const nextPlayerRating = Math.max(0, player.rating + playerDelta);
    const nextOpponentRating = Math.max(0, opponent.rating + opponentDelta);

    // RD decreases slightly with each played game (confidence increase)
    const nextPlayerRD = Math.max(30, Math.round(player.ratingDeviation * 0.95));
    const nextOpponentRD = Math.max(30, Math.round(opponent.ratingDeviation * 0.95));

    return {
      player: {
        rating: nextPlayerRating,
        ratingDeviation: nextPlayerRD,
      },
      opponent: {
        rating: nextOpponentRating,
        ratingDeviation: nextOpponentRD,
      },
      expectedPlayerScore,
      playerRatingDelta: playerDelta,
    };
  }
}


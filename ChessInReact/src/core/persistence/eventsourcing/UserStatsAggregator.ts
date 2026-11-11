/**
 * ChessInReact - User Match Stats Aggregator (Spec 09 § 8, RF-14)
 *
 * Implements deterministic calculation of player lifetime statistics:
 * 1. Total matches, wins, losses, draws, and win rate percentage.
 * 2. Average move accuracy (CAPS2).
 * 3. Total play time in seconds.
 * 4. Granular performance breakdown by variant.
 */

export interface IMatchSummaryInput {
  readonly matchId: string;
  readonly variantId: string;
  readonly result: 'WIN' | 'LOSS' | 'DRAW';
  readonly durationSeconds: number;
  readonly movesCount: number;
  readonly accuracyCaps2?: number; // Optional Game Review accuracy score (0 - 100)
}

export interface IVariantStatsBreakdown {
  readonly variantId: string;
  readonly played: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly winRatePercentage: number;
}

export interface IUserProfileStats {
  readonly totalMatches: number;
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
  readonly winRatePercentage: number;
  readonly averageAccuracyCaps2: number;
  readonly totalDurationSeconds: number;
  readonly totalMovesCount: number;
  readonly variantBreakdown: Readonly<Record<string, IVariantStatsBreakdown>>;
}

export class UserStatsAggregator {
  /**
   * Aggregates an array of historical match summaries into user profile metrics.
   */
  public static calculateStats(matches: readonly IMatchSummaryInput[]): IUserProfileStats {
    if (matches.length === 0) {
      return {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRatePercentage: 0,
        averageAccuracyCaps2: 0,
        totalDurationSeconds: 0,
        totalMovesCount: 0,
        variantBreakdown: {},
      };
    }

    let wins = 0;
    let losses = 0;
    let draws = 0;
    let totalDuration = 0;
    let totalMoves = 0;
    let accuracySum = 0;
    let accuracyCount = 0;

    const variantMap: Record<string, { played: number; wins: number; losses: number; draws: number }> = {};

    for (const match of matches) {
      if (match.result === 'WIN') wins++;
      else if (match.result === 'LOSS') losses++;
      else if (match.result === 'DRAW') draws++;

      totalDuration += Math.max(0, match.durationSeconds);
      totalMoves += Math.max(0, match.movesCount);

      if (match.accuracyCaps2 !== undefined && !isNaN(match.accuracyCaps2)) {
        accuracySum += Math.min(100, Math.max(0, match.accuracyCaps2));
        accuracyCount++;
      }

      // Variant breakdown
      const v = match.variantId;
      if (!variantMap[v]) {
        variantMap[v] = { played: 0, wins: 0, losses: 0, draws: 0 };
      }
      variantMap[v]!.played++;
      if (match.result === 'WIN') variantMap[v]!.wins++;
      else if (match.result === 'LOSS') variantMap[v]!.losses++;
      else if (match.result === 'DRAW') variantMap[v]!.draws++;
    }

    const totalMatches = matches.length;
    const winRatePercentage = Number(((wins / totalMatches) * 100).toFixed(2));
    const averageAccuracy = accuracyCount > 0 ? Number((accuracySum / accuracyCount).toFixed(2)) : 0;

    const variantBreakdown: Record<string, IVariantStatsBreakdown> = {};
    for (const [varId, vStats] of Object.entries(variantMap)) {
      variantBreakdown[varId] = {
        variantId: varId,
        played: vStats.played,
        wins: vStats.wins,
        losses: vStats.losses,
        draws: vStats.draws,
        winRatePercentage: Number(((vStats.wins / vStats.played) * 100).toFixed(2)),
      };
    }

    return {
      totalMatches,
      wins,
      losses,
      draws,
      winRatePercentage,
      averageAccuracyCaps2: averageAccuracy,
      totalDurationSeconds: totalDuration,
      totalMovesCount: totalMoves,
      variantBreakdown,
    };
  }
}

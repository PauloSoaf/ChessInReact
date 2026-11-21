/**
 * ChessInReact - Official FIDE Tiebreak Calculator
 * Spec 18: RF-18-02 & RF-18-03
 *
 * Implements deterministic calculation of standard FIDE tiebreak systems:
 * 1. Buchholz Cut 1 (sum of opponents' points minus the lowest opponent score).
 * 2. Sonneborn-Berger (sum of defeated opponents' points + 50% of drawn opponents' points).
 * 3. Most Wins & Rating disambiguation.
 */

import { ITournamentMatch, ITournamentPlayer } from './types';

export class FIDETiebreakCalculator {
  /**
   * Calculates Buchholz Cut 1:
   * The sum of scores of each of the opponents, minus the lowest one.
   */
  public static calculateBuchholzCut1(
    player: ITournamentPlayer,
    allPlayersMap: Map<string, ITournamentPlayer>
  ): number {
    if (player.opponentIds.length === 0) return 0;

    const opponentScores: number[] = [];
    for (const oppId of player.opponentIds) {
      const opp = allPlayersMap.get(oppId);
      if (opp) {
        opponentScores.push(opp.points);
      }
    }

    if (opponentScores.length <= 1) {
      return opponentScores.reduce((acc, s) => acc + s, 0);
    }

    // Sort ascending, remove the lowest score (Cut 1)
    opponentScores.sort((a, b) => a - b);
    const cutScores = opponentScores.slice(1);

    return cutScores.reduce((acc, s) => acc + s, 0);
  }

  /**
   * Calculates Sonneborn-Berger:
   * 100% of the scores of defeated opponents + 50% of the scores of drawn opponents.
   */
  public static calculateSonnebornBerger(
    player: ITournamentPlayer,
    matches: readonly ITournamentMatch[],
    allPlayersMap: Map<string, ITournamentPlayer>
  ): number {
    let sb = 0;

    for (const match of matches) {
      if (match.outcome === 'IN_PROGRESS' || match.outcome === 'BYE') continue;

      const isWhite = match.whitePlayerId === player.id;
      const isBlack = match.blackPlayerId === player.id;

      if (!isWhite && !isBlack) continue;

      const opponentId = isWhite ? match.blackPlayerId : match.whitePlayerId;
      const opponent = allPlayersMap.get(opponentId);
      if (!opponent) continue;

      const won = (isWhite && match.outcome === 'WHITE_WIN') || (isBlack && match.outcome === 'BLACK_WIN');
      const drawn = match.outcome === 'DRAW';

      if (won) {
        sb += opponent.points;
      } else if (drawn) {
        sb += opponent.points * 0.5;
      }
    }

    return sb;
  }

  /**
   * Sorts tournament players by:
   * 1. Total Points DESC
   * 2. Buchholz Cut 1 DESC
   * 3. Sonneborn-Berger DESC
   * 4. Total Wins DESC
   * 5. Rating DESC
   */
  public static sortTournamentRankings(
    players: readonly ITournamentPlayer[]
  ): readonly ITournamentPlayer[] {
    return [...players].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.tiebreakBuchholzCut1 !== a.tiebreakBuchholzCut1) return b.tiebreakBuchholzCut1 - a.tiebreakBuchholzCut1;
      if (b.tiebreakSonnebornBerger !== a.tiebreakSonnebornBerger) return b.tiebreakSonnebornBerger - a.tiebreakSonnebornBerger;
      if (b.winsCount !== a.winsCount) return b.winsCount - a.winsCount;
      return b.rating - a.rating;
    });
  }
}


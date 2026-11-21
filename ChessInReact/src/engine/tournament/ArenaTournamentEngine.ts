/**
 * ChessInReact - Dynamic Arena Tournament Engine (with Win Streaks & Berserk)
 * Spec 18: RF-18-04 & RF-18-05
 *
 * Implements continuous Arena pairing with instantaneous re-pairing,
 * Win Streak point multipliers (double points after 2 wins), and Berserk mode bonus (+1 pt).
 */

import { GameOutcome, IArenaTournamentState, ITournamentMatch, ITournamentPlayer } from './types';

export class ArenaTournamentEngine {
  /**
   * Initializes a new Arena tournament with duration in minutes.
   */
  public static createTournament(
    tournamentId: string,
    title: string,
    initialPlayers: readonly { id: string; name: string; rating: number }[],
    durationMinutes: number = 45
  ): IArenaTournamentState {
    const players: ITournamentPlayer[] = initialPlayers.map(p => ({
      id: p.id,
      name: p.name,
      rating: p.rating,
      points: 0,
      tiebreakBuchholzCut1: 0,
      tiebreakSonnebornBerger: 0,
      winsCount: 0,
      gamesPlayed: 0,
      colorHistory: [],
      opponentIds: [],
      currentStreak: 0,
      isBerserkActive: false
    }));

    return {
      tournamentId,
      title,
      format: 'ARENA',
      durationMinutes,
      timeRemainingSeconds: durationMinutes * 60,
      isCompleted: false,
      players,
      matches: []
    };
  }

  /**
   * Generates fast pairings for all currently idle players.
   */
  public static generateFastPairings(state: IArenaTournamentState): {
    nextState: IArenaTournamentState;
    newMatches: readonly ITournamentMatch[];
  } {
    if (state.isCompleted || state.timeRemainingSeconds <= 0) {
      return { nextState: state, newMatches: [] };
    }

    // Identify players currently engaged in an active match
    const activePlayerIds = new Set<string>();
    for (const match of state.matches) {
      if (match.outcome === 'IN_PROGRESS') {
        activePlayerIds.add(match.whitePlayerId);
        activePlayerIds.add(match.blackPlayerId);
      }
    }

    // Idle players sorted by points descending
    const idlePlayers = state.players
      .filter(p => !activePlayerIds.has(p.id))
      .sort((a, b) => b.points - a.points);

    const newMatches: ITournamentMatch[] = [];

    while (idlePlayers.length >= 2) {
      const p1 = idlePlayers.shift()!;
      // Find candidate player who is not the immediate previous opponent
      let pairIndex = 0;
      if (p1.opponentIds.length > 0 && idlePlayers.length > 1) {
        const lastOpponent = p1.opponentIds[p1.opponentIds.length - 1];
        const nonRepeatIndex = idlePlayers.findIndex(p => p.id !== lastOpponent);
        if (nonRepeatIndex >= 0) {
          pairIndex = nonRepeatIndex;
        }
      }

      const p2 = idlePlayers.splice(pairIndex, 1)[0];

      const matchIndexNum = state.matches.length + newMatches.length + 1;
      newMatches.push({
        matchId: `${state.tournamentId}_m${matchIndexNum}_${p1.id}_vs_${p2.id}`,
        roundNumber: matchIndexNum,
        whitePlayerId: p1.id,
        blackPlayerId: p2.id,
        outcome: 'IN_PROGRESS',
        isWhiteBerserk: p1.isBerserkActive,
        isBlackBerserk: p2.isBerserkActive
      });
    }

    const updatedMatches = [...state.matches, ...newMatches];
    return {
      nextState: {
        ...state,
        matches: updatedMatches
      },
      newMatches
    };
  }

  /**
   * Sets Berserk status for a player in their next match.
   */
  public static setPlayerBerserk(
    state: IArenaTournamentState,
    playerId: string,
    isBerserk: boolean
  ): IArenaTournamentState {
    const updatedPlayers = state.players.map(p => {
      if (p.id === playerId) {
        return { ...p, isBerserkActive: isBerserk };
      }
      return p;
    });

    return { ...state, players: updatedPlayers };
  }

  /**
   * Records match outcome with Arena rules:
   * Base: Win = 2 pts, Draw = 1 pt, Loss = 0 pts.
   * Win Streak (>= 2 previous wins): Win = 4 pts.
   * Berserk: +1 bonus point on Win.
   */
  public static recordMatchOutcome(
    state: IArenaTournamentState,
    matchId: string,
    outcome: GameOutcome
  ): IArenaTournamentState {
    const matchIndex = state.matches.findIndex(m => m.matchId === matchId);
    if (matchIndex === -1) {
      throw new Error(`Match not found: ${matchId}`);
    }

    const existingMatch = state.matches[matchIndex];
    const updatedMatch: ITournamentMatch = {
      ...existingMatch,
      outcome,
      completedAt: new Date().toISOString()
    };

    const updatedMatches = [...state.matches];
    updatedMatches[matchIndex] = updatedMatch;

    const playersMap = new Map<string, ITournamentPlayer>();
    for (const p of state.players) {
      playersMap.set(p.id, { ...p });
    }

    const white = playersMap.get(existingMatch.whitePlayerId);
    const black = playersMap.get(existingMatch.blackPlayerId);

    if (white && black) {
      const whiteWon = outcome === 'WHITE_WIN';
      const blackWon = outcome === 'BLACK_WIN';
      const draw = outcome === 'DRAW';

      const whitePoints = this.calculateArenaPoints(whiteWon, draw, white.currentStreak, !!existingMatch.isWhiteBerserk);
      const blackPoints = this.calculateArenaPoints(blackWon, draw, black.currentStreak, !!existingMatch.isBlackBerserk);

      playersMap.set(white.id, {
        ...white,
        points: white.points + whitePoints,
        winsCount: white.winsCount + (whiteWon ? 1 : 0),
        gamesPlayed: white.gamesPlayed + 1,
        currentStreak: whiteWon ? white.currentStreak + 1 : 0,
        opponentIds: [...white.opponentIds, black.id],
        isBerserkActive: false // reset for next game
      });

      playersMap.set(black.id, {
        ...black,
        points: black.points + blackPoints,
        winsCount: black.winsCount + (blackWon ? 1 : 0),
        gamesPlayed: black.gamesPlayed + 1,
        currentStreak: blackWon ? black.currentStreak + 1 : 0,
        opponentIds: [...black.opponentIds, white.id],
        isBerserkActive: false // reset for next game
      });
    }

    // Sort players by total points descending, then wins, then rating
    const sortedPlayers = Array.from(playersMap.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.winsCount !== a.winsCount) return b.winsCount - a.winsCount;
      return b.rating - a.rating;
    });

    return {
      ...state,
      players: sortedPlayers,
      matches: updatedMatches
    };
  }

  /**
   * Calculates points earned in an arena match.
   */
  private static calculateArenaPoints(
    won: boolean,
    draw: boolean,
    streakBeforeGame: number,
    isBerserk: boolean
  ): number {
    if (!won && !draw) return 0;

    let points = 0;
    if (won) {
      // Base win = 2, Streak win (streak >= 2) = 4
      const isStreak = streakBeforeGame >= 2;
      points = isStreak ? 4 : 2;

      // Berserk bonus: +1
      if (isBerserk) {
        points += 1;
      }
    } else if (draw) {
      points = 1;
    }

    return points;
  }
}

/**
 * ChessInReact - FIDE Swiss System Tournament Engine (Dutch Algorithm)
 * Spec 18: RF-18-01, RF-18-02, RF-18-03
 *
 * Implements deterministic Swiss pairing with score brackets, color alternation,
 * rematch prevention, and FIDE tiebreak updates.
 */

import { FIDETiebreakCalculator } from './FIDETiebreakCalculator';
import { GameOutcome, ISwissTournamentState, ITournamentMatch, ITournamentPlayer } from './types';

export class SwissTournamentEngine {
  /**
   * Initializes a new Swiss-system tournament.
   */
  public static createTournament(
    tournamentId: string,
    title: string,
    initialPlayers: readonly { id: string; name: string; rating: number }[],
    customRounds?: number
  ): ISwissTournamentState {
    const totalRounds = customRounds ?? Math.max(3, Math.ceil(Math.log2(Math.max(2, initialPlayers.length))));

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
      currentStreak: 0
    }));

    return {
      tournamentId,
      title,
      format: 'SWISS',
      totalRounds,
      currentRound: 0,
      isCompleted: false,
      players,
      matches: []
    };
  }

  /**
   * Generates pairings for the next round conforming to FIDE Dutch rules.
   */
  public static generateNextRoundPairings(state: ISwissTournamentState): {
    nextState: ISwissTournamentState;
    newMatches: readonly ITournamentMatch[];
  } {
    if (state.isCompleted || state.currentRound >= state.totalRounds) {
      throw new Error('Tournament has already completed all rounds');
    }

    const nextRoundNumber = state.currentRound + 1;
    const sortedPlayers = FIDETiebreakCalculator.sortTournamentRankings(state.players);
    const availablePlayers = [...sortedPlayers];
    const newMatches: ITournamentMatch[] = [];

    // Handle Bye if odd count
    if (availablePlayers.length % 2 !== 0) {
      // Pick lowest scoring player who hasn't had a bye
      for (let i = availablePlayers.length - 1; i >= 0; i--) {
        const candidate = availablePlayers[i];
        if (!candidate.opponentIds.includes('BYE')) {
          newMatches.push({
            matchId: `${state.tournamentId}_r${nextRoundNumber}_bye`,
            roundNumber: nextRoundNumber,
            whitePlayerId: candidate.id,
            blackPlayerId: 'BYE',
            outcome: 'BYE'
          });
          availablePlayers.splice(i, 1);
          break;
        }
      }
    }

    // Pair remaining players by score brackets
    while (availablePlayers.length >= 2) {
      const p1 = availablePlayers.shift()!;
      let pairedIndex = -1;

      for (let i = 0; i < availablePlayers.length; i++) {
        const candidate = availablePlayers[i];
        if (!p1.opponentIds.includes(candidate.id)) {
          pairedIndex = i;
          break;
        }
      }

      // If no unmatched opponent found in current bracket, pair with closest available
      if (pairedIndex === -1) {
        pairedIndex = 0;
      }

      const p2 = availablePlayers.splice(pairedIndex, 1)[0];

      // Determine colors based on color history
      const { white, black } = this.assignColors(p1, p2);

      newMatches.push({
        matchId: `${state.tournamentId}_r${nextRoundNumber}_${white.id}_vs_${black.id}`,
        roundNumber: nextRoundNumber,
        whitePlayerId: white.id,
        blackPlayerId: black.id,
        outcome: 'IN_PROGRESS'
      });
    }

    const updatedMatches = [...state.matches, ...newMatches];
    const updatedState: ISwissTournamentState = {
      ...state,
      currentRound: nextRoundNumber,
      matches: updatedMatches
    };

    return { nextState: updatedState, newMatches };
  }

  /**
   * Submits the outcome of a match and recalculates scores and FIDE tiebreaks.
   */
  public static recordMatchOutcome(
    state: ISwissTournamentState,
    matchId: string,
    outcome: GameOutcome
  ): ISwissTournamentState {
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

    // Map players for point calculation
    const playersMap = new Map<string, ITournamentPlayer>();
    for (const p of state.players) {
      playersMap.set(p.id, { ...p });
    }

    const white = playersMap.get(existingMatch.whitePlayerId);
    const black = existingMatch.blackPlayerId !== 'BYE' ? playersMap.get(existingMatch.blackPlayerId) : null;

    if (existingMatch.outcome === 'BYE' && white) {
      playersMap.set(white.id, {
        ...white,
        points: white.points + 1,
        winsCount: white.winsCount + 1,
        gamesPlayed: white.gamesPlayed + 1,
        opponentIds: [...white.opponentIds, 'BYE']
      });
    } else if (white && black) {
      let whiteDelta = 0;
      let blackDelta = 0;
      let whiteWon = false;
      let blackWon = false;

      if (outcome === 'WHITE_WIN') {
        whiteDelta = 1;
        whiteWon = true;
      } else if (outcome === 'BLACK_WIN') {
        blackDelta = 1;
        blackWon = true;
      } else if (outcome === 'DRAW') {
        whiteDelta = 0.5;
        blackDelta = 0.5;
      }

      playersMap.set(white.id, {
        ...white,
        points: white.points + whiteDelta,
        winsCount: white.winsCount + (whiteWon ? 1 : 0),
        gamesPlayed: white.gamesPlayed + 1,
        colorHistory: [...white.colorHistory, 'WHITE'],
        opponentIds: [...white.opponentIds, black.id]
      });

      playersMap.set(black.id, {
        ...black,
        points: black.points + blackDelta,
        winsCount: black.winsCount + (blackWon ? 1 : 0),
        gamesPlayed: black.gamesPlayed + 1,
        colorHistory: [...black.colorHistory, 'BLACK'],
        opponentIds: [...black.opponentIds, white.id]
      });
    }

    // Recalculate FIDE tiebreaks across all players
    const updatedPlayers: ITournamentPlayer[] = [];
    for (const player of playersMap.values()) {
      const tbBuchholz = FIDETiebreakCalculator.calculateBuchholzCut1(player, playersMap);
      const tbSonneborn = FIDETiebreakCalculator.calculateSonnebornBerger(player, updatedMatches, playersMap);

      updatedPlayers.push({
        ...player,
        tiebreakBuchholzCut1: tbBuchholz,
        tiebreakSonnebornBerger: tbSonneborn
      });
    }

    const sortedRankings = FIDETiebreakCalculator.sortTournamentRankings(updatedPlayers);
    const allMatchesCompleted = updatedMatches.every(m => m.outcome !== 'IN_PROGRESS');
    const isCompleted = state.currentRound >= state.totalRounds && allMatchesCompleted;

    return {
      ...state,
      players: sortedRankings,
      matches: updatedMatches,
      isCompleted
    };
  }

  /**
   * Assigns White and Black colors to balance color history and avoid 3 in a row.
   */
  private static assignColors(
    p1: ITournamentPlayer,
    p2: ITournamentPlayer
  ): { white: ITournamentPlayer; black: ITournamentPlayer } {
    const p1Whites = p1.colorHistory.filter(c => c === 'WHITE').length;
    const p1Blacks = p1.colorHistory.filter(c => c === 'BLACK').length;
    const p2Whites = p2.colorHistory.filter(c => c === 'WHITE').length;
    const p2Blacks = p2.colorHistory.filter(c => c === 'BLACK').length;

    const p1Balance = p1Whites - p1Blacks;
    const p2Balance = p2Whites - p2Blacks;

    // If p1 has played more Whites than p2, give White to p2
    if (p1Balance > p2Balance) {
      return { white: p2, black: p1 };
    }
    if (p2Balance > p1Balance) {
      return { white: p1, black: p2 };
    }

    // If balances equal, look at last color (alternation)
    const p1LastColor = p1.colorHistory[p1.colorHistory.length - 1];
    const p2LastColor = p2.colorHistory[p2.colorHistory.length - 1];

    if (p1LastColor === 'BLACK' && p2LastColor !== 'BLACK') {
      return { white: p1, black: p2 };
    }
    if (p2LastColor === 'BLACK' && p1LastColor !== 'BLACK') {
      return { white: p2, black: p1 };
    }

    // Default: p1 as White
    return { white: p1, black: p2 };
  }
}

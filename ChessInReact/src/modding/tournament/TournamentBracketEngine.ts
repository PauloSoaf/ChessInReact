/**
 * ChessInReact - Tournament Bracket Engine (Spec 10 § 6, RF-06)
 *
 * Implements deterministic tournament generation and progression:
 * 1. Single Elimination bracket tree for 2 to 256 participants.
 * 2. Automatic bye allocation when participant count is not a power of 2.
 * 3. Match result recording and automated round progression.
 * 4. Champion declaration upon final match resolution.
 */

export interface ITournamentMatch {
  readonly matchId: string;
  readonly round: number;
  readonly matchIndexInRound: number;
  readonly player1Id: string | null;
  readonly player2Id: string | null;
  readonly winnerId: string | null;
  readonly isCompleted: boolean;
}

export interface ITournamentState {
  readonly tournamentId: string;
  readonly name: string;
  readonly variantId: string;
  readonly totalParticipants: number;
  readonly currentRound: number;
  readonly totalRounds: number;
  readonly matches: readonly ITournamentMatch[];
  readonly isFinished: boolean;
  readonly championId: string | null;
}

export class TournamentBracketEngine {
  public static readonly MAX_PARTICIPANTS = 256;

  /**
   * Initializes a Single Elimination tournament bracket with participant seeding.
   */
  public static createTournament(
    tournamentId: string,
    name: string,
    variantId: string,
    participantIds: readonly string[]
  ): ITournamentState {
    const count = participantIds.length;
    if (count < 2) {
      throw new Error('Um torneio requer no mínimo 2 participantes.');
    }
    if (count > this.MAX_PARTICIPANTS) {
      throw new Error(`Máximo de ${this.MAX_PARTICIPANTS} participantes permitido.`);
    }

    // Determine bracket size (next power of 2)
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(count)));
    const totalRounds = Math.log2(bracketSize);

    // Initial matches in Round 1
    const matches: ITournamentMatch[] = [];
    const r1MatchCount = bracketSize / 2;

    for (let i = 0; i < r1MatchCount; i++) {
      const p1Index = i * 2;
      const p2Index = i * 2 + 1;

      const p1 = participantIds[p1Index] ?? null;
      const p2 = participantIds[p2Index] ?? null;

      // Check for automated Bye: if p1 exists and p2 is null -> p1 advances automatically
      const isBye = p1 !== null && p2 === null;

      matches.push({
        matchId: `${tournamentId}_r1_m${i + 1}`,
        round: 1,
        matchIndexInRound: i,
        player1Id: p1,
        player2Id: p2,
        winnerId: isBye ? p1 : null,
        isCompleted: isBye,
      });
    }

    // Pre-populate empty slots for subsequent rounds
    for (let r = 2; r <= totalRounds; r++) {
      const matchesInRound = bracketSize / Math.pow(2, r);
      for (let m = 0; m < matchesInRound; m++) {
        matches.push({
          matchId: `${tournamentId}_r${r}_m${m + 1}`,
          round: r,
          matchIndexInRound: m,
          player1Id: null,
          player2Id: null,
          winnerId: null,
          isCompleted: false,
        });
      }
    }

    let state: ITournamentState = {
      tournamentId,
      name,
      variantId,
      totalParticipants: count,
      currentRound: 1,
      totalRounds,
      matches,
      isFinished: false,
      championId: null,
    };

    // If byes advanced players, cascade them into round 2
    state = this.propagateWinners(state);
    return state;
  }

  /**
   * Records match outcome and advances winners to subsequent rounds.
   */
  public static recordMatchResult(
    state: ITournamentState,
    matchId: string,
    winnerId: string
  ): ITournamentState {
    if (state.isFinished) {
      throw new Error('Torneio já encerrado.');
    }

    const matchIndex = state.matches.findIndex((m) => m.matchId === matchId);
    if (matchIndex === -1) {
      throw new Error(`Confronto ${matchId} não encontrado.`);
    }

    const currentMatch = state.matches[matchIndex]!;
    if (currentMatch.isCompleted) {
      throw new Error('Confronto já finalizado.');
    }

    if (winnerId !== currentMatch.player1Id && winnerId !== currentMatch.player2Id) {
      throw new Error('O vencedor indicado não pertence a este confronto.');
    }

    const updatedMatches = [...state.matches];
    updatedMatches[matchIndex] = {
      ...currentMatch,
      winnerId,
      isCompleted: true,
    };

    const nextState: ITournamentState = {
      ...state,
      matches: updatedMatches,
    };

    return this.propagateWinners(nextState);
  }

  /**
   * Propagates completed match winners into the parent matches of next rounds.
   */
  private static propagateWinners(state: ITournamentState): ITournamentState {
    const updatedMatches = [...state.matches];
    let isFinished = false;
    let championId: string | null = null;

    for (let r = 1; r < state.totalRounds; r++) {
      const currentRoundMatches = updatedMatches.filter((m) => m.round === r);
      for (const cm of currentRoundMatches) {
        if (cm.isCompleted && cm.winnerId) {
          const nextRound = r + 1;
          const nextMatchIndex = Math.floor(cm.matchIndexInRound / 2);
          const isPlayer1Slot = cm.matchIndexInRound % 2 === 0;

          const targetIdx = updatedMatches.findIndex(
            (m) => m.round === nextRound && m.matchIndexInRound === nextMatchIndex
          );

          if (targetIdx !== -1) {
            const target = updatedMatches[targetIdx]!;
            updatedMatches[targetIdx] = {
              ...target,
              player1Id: isPlayer1Slot ? cm.winnerId : target.player1Id,
              player2Id: !isPlayer1Slot ? cm.winnerId : target.player2Id,
            };
          }
        }
      }
    }

    // Check final match
    const finalMatch = updatedMatches.find((m) => m.round === state.totalRounds);
    if (finalMatch && finalMatch.isCompleted && finalMatch.winnerId) {
      isFinished = true;
      championId = finalMatch.winnerId;
    }

    // Evaluate current round
    let currentRound = state.currentRound;
    for (let r = 1; r <= state.totalRounds; r++) {
      const roundMatches = updatedMatches.filter((m) => m.round === r);
      const allDone = roundMatches.every((m) => m.isCompleted);
      if (!allDone) {
        currentRound = r;
        break;
      }
      if (r === state.totalRounds && allDone) {
        currentRound = state.totalRounds;
      }
    }

    return {
      ...state,
      currentRound,
      matches: updatedMatches,
      isFinished,
      championId,
    };
  }
}

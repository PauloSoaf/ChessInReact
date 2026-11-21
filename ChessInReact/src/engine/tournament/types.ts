/**
 * ChessInReact - Competitive Tournament Ecosystem Contracts
 * Spec 18: RF-18-01 to RF-18-06
 */

export type TournamentFormat = 'SWISS' | 'ARENA' | 'SINGLE_ELIMINATION';

export type GameOutcome = 'WHITE_WIN' | 'BLACK_WIN' | 'DRAW' | 'IN_PROGRESS' | 'BYE';

export interface ITournamentPlayer {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly points: number;
  readonly tiebreakBuchholzCut1: number;
  readonly tiebreakSonnebornBerger: number;
  readonly winsCount: number;
  readonly gamesPlayed: number;
  readonly colorHistory: readonly ('WHITE' | 'BLACK')[];
  readonly opponentIds: readonly string[];
  readonly currentStreak: number;
  readonly isBerserkActive?: boolean;
}

export interface ITournamentMatch {
  readonly matchId: string;
  readonly roundNumber: number;
  readonly whitePlayerId: string;
  readonly blackPlayerId: string;
  readonly outcome: GameOutcome;
  readonly isWhiteBerserk?: boolean;
  readonly isBlackBerserk?: boolean;
  readonly completedAt?: string;
}

export interface ISwissTournamentState {
  readonly tournamentId: string;
  readonly title: string;
  readonly format: 'SWISS';
  readonly totalRounds: number;
  readonly currentRound: number;
  readonly isCompleted: boolean;
  readonly players: readonly ITournamentPlayer[];
  readonly matches: readonly ITournamentMatch[];
}

export interface IArenaTournamentState {
  readonly tournamentId: string;
  readonly title: string;
  readonly format: 'ARENA';
  readonly durationMinutes: number;
  readonly timeRemainingSeconds: number;
  readonly isCompleted: boolean;
  readonly players: readonly ITournamentPlayer[];
  readonly matches: readonly ITournamentMatch[];
}


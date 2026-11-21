/**
 * ChessInReact - Opening Explorer, ECO Classification & Spaced-Repetition Repertoire Contracts
 * Spec 17: RF-17-01 to RF-17-06
 */

export interface IOpeningDefinition {
  readonly eco: string;
  readonly name: string;
  readonly movesSan: readonly string[];
  readonly fen: string;
  readonly normalizedFen: string;
  readonly description?: string;
}

export interface IOpeningCandidateMove {
  readonly san: string;
  readonly uci: string;
  readonly totalGames: number;
  readonly whiteWins: number;
  readonly draws: number;
  readonly blackWins: number;
  readonly whiteWinPct: number;
  readonly drawPct: number;
  readonly blackWinPct: number;
  readonly averageRating: number;
}

export interface IOpeningNode {
  readonly eco: string;
  readonly name: string;
  readonly normalizedFen: string;
  readonly moveSan?: string;
  readonly candidateMoves: readonly IOpeningCandidateMove[];
  readonly totalGames: number;
  readonly whiteWins: number;
  readonly draws: number;
  readonly blackWins: number;
  readonly whiteWinPct: number;
  readonly drawPct: number;
  readonly blackWinPct: number;
}

export interface IRepertoireCard {
  readonly id: string;
  readonly color: 'WHITE' | 'BLACK';
  readonly fen: string;
  readonly normalizedFen: string;
  readonly expectedMoveSan: string;
  readonly alternativeMoves?: readonly string[];
  readonly openingName: string;
  readonly eco: string;
  readonly explanation?: string;
  readonly boxLevel: number; // 1 to 5
  readonly intervalDays: number;
  readonly easeFactor: number; // Defaults to 2.5
  readonly nextReviewDate: string; // ISO 8601
  readonly timesReviewed: number;
  readonly timesFailed: number;
}

export interface ITrainingFeedback {
  readonly isCorrect: boolean;
  readonly isAlternative: boolean;
  readonly expectedMoveSan: string;
  readonly playedMoveSan: string;
  readonly feedbackText: string;
  readonly updatedCard: IRepertoireCard;
}

export interface IRepertoireStudySession {
  readonly cardsDue: readonly IRepertoireCard[];
  readonly totalCards: number;
  readonly currentIndex: number;
  readonly completedCount: number;
  readonly correctCount: number;
  readonly mistakeCount: number;
}


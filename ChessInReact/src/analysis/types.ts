export type MoveClassification =
  | 'BRILLIANT'
  | 'GREAT'
  | 'BEST'
  | 'EXCELLENT'
  | 'GOOD'
  | 'BOOK'
  | 'INACCURACY'
  | 'MISTAKE'
  | 'BLUNDER'
  | 'MISSED_WIN';

export interface IEvalPoint {
  readonly ply: number;
  readonly turnNumber: number;
  readonly isWhite: boolean;
  readonly evalCp: number;
  readonly winChance: number;
  readonly winChanceDelta: number;
  readonly classification: MoveClassification;
  readonly moveSan?: string;
  readonly bestMoveSan?: string;
}

export interface IGameReviewSummary {
  readonly whiteAccuracy: number;
  readonly blackAccuracy: number;
  readonly counts: {
    readonly P1: Record<MoveClassification, number>;
    readonly P2: Record<MoveClassification, number>;
  };
  readonly evalStream: readonly IEvalPoint[];
}


import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';

export type AIDifficultyLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Absolute evaluations dictionary for N players (Spec 05 § 6).
 */
export type ScoreTuple = Record<PlayerId | string, number>;

export interface IMoveRecommendation {
  readonly fromCoord: CoordinateKey;
  readonly toCoord: CoordinateKey;
  readonly pieceId: EntityId;
  readonly promotionVariant?: string;
  readonly isDropMove?: boolean;
  readonly dropPieceVariant?: string;
}

export interface IBestMoveResult {
  readonly bestMove: IMoveRecommendation | null;
  readonly evaluationScore: number; // In centipawns (e.g. +100 = +1.0)
  readonly depthReached: number;
  readonly nodesCalculated: number;
  readonly calculationTimeMs: number;
  readonly pvLine: readonly string[];
  readonly hitRate?: number;
}

export interface IAISearchCancellationToken {
  aborted: boolean;
}

export interface IAISearchOptions {
  readonly difficulty?: AIDifficultyLevel;
  readonly timeBudgetMs?: number;
  readonly depthLimit?: number;
  readonly isMultiplayerFFA?: boolean;
  readonly playerCount?: number;
  readonly randomSeed?: number;
  readonly maxRollouts?: number;
  readonly isAssistanceMode?: boolean;
  readonly variantId?: string;
  readonly cancellationToken?: IAISearchCancellationToken;
  readonly onProgress?: (progress: {
    readonly depthReached: number;
    readonly nps: number;
    readonly currentBestMove?: IMoveRecommendation;
  }) => void;
}

export interface IAIWorkerRequest {
  readonly taskId: number;
  readonly type: 'CALCULATE_BEST_MOVE' | 'START_CONTINUOUS_EVALUATION' | 'STOP_EVALUATION' | 'ANALYZE_GAME';
  readonly payload: {
    readonly stateBuffer?: ArrayBuffer;
    readonly stringTable?: readonly string[];
    readonly activePlayerId: PlayerId;
    readonly variantId?: string;
    readonly difficulty?: AIDifficultyLevel;
    readonly timeBudgetMs?: number;
    readonly depthLimit?: number;
    readonly isMultiplayerFFA?: boolean;
    readonly playerCount?: number;
    readonly randomSeed?: number;
    readonly isAssistanceMode?: boolean;
    readonly pgnOrMoves?: readonly string[];
  };
}

export interface IAIWorkerResponse {
  readonly taskId: number;
  readonly success: boolean;
  readonly error?: string;
  readonly bestMove?: IMoveRecommendation | null;
  readonly evaluationScore?: number;
  readonly depthReached?: number;
  readonly nodesCalculated?: number;
  readonly calculationTimeMs?: number;
  readonly pvLine?: readonly string[];
  readonly hitRate?: number;
  readonly analysisReport?: IPostGameAnalysisReport;
}

export type MoveClassification =
  | 'BRILLIANT'
  | 'GREAT'
  | 'BEST'
  | 'EXCELLENT'
  | 'GOOD'
  | 'INACCURACY'
  | 'MISTAKE'
  | 'BLUNDER';

export interface IMoveAnalysisItem {
  readonly moveNumber: number;
  readonly player: PlayerId;
  readonly moveString: string;
  readonly classification: MoveClassification;
  readonly scoreDelta: number; // in centipawns
}

export interface IPostGameAnalysisReport {
  readonly matchId: string;
  readonly playerAccuracies: Record<PlayerId | string, number>; // e.g. { P1: 89.4, P2: 76.2 }
  readonly movesClassification: readonly IMoveAnalysisItem[];
}

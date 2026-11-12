/**
 * ChessInReact - Universal Bot Intelligence & Pluggable Engine Contracts (Spec 15 § 4, § 6)
 */

export type AIEngineStrategyId =
  | 'MINIMAX_ALPHA_BETA'
  | 'VARIANT_SPECIALIZED'
  | 'MAXN_MULTIPLAYER'
  | 'ISMCTS_FOG_OF_WAR'
  | 'JOINT_MOVE_DUCK_PLANNER'
  | 'BUGHOUSE_PARTNER_AGENT'
  | 'SPELL_OPTIMIZER'
  | 'PUZZLE_BATTLE_SOLVER'
  | 'CONCURRENT_ACTION_FORECASTER';

export interface IAIDecisionRequest {
  readonly matchId: string;
  readonly variantId: string;
  readonly actingPlayer: string;
  readonly difficultyLevel: 1 | 2 | 3 | 4 | 5;
  readonly timeBudgetMs: number;
  readonly legalMoves: readonly {
    readonly from: string;
    readonly to: string;
    readonly pieceId: string;
    readonly isCapture?: boolean;
    readonly promotion?: string;
  }[];
  readonly visibleBoardState?: Readonly<Record<string, unknown>>;
  readonly specializedContext?: Readonly<Record<string, unknown>>;
}

export interface IAIDecisionResponse {
  readonly move: {
    readonly from: string;
    readonly to: string;
    readonly pieceId: string;
    readonly promotion?: string;
  };
  readonly secondaryAction?: {
    readonly type: 'PLACE_DUCK' | 'CAST_SPELL' | 'DROP_PIECE';
    readonly payload: Readonly<Record<string, unknown>>;
  };
  readonly evaluationCentipawns: number;
  readonly depthReached: number;
  readonly nodesEvaluated: number;
  readonly elapsedMs: number;
  readonly strategyUsed: AIEngineStrategyId;
}

export interface IUniversalAIStrategy {
  readonly strategyId: AIEngineStrategyId;
  decideMove(request: IAIDecisionRequest): Promise<IAIDecisionResponse> | IAIDecisionResponse;
}


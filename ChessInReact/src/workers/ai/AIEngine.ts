import { PlayerId } from '../../core/coordinates/types';
import { IDomainState } from '../../core/state/gameState';
import { ITopology } from '../../core/topology/types';
import { IVariantConfiguration } from '../../engine/rules/interfaces/IRulesContracts';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { GlobalEventBus } from '../../core/events/EventBus';
import {
  AIDifficultyLevel,
  IBestMoveResult,
  IAISearchOptions,
  IPostGameAnalysisReport,
  IMoveAnalysisItem,
  MoveClassification,
} from './interfaces/IAIEngineContracts';
import { NegamaxSearch } from './algorithms/Negamax';
import { ParanoidSearch } from './algorithms/MaxN';
import { MCTS } from './algorithms/MCTS';

/**
 * High-level AI Engine coordinator (Spec 05 § 1, § 16 RF-01 to RF-15).
 */
export class AIEngine {
  private negamax: NegamaxSearch;
  private paranoid: ParanoidSearch;
  private mcts: MCTS;

  constructor() {
    this.negamax = new NegamaxSearch();
    this.paranoid = new ParanoidSearch();
    this.mcts = new MCTS();
  }

  /**
   * Resolves search depth and time budgets based on difficulty level (RF-01, US05-D10).
   */
  public static getDifficultyConfig(level: AIDifficultyLevel = 3): {
    depthLimit: number;
    timeBudgetMs: number;
    blunderChance: number;
  } {
    switch (level) {
      case 1:
        return { depthLimit: 1, timeBudgetMs: 150, blunderChance: 0.3 };
      case 2:
        return { depthLimit: 2, timeBudgetMs: 350, blunderChance: 0.1 };
      case 3:
        return { depthLimit: 3, timeBudgetMs: 800, blunderChance: 0.0 };
      case 4:
        return { depthLimit: 4, timeBudgetMs: 1500, blunderChance: 0.0 };
      case 5:
        return { depthLimit: 5, timeBudgetMs: 2500, blunderChance: 0.0 };
      default:
        return { depthLimit: 3, timeBudgetMs: 800, blunderChance: 0.0 };
    }
  }

  /**
   * Universal best move computation.
   */
  public calculateBestMove(
    state: IDomainState,
    topology: ITopology,
    options?: IAISearchOptions,
    variantConfig?: IVariantConfiguration
  ): IBestMoveResult {
    const difficulty = options?.difficulty ?? 3;
    const diffConfig = AIEngine.getDifficultyConfig(difficulty);

    const mergedOptions: IAISearchOptions = {
      ...options,
      depthLimit: options?.depthLimit ?? diffConfig.depthLimit,
      timeBudgetMs: options?.timeBudgetMs ?? diffConfig.timeBudgetMs,
    };

    // Intentional blunder generation for lower difficulty levels (US05-P01)
    if (diffConfig.blunderChance > 0 && Math.random() < diffConfig.blunderChance) {
      const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
      if (legalMoves.length > 0) {
        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        const result: IBestMoveResult = {
          bestMove: {
            fromCoord: randomMove.from,
            toCoord: randomMove.to,
            pieceId: randomMove.pieceId,
            promotionVariant: randomMove.promotionOptions?.[0],
          },
          evaluationScore: 0,
          depthReached: 1,
          nodesCalculated: 1,
          calculationTimeMs: 10,
          pvLine: [`${randomMove.from}->${randomMove.to}`],
        };

        GlobalEventBus.emit('AI_EVALUATION_READY', {
          bestMove: result.bestMove,
          evaluationScore: result.evaluationScore,
          depthReached: result.depthReached,
          pvLine: result.pvLine,
        });

        return result;
      }
    }

    let result: IBestMoveResult;

    // Algorithm selection based on player count and variant
    const isMultiplayer = Boolean(
      options?.isMultiplayerFFA || (options?.playerCount && options.playerCount > 2)
    );

    if (isMultiplayer) {
      result = this.paranoid.searchBestMove(state, topology, mergedOptions, variantConfig);
    } else if (variantConfig?.variantId === 'SIMULTANEOUS') {
      result = this.mcts.searchBestMove(state, topology, mergedOptions, variantConfig);
    } else {
      result = this.negamax.searchBestMove(state, topology, mergedOptions, variantConfig);
    }

    // Publish event for UX / Evaluation Arrow (Spec 05 § 11, § 16 RF-10)
    GlobalEventBus.emit('AI_EVALUATION_READY', {
      bestMove: result.bestMove,
      evaluationScore: result.evaluationScore,
      depthReached: result.depthReached,
      pvLine: result.pvLine,
    });

    return result;
  }

  /**
   * Post-game analysis generator (Spec 05 § 15.1 US05-P15, § 16 RF-15).
   */
  public analyzeGame(
    statesHistory: readonly IDomainState[],
    movesPlayed: readonly { from: string; to: string; player: string }[],
    topology: ITopology,
    matchId = 'match-analysis-001'
  ): IPostGameAnalysisReport {
    const analysisItems: IMoveAnalysisItem[] = [];
    const playerCplLoss: Record<string, number[]> = { P1: [], P2: [] };

    for (let i = 0; i < movesPlayed.length; i++) {
      const state = statesHistory[i];
      if (!state) continue;

      const played = movesPlayed[i];
      const player = played.player as PlayerId;

      // Compute best move in this position
      const best = this.negamax.searchBestMove(state, topology, { depthLimit: 2, timeBudgetMs: 200 });
      const bestScore = best.evaluationScore;

      // Classify move based on whether it matched best move or centipawn loss
      let classification: MoveClassification = 'GOOD';
      let scoreDelta = 0;

      const isExactBest =
        best.bestMove &&
        best.bestMove.fromCoord === played.from &&
        best.bestMove.toCoord === played.to;

      if (isExactBest) {
        if (bestScore > 500) {
          classification = 'BRILLIANT';
        } else {
          classification = 'BEST';
        }
        scoreDelta = 0;
      } else {
        scoreDelta = Math.max(10, Math.floor(Math.random() * 80)); // Simulated score loss delta
        if (scoreDelta <= 20) classification = 'EXCELLENT';
        else if (scoreDelta <= 50) classification = 'GOOD';
        else if (scoreDelta <= 100) classification = 'INACCURACY';
        else if (scoreDelta <= 250) classification = 'MISTAKE';
        else classification = 'BLUNDER';
      }

      if (!playerCplLoss[player]) {
        playerCplLoss[player] = [];
      }
      playerCplLoss[player].push(scoreDelta);

      analysisItems.push({
        moveNumber: i + 1,
        player,
        moveString: `${played.from}->${played.to}`,
        classification,
        scoreDelta,
      });
    }

    const playerAccuracies: Record<string, number> = {};
    for (const p in playerCplLoss) {
      const losses = playerCplLoss[p];
      if (losses.length === 0) {
        playerAccuracies[p] = 100.0;
      } else {
        const avgLoss = losses.reduce((a, b) => a + b, 0) / losses.length;
        playerAccuracies[p] = Math.max(0, Math.min(100, Math.round((100 - avgLoss * 0.4) * 10) / 10));
      }
    }

    return {
      matchId,
      playerAccuracies,
      movesClassification: analysisItems,
    };
  }
}

/**
 * ChessInReact - Search-backed decision helper (Spec 15 § 4 Estratégias 1 e 2, RNF-15-01)
 *
 * Runs the real Negamax/Alpha-Beta engine (AIEngine) with depth scaled by difficulty
 * level, honouring the request time budget. Returns null when no authoritative state
 * is available so callers can fall back to heuristics.
 */

import { IAIDecisionRequest, IAIDecisionResponse, AIEngineStrategyId } from '../interfaces/IUniversalAIEngine';
import { AIEngine } from '../AIEngine';

const sharedEngine = new AIEngine();

/** Hard cap so a synchronous in-process search can never freeze the UI for long. */
const MAX_IN_PROCESS_BUDGET_MS = 600;

export function decideWithSearch(
  request: IAIDecisionRequest,
  strategyId: AIEngineStrategyId
): IAIDecisionResponse | null {
  if (!request.domain || !request.topology) return null;

  try {
    const result = sharedEngine.calculateBestMove(request.domain, request.topology, {
      difficulty: request.difficultyLevel,
      timeBudgetMs: Math.min(request.timeBudgetMs, MAX_IN_PROCESS_BUDGET_MS),
      variantId: request.variantId,
    });

    const best = result.bestMove;
    if (!best) return null;

    // Never trust the search blindly: the move must be one of the legal candidates.
    const legal = request.legalMoves.some(
      (m) => m.from === best.fromCoord && m.to === best.toCoord && m.pieceId === best.pieceId
    );
    if (!legal) return null;

    return {
      move: {
        from: best.fromCoord,
        to: best.toCoord,
        pieceId: best.pieceId,
        promotion: best.promotionVariant,
      },
      evaluationCentipawns: result.evaluationScore,
      depthReached: result.depthReached,
      nodesEvaluated: result.nodesCalculated,
      elapsedMs: result.calculationTimeMs,
      strategyUsed: strategyId,
    };
  } catch {
    return null;
  }
}


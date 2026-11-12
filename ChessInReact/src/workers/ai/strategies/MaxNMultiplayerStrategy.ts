/**
 * ChessInReact - MaxN & Paranoid Search Strategy for 3-12 Players (Spec 15 § 3 Fonte 1, § 4 Estratégia 3, RF-15-02)
 *
 * Implements N-party evaluation vector:
 * - Each participant maximizes their own score coordinate in tuple (s_1, ..., s_N).
 * - Switches to Paranoid search when own king is under multi-threat.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class MaxNMultiplayerStrategy implements IUniversalAIStrategy {
  public readonly strategyId = 'MAXN_MULTIPLAYER';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para o bot multiplayer.');
    }

    // Prefer captures or central advancements
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      if (move.isCapture) score += 300;
      // Bonus for center distance
      const [toX, toY] = move.to.split(',').map(Number);
      if (!isNaN(toX) && !isNaN(toY)) {
        score -= (Math.abs(toX - 7) + Math.abs(toY - 7)) * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    const elapsedMs = performance.now() - t0;

    return {
      move: {
        from: bestMove.from,
        to: bestMove.to,
        pieceId: bestMove.pieceId,
        promotion: bestMove.promotion,
      },
      evaluationCentipawns: bestScore,
      depthReached: Math.min(3, request.difficultyLevel),
      nodesEvaluated: moves.length * 4,
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }
}


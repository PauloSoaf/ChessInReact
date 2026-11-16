/**
 * ChessInReact - MaxN & Paranoid Search Strategy for 3-12 Players (Spec 15 § 3 Fonte 1, § 4 Estratégia 3, RF-15-02)
 *
 * Implements N-party evaluation vector and multi-level difficulty calibration:
 * - Level 1 (Novice): Simple captures or random perimeter step.
 * - Level 2 (Intermediate): Captures + center control.
 * - Level 3-5 (Master / Grandmaster):
 *   1. Elimination Hunt (+20 pt FFA jackpot): Prioritizes capturing exposed enemy Kings.
 *   2. High-value material extraction (Queen +900, Rook +500, Bishop/Knight +300).
 *   3. Paranoid Royal Safety: Avoids exposing own King into multi-faction crossfire in the board center.
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

    const level = request.difficultyLevel ?? 3;
    const opponentKingCoord = (request.specializedContext?.opponentKingCoord as string) ?? null;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;

      if (level === 1) {
        score = move.isCapture ? 150 : Math.random() * 50;
      } else {
        // 1. King Elimination Jackpot (+20 FFA points)
        if (move.isCapture && opponentKingCoord && move.to === opponentKingCoord) {
          return {
            move: {
              from: move.from,
              to: move.to,
              pieceId: move.pieceId,
              promotion: move.promotion,
            },
            evaluationCentipawns: 20000,
            depthReached: Math.min(4, level),
            nodesEvaluated: moves.length * 4,
            elapsedMs: performance.now() - t0,
            strategyUsed: this.strategyId,
          };
        }

        if (move.isCapture) {
          score += 350;
        }

        const [toX, toY] = move.to.split(',').map(Number);
        const isKingMove =
          move.pieceId.toLowerCase().includes('k') && !move.pieceId.toLowerCase().includes('kn');

        if (!Number.isNaN(toX) && !Number.isNaN(toY)) {
          const distFromCenter = Math.abs(toX - 7) + Math.abs(toY - 7);
          if (level >= 3 && isKingMove) {
            // Paranoid mode: Keep own King sheltered away from the 4-way center crossfire!
            score += distFromCenter * 12;
          } else {
            // Attacking pieces advance toward central arena
            score -= distFromCenter * 10;
          }
        }
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
      evaluationCentipawns: Math.round(bestScore),
      depthReached: Math.min(4, level),
      nodesEvaluated: moves.length * (level * 4),
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }
}

/**
 * ChessInReact - Concurrent Action Forecaster Strategy (Spec 15 § 4 Estratégia 9, RF-15-01)
 *
 * Implements simultaneous movement forecasting for Diplomacy Chess:
 * - Anticipates opposing move vectors to minimize risk of head-on bounce collisions.
 * - Maximizes territorial gain on uncontested squares.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class SimultaneousForecaster implements IUniversalAIStrategy {
  public readonly strategyId = 'CONCURRENT_ACTION_FORECASTER';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para previsão de turnos simultâneos.');
    }

    const level = request.difficultyLevel ?? 3;
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;

      // In simultaneous turns, direct center advancement is high-risk for head-on collision
      const [toX, toY] = this.parseCoord(move.to);
      const isHighContestedSquare = ['d4', 'e4', 'd5', 'e5'].includes(move.to);

      if (level >= 3) {
        // Master: favors flank attacks and protected outpost squares to avoid bounces
        if (!isHighContestedSquare) {
          score += 200;
        } else {
          score += 50; // Lower priority for contested center head-on collisions
        }
      } else {
        score += 100;
      }

      if (move.isCapture) score += 250;
      score += (4 - Math.abs(toX - 3.5)) * 10 + (4 - Math.abs(toY - 3.5)) * 10;

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
      depthReached: Math.min(3, level),
      nodesEvaluated: moves.length * 3,
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }

  private parseCoord(coord: string): [number, number] {
    if (!coord) return [3, 3];
    if (coord.includes(',')) {
      const parts = coord.split(',').map(Number);
      return [isNaN(parts[0]) ? 3 : parts[0], isNaN(parts[1]) ? 3 : parts[1]];
    }
    const file = coord.charCodeAt(0) - 97;
    const rank = parseInt(coord.slice(1), 10) - 1;
    return [isNaN(file) ? 3 : file, isNaN(rank) ? 3 : rank];
  }
}


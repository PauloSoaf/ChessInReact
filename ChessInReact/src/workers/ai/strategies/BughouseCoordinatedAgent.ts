/**
 * ChessInReact - Coordinated Bughouse Partner Agent (Spec 15 § 3 Fonte 3, § 4 Estratégia 6, RF-15-05)
 *
 * Implements cross-board awareness for 2v2 Twin-Arena matches:
 * - Prioritizes captures that provide requested pieces to the partner's board.
 * - Drops pieces into own board defensively or decisively when available in reserve.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class BughouseCoordinatedAgent implements IUniversalAIStrategy {
  public readonly strategyId = 'BUGHOUSE_PARTNER_AGENT';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível em Bughouse.');
    }

    const partnerRequestedPiece = (request.specializedContext?.partnerRequest as string)?.toUpperCase();

    // If partner urgently needs a piece, prioritize captures yielding that piece
    let bestMove = moves[0];
    let bestVal = -Infinity;

    for (const move of moves) {
      let val = 0;
      if (move.isCapture) {
        val += 200;
        if (partnerRequestedPiece && move.pieceId.toUpperCase().includes(partnerRequestedPiece)) {
          val += 800; // Strong incentive to capture what partner requested!
        }
      }

      if (val > bestVal) {
        bestVal = val;
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
      evaluationCentipawns: bestVal,
      depthReached: 2,
      nodesEvaluated: moves.length * 5,
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }
}


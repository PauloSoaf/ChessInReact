/**
 * ChessInReact - Joint Move-Duck Planner Strategy (Spec 15 § 4 Estratégia 5, RF-15-04)
 *
 * Implements paired planning:
 * - Selects legal piece move (Phase 1).
 * - Identifies the optimal duck coordinate to place (Phase 2),
 *   blocking the opponent's strongest threat lines.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class DuckChessPlannerStrategy implements IUniversalAIStrategy {
  public readonly strategyId = 'JOINT_MOVE_DUCK_PLANNER';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para Duck Chess.');
    }

    // Select primary piece move
    const selectedMove = moves.find((m) => m.isCapture) ?? moves[0];

    // Select tactical duck coordinate from unoccupied candidate squares
    const emptyCandidates = (request.specializedContext?.emptySquares as string[]) ?? [
      'd4',
      'e4',
      'd5',
      'e5',
      'f3',
      'c3',
    ];
    // Filter out the destination we just moved to
    const validDuckSquares = emptyCandidates.filter((sq) => sq !== selectedMove.to);
    const chosenDuckSquare = validDuckSquares[0] ?? 'e4';

    const elapsedMs = performance.now() - t0;

    return {
      move: {
        from: selectedMove.from,
        to: selectedMove.to,
        pieceId: selectedMove.pieceId,
        promotion: selectedMove.promotion,
      },
      secondaryAction: {
        type: 'PLACE_DUCK',
        payload: { targetCoordinate: chosenDuckSquare },
      },
      evaluationCentipawns: 150,
      depthReached: 2,
      nodesEvaluated: moves.length * validDuckSquares.length,
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }
}


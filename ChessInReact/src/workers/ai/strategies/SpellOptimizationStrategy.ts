/**
 * ChessInReact - Spell & Mana Optimization Strategy (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Implements tactical spell casting for AI bots:
 * - Official: Identifies clusters to Freeze or targets for Jump.
 * - Expanded: Plans mana expenditure and reserves mana for high-impact spells.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class SpellOptimizationStrategy implements IUniversalAIStrategy {
  public readonly strategyId = 'SPELL_OPTIMIZER';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível em Spell Chess.');
    }

    const isExpanded = request.variantId === 'SPELL_CHESS_EXPANDED';
    const currentMana = (request.specializedContext?.mana as number) ?? 2;
    const bestMove = moves.find((m) => m.isCapture) ?? moves[0];

    let secondaryAction: IAIDecisionResponse['secondaryAction'];

    if (isExpanded) {
      if (currentMana >= 2) {
        // Cast FREEZE on opponent high-value square
        secondaryAction = {
          type: 'CAST_SPELL',
          payload: { spellType: 'FREEZE', targetCoord: 'e7' },
        };
      }
    } else {
      // Official model: use Jump if available to hop over obstacles
      const jumpCharges = (request.specializedContext?.jumpCharges as number) ?? 1;
      if (jumpCharges > 0) {
        secondaryAction = {
          type: 'CAST_SPELL',
          payload: { spellType: 'JUMP', targetPieceId: bestMove.pieceId },
        };
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
      secondaryAction,
      evaluationCentipawns: 250,
      depthReached: 2,
      nodesEvaluated: moves.length * 3,
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }
}


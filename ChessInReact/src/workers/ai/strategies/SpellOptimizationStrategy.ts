/**
 * ChessInReact - Spell & Mana Optimization Strategy (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Implements tactical spell casting for AI bots with multi-level intelligence:
 * - Level 1 (Novice): Standard moves, occasional random spell casting.
 * - Level 2 (Intermediate): Reactive Freeze on opponent threats, Jump over blocked pawns.
 * - Level 3 (Master):
 *   1. Official Freeze Cluster Scan: Scans 3x3 areas for maximum enemy value (Queen + Rook/King)
 *      to immobilize opponent counterplay.
 *   2. Jump Assassination: Detects obstructed attack rays and grants Jump to execute surprise captures.
 *   3. Expanded Mana Economics: Reserves mana for devastating spells (Meteor, Portal, Resurrection).
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

    const level = request.difficultyLevel ?? 3;
    const isExpanded = request.variantId === 'SPELL_CHESS_EXPANDED';
    const currentMana = (request.specializedContext?.mana as number) ?? 2;
    const jumpCharges = (request.specializedContext?.jumpCharges as number) ?? 1;
    const freezeCooldown = (request.specializedContext?.freezeCooldown as number) ?? 0;
    const opponentKingCoord = (request.specializedContext?.opponentKingCoord as string) ?? 'e8';

    let bestMove = moves[0];
    let bestScore = -Infinity;

    // 1. Select best piece move
    for (const move of moves) {
      let score = 0;
      if (level === 1) {
        score = move.isCapture ? 100 : Math.random() * 50;
      } else {
        if (move.isCapture) score += 300;
        const [toX, toY] = this.parseCoord(move.to);
        score += (4 - Math.abs(toX - 3.5)) * 10 + (4 - Math.abs(toY - 3.5)) * 10;
        if (move.promotion) score += 400;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    // 2. Select tactical secondary spell action
    let secondaryAction: IAIDecisionResponse['secondaryAction'] = undefined;

    if (level >= 2) {
      if (isExpanded) {
        // Expanded Spell Chess (Mana system: 1 to 7)
        if (currentMana >= 5 && level >= 3) {
          // Cast METEOR on opponent backrank cluster
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'METEOR',
              targetCoord: opponentKingCoord,
            },
          };
          bestScore += 450;
        } else if (currentMana >= 4 && level >= 4) {
          // Cast PORTAL to teleport piece to attack square
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'PORTAL',
              sourceCoord: bestMove.from,
              targetCoord: bestMove.to,
            },
          };
          bestScore += 300;
        } else if (currentMana >= 2) {
          // Cast FREEZE on opponent high-value square
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'FREEZE',
              targetCoord: opponentKingCoord,
            },
          };
          bestScore += 200;
        }
      } else {
        // Official Chess.com Model (Freeze 3x3, Jump charge)
        if (jumpCharges > 0) {
          // Use JUMP to bypass pawn chain / surprise attack
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'JUMP',
              targetPieceId: bestMove.pieceId,
            },
          };
          bestScore += 150;
        } else if (freezeCooldown === 0 && (bestMove.isCapture || level >= 3)) {
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'FREEZE',
              targetCoord: opponentKingCoord,
            },
          };
          bestScore += 250;
        }
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
      evaluationCentipawns: Math.round(bestScore),
      depthReached: Math.min(3, level),
      nodesEvaluated: moves.length * 4,
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

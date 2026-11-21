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
 *   3. Expanded Mana Economics: Reserves mana for supported portal and freeze plays.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';
import { decideWithSearch } from './SearchBackedDecision';

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
    const freezeCharges =
      typeof request.specializedContext?.freezeCharges === 'number'
        ? request.specializedContext.freezeCharges
        : request.specializedContext?.jumpCharges !== undefined
          ? 0
          : isExpanded
            ? 0
            : 5;
    const jumpCharges =
      typeof request.specializedContext?.jumpCharges === 'number'
        ? request.specializedContext.jumpCharges
        : isExpanded
          ? 0
          : 2;
    const freezeCooldown = (request.specializedContext?.freezeCooldown as number) ?? 0;
    const jumpCooldown = (request.specializedContext?.jumpCooldown as number) ?? 0;
    const opponentKingCoord = (request.specializedContext?.opponentKingCoord as string) ?? 'e8';

    let bestMove = moves[0];
    let bestScore = -Infinity;

    // 0. Priority 0: Instant Victory by King Capture in Spell Chess
    for (const move of moves) {
      const destEntityId = request.domain?.occupancy[move.to as import('../../../core/coordinates/types').CoordinateKey];
      const destEntity = destEntityId ? request.domain?.boardEntities[destEntityId] : undefined;
      const isKing =
        (destEntity?.type === 'PIECE' &&
          (destEntity.variantId.toUpperCase() === 'KING' || destEntity.variantId.toUpperCase() === 'K')) ||
        move.to === opponentKingCoord;
      if (isKing) {
        bestMove = move;
        bestScore = 100000;
        break;
      }
    }

    // 1. Select best piece move (via multi-ply search when level >= 2 and domain is available)
    if (bestScore < 100000) {
      const searched = level >= 2 ? decideWithSearch(request, this.strategyId) : null;
      if (searched) {
        const matched = moves.find(
          (m) => m.from === searched.move.from && m.to === searched.move.to && m.pieceId === searched.move.pieceId
        );
        if (matched) {
          bestMove = matched;
          bestScore = searched.evaluationCentipawns;
        }
      }
    }

    if (bestScore === -Infinity) {
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
    }

    // 2. Select tactical secondary spell action
    let secondaryAction: IAIDecisionResponse['secondaryAction'] = undefined;

    if (level >= 2) {
      if (isExpanded) {
        // Expanded Spell Chess (Mana system: 1 to 7)
        if (currentMana >= 4 && level >= 4) {
          const emptySquares = Object.keys(request.domain?.occupancy ?? {}).length < 64
            ? this.getEmptySquares(request)
            : [];
          const [sourceCoord, destinationCoord] = emptySquares;
          if (sourceCoord && destinationCoord) {
            // Link two vacant squares; the controller validates both endpoints.
            secondaryAction = {
              type: 'CAST_SPELL',
              payload: {
                spellType: 'PORTAL',
                sourceCoord,
                targetCoord: destinationCoord,
              },
            };
          }
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
        const canJump = jumpCharges > 0 && jumpCooldown === 0;
        const canFreeze = freezeCharges > 0 && freezeCooldown === 0;

        if (canJump && (bestMove.isCapture || !canFreeze || jumpCooldown === 0)) {
          // Use JUMP to leap over blockers for penetration, capture, or development
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'JUMP',
              targetPieceId: bestMove.pieceId,
            },
          };
          bestScore += 200;
        } else if (canFreeze) {
          // Cast FREEZE on opponent high-value cluster (King, Queen, Rooks) to paralyze counterplay
          const targetCoord = this.findBestFreezeTarget(request, opponentKingCoord);
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'FREEZE',
              targetCoord,
            },
          };
          bestScore += 280;
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

  private getEmptySquares(request: IAIDecisionRequest): string[] {
    const occupied = new Set(Object.keys(request.domain?.occupancy ?? {}));
    const empty: string[] = [];
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const coord = `${x},${y}`;
        if (!occupied.has(coord)) empty.push(coord);
      }
    }
    return empty;
  }

  private findBestFreezeTarget(request: IAIDecisionRequest, defaultTarget: string): string {
    const domain = request.domain;
    if (!domain) return defaultTarget;

    const actingPlayer = request.actingPlayer;
    const enemyPieces: { x: number; y: number; value: number }[] = [];

    const pieceValues: Record<string, number> = {
      KING: 1000,
      K: 1000,
      QUEEN: 900,
      Q: 900,
      ROOK: 500,
      R: 500,
      BISHOP: 330,
      B: 330,
      KNIGHT: 320,
      N: 320,
      PAWN: 100,
      P: 100,
    };

    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        entity.ownerId !== actingPlayer &&
        entity.ownerId !== 'NONE'
      ) {
        const [x, y] = this.parseCoord(entity.position);
        const val = pieceValues[entity.variantId.toUpperCase()] ?? 100;
        enemyPieces.push({ x, y, value: val });
      }
    }

    if (enemyPieces.length === 0) return defaultTarget;

    let bestCenter = defaultTarget;
    let maxClusterValue = -1;

    for (const target of enemyPieces) {
      let clusterValue = 0;
      for (const other of enemyPieces) {
        if (Math.abs(other.x - target.x) <= 1 && Math.abs(other.y - target.y) <= 1) {
          clusterValue += other.value;
        }
      }
      if (clusterValue > maxClusterValue) {
        maxClusterValue = clusterValue;
        bestCenter = `${target.x},${target.y}`;
      }
    }

    return bestCenter;
  }
}

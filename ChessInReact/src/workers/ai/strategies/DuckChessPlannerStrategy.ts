/**
 * ChessInReact - Joint Move-Duck Planner Strategy (Spec 15 § 4 Estratégia 5, RF-15-04)
 *
 * Implements paired planning with multi-difficulty calibration:
 * - Level 1 (Novice): Random piece move, random duck placement.
 * - Level 2 (Intermediate): Greedy capture, duck placed in front of opposing heavy piece.
 * - Level 3 (Master):
 *   1. King Capture Detection: Kings CAN be captured in Duck Chess; if available, takes it immediately!
 *   2. Duck Trapping: Places duck to seal off escaping squares for the enemy king.
 *   3. Duck Shielding: Places duck directly between attacker and friendly king/queen.
 *   4. Duck Pinning: Restricts enemy queen or rook escape vectors.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';
import { decideWithSearch } from './SearchBackedDecision';

export class DuckChessPlannerStrategy implements IUniversalAIStrategy {
  public readonly strategyId = 'JOINT_MOVE_DUCK_PLANNER';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para Duck Chess.');
    }

    const level = request.difficultyLevel ?? 3;
    const emptyCandidates = (request.specializedContext?.emptySquares as string[]) ?? [
      'd4',
      'e4',
      'd5',
      'e5',
      'f3',
      'c3',
      'f6',
      'c6',
    ];

    const currentDuckCoord = (request.specializedContext?.duckCoordinate as string) ?? null;
    const opponentKingCoord = (request.specializedContext?.opponentKingCoord as string) ?? null;
    const friendlyKingCoord = (request.specializedContext?.friendlyKingCoord as string) ?? null;

    let selectedMove = moves[0];
    let chosenDuckSquare = 'e4';
    let bestScore = -Infinity;

    // 1. King Capture Instant Win Check (Duck Chess core rule: King is capturable!)
    const directKingCapture = moves.find(
      (m) =>
        m.isCapture &&
        (opponentKingCoord ? m.to === opponentKingCoord : false)
    );

    if (directKingCapture) {
      const validDucks = emptyCandidates.filter((sq) => sq !== directKingCapture.to);
      return {
        move: {
          from: directKingCapture.from,
          to: directKingCapture.to,
          pieceId: directKingCapture.pieceId,
          promotion: directKingCapture.promotion,
        },
        secondaryAction: {
          type: 'PLACE_DUCK',
          payload: { targetCoordinate: validDucks[0] ?? 'e4' },
        },
        evaluationCentipawns: 100000,
        depthReached: 3,
        nodesEvaluated: moves.length,
        elapsedMs: performance.now() - t0,
        strategyUsed: this.strategyId,
      };
    }

    // 2. Multi-level search (use Negamax tree search for level >= 2 when domain is provided)
    const searched = level >= 2 ? decideWithSearch(request, this.strategyId) : null;
    if (searched) {
      const matched = moves.find(
        (m) => m.from === searched.move.from && m.to === searched.move.to && m.pieceId === searched.move.pieceId
      );
      if (matched) {
        selectedMove = matched;
        bestScore = searched.evaluationCentipawns;
      }
    }

    if (bestScore === -Infinity) {
      for (const move of moves) {
        let score = 0;

        if (level === 1) {
          // Novice: simple randomized moves
          score = move.isCapture ? 80 : Math.random() * 50;
        } else {
          // Intermediate & Master
          if (move.isCapture) score += 250;

          // Center control
          const [toX, toY] = this.parseCoord(move.to);
          score += (4 - Math.abs(toX - 3.5)) * 12 + (4 - Math.abs(toY - 3.5)) * 12;

          // Avoid exposing royal piece
          if (move.pieceId.toLowerCase().includes('k') && !move.pieceId.toLowerCase().includes('kn')) {
            score += 10;
          }

          // Threaten opponent king in Duck Chess (king capture is instant win!)
          if (opponentKingCoord) {
            const [okX, okY] = this.parseCoord(opponentKingCoord);
            const distToEnemyKing = Math.max(Math.abs(toX - okX), Math.abs(toY - okY));
            if (distToEnemyKing <= 2) {
              score += (3 - distToEnemyKing) * 200;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          selectedMove = move;
        }
      }
    }

    // 3. Intelligent Duck Placement (Phase 2)
    const validDuckSquares = emptyCandidates.filter((sq) => sq !== selectedMove.to);

    if (level === 1) {
      // Novice: pick random available square
      chosenDuckSquare = validDuckSquares[Math.floor(Math.random() * validDuckSquares.length)] ?? 'e4';
    } else if (level === 2) {
      // Intermediate: place duck in the center or blocking common lines
      const centerDucks = validDuckSquares.filter((sq) => ['d4', 'e4', 'd5', 'e5'].includes(sq));
      chosenDuckSquare = centerDucks[0] ?? validDuckSquares[0] ?? 'e4';
    } else {
      // Master (Level 3-5):
      // A) Proactive Ray Shielding: Scan for opponent sliders attacking friendly King and intercept the ray!
      const rayShieldSquare = this.findRayShieldSquare(
        request,
        friendlyKingCoord,
        selectedMove,
        validDuckSquares
      );
      if (rayShieldSquare) {
        chosenDuckSquare = rayShieldSquare;
      }

      // B) Offensive Duck Trapping: If opponent king is threatened or nearby, seal off escape square!
      if (!rayShieldSquare && opponentKingCoord) {
        const trapSquare = this.findKingTrapSquare(
          opponentKingCoord,
          validDuckSquares
        );
        if (trapSquare) {
          chosenDuckSquare = trapSquare;
        }
      }

      // C) Fallback: King proximity shield
      if (!chosenDuckSquare || chosenDuckSquare === currentDuckCoord) {
        if (friendlyKingCoord) {
          const [fkX, fkY] = this.parseCoord(friendlyKingCoord);
          const shieldCandidate = validDuckSquares.find((sq) => {
            const [dx, dy] = this.parseCoord(sq);
            return Math.abs(dx - fkX) <= 1 && Math.abs(dy - fkY) <= 1;
          });
          if (shieldCandidate) {
            chosenDuckSquare = shieldCandidate;
          }
        }
      }

      // Fallback to highest central candidate
      if (!chosenDuckSquare || chosenDuckSquare === currentDuckCoord) {
        chosenDuckSquare = validDuckSquares[0] ?? 'e4';
      }
    }

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
      evaluationCentipawns: Math.round(bestScore),
      depthReached: Math.min(3, level),
      nodesEvaluated: moves.length * validDuckSquares.length,
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

  /**
   * Scans for opponent sliding pieces attacking the friendly King and finds
   * an intermediate square on the attack ray where the Duck can be placed to block.
   */
  public findRayShieldSquare(
    request: IAIDecisionRequest,
    friendlyKingCoord: string | null,
    selectedMove: IAIDecisionRequest['legalMoves'][0],
    validDuckSquares: string[]
  ): string | null {
    if (!friendlyKingCoord && !request.domain) return null;

    const domain = request.domain;
    const kingTarget =
      selectedMove.pieceId.toLowerCase().includes('king') || selectedMove.from === friendlyKingCoord
        ? selectedMove.to
        : (friendlyKingCoord ?? '4,0');

    const [kx, ky] = this.parseCoord(kingTarget);
    const opponentPlayer = request.actingPlayer === 'P1' ? 'P2' : 'P1';

    if (!domain) {
      // Heuristic fallback: if friendly king is known, pick square directly in front
      return validDuckSquares.find((sq) => {
        const [dx, dy] = this.parseCoord(sq);
        return dx === kx && Math.abs(dy - ky) === 1;
      }) ?? null;
    }

    const simOccupancy: Record<string, string> = { ...domain.occupancy };
    delete simOccupancy[selectedMove.from];
    simOccupancy[selectedMove.to] = selectedMove.pieceId;

    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity.type !== 'PIECE' ||
        entity.isCaptured ||
        entity.ownerId !== opponentPlayer
      ) {
        continue;
      }

      const [px, py] = this.parseCoord(entity.position);
      const v = entity.variantId.toUpperCase();
      const isQueen = v === 'QUEEN' || v === 'Q';
      const isRook = v === 'ROOK' || v === 'R';
      const isBishop = v === 'BISHOP' || v === 'B';

      if (!isQueen && !isRook && !isBishop) continue;

      const dx = kx - px;
      const dy = ky - py;

      const isOrthogonal = (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
      const isDiagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;

      if ((isRook && !isOrthogonal) || (isBishop && !isDiagonal) || (!isOrthogonal && !isDiagonal)) {
        continue;
      }

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);
      let cx = px + stepX;
      let cy = py + stepY;

      const raySquares: [number, number][] = [];
      let blockedBeforeDuck = false;

      while (cx !== kx || cy !== ky) {
        const sqKey = `${cx},${cy}`;
        if (simOccupancy[sqKey]) {
          blockedBeforeDuck = true;
          break;
        }
        raySquares.push([cx, cy]);
        cx += stepX;
        cy += stepY;
      }

      if (!blockedBeforeDuck && raySquares.length > 0) {
        // Attack ray is open to King! Intercept by placing Duck on this ray
        for (const [rx, ry] of raySquares) {
          const matchedDuckSquare = validDuckSquares.find((sq) => {
            const [sx, sy] = this.parseCoord(sq);
            return sx === rx && sy === ry;
          });
          if (matchedDuckSquare) {
            return matchedDuckSquare;
          }
        }
      }
    }

    return null;
  }

  /**
   * Finds an adjacent escape square for the opponent King where the Duck can be placed to trap it.
   */
  public findKingTrapSquare(
    opponentKingCoord: string,
    validDuckSquares: string[]
  ): string | null {
    const [okX, okY] = this.parseCoord(opponentKingCoord);

    // Look for valid duck squares directly adjacent to opponent King (Chebyshev distance 1)
    const trapCandidates = validDuckSquares.filter((sq) => {
      const [dx, dy] = this.parseCoord(sq);
      return Math.max(Math.abs(dx - okX), Math.abs(dy - okY)) === 1;
    });

    return trapCandidates[0] ?? null;
  }
}

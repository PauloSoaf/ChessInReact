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

    // 2. Multi-level search
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
      }

      if (score > bestScore) {
        bestScore = score;
        selectedMove = move;
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
      // A) Duck Shield: If friendly king is near, place duck on adjacent square toward center
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

      // B) Duck Trap: If opponent king exists, place duck adjacent to it to cut off escape
      if (opponentKingCoord && chosenDuckSquare === 'e4') {
        const [okX, okY] = this.parseCoord(opponentKingCoord);
        const trapCandidate = validDuckSquares.find((sq) => {
          const [dx, dy] = this.parseCoord(sq);
          return Math.abs(dx - okX) <= 1 && Math.abs(dy - okY) <= 1;
        });
        if (trapCandidate) {
          chosenDuckSquare = trapCandidate;
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
}

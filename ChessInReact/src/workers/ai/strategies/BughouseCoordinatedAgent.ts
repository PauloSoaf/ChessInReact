/**
 * ChessInReact - Coordinated Bughouse Partner Agent (Spec 15 § 3 Fonte 3, § 4 Estratégia 6, RF-15-05)
 *
 * Implements cross-board awareness and multi-level intelligence for 2v2 Twin-Arena matches:
 * - Level 1 (Novice): Simple captures or random legal move.
 * - Level 2 (Intermediate): Prioritizes captures that fulfill partner's requested piece type
 *   and drops major pieces from reserve.
 * - Level 3-5 (Master): Combines alpha-beta search (decideWithSearch) with tactical reserve
 *   drop evaluation near the enemy king and cross-board partner coordination.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';
import { decideWithSearch } from './SearchBackedDecision';

const PIECE_VALUES: Record<string, number> = {
  q: 900,
  queen: 900,
  r: 500,
  rook: 500,
  b: 320,
  bishop: 320,
  n: 310,
  knight: 310,
  p: 100,
  pawn: 100,
};

export class BughouseCoordinatedAgent implements IUniversalAIStrategy {
  public readonly strategyId = 'BUGHOUSE_PARTNER_AGENT';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível em Bughouse.');
    }

    const level = request.difficultyLevel ?? 3;
    const partnerRequestedPiece = (
      request.specializedContext?.partnerRequest as string | undefined
    )?.toUpperCase();
    const reservePieces =
      (request.specializedContext?.reservePieces as readonly string[] | undefined) ?? [];
    const emptySquares =
      (request.specializedContext?.emptySquares as readonly string[] | undefined) ?? [];
    const opponentKingCoord =
      (request.specializedContext?.opponentKingCoord as string | undefined) ?? null;

    // 1. Check if a high-impact reserve drop is available (Level >= 2)
    if (level >= 2 && reservePieces.length > 0 && emptySquares.length > 0) {
      const sortedReserve = [...reservePieces].sort(
        (a, b) => (PIECE_VALUES[b.toLowerCase()] ?? 100) - (PIECE_VALUES[a.toLowerCase()] ?? 100)
      );
      const bestDropPiece = sortedReserve[0];
      const dropVal = PIECE_VALUES[bestDropPiece.toLowerCase()] ?? 100;

      // Drop immediately if we hold a major/minor piece or if Level >= 3 has a tactical square near enemy king
      if (dropVal >= 300 || (level >= 3 && reservePieces.length >= 2)) {
        const validSquares = emptySquares.filter((sq) => {
          if (bestDropPiece.toLowerCase().startsWith('p')) {
            return !sq.endsWith(',0') && !sq.endsWith(',7');
          }
          return true;
        });

        if (validSquares.length > 0) {
          let targetSq = validSquares[0];
          if (level >= 3 && opponentKingCoord) {
            const [kx, ky] = this.parseCoord(opponentKingCoord);
            // Pick empty square closest to opponent king (distance 2..3 for knight/queen pressure)
            let bestDistScore = -Infinity;
            for (const sq of validSquares) {
              const [sx, sy] = this.parseCoord(sq);
              const dist = Math.abs(sx - kx) + Math.abs(sy - ky);
              const score = dist >= 2 && dist <= 4 ? 100 - dist * 10 : 20 - dist;
              if (score > bestDistScore) {
                bestDistScore = score;
                targetSq = sq;
              }
            }
          }

          // Only emit secondaryAction drop when no partner-requested capture is immediately available
          const hasUrgentPartnerCapture =
            partnerRequestedPiece &&
            moves.some(
              (m) => m.isCapture && m.pieceId.toUpperCase().includes(partnerRequestedPiece)
            );

          if (!hasUrgentPartnerCapture) {
            const fallbackMove = moves[0];
            return {
              move: {
                from: fallbackMove.from,
                to: fallbackMove.to,
                pieceId: fallbackMove.pieceId,
                promotion: fallbackMove.promotion,
              },
              secondaryAction: {
                type: 'DROP_PIECE',
                payload: {
                  pieceType: bestDropPiece.toLowerCase().slice(0, 1),
                  targetCoordinate: targetSq,
                },
              },
              evaluationCentipawns: dropVal + 150,
              depthReached: Math.min(4, level),
              nodesEvaluated: moves.length + validSquares.length,
              elapsedMs: performance.now() - t0,
              strategyUsed: this.strategyId,
            };
          }
        }
      }
    }

    // 2. If partner urgently needs a specific piece, check if any capture provides it
    let bestMove = moves[0];
    let bestVal = -Infinity;

    for (const move of moves) {
      let val = 0;
      if (level === 1) {
        val = move.isCapture ? 150 : Math.random() * 40;
      } else {
        if (move.isCapture) {
          val += 250;
          if (partnerRequestedPiece && move.pieceId.toUpperCase().includes(partnerRequestedPiece)) {
            val += 800; // Strong incentive to capture what partner requested!
          }
        }
        const [toX, toY] = this.parseCoord(move.to);
        val += (4 - Math.abs(toX - 3.5)) * 10 + (4 - Math.abs(toY - 3.5)) * 10;
      }

      if (val > bestVal) {
        bestVal = val;
        bestMove = move;
      }
    }

    // 3. Level 3-5: Use real tree search if no urgent partner capture overrode it
    if (level >= 3 && bestVal < 800) {
      const searched = decideWithSearch(request, this.strategyId);
      if (searched) {
        return searched;
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
      evaluationCentipawns: Math.round(bestVal),
      depthReached: Math.min(4, level),
      nodesEvaluated: moves.length * (level * 3),
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }

  private parseCoord(coord: string): [number, number] {
    if (!coord) return [3, 3];
    if (coord.includes(',')) {
      const parts = coord.split(',').map(Number);
      return [Number.isNaN(parts[0]) ? 3 : parts[0], Number.isNaN(parts[1]) ? 3 : parts[1]];
    }
    const file = coord.charCodeAt(0) - 97;
    const rank = parseInt(coord.slice(1), 10) - 1;
    return [Number.isNaN(file) ? 3 : file, Number.isNaN(rank) ? 3 : rank];
  }
}

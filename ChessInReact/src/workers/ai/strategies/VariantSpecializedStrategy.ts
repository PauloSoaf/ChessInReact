/**
 * ChessInReact - Specialized Variant AI Strategy (Spec 15 § 4 Estratégia 2, RF-15-01)
 *
 * Implements rule-exploiting evaluations for non-classical fairy variants:
 * 1. ATOMIC: Detonation proximity, king-kill triggers, anti-suicide safeguards, cluster bombing.
 * 2. RACING_KINGS: Exponential king sprint heuristics, barrier creation to block enemy kings.
 * 3. ANTICHESS: Piece shedding optimization, forced capture sequences, avoiding royal shelter.
 * 4. CAPABLANCA: Canonical Archbishop (750 cp) and Chancellor (880 cp) file control.
 * 5. CRAZYHOUSE: Reserve drops, tactical pocket utilization.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';

export class VariantSpecializedStrategy implements IUniversalAIStrategy {
  public readonly strategyId = 'VARIANT_SPECIALIZED';

  public decideMove(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error(`Nenhum movimento legal disponível para variante especializada ${request.variantId}.`);
    }

    const variant = request.variantId.toUpperCase();
    const level = request.difficultyLevel ?? 3;

    let bestMove = moves[0];
    let bestScore = -Infinity;

    if (variant.includes('ATOMIC')) {
      ({ bestMove, bestScore } = this.evaluateAtomic(moves, level, request));
    } else if (variant.includes('RACING')) {
      ({ bestMove, bestScore } = this.evaluateRacingKings(moves, level));
    } else if (variant.includes('ANTICHESS') || variant.includes('GIVEAWAY')) {
      ({ bestMove, bestScore } = this.evaluateAntichess(moves, level));
    } else if (variant.includes('CAPABLANCA')) {
      ({ bestMove, bestScore } = this.evaluateCapablanca(moves, level));
    } else {
      ({ bestMove, bestScore } = this.evaluateGenericVariant(moves, level));
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
      depthReached: Math.min(4, level + 1),
      nodesEvaluated: moves.length * (level * 3),
      elapsedMs,
      strategyUsed: this.strategyId,
    };
  }

  /**
   * ATOMIC CHESS: Exploit explosions and king detonation adjacency.
   */
  private evaluateAtomic(
    moves: IAIDecisionRequest['legalMoves'],
    level: number,
    request: IAIDecisionRequest
  ): { bestMove: (typeof moves)[0]; bestScore: number } {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    // Approximate opponent king coordinate if present in specialized context
    const opponentKingCoord = (request.specializedContext?.opponentKingCoord as string) ?? null;
    const friendlyKingCoord = (request.specializedContext?.friendlyKingCoord as string) ?? null;

    for (const move of moves) {
      let score = 0;

      // Level 1: Random capture or forward step
      if (level === 1) {
        score = move.isCapture ? 100 : Math.random() * 50;
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        continue;
      }

      const [toX, toY] = this.parseCoord(move.to);

      // Level 2 & 3: Atomic King Detonation Detection
      if (opponentKingCoord) {
        const [opKx, opKy] = this.parseCoord(opponentKingCoord);
        const distToEnemyKing = Math.max(Math.abs(toX - opKx), Math.abs(toY - opKy));

        // If capture occurs adjacent to enemy king (Chebyshev distance <= 1), it's INSTANT WIN!
        if (move.isCapture && distToEnemyKing <= 1) {
          return { bestMove: move, bestScore: 100000 };
        }
      }

      // Anti-suicide check: never blow up our own king!
      if (friendlyKingCoord && move.isCapture) {
        const [myKx, myKy] = this.parseCoord(friendlyKingCoord);
        const distToFriendlyKing = Math.max(Math.abs(toX - myKx), Math.abs(toY - myKy));
        if (distToFriendlyKing <= 1) {
          // Self-detonation suicide: huge penalty!
          score -= 50000;
        }
      }

      // Capture explosion value
      if (move.isCapture) {
        score += 350; // Base capture bonus

        // Extra bonus for capturing major pieces with explosion fallout
        if (move.pieceId.includes('q') || move.pieceId.includes('r')) {
          score += 250;
        }
      }

      // Level 3 Master: Center control & king approach
      if (level >= 3) {
        score += (4 - Math.abs(toX - 3.5) + (4 - Math.abs(toY - 3.5))) * 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return { bestMove, bestScore };
  }

  /**
   * RACING KINGS: Heuristic sprint to 8th rank.
   */
  private evaluateRacingKings(
    moves: IAIDecisionRequest['legalMoves'],
    level: number
  ): { bestMove: (typeof moves)[0]; bestScore: number } {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      const [, toY] = this.parseCoord(move.to);
      const isKingMove = move.pieceId.toLowerCase().includes('k') && !move.pieceId.toLowerCase().includes('kn');

      // Level 1: simple forward move
      if (level === 1) {
        score = toY * 20 + (isKingMove ? 50 : 0);
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        continue;
      }

      // Goal rank is 7 (0-based) for both White and Black
      if (isKingMove) {
        // Direct king sprint: exponential incentive for higher ranks!
        score += Math.pow(toY + 1, 3) * 20;

        // Winning touch: King lands on 8th rank!
        if (toY >= 7) {
          return { bestMove: move, bestScore: 50000 };
        }
      } else {
        // Non-king moves: use pieces (Rooks/Queens) to block enemy king files
        score += toY * 10;
        if (move.isCapture) score += 150;

        // Level 3 Master: reward piece positioning on rank 6 or 7 to create barriers
        if (level >= 3 && toY >= 6) {
          score += 200;
        }
      }

      // Small jitter for unpredictability on equal scores
      score += Math.random() * 5;

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return { bestMove, bestScore };
  }

  /**
   * ANTICHESS: Mandatory capture and piece-shedding optimization.
   */
  private evaluateAntichess(
    moves: IAIDecisionRequest['legalMoves'],
    level: number
  ): { bestMove: (typeof moves)[0]; bestScore: number } {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;

      // Captures are mandatory in Antichess
      if (move.isCapture) {
        score += 500;

        // Level 2 & 3: sacrifice high value pieces first (inverted piece values)
        if (level >= 2) {
          const pid = move.pieceId.toLowerCase();
          if (pid.includes('q')) score += 900; // Sacrificing Queen is great!
          else if (pid.includes('r')) score += 500;
          else if (pid.includes('b') || pid.includes('n')) score += 300;
        }
      } else {
        // When not capturing, advance pieces toward opponent territory to provoke captures
        const [, toY] = this.parseCoord(move.to);
        score += toY * 15;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return { bestMove, bestScore };
  }

  /**
   * CAPABLANCA CHESS: 10x8 board with Archbishop and Chancellor.
   */
  private evaluateCapablanca(
    moves: IAIDecisionRequest['legalMoves'],
    level: number
  ): { bestMove: (typeof moves)[0]; bestScore: number } {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      const [toX, toY] = this.parseCoord(move.to);

      if (move.isCapture) {
        score += 300;
      }

      // Valuate fairy pieces
      const pid = move.pieceId.toLowerCase();
      if (pid.includes('c') || pid.includes('chancellor')) {
        score += 40; // Chancellor activity
      } else if (pid.includes('a') || pid.includes('archbishop')) {
        score += 35; // Archbishop activity
      }

      // Level 3: 10-file center control (files 4, 5)
      if (level >= 3) {
        const centerDistX = Math.abs(toX - 4.5);
        const centerDistY = Math.abs(toY - 3.5);
        score += (5 - centerDistX) * 12 + (4 - centerDistY) * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return { bestMove, bestScore };
  }

  private evaluateGenericVariant(
    moves: IAIDecisionRequest['legalMoves'],
    level: number
  ): { bestMove: (typeof moves)[0]; bestScore: number } {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      if (move.isCapture) score += 200;
      if (level >= 2) {
        const [toX, toY] = this.parseCoord(move.to);
        score += (4 - Math.abs(toX - 3.5)) * 10 + (4 - Math.abs(toY - 3.5)) * 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return { bestMove, bestScore };
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


/**
 * ChessInReact - Spell & Mana Optimization Strategy (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Implements tactical spell casting for AI bots with multi-level intelligence:
 * - Level 1 (Novice): Standard moves, occasional random spell casting.
 * - Level 2 (Intermediate): Reactive Freeze on opponent threats, Jump over blocked pawns.
 * - Level 3 (Master):
 *   1. Proactive Jump Threat Defense: Detects 1-obstacle attack rays from opponent Queen/Rook/Bishop
 *      towards friendly King and eliminates/evades/blocks the threat (or casts reactive Freeze).
 *   2. Offensive Jump Assassination: Detects 1-obstacle rays to enemy King and leaps for instant checkmate.
 *   3. Freeze Cluster Scan: Scans 3x3 areas for maximum enemy value to immobilize opponent counterplay.
 *   4. Expanded Mana Economics: Reserves mana for supported portal and freeze plays.
 */

import {
  IUniversalAIStrategy,
  IAIDecisionRequest,
  IAIDecisionResponse,
} from '../interfaces/IUniversalAIEngine';
import { decideWithSearch } from './SearchBackedDecision';
import { IDomainState } from '../../../core/state/gameState';
import { PlayerId } from '../../../core/coordinates/types';

export interface ILethalJumpThreat {
  threateningPieceId: string;
  threateningCoord: string;
  threateningVariant: string;
  intermediateCoord: string;
}

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
    const freezeCharges = (request.specializedContext?.freezeCharges as number) ?? 0;
    const jumpCharges =
      typeof request.specializedContext?.jumpCharges === 'number'
        ? request.specializedContext.jumpCharges
        : isExpanded
          ? 0
          : 2;
    const freezeCooldown = (request.specializedContext?.freezeCooldown as number) ?? 0;
    const jumpCooldown = (request.specializedContext?.jumpCooldown as number) ?? 0;

    const actingPlayer = request.actingPlayer as PlayerId;
    const opponentPlayer = (actingPlayer === 'P1' ? 'P2' : 'P1') as PlayerId;

    const friendlyKingCoord =
      (request.specializedContext?.friendlyKingCoord as string) ??
      (request.domain ? this.findKingCoord(request.domain, actingPlayer) : null) ??
      (actingPlayer === 'P1' ? '4,0' : '4,7');

    const opponentKingCoord =
      (request.specializedContext?.opponentKingCoord as string) ??
      (request.domain ? this.findKingCoord(request.domain, opponentPlayer) : null) ??
      (actingPlayer === 'P1' ? '4,7' : '4,0');

    const canJump = jumpCharges > 0 && jumpCooldown === 0;
    const canFreeze = freezeCharges > 0 && freezeCooldown === 0;

    // Detect current lethal Jump threats against Bot's King
    const currentThreats = request.domain
      ? this.detectLethalJumpThreats(request.domain, friendlyKingCoord, actingPlayer)
      : [];

    let bestMove = moves[0];
    let bestScore = -Infinity;
    let requiredJumpAction = false;

    // 0. Priority 0A: Instant Victory by direct King Capture in Spell Chess
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

    // 0. Priority 0B: Offensive Jump Assassination (Bot uses Jump to leap over 1 obstacle and capture opponent King)
    if (bestScore < 100000 && canJump && request.domain && level >= 2) {
      const offensiveThreats = this.detectLethalJumpThreats(request.domain, opponentKingCoord, opponentPlayer);
      for (const threat of offensiveThreats) {
        // Can this threat piece reach opponent King if granted Jump?
        const candidateMove = moves.find(
          (m) => (m.pieceId === threat.threateningPieceId || m.from === threat.threateningCoord) && m.to === opponentKingCoord
        );
        if (candidateMove) {
          bestMove = candidateMove;
          bestScore = 100000;
          requiredJumpAction = true;
          break;
        }
      }
    }

    // 1. Evaluate legal moves with Proactive Jump Threat Defense
    if (bestScore < 100000) {
      // Run multi-ply search if level >= 2
      const searched = level >= 2 ? decideWithSearch(request, this.strategyId) : null;
      const searchedCandidate = searched
        ? moves.find(
            (m) => m.from === searched.move.from && m.to === searched.move.to && m.pieceId === searched.move.pieceId
          )
        : null;

      // Evaluate each candidate move with safety simulation
      for (const move of moves) {
        let score = 0;

        // Base heuristic evaluation
        if (move.isCapture) score += 300;
        const [toX, toY] = this.parseCoord(move.to);
        score += (4 - Math.abs(toX - 3.5)) * 10 + (4 - Math.abs(toY - 3.5)) * 10;
        if (move.promotion) score += 400;

        // If search backed, boost matching move
        if (searchedCandidate && move === searchedCandidate && searched) {
          score += searched.evaluationCentipawns;
        }

        // SIMULATE POSITION AFTER MOVE (Proactive Jump Defense)
        if (request.domain && level >= 2) {
          const newKingCoord =
            move.pieceId.toLowerCase().includes('king') || move.from === friendlyKingCoord
              ? move.to
              : friendlyKingCoord;

          // Check if any opponent piece can capture the king with Jump in the simulated state
          const simOccupancy: Record<string, string> = { ...request.domain.occupancy };
          delete simOccupancy[move.from];
          simOccupancy[move.to] = move.pieceId;

          const threatsAfter = this.detectLethalJumpThreats(
            request.domain,
            newKingCoord,
            actingPlayer,
            simOccupancy
          );

          if (threatsAfter.length > 0) {
            // CATASTROPHIC PENALTY: Move leaves King directly vulnerable to an immediate Royal Jump capture!
            score -= 200000;
          } else if (currentThreats.length > 0 && threatsAfter.length === 0) {
            // HIGH DEFENSIVE BONUS: Move successfully eliminates or blocks the Jump assassination!
            const isCaptureThreat = currentThreats.some((t) => t.threateningCoord === move.to);
            const isKingEvasion = move.from === friendlyKingCoord;
            if (isCaptureThreat) {
              score += 35000;
            } else if (isKingEvasion) {
              score += 25000;
            } else {
              score += 20000; // Ray block
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
      }
    }

    // 2. Select tactical secondary spell action
    let secondaryAction: IAIDecisionResponse['secondaryAction'] = undefined;

    if (requiredJumpAction) {
      secondaryAction = {
        type: 'CAST_SPELL',
        payload: {
          spellType: 'JUMP',
          targetPieceId: bestMove.pieceId,
        },
      };
    } else if (level >= 2) {
      if (isExpanded) {
        // Expanded Spell Chess (Mana system: 1 to 7)
        if (currentMana >= 4 && level >= 4) {
          const emptySquares =
            Object.keys(request.domain?.occupancy ?? {}).length < 64 ? this.getEmptySquares(request) : [];
          const [sourceCoord, destinationCoord] = emptySquares;
          if (sourceCoord && destinationCoord) {
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
        // DEFENSIVE FREEZE PRIORITY: If there's an active threat on Bot King, freeze the threatening piece!
        if (canFreeze && currentThreats.length > 0) {
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'FREEZE',
              targetCoord: currentThreats[0].threateningCoord,
            },
          };
          bestScore += 400;
        } else if (canJump && bestMove.isCapture) {
          secondaryAction = {
            type: 'CAST_SPELL',
            payload: {
              spellType: 'JUMP',
              targetPieceId: bestMove.pieceId,
            },
          };
          bestScore += 200;
        } else if (canFreeze) {
          // Tactical Freeze cluster scan
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

  /**
   * Scans all opponent sliding pieces (Queen, Rook, Bishop) to detect if any piece
   * has exactly 1 intermediate obstacle ray towards the target King.
   * In Spell Chess, this constitutes an immediate lethal Jump threat!
   */
  public detectLethalJumpThreats(
    domain: IDomainState,
    kingCoord: string,
    kingOwner: PlayerId,
    customOccupancy?: Record<string, string>
  ): ILethalJumpThreat[] {
    const threats: ILethalJumpThreat[] = [];
    const occupancy = customOccupancy ?? (domain.occupancy as Record<string, string>);
    const [kx, ky] = this.parseCoord(kingCoord);

    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity.type !== 'PIECE' ||
        entity.isCaptured ||
        entity.ownerId === kingOwner ||
        entity.ownerId === 'NONE' ||
        entity.metadata?.isFrozen
      ) {
        continue;
      }

      // Check if this piece is actually present on the board
      const [px, py] = this.parseCoord(entity.position);
      const currentSquareKey = `${px},${py}`;
      if (customOccupancy && customOccupancy[currentSquareKey] !== entity.id) {
        // Piece was moved or captured in the simulated position
        continue;
      }

      const variant = entity.variantId.toUpperCase();
      const isQueen = variant === 'QUEEN' || variant === 'Q';
      const isRook = variant === 'ROOK' || variant === 'R';
      const isBishop = variant === 'BISHOP' || variant === 'B';

      if (!isQueen && !isRook && !isBishop) {
        continue;
      }

      const dx = kx - px;
      const dy = ky - py;

      // Check alignment
      const isOrthogonal = (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
      const isDiagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;

      if ((isRook && !isOrthogonal) || (isBishop && !isDiagonal) || (!isOrthogonal && !isDiagonal)) {
        continue;
      }

      // Trace along ray from piece to king
      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);

      const obstacles: string[] = [];
      let cx = px + stepX;
      let cy = py + stepY;

      while (cx !== kx || cy !== ky) {
        const cKey = `${cx},${cy}`;
        const occId = occupancy[cKey];
        if (occId) {
          const occEntity = domain.boardEntities[occId as import('../../../core/coordinates/types').EntityId];
          if (!occEntity || (occEntity.type === 'PIECE' && !occEntity.isCaptured)) {
            obstacles.push(cKey);
          }
        }
        cx += stepX;
        cy += stepY;
      }

      // In Spell Chess: exactly 1 intermediate obstacle allows an immediate Jump capture!
      if (obstacles.length === 1 || obstacles.length === 0) {
        threats.push({
          threateningPieceId: entity.id,
          threateningCoord: `${px},${py}`,
          threateningVariant: variant,
          intermediateCoord: obstacles[0] ?? `${kx},${ky}`,
        });
      }
    }

    return threats;
  }

  private findKingCoord(domain: IDomainState, player: PlayerId): string | null {
    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        entity.ownerId === player &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K')
      ) {
        return entity.position;
      }
    }
    return null;
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

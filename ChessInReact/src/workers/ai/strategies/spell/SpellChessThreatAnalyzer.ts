/**
 * ChessInReact - Spell Chess Threat Analyzer (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Geometric ray tracing and tactical threat detection for Spell Chess:
 * - Detects 0-obstacle direct threats to royals and high-value pieces.
 * - Detects 1-obstacle Jump rays where an intermediate piece can be leaped over.
 * - Identifies the exact obstacle square for offensive or defensive Jump tactics.
 */

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, CoordinateKey, EntityId } from '../../../../core/coordinates/types';
import { CheckValidator } from '../../../../engine/rules/CheckValidator';
import { ITopology } from '../../../../core/topology/types';

export interface IJumpRayThreat {
  readonly attackingPieceId: string;
  readonly attackingCoord: string;
  readonly targetCoord: string;
  readonly obstacleCoord: string;
  readonly obstaclePieceId: string;
  readonly attackingVariant: string;
}

export class SpellChessThreatAnalyzer {
  public static parseCoord(coord: string): [number, number] {
    const parts = coord.split(',').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0];
  }

  public static toCoord(x: number, y: number): string {
    return `${x},${y}`;
  }

  /**
   * Finds the coordinate of a player's King in the domain.
   */
  public static findKingCoord(domain: IDomainState, owner: PlayerId): string | null {
    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity &&
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        entity.ownerId === owner &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K')
      ) {
        return entity.position;
      }
    }
    return null;
  }

  /**
   * Scans all opponent sliding pieces (Queen, Rook, Bishop) to find any rays
   * directed at targetCoord having EXACTLY 1 intermediate obstacle.
   */
  public static detectOneObstacleJumpRays(
    domain: IDomainState,
    targetCoord: string,
    targetOwner: PlayerId,
    customOccupancy?: Record<string, string>
  ): IJumpRayThreat[] {
    const threats: IJumpRayThreat[] = [];
    const occ = customOccupancy ?? (domain.occupancy as Record<string, string>);
    const [tx, ty] = this.parseCoord(targetCoord);

    for (const entity of Object.values(domain.boardEntities)) {
      if (
        !entity ||
        entity.type !== 'PIECE' ||
        entity.isCaptured ||
        entity.ownerId === targetOwner ||
        entity.ownerId === 'NONE' ||
        entity.metadata?.isFrozen
      ) {
        continue;
      }

      const piecePos = entity.position;
      if (customOccupancy && customOccupancy[piecePos] !== entity.id) {
        continue;
      }

      const variant = entity.variantId.toUpperCase();
      const isQueen = variant === 'QUEEN' || variant === 'Q';
      const isRook = variant === 'ROOK' || variant === 'R';
      const isBishop = variant === 'BISHOP' || variant === 'B';

      if (!isQueen && !isRook && !isBishop) continue;

      const [px, py] = this.parseCoord(piecePos);
      const dx = tx - px;
      const dy = ty - py;

      const isOrthogonal = (dx === 0 && dy !== 0) || (dy === 0 && dx !== 0);
      const isDiagonal = Math.abs(dx) === Math.abs(dy) && dx !== 0;

      if ((isRook && !isOrthogonal) || (isBishop && !isDiagonal) || (!isOrthogonal && !isDiagonal)) {
        continue;
      }

      const stepX = Math.sign(dx);
      const stepY = Math.sign(dy);

      const obstacles: Array<{ coord: string; pieceId: string }> = [];
      let cx = px + stepX;
      let cy = py + stepY;

      while (cx !== tx || cy !== ty) {
        const curCoord = this.toCoord(cx, cy);
        const occId = occ[curCoord];
        if (occId && !domain.boardEntities[occId as EntityId]?.metadata?.canBeJumpedOver) {
          obstacles.push({ coord: curCoord, pieceId: occId });
        }
        cx += stepX;
        cy += stepY;
      }

      if (obstacles.length === 1 && domain.boardEntities[obstacles[0].pieceId as EntityId]?.type === 'PIECE') {
        threats.push({
          attackingPieceId: entity.id,
          attackingCoord: piecePos,
          targetCoord,
          obstacleCoord: obstacles[0].coord,
          obstaclePieceId: obstacles[0].pieceId,
          attackingVariant: variant,
        });
      }
    }

    return threats;
  }

  /**
   * Detects all pieces delivering direct attack / check against targetCoord.
   */
  public static detectDirectAttacks(
    domain: IDomainState,
    targetCoord: string,
    attackerOwner: PlayerId,
    topology: ITopology
  ): Array<{ attackingPieceId: string; attackingCoord: string; variantId: string }> {
    const attackers: Array<{ attackingPieceId: string; attackingCoord: string; variantId: string }> = [];
    const targetKey = targetCoord as CoordinateKey;

    for (const entity of Object.values(domain.boardEntities)) {
      if (
        !entity ||
        entity.type !== 'PIECE' ||
        entity.isCaptured ||
        entity.ownerId !== attackerOwner ||
        entity.metadata?.isFrozen
      ) {
        continue;
      }

      if (CheckValidator.isSquareAttacked(targetKey, attackerOwner, domain, topology)) {
        // Confirm if this piece specifically attacks targetKey
        // Create a test domain without this piece to see if attack disappears
        const testDomain: IDomainState = {
          ...domain,
          occupancy: { ...domain.occupancy },
          boardEntities: { ...domain.boardEntities },
        };
        delete testDomain.occupancy[entity.position];
        delete testDomain.boardEntities[entity.id as EntityId];

        const stillAttacked = CheckValidator.isSquareAttacked(targetKey, attackerOwner, testDomain, topology);
        if (!stillAttacked) {
          attackers.push({
            attackingPieceId: entity.id,
            attackingCoord: entity.position,
            variantId: entity.variantId,
          });
        }
      }
    }

    return attackers;
  }

  /**
   * Checks if a straight ray between from and to strictly passes through target square.
   */
  public static rayPassesThroughSquare(from: string, to: string, target: string): boolean {
    const [fx, fy] = this.parseCoord(from);
    const [tx, ty] = this.parseCoord(to);
    const [mx, my] = this.parseCoord(target);

    const dx = tx - fx;
    const dy = ty - fy;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    if (stepX === 0 && stepY === 0) return false;
    if (stepX !== 0 && stepY !== 0 && Math.abs(dx) !== Math.abs(dy)) return false;

    let curX = fx + stepX;
    let curY = fy + stepY;
    while (curX !== tx || curY !== ty) {
      if (curX === mx && curY === my) return true;
      curX += stepX;
      curY += stepY;
    }
    return false;
  }
}

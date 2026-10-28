import { CoordinateKey, EntityId, PlayerId } from '../../core/coordinates/types';
import { DirectionIndex, ITopology } from '../../core/topology/types';
import { IDomainState } from '../../core/state/gameState';
import { IPieceEntity } from '../../core/entities/types';
import { parseCoord, toCoordKey } from './utils/CoordinateHelper';

const KNIGHT_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
];

const ORTHOGONAL_DIRECTIONS: readonly number[] = [
  DirectionIndex.NORTH,
  DirectionIndex.EAST,
  DirectionIndex.SOUTH,
  DirectionIndex.WEST,
];

const DIAGONAL_DIRECTIONS: readonly number[] = [
  DirectionIndex.NORTHEAST,
  DirectionIndex.SOUTHEAST,
  DirectionIndex.SOUTHWEST,
  DirectionIndex.NORTHWEST,
];

export class CheckValidator {
  /**
   * Universal Reverse Raycasting check detection (RF-04, RNF-15).
   * Checks if targetCoord is attacked by any piece belonging to attackerPlayerId.
   */
  public static isSquareAttacked(
    targetCoord: CoordinateKey,
    attackerPlayerId: PlayerId,
    state: IDomainState,
    topology: ITopology
  ): boolean {
    const targetParsed = parseCoord(targetCoord);
    if (!targetParsed) return false;

    // 1. Reverse Raycasting (Orthogonal & Diagonal)
    if (topology.type === 'SQUARE') {
      const tx = targetParsed.x;
      const ty = targetParsed.y;

      // North
      for (let y = ty + 1; y < 8; y++) {
        const occId = state.occupancy[toCoordKey(tx, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (y === ty + 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            break;
          }
        }
      }
      // South
      for (let y = ty - 1; y >= 0; y--) {
        const occId = state.occupancy[toCoordKey(tx, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (y === ty - 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            break;
          }
        }
      }
      // East
      for (let x = tx + 1; x < 8; x++) {
        const occId = state.occupancy[toCoordKey(x, ty)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            break;
          }
        }
      }
      // West
      for (let x = tx - 1; x >= 0; x--) {
        const occId = state.occupancy[toCoordKey(x, ty)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            break;
          }
        }
      }
      // Northeast
      for (let x = tx + 1, y = ty + 1; x < 8 && y < 8; x++, y++) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            break;
          }
        }
      }
      // Northwest
      for (let x = tx - 1, y = ty + 1; x >= 0 && y < 8; x--, y++) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            break;
          }
        }
      }
      // Southeast
      for (let x = tx + 1, y = ty - 1; x < 8 && y >= 0; x++, y--) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            break;
          }
        }
      }
      // Southwest
      for (let x = tx - 1, y = ty - 1; x >= 0 && y >= 0; x--, y--) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const piece = state.boardEntities[occId] as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            break;
          }
        }
      }
    } else {
      // Non-square generic raycasting
      for (const dir of ORTHOGONAL_DIRECTIONS) {
        let current = targetCoord;
        let dist = 0;
        while (dist < 8) {
          const next = topology.getNeighbor(current, dir);
          if (!next || !topology.isValidCoordinate(next)) break;
          const occId = state.occupancy[next];
          if (occId) {
            const piece = state.boardEntities[occId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
              if (piece.ownerId === attackerPlayerId) {
                const v = piece.variantId.toUpperCase();
                if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
                if (dist === 0 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
              }
              break;
            }
          }
          current = next;
          dist++;
        }
      }
      for (const dir of DIAGONAL_DIRECTIONS) {
        let current = targetCoord;
        let dist = 0;
        while (dist < 8) {
          const next = topology.getNeighbor(current, dir);
          if (!next || !topology.isValidCoordinate(next)) break;
          const occId = state.occupancy[next];
          if (occId) {
            const piece = state.boardEntities[occId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
              if (piece.ownerId === attackerPlayerId) {
                const v = piece.variantId.toUpperCase();
                if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
                if (dist === 0 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
              }
              break;
            }
          }
          current = next;
          dist++;
        }
      }
    }

    // 3. Knight jumps (checking for enemy KNIGHT, AMAZON, CHANCELLOR, ARCHBISHOP)
    for (const [dx, dy] of KNIGHT_OFFSETS) {
      const knightCoord = toCoordKey(targetParsed.x + dx, targetParsed.y + dy);
      if (!topology.isValidCoordinate(knightCoord)) continue;

      const occId = state.occupancy[knightCoord];
      if (occId) {
        const piece = state.boardEntities[occId] as IPieceEntity | undefined;
        if (piece && piece.type === 'PIECE' && !piece.isCaptured && piece.ownerId === attackerPlayerId) {
          const v = piece.variantId.toUpperCase();
          if (
            v === 'KNIGHT' ||
            v === 'N' ||
            v === 'AMAZON' ||
            v === 'CHANCELLOR' ||
            v === 'ARCHBISHOP' ||
            v === 'QN' ||
            v === 'RN' ||
            v === 'BN'
          ) {
            return true;
          }
        }
      }
    }

    // 4. Pawn attacks
    // For an attacker pawn to attack targetCoord:
    // If attacker is White (moves +y), pawn must be at targetCoord.y - 1, targetCoord.x ± 1
    // If attacker is Black (moves -y), pawn must be at targetCoord.y + 1, targetCoord.x ± 1
    const isAttackerWhite = attackerPlayerId === 'P1';
    const pawnSourceY = isAttackerWhite ? targetParsed.y - 1 : targetParsed.y + 1;

    for (const pawnDx of [-1, 1]) {
      const pawnCoord = toCoordKey(targetParsed.x + pawnDx, pawnSourceY);
      if (!topology.isValidCoordinate(pawnCoord)) continue;

      const occId = state.occupancy[pawnCoord];
      if (occId) {
        const piece = state.boardEntities[occId] as IPieceEntity | undefined;
        if (piece && piece.type === 'PIECE' && !piece.isCaptured && piece.ownerId === attackerPlayerId) {
          const v = piece.variantId.toUpperCase();
          if (v === 'PAWN') {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Finds the royal piece (King) belonging to playerId.
   */
  public static findRoyalPiece(playerId: PlayerId, state: IDomainState): IPieceEntity | null {
    for (const id in state.boardEntities) {
      const entity = state.boardEntities[id as EntityId];
      if (
        entity &&
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        entity.ownerId === playerId &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K')
      ) {
        return entity;
      }
    }
    return null;
  }

  /**
   * Checks if the royal piece of playerId is currently in check.
   */
  public static isRoyalInCheck(
    playerId: PlayerId,
    state: IDomainState,
    topology: ITopology
  ): boolean {
    const king = this.findRoyalPiece(playerId, state);
    if (!king) return false;

    // Detect attacker: any other player on board
    const attackerId: PlayerId = playerId === 'P1' ? 'P2' : 'P1';
    return this.isSquareAttacked(king.position, attackerId, state, topology);
  }
}

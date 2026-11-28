import { CoordinateKey, EntityId, PlayerId } from '../../core/coordinates/types';
import { ITopology } from '../../core/topology/types';
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

    // 1. Reverse Raycasting (Orthogonal & Diagonal)
    const isCubic = Boolean((topology as { readonly isCubic?: boolean }).isCubic);
    const isToroidal = Boolean((topology as { readonly isToroidal?: boolean }).isToroidal);

    if (isCubic || isToroidal) {
      // Topological raycasting for non-flat manifolds (Cube, Torus)
      const orthDirs = [0, 2, 4, 6];
      for (const dir of orthDirs) {
        let jumpedBlockers = 0;
        const ray = topology.getRay(targetCoord, dir);
        for (let i = 0; i < ray.length; i++) {
          const coord = ray[i];
          const occId = state.occupancy[coord];
          if (!occId) continue;
          const raw = state.boardEntities[occId];
          if (raw?.type === 'OBSTACLE') break;
          const piece = raw as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (i === 0 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }

      const diagDirs = [1, 3, 5, 7];
      for (const dir of diagDirs) {
        let jumpedBlockers = 0;
        const ray = topology.getRay(targetCoord, dir);
        for (let i = 0; i < ray.length; i++) {
          const coord = ray[i];
          const occId = state.occupancy[coord];
          if (!occId) continue;
          const raw = state.boardEntities[occId];
          if (raw?.type === 'OBSTACLE') break;
          const piece = raw as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (i === 0 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }

      // Topological knight leaps (2 steps dirA, 1 step dirB)
      for (const dA of [0, 2, 4, 6]) {
        const s1 = topology.getNeighbor(targetCoord, dA);
        const s2 = s1 ? topology.getNeighbor(s1, dA) : null;
        if (!s2) continue;
        for (const dB of [(dA + 2) % 8, (dA + 6) % 8]) {
          const kc = topology.getNeighbor(s2, dB);
          if (!kc) continue;
          const occId = state.occupancy[kc];
          if (occId) {
            const piece = state.boardEntities[occId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE' && !piece.isCaptured && !piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'KNIGHT' || v === 'N' || v === 'AMAZON' || v === 'CHANCELLOR' || v === 'ARCHBISHOP') return true;
            }
          }
        }
      }

      // Topological pawn attacks: scan attacker pawns
      for (const id in state.boardEntities) {
        const piece = state.boardEntities[id as EntityId] as IPieceEntity | undefined;
        if (
          piece &&
          piece.type === 'PIECE' &&
          !piece.isCaptured &&
          !piece.metadata?.isFrozen &&
          piece.ownerId === attackerPlayerId
        ) {
          const v = piece.variantId.toUpperCase();
          if (v === 'PAWN' || v === 'P') {
            const isWhitePawn = piece.ownerId === 'P1';
            const pawnDiagDirs = isWhitePawn ? [7, 1] : [5, 3];
            for (const d of pawnDiagDirs) {
              const attackCoord = topology.getNeighbor(piece.position, d);
              if (attackCoord === targetCoord) return true;
            }
          }
        }
      }

      return false;
    }

    if (topology.type === 'SQUARE') {
      if (!targetParsed) return false;
      const tx = targetParsed.x;
      const ty = targetParsed.y;
      const maxX = (topology as { width?: number }).width ?? 8;
      const maxY = (topology as { height?: number }).height ?? 8;

      let jumpedBlockers = 0;
      // North
      for (let y = ty + 1; y < maxY; y++) {
        const occId = state.occupancy[toCoordKey(tx, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (y === ty + 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // South
      for (let y = ty - 1; y >= 0; y--) {
        const occId = state.occupancy[toCoordKey(tx, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (y === ty - 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // East
      for (let x = tx + 1; x < maxX; x++) {
        const occId = state.occupancy[toCoordKey(x, ty)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // West
      for (let x = tx - 1; x >= 0; x--) {
        const occId = state.occupancy[toCoordKey(x, ty)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // Northeast
      for (let x = tx + 1, y = ty + 1; x < maxX && y < maxY; x++, y++) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // Northwest
      for (let x = tx - 1, y = ty + 1; x >= 0 && y < maxY; x--, y++) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // Southeast
      for (let x = tx + 1, y = ty - 1; x < maxX && y >= 0; x++, y--) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx + 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
      jumpedBlockers = 0;
      // Southwest
      for (let x = tx - 1, y = ty - 1; x >= 0 && y >= 0; x--, y--) {
        const occId = state.occupancy[toCoordKey(x, y)];
        if (occId) {
          const rawEntity = state.boardEntities[occId];
          if (rawEntity?.type === 'OBSTACLE') break;
          const piece = rawEntity as IPieceEntity | undefined;
          if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
            if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
              const v = piece.variantId.toUpperCase();
              if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
              if (x === tx - 1 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
            }
            if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
          }
        }
      }
    } else {
      // Non-square generic raycasting (supports HexTopology edge dirs 0-5 and vertex dirs 6-11)
      const edgeDirs = [0, 1, 2, 3, 4, 5];
      for (const dir of edgeDirs) {
        let jumpedBlockers = 0;
        let current = targetCoord;
        let dist = 0;
        while (dist < 8) {
          const next = topology.getNeighbor(current, dir);
          if (!next || !topology.isValidCoordinate(next)) break;
          const occId = state.occupancy[next];
          if (occId) {
            const piece = state.boardEntities[occId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
              if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
                const v = piece.variantId.toUpperCase();
                if (v === 'ROOK' || v === 'QUEEN' || v === 'R' || v === 'Q' || v === 'CHANCELLOR' || v === 'AMAZON') return true;
                if (dist === 0 && (v === 'KING' || v === 'K' || v === 'WAZIR' || v === 'W')) return true;
              }
              if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
            }
          }
          current = next;
          dist++;
        }
      }
      const diagDirs = [6, 7, 8, 9, 10, 11];
      for (const dir of diagDirs) {
        let jumpedBlockers = 0;
        let current = targetCoord;
        let dist = 0;
        while (dist < 8) {
          const next = topology.getNeighbor(current, dir);
          if (!next || !topology.isValidCoordinate(next)) break;
          const occId = state.occupancy[next];
          if (occId) {
            const piece = state.boardEntities[occId] as IPieceEntity | undefined;
            if (piece && piece.type === 'PIECE' && !piece.isCaptured) {
              if (!piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
                const v = piece.variantId.toUpperCase();
                if (v === 'BISHOP' || v === 'QUEEN' || v === 'B' || v === 'Q' || v === 'ARCHBISHOP' || v === 'AMAZON') return true;
                if (dist === 0 && (v === 'KING' || v === 'K' || v === 'FERZ' || v === 'F')) return true;
              }
              if (!piece.metadata?.canBeJumpedOver || jumpedBlockers++ >= 1) break;
            }
          }
          current = next;
          dist++;
        }
      }
      return false;
    }

    if (!targetParsed) return false;

    // 3. Knight jumps (checking for enemy KNIGHT, AMAZON, CHANCELLOR, ARCHBISHOP)
    for (const [dx, dy] of KNIGHT_OFFSETS) {
      const knightCoord = toCoordKey(targetParsed.x + dx, targetParsed.y + dy);
      if (!topology.isValidCoordinate(knightCoord)) continue;

      const occId = state.occupancy[knightCoord];
      if (occId) {
        const piece = state.boardEntities[occId] as IPieceEntity | undefined;
        if (piece && piece.type === 'PIECE' && !piece.isCaptured && !piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
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
    // Support multi-player orientations and toroidal wrapping:
    const tw = (topology as { readonly width?: number }).width ?? 8;
    const th = (topology as { readonly height?: number }).height ?? 8;

    const wrapCoord = (x: number, y: number): CoordinateKey => {
      let wx = x;
      let wy = y;
      if (isToroidal) {
        wx = ((wx % tw) + tw) % tw;
        wy = ((wy % th) + th) % th;
      }
      return toCoordKey(wx, wy);
    };

    const pawnSourceCandidates: CoordinateKey[] = [];
    const maxBoardSide = Math.max(tw, th);
    if (attackerPlayerId === 'P1') {
      pawnSourceCandidates.push(wrapCoord(targetParsed.x - 1, targetParsed.y - 1));
      pawnSourceCandidates.push(wrapCoord(targetParsed.x + 1, targetParsed.y - 1));
    } else if (attackerPlayerId === 'P2') {
      // 2P: advances down from y+1; 4P West: advances right from x-1
      pawnSourceCandidates.push(wrapCoord(targetParsed.x - 1, targetParsed.y + 1));
      pawnSourceCandidates.push(wrapCoord(targetParsed.x + 1, targetParsed.y + 1));
      // The west-flank square only exists on enlarged multiplayer boards. On 8x8 it
      // would let a black pawn attack backwards and forbid legal White moves.
      if (maxBoardSide > 8) pawnSourceCandidates.push(wrapCoord(targetParsed.x - 1, targetParsed.y - 1));
    } else if (attackerPlayerId === 'P3') {
      pawnSourceCandidates.push(wrapCoord(targetParsed.x - 1, targetParsed.y + 1));
      pawnSourceCandidates.push(wrapCoord(targetParsed.x + 1, targetParsed.y + 1));
    } else if (attackerPlayerId === 'P4') {
      pawnSourceCandidates.push(wrapCoord(targetParsed.x + 1, targetParsed.y - 1));
      pawnSourceCandidates.push(wrapCoord(targetParsed.x + 1, targetParsed.y + 1));
    } else {
      // General multiplayer radial/angular fallback
      for (const dx of [-1, 1]) {
        for (const dy of [-1, 1]) {
          pawnSourceCandidates.push(wrapCoord(targetParsed.x + dx, targetParsed.y + dy));
        }
      }
    }

    for (const pawnCoord of pawnSourceCandidates) {
      if (!topology.isValidCoordinate(pawnCoord)) continue;

      const occId = state.occupancy[pawnCoord];
      if (occId) {
        const piece = state.boardEntities[occId] as IPieceEntity | undefined;
        if (piece && piece.type === 'PIECE' && !piece.isCaptured && !piece.metadata?.isFrozen && piece.ownerId === attackerPlayerId) {
          const v = piece.variantId.toUpperCase();
          if (v === 'PAWN' || v === 'P') {
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
        (
          entity.variantId.toUpperCase() === 'KING' ||
          entity.variantId.toUpperCase() === 'K' ||
          entity.variantId.toUpperCase() === 'GENERAL' ||
          entity.variantId.toUpperCase() === 'GYOKU' ||
          entity.variantId.toUpperCase() === 'JIANG' ||
          entity.variantId.toUpperCase() === 'SHUAI'
        )
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
    const enemyOwners = new Set<PlayerId>();
    for (const id in state.boardEntities) {
      const entity = state.boardEntities[id as EntityId];
      if (
        entity &&
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        entity.ownerId !== playerId &&
        entity.ownerId !== 'NONE'
      ) {
        enemyOwners.add(entity.ownerId);
      }
    }
    if (enemyOwners.size === 0) {
      enemyOwners.add(playerId === 'P1' ? 'P2' : 'P1');
    }
    for (const attackerId of enemyOwners) {
      if (this.isSquareAttacked(king.position, attackerId, state, topology)) {
        return true;
      }
    }
    return false;
  }
}

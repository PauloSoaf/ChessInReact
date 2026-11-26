import { CoordinateKey, EntityId, PlayerId } from '../../core/coordinates/types';
import { ITopology } from '../../core/topology/types';
import { IDomainState } from '../../core/state/gameState';
import { IPieceEntity } from '../../core/entities/types';
import {
  IGameResult,
  ILegalMove,
  IMoveIntent,
  IValidationResult,
  IVariantConfiguration,
  PieceVariantId,
} from './interfaces/IRulesContracts';
import { BetzaParser } from './behaviors/BetzaParser';
import { CheckValidator } from './CheckValidator';
import { GameOverDetector } from './GameOverDetector';
import { VariantRegistry } from './VariantRegistry';
import { VariantMapConfig } from '../variants/VariantMapConfig';
import { AtomicExplosionModifier } from '../variants/modifiers/AtomicExplosionModifier';
import { parseCoord, toCoordKey, toCubicCoordKey } from './utils/CoordinateHelper';

const PROMOTION_OPTIONS: readonly PieceVariantId[] = ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'];

export class RulesEngine {
  /**
   * Universal move validation for client and server (RF-01, RNF-02 < 0.05ms).
   */
  public static validateMove(
    state: IDomainState,
    intent: IMoveIntent,
    topology: ITopology,
    variantConfig?: IVariantConfiguration
  ): IValidationResult {
    variantConfig = variantConfig ?? VariantRegistry.resolveRulesConfig(state.variantId);
    // 0. Game Over check (RF-01, RF-05)
    if (state.isGameOver || state.winnerId !== null) {
      return {
        valid: false,
        code: 'GAME_OVER',
        reason: 'Game is already over. No further moves are permitted.',
      };
    }

    // 1. Entity existence & piece checks
    const piece = state.boardEntities[intent.pieceId] as IPieceEntity | undefined;
    if (!piece) {
      return { valid: false, code: 'ENTITY_NOT_FOUND', reason: `Entity "${intent.pieceId}" not found.` };
    }
    if (piece.type !== 'PIECE') {
      return { valid: false, code: 'NOT_A_PIECE', reason: `Entity "${intent.pieceId}" is not a PIECE.` };
    }
    if (piece.isCaptured) {
      return { valid: false, code: 'PIECE_IS_CAPTURED', reason: `Piece "${intent.pieceId}" is already captured.` };
    }
    if (piece.metadata?.isFrozen) {
      return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: `Piece "${intent.pieceId}" is frozen.` };
    }
    const originTerrainId = state.terrain?.[piece.position];
    const originTerrain = originTerrainId ? state.boardEntities[originTerrainId] : undefined;
    if (originTerrain?.type === 'TERRAIN' && originTerrain.variantId === 'FROZEN') {
      return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: `Origin square ${piece.position} is frozen.` };
    }

    // 2. Ownership & Turn
    const actingPlayer = intent.actingPlayer ?? piece.ownerId;
    if (piece.ownerId !== actingPlayer) {
      return {
        valid: false,
        code: 'NOT_PLAYER_PIECE',
        reason: `Piece belongs to ${piece.ownerId}, not acting player ${actingPlayer}.`,
      };
    }
    if (state.activePlayer !== actingPlayer) {
      return {
        valid: false,
        code: 'NOT_PLAYER_TURN',
        reason: `Active player is ${state.activePlayer}, not ${actingPlayer}.`,
      };
    }

    // 3. Coordinate validity
    if (piece.position !== intent.from || state.occupancy[intent.from] !== intent.pieceId) {
      return {
        valid: false,
        code: 'ORIGIN_MISMATCH',
        reason: `Piece position mismatch at ${intent.from}.`,
      };
    }
    if (intent.from === intent.to) {
      return { valid: false, code: 'ORIGIN_EQUALS_DESTINATION', reason: 'Destination equals origin.' };
    }
    if (!topology.isValidCoordinate(intent.to)) {
      return { valid: false, code: 'DESTINATION_OUT_OF_BOUNDS', reason: `Destination ${intent.to} out of bounds.` };
    }

    const parsedFrom = parseCoord(piece.position);
    const parsedTo = parseCoord(intent.to);
    const boardWidth = (topology as { readonly width?: number }).width ?? 8;
    if (parsedTo && VariantMapConfig.isVoidSquare(state.variantId, parsedTo.x, parsedTo.y, boardWidth)) {
      return { valid: false, code: 'DESTINATION_OUT_OF_BOUNDS', reason: `Destination ${intent.to} is a void cutout square.` };
    }

    const destTerrainId = state.terrain?.[intent.to];
    const destTerrain = destTerrainId ? state.boardEntities[destTerrainId] : undefined;
    if (destTerrain?.type === 'TERRAIN' && destTerrain.variantId === 'FROZEN') {
      return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: `Destination ${intent.to} is frozen.` };
    }

    // 4. Check destination occupancy
    const destOccupantId = state.occupancy[intent.to];
    if (destOccupantId) {
      const rawDest = state.boardEntities[destOccupantId];
      if (rawDest?.type === 'OBSTACLE') {
        return {
          valid: false,
          code: 'GEOMETRICALLY_INVALID',
          reason: `Destination occupied by obstacle ${destOccupantId}.`,
        };
      }
      const destPiece = rawDest as IPieceEntity | undefined;
      if (destPiece && destPiece.type === 'PIECE' && !destPiece.isCaptured) {
        if (destPiece.ownerId === intent.actingPlayer) {
          return {
            valid: false,
            code: 'DESTINATION_FRIENDLY_OCCUPIED',
            reason: `Destination occupied by friendly piece ${destOccupantId}.`,
          };
        }
        if (destPiece.metadata?.isShielded) {
          return {
            valid: false,
            code: 'GEOMETRICALLY_INVALID',
            reason: `Destination piece ${destOccupantId} is protected by Mirror Shield.`,
          };
        }
      }
    }

    // 5. Fast Direct Destination Validation (RNF-02 < 0.05ms)
    const isWhite = piece.ownerId === 'P1';
    const vUpper = piece.variantId.toUpperCase();

    const isPawn = vUpper === 'PAWN' || vUpper === 'P';
    const isKing = vUpper === 'KING' || vUpper === 'K';
    let isReachable = false;
    let isCastling: 'KINGSIDE' | 'QUEENSIDE' | undefined;
    let isEnPassant = false;
    const hasJumpBuff = Boolean(piece.metadata?.hasJump);

    if (isPawn && parsedFrom && parsedTo) {
      const isCubic = Boolean((topology as { readonly isCubic?: boolean }).isCubic);
      const isShogi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('SHOGI') ||
        state.variantId?.toUpperCase().includes('SHOGI')
      );
      const isXiangqi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('XIANGQI') ||
        state.variantId?.toUpperCase().includes('XIANGQI')
      );

      // Multi-directional pawn advancement vector [pdx, pdy]
      let pdx = 0;
      let pdy = isWhite ? 1 : -1;
      if (!isCubic && !isShogi && !isXiangqi) {
        const bw = (topology as { readonly width?: number }).width ?? 8;
        const bh = (topology as { readonly height?: number }).height ?? 8;
        const cx = (bw - 1) / 2;
        const cy = (bh - 1) / 2;

        if (bw > 8 || bh > 8) {
          if (piece.ownerId === 'P3' || (piece.ownerId as string) === 'FACTION_3') {
            pdx = 0;
            pdy = -1; // North flank advances South
          } else if (piece.ownerId === 'P4' || (piece.ownerId as string) === 'FACTION_4') {
            pdx = -1;
            pdy = 0; // East flank advances West
          } else if (piece.ownerId === 'P2' || (piece.ownerId as string) === 'FACTION_2') {
            pdx = 1;
            pdy = 0; // West flank advances East
          } else {
            const diffX = parsedFrom.x - cx;
            const diffY = parsedFrom.y - cy;
            if (Math.abs(diffX) > Math.abs(diffY) + 0.5) {
              pdx = diffX < 0 ? 1 : -1;
              pdy = 0;
            }
          }
        }
      }

      if (isShogi) {
        // Shogi pawn: 1 step straight forward, captures straight forward
        const target = toCoordKey(parsedFrom.x, parsedFrom.y + (isWhite ? 1 : -1));
        if (intent.to === target) {
          isReachable = true;
        }
      } else if (isXiangqi) {
        // Xiangqi soldier: 1 step forward; after crossing the river, also 1 step sideways
        const forwardStep = toCoordKey(parsedFrom.x, parsedFrom.y + (isWhite ? 1 : -1));
        const crossedRiver = isWhite ? parsedFrom.y >= 5 : parsedFrom.y <= 4;
        const sidewaysSteps = crossedRiver
          ? [toCoordKey(parsedFrom.x - 1, parsedFrom.y), toCoordKey(parsedFrom.x + 1, parsedFrom.y)]
          : [];
        if (intent.to === forwardStep || sidewaysSteps.includes(intent.to)) {
          isReachable = true;
        }
      } else {
        const forwardDir = isWhite ? 0 : 4;
        const startRank = isWhite ? 1 : 6;
        const f1 = isCubic
          ? topology.getNeighbor(piece.position, forwardDir)
          : toCoordKey(parsedFrom.x + pdx, parsedFrom.y + pdy);
        const f2 = isCubic
          ? (f1 ? topology.getNeighbor(f1, forwardDir) : null)
          : toCoordKey(parsedFrom.x + 2 * pdx, parsedFrom.y + 2 * pdy);

        // 1-step forward
        if (intent.to === f1 && !destOccupantId) {
          isReachable = true;
        }
        // 2-step forward (or Jump leap over 1 square)
        else if (
          intent.to === f2 &&
          ((((pdx === 0 && parsedFrom.y === startRank) || (!piece.hasMoved && pdx !== 0)) && !piece.hasMoved) || hasJumpBuff) &&
          !destOccupantId
        ) {
          if (!isCubic) {
            const intermediate = toCoordKey(parsedFrom.x + pdx, parsedFrom.y + pdy);
            const interId = state.occupancy[intermediate];
            const interPiece = interId ? (state.boardEntities[interId] as IPieceEntity | undefined) : undefined;
            const isInterJumpable = Boolean(hasJumpBuff || interPiece?.metadata?.canBeJumpedOver || interPiece?.metadata?.hasJump);
            if (!state.occupancy[intermediate] || isInterJumpable) {
              isReachable = true;
            }
          } else {
            const f1Id = f1 ? state.occupancy[f1] : undefined;
            const f1Piece = f1Id ? (state.boardEntities[f1Id] as IPieceEntity | undefined) : undefined;
            const isF1Jumpable = Boolean(hasJumpBuff || f1Piece?.metadata?.canBeJumpedOver || f1Piece?.metadata?.hasJump);
            if (!f1 || !state.occupancy[f1] || isF1Jumpable) {
              isReachable = true;
            }
          }
        }
        // Diagonal capture
        else {
          const diagTargets = isCubic
            ? (isWhite ? [topology.getNeighbor(piece.position, 7), topology.getNeighbor(piece.position, 1)] : [topology.getNeighbor(piece.position, 5), topology.getNeighbor(piece.position, 3)])
            : [
                toCoordKey(parsedFrom.x + pdx - pdy, parsedFrom.y + pdy + pdx),
                toCoordKey(parsedFrom.x + pdx + pdy, parsedFrom.y + pdy - pdx),
              ];
          if (diagTargets.includes(intent.to)) {
            if (destOccupantId) {
              isReachable = true;
            } else if (intent.to === state.turnState.enPassantTarget) {
              isReachable = true;
              isEnPassant = true;
            }
          }
        }
      }
    } else if (
      isKing &&
      parsedFrom &&
      parsedTo &&
      !piece.hasMoved &&
      (parsedTo.x === 6 || parsedTo.x === 2) &&
      Math.abs(parsedTo.x - parsedFrom.x) >= 2
    ) {
      if (
        state.variantId?.toUpperCase().includes('NO_CASTLING') ||
        Boolean((variantConfig as { specialRules?: { noCastling?: boolean } })?.specialRules?.noCastling)
      ) {
        return {
          valid: false,
          reason: 'Roque estritamente proibido na variante No Castling.',
        };
      }
      // Castling attempt (Classic & Chess960)
      const rank = isWhite ? 0 : 7;
      const isChess960 = Boolean(
        state.variantId?.toUpperCase().includes('960') ||
        (variantConfig as { variantId?: string })?.variantId?.toUpperCase().includes('960')
      );
      const enemyIds = (Object.values(state.boardEntities) as IPieceEntity[])
        .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== piece.ownerId && e.ownerId !== 'NONE')
        .map((e) => e.ownerId);
      const isSquareThreatened = (coord: CoordinateKey) =>
        enemyIds.some((eid) => CheckValidator.isSquareAttacked(coord, eid, state, topology));

      if (parsedFrom.y === rank && !isSquareThreatened(piece.position)) {
        if (parsedTo.x === 6) {
          // Kingside
          let rookCoord = toCoordKey(7, rank);
          let rookId = state.occupancy[rookCoord];
          if (!rookId && isChess960) {
            for (let x = parsedFrom.x + 1; x < 8; x++) {
              const id = state.occupancy[toCoordKey(x, rank)];
              if (id) {
                const r = state.boardEntities[id] as IPieceEntity | undefined;
                if (r && !r.hasMoved && (r.variantId.toUpperCase() === 'ROOK' || r.variantId.toUpperCase() === 'R') && r.ownerId === piece.ownerId) {
                  rookCoord = toCoordKey(x, rank);
                  rookId = id;
                  break;
                }
              }
            }
          }
          const rook = rookId ? (state.boardEntities[rookId] as IPieceEntity | undefined) : undefined;
          if (rook && !rook.hasMoved) {
            const rookX = parseCoord(rookCoord)?.x ?? 7;
            const minX = Math.min(parsedFrom.x, 6, rookX, 5);
            const maxX = Math.max(parsedFrom.x, 6, rookX, 5);
            let pathClear = true;
            for (let x = minX; x <= maxX; x++) {
              const c = toCoordKey(x, rank);
              if (c !== piece.position && c !== rookCoord && state.occupancy[c]) {
                pathClear = false;
                break;
              }
            }
            if (pathClear) {
              const stepMin = Math.min(parsedFrom.x, 6);
              const stepMax = Math.max(parsedFrom.x, 6);
              let safeTransit = true;
              for (let x = stepMin; x <= stepMax; x++) {
                if (isSquareThreatened(toCoordKey(x, rank))) {
                  safeTransit = false;
                  break;
                }
              }
              if (safeTransit) {
                isReachable = true;
                isCastling = 'KINGSIDE';
              }
            }
          }
        } else if (parsedTo.x === 2) {
          // Queenside
          let rookCoord = toCoordKey(0, rank);
          let rookId = state.occupancy[rookCoord];
          if (!rookId && isChess960) {
            for (let x = 0; x < parsedFrom.x; x++) {
              const id = state.occupancy[toCoordKey(x, rank)];
              if (id) {
                const r = state.boardEntities[id] as IPieceEntity | undefined;
                if (r && !r.hasMoved && (r.variantId.toUpperCase() === 'ROOK' || r.variantId.toUpperCase() === 'R') && r.ownerId === piece.ownerId) {
                  rookCoord = toCoordKey(x, rank);
                  rookId = id;
                  break;
                }
              }
            }
          }
          const rook = rookId ? (state.boardEntities[rookId] as IPieceEntity | undefined) : undefined;
          if (rook && !rook.hasMoved) {
            const rookX = parseCoord(rookCoord)?.x ?? 0;
            const minX = Math.min(parsedFrom.x, 2, rookX, 3);
            const maxX = Math.max(parsedFrom.x, 2, rookX, 3);
            let pathClear = true;
            for (let x = minX; x <= maxX; x++) {
              const c = toCoordKey(x, rank);
              if (c !== piece.position && c !== rookCoord && state.occupancy[c]) {
                pathClear = false;
                break;
              }
            }
            if (pathClear) {
              const stepMin = Math.min(parsedFrom.x, 2);
              const stepMax = Math.max(parsedFrom.x, 2);
              let safeTransit = true;
              for (let x = stepMin; x <= stepMax; x++) {
                if (isSquareThreatened(toCoordKey(x, rank))) {
                  safeTransit = false;
                  break;
                }
              }
              if (safeTransit) {
                isReachable = true;
                isCastling = 'QUEENSIDE';
              }
            }
          }
        }
      }
    } else {
      // Standard Betza behaviors
      const behaviors = BetzaParser.parse(piece.variantId);
      for (const behavior of behaviors) {
        const dests = behavior.generatePseudoLegalMoves(piece.position, topology, state, piece, isWhite);
        if (dests.includes(intent.to)) {
          isReachable = true;
          break;
        }
      }
    }

    if (!isReachable) {
      return {
        valid: false,
        code: 'GEOMETRICALLY_INVALID',
        reason: `Move from ${intent.from} to ${intent.to} is geometrically invalid.`,
      };
    }

    if (parsedFrom && parsedTo) {
      const isXiangqi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('XIANGQI') ||
        state.variantId?.toUpperCase().includes('XIANGQI')
      );
      if (isXiangqi) {
        if (vUpper === 'ELEPHANT') {
          if (piece.ownerId === 'P1' && parsedTo.y > 4) {
            return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: 'Xiangqi: Elefante não pode atravessar o rio.' };
          }
          if (piece.ownerId === 'P2' && parsedTo.y < 5) {
            return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: 'Xiangqi: Elefante não pode atravessar o rio.' };
          }
          const midX = (parsedFrom.x + parsedTo.x) / 2;
          const midY = (parsedFrom.y + parsedTo.y) / 2;
          if (state.occupancy[toCoordKey(midX, midY)]) {
            return { valid: false, code: 'PATH_OBSTRUCTED', reason: 'Xiangqi: Olho do Elefante bloqueado.' };
          }
        }
        if (vUpper === 'GENERAL' || vUpper === 'JIANG' || vUpper === 'SHUAI' || vUpper === 'ADVISOR') {
          if (parsedTo.x < 3 || parsedTo.x > 5) {
            return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: 'Xiangqi: Peça real/conselheiro não pode sair do palácio.' };
          }
          if (piece.ownerId === 'P1' && (parsedTo.y < 0 || parsedTo.y > 2)) {
            return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: 'Xiangqi: Peça real/conselheiro não pode sair do palácio.' };
          }
          if (piece.ownerId === 'P2' && (parsedTo.y < 7 || parsedTo.y > 9)) {
            return { valid: false, code: 'GEOMETRICALLY_INVALID', reason: 'Xiangqi: Peça real/conselheiro não pode sair do palácio.' };
          }
        }
      }
    }

    const capturedPieceId: EntityId | undefined = isEnPassant
      ? (parsedFrom && parsedTo ? state.occupancy[toCoordKey(parsedTo.x, parsedFrom.y)] : undefined)
      : destOccupantId;

    const isCapture = Boolean(capturedPieceId);

    // Atomic Chess rule: Kings cannot capture, and captures cannot blow up friendly King
    const isAtomicVariant = Boolean(
      variantConfig?.variantId?.toUpperCase().includes('ATOMIC') ||
      variantConfig?.captureExplosion ||
      state.variantId?.toUpperCase().includes('ATOMIC')
    );
    if (isAtomicVariant && isCapture) {
      if (isKing && !AtomicExplosionModifier.canKingCapture()) {
        return {
          valid: false,
          code: 'GEOMETRICALLY_INVALID',
          reason: 'Atomic Chess rule: Kings are not allowed to capture.',
        };
      }
      const friendlyKing = CheckValidator.findRoyalPiece(piece.ownerId, state);
      if (friendlyKing && parsedTo) {
        const kParsed = parseCoord(friendlyKing.position);
        if (kParsed && Math.max(Math.abs(kParsed.x - parsedTo.x), Math.abs(kParsed.y - parsedTo.y)) <= 1) {
          return {
            valid: false,
            code: 'LEAVES_KING_IN_CHECK',
            reason: 'Atomic Chess rule: Capture would detonate the friendly king.',
          };
        }
      }
    }

    // 6. King safety check on in-place simulated move (RF-04, RNF-02 < 0.05ms)
    const enforceCheck = variantConfig?.enforceCheck ?? (variantConfig?.variantId !== 'ANTICHESS');
    if (enforceCheck) {
      const isFrozen = Object.isFrozen(state.occupancy);
      const occ: Record<string, EntityId | undefined> = isFrozen
        ? { ...state.occupancy }
        : (state.occupancy as Record<string, EntityId | undefined>);
      const evalState = (isFrozen ? { ...state, occupancy: occ } : state) as unknown as IDomainState;

      const prevFrom = piece.position;
      const prevDestOccupant = occ[intent.to];
      let epVictimCoord: CoordinateKey | null = null;
      let epVictimId: EntityId | undefined;

      if (isEnPassant && parsedTo && parsedFrom) {
        epVictimCoord = toCoordKey(parsedTo.x, parsedFrom.y);
        epVictimId = occ[epVictimCoord];
        delete occ[epVictimCoord];
      }

      delete occ[prevFrom];
      occ[intent.to] = piece.id;

      const isMovingKing = vUpper === 'KING' || vUpper === 'K';
      const royalPiece = isMovingKing ? piece : CheckValidator.findRoyalPiece(piece.ownerId, evalState);
      const kingCoord = isMovingKing ? intent.to : royalPiece?.position;

      const enemyOwners = (Object.values(evalState.boardEntities) as IPieceEntity[])
        .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== piece.ownerId && e.ownerId !== 'NONE')
        .map((e) => e.ownerId);

      let leavesInCheck = kingCoord
        ? enemyOwners.some((eid) => CheckValidator.isSquareAttacked(kingCoord, eid, evalState, topology))
        : false;

      if (!leavesInCheck && isMovingKing && parsedTo) {
        for (const ent of Object.values(evalState.boardEntities)) {
          if (
            ent &&
            ent.type === 'PIECE' &&
            !ent.isCaptured &&
            ent.ownerId !== piece.ownerId &&
            ent.ownerId !== 'NONE' &&
            (ent.variantId.toUpperCase() === 'KING' || ent.variantId.toUpperCase() === 'K')
          ) {
            const ekP = parseCoord(ent.position);
            if (ekP && Math.max(Math.abs(ekP.x - parsedTo.x), Math.abs(ekP.y - parsedTo.y)) <= 1) {
              leavesInCheck = true;
              break;
            }
          }
        }
      }

      const givesCheckInRacingKings =
        !leavesInCheck &&
        variantConfig?.variantId === 'RACING_KINGS' &&
        enemyOwners.some((eid) => CheckValidator.isRoyalInCheck(eid, evalState, topology));

      // Restore occupancy if not frozen
      if (!isFrozen) {
        occ[prevFrom] = piece.id;
        if (prevDestOccupant !== undefined) {
          occ[intent.to] = prevDestOccupant;
        } else {
          delete occ[intent.to];
        }
        if (epVictimCoord && epVictimId) {
          occ[epVictimCoord] = epVictimId;
        }
      }

      const isCapturingEnemyKing = Boolean(
        prevDestOccupant &&
        evalState.boardEntities[prevDestOccupant]?.type === 'PIECE' &&
        (evalState.boardEntities[prevDestOccupant] as IPieceEntity).variantId.toUpperCase().includes('KING') &&
        (evalState.boardEntities[prevDestOccupant] as IPieceEntity).ownerId !== piece.ownerId
      );
      const isSpellChess = Boolean(
        variantConfig?.variantId.toUpperCase().includes('SPELL') ||
        evalState.variantId?.toUpperCase().includes('SPELL')
      );

      if ((leavesInCheck && !(isSpellChess && isCapturingEnemyKing)) || givesCheckInRacingKings) {
        return {
          valid: false,
          code: 'LEAVES_KING_IN_CHECK',
          reason: givesCheckInRacingKings
            ? 'Racing Kings rule: Giving check is forbidden.'
            : 'Move would leave the king in check.',
        };
      }
    }

    // 7. Antichess forced capture check (RF-10)
    if (variantConfig?.variantId === 'ANTICHESS' && !isCapture) {
      const allLegal = this.getLegalMoves(state, topology, variantConfig);
      if (allLegal.some((m) => m.isCapture)) {
        return {
          valid: false,
          code: 'FORCED_CAPTURE_AVAILABLE',
          reason: 'Antichess rule: Capture is mandatory when available.',
        };
      }
    }

    const promotionRank = isWhite ? 7 : 0;
    const isPromotion = isPawn && parsedTo?.y === promotionRank;

    return {
      valid: true,
      isCapture,
      capturedPieceId,
      isCastling,
      isEnPassant,
      isPromotion,
    };
  }

  /**
   * Generates all legal moves for the active player (RF-02).
   */
  public static getLegalMoves(
    state: IDomainState,
    topology: ITopology,
    variantConfig?: IVariantConfiguration
  ): ILegalMove[] {
    variantConfig = variantConfig ?? VariantRegistry.resolveRulesConfig(state.variantId);
    const legalMoves: ILegalMove[] = [];
    const activePlayer = state.activePlayer;

    const king = CheckValidator.findRoyalPiece(activePlayer, state);
    const livingEnemyOwners = Array.from(
      new Set(
        (Object.values(state.boardEntities) as IPieceEntity[])
          .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== activePlayer && e.ownerId !== 'NONE')
          .map((e) => e.ownerId)
      )
    );

    for (const id in state.boardEntities) {
      const entity = state.boardEntities[id as EntityId];
      if (entity && entity.type === 'PIECE' && !entity.isCaptured && entity.ownerId === activePlayer) {
        legalMoves.push(
          ...this.getLegalMovesForPiece(
            entity as IPieceEntity,
            state,
            topology,
            variantConfig,
            king,
            livingEnemyOwners
          )
        );
      }
    }

    // Antichess rule: If captures exist, only captures are legal! (RF-10)
    if (variantConfig?.variantId === 'ANTICHESS') {
      const captures = legalMoves.filter((m) => m.isCapture);
      if (captures.length > 0) {
        return captures;
      }
    }

    return legalMoves;
  }

  /**
   * Generates legal moves for a specific piece, handling special moves and king safety.
   */
  public static getLegalMovesForPiece(
    piece: IPieceEntity,
    state: IDomainState,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    precomputedKing?: IPieceEntity | null,
    precomputedOpponentIds?: readonly PlayerId[] | PlayerId
  ): ILegalMove[] {
    variantConfig = variantConfig ?? VariantRegistry.resolveRulesConfig(state.variantId);
    if (piece.metadata?.isFrozen) {
      return [];
    }
    const originTerrainId = state.terrain?.[piece.position];
    const originTerrain = originTerrainId ? state.boardEntities[originTerrainId] : undefined;
    if (originTerrain?.type === 'TERRAIN' && originTerrain.variantId === 'FROZEN') {
      return [];
    }

    const isWhite = piece.ownerId === 'P1';
    const parsedFrom = parseCoord(piece.position);
    const vUpper = piece.variantId.toUpperCase();
    const isPawn = parsedFrom && (vUpper === 'PAWN' || vUpper === 'P');
    const hasJumpBuff = Boolean(piece.metadata?.hasJump);
    const boardWidth = (topology as { readonly width?: number }).width ?? 8;
    const candidateDestinations: CoordinateKey[] = [];

    // 1. Direct handling for PAWN (bypassing Betza loop for 10x faster execution)
    if (isPawn && parsedFrom) {
      const isCubic = Boolean((topology as { readonly isCubic?: boolean }).isCubic);
      const isToroidal = Boolean((topology as { readonly isToroidal?: boolean }).isToroidal);
      const isShogi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('SHOGI') ||
        state.variantId?.toUpperCase().includes('SHOGI')
      );
      const isXiangqi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('XIANGQI') ||
        state.variantId?.toUpperCase().includes('XIANGQI')
      );

      const tw = (topology as { readonly width?: number }).width ?? 8;
      const th = (topology as { readonly height?: number }).height ?? 8;
      const wrapY = (y: number) => (isToroidal ? ((y % th) + th) % th : y);
      const wrapX = (x: number) => (isToroidal ? ((x % tw) + tw) % tw : x);

      const makeCoord = (x: number, y: number): CoordinateKey => {
        return parsedFrom.face !== undefined
          ? toCubicCoordKey(parsedFrom.face, x, y)
          : toCoordKey(x, y);
      };

      if (isShogi) {
        const f1 = makeCoord(parsedFrom.x, parsedFrom.y + (isWhite ? 1 : -1));
        if (topology.isValidCoordinate(f1)) {
          const occId = state.occupancy[f1];
          if (!occId || (state.boardEntities[occId] as IPieceEntity | undefined)?.ownerId !== piece.ownerId) {
            candidateDestinations.push(f1);
          }
        }
      } else if (isXiangqi) {
        const forwardCoord = makeCoord(parsedFrom.x, parsedFrom.y + (isWhite ? 1 : -1));
        const crossedRiver = isWhite ? parsedFrom.y >= 5 : parsedFrom.y <= 4;
        const candidates = [forwardCoord];
        if (crossedRiver) {
          candidates.push(makeCoord(parsedFrom.x - 1, parsedFrom.y), makeCoord(parsedFrom.x + 1, parsedFrom.y));
        }
        for (const c of candidates) {
          if (topology.isValidCoordinate(c)) {
            const occId = state.occupancy[c];
            if (!occId || (state.boardEntities[occId] as IPieceEntity | undefined)?.ownerId !== piece.ownerId) {
              candidateDestinations.push(c);
            }
          }
        }
      } else {
        // Multi-directional pawn advancement vector [pdx, pdy]
        let pdx = 0;
        let pdy = isWhite ? 1 : -1;
        if (!isCubic) {
          const cx = (tw - 1) / 2;
          const cy = (th - 1) / 2;
          if (tw > 8 || th > 8) {
            if (piece.ownerId === 'P3' || (piece.ownerId as string) === 'FACTION_3') {
              pdx = 0;
              pdy = -1; // North in 4P
            } else if (piece.ownerId === 'P4' || (piece.ownerId as string) === 'FACTION_4') {
              pdx = -1;
              pdy = 0; // East in 4P
            } else if (piece.ownerId === 'P2' || (piece.ownerId as string) === 'FACTION_2') {
              pdx = 1;
              pdy = 0; // West in 4P
            } else {
              const diffX = parsedFrom.x - cx;
              const diffY = parsedFrom.y - cy;
              if (Math.abs(diffX) > Math.abs(diffY) + 0.5) {
                pdx = diffX < 0 ? 1 : -1;
                pdy = 0;
              }
            }
          }
        }

        const forwardDir = isWhite ? 0 : 4;
        const f1 = isCubic
          ? topology.getNeighbor(piece.position, forwardDir)
          : makeCoord(wrapX(parsedFrom.x + pdx), wrapY(parsedFrom.y + pdy));

        if (f1 && topology.isValidCoordinate(f1) && !state.occupancy[f1]) {
          candidateDestinations.push(f1);

          // 2-step forward
          const startRank = isWhite ? 1 : 6;
          const isAtStart = (pdx === 0 && parsedFrom.y === startRank) || (!piece.hasMoved && pdx !== 0);
          if (isAtStart && !piece.hasMoved) {
            const f2 = isCubic
              ? topology.getNeighbor(f1, forwardDir)
              : makeCoord(wrapX(parsedFrom.x + 2 * pdx), wrapY(parsedFrom.y + 2 * pdy));
            if (f2 && topology.isValidCoordinate(f2) && !state.occupancy[f2]) {
              candidateDestinations.push(f2);
            }
          }
        } else {
          const f1OccupantId = f1 ? state.occupancy[f1] : undefined;
          const f1Piece = f1OccupantId ? (state.boardEntities[f1OccupantId] as IPieceEntity | undefined) : undefined;
          const isF1Jumpable = Boolean(hasJumpBuff || f1Piece?.metadata?.canBeJumpedOver || f1Piece?.metadata?.hasJump);
          if (isF1Jumpable) {
            const f2 = isCubic
              ? (f1 ? topology.getNeighbor(f1, forwardDir) : null)
              : makeCoord(wrapX(parsedFrom.x + 2 * pdx), wrapY(parsedFrom.y + 2 * pdy));
            if (f2 && topology.isValidCoordinate(f2) && !state.occupancy[f2]) {
              candidateDestinations.push(f2);
            }
          }
        }

        // Diagonal captures & En Passant
        if (isCubic) {
          const diagDirs = isWhite ? [7, 1] : [5, 3];
          for (const dir of diagDirs) {
            const diag = topology.getNeighbor(piece.position, dir);
            if (diag && topology.isValidCoordinate(diag)) {
              const occId = state.occupancy[diag];
              if (occId) {
                const victim = state.boardEntities[occId] as IPieceEntity | undefined;
                if (
                  victim &&
                  victim.type === 'PIECE' &&
                  !victim.isCaptured &&
                  victim.ownerId !== piece.ownerId &&
                  !victim.metadata?.isShielded
                ) {
                  candidateDestinations.push(diag);
                }
              } else if (diag === state.turnState.enPassantTarget) {
                candidateDestinations.push(diag);
              }
            }
          }
        } else {
          const diagTargets = [
            makeCoord(wrapX(parsedFrom.x + pdx - pdy), wrapY(parsedFrom.y + pdy + pdx)),
            makeCoord(wrapX(parsedFrom.x + pdx + pdy), wrapY(parsedFrom.y + pdy - pdx)),
          ];
          for (const diag of diagTargets) {
            if (topology.isValidCoordinate(diag)) {
              const occId = state.occupancy[diag];
              if (occId) {
                const victim = state.boardEntities[occId] as IPieceEntity | undefined;
                if (
                  victim &&
                  victim.type === 'PIECE' &&
                  !victim.isCaptured &&
                  victim.ownerId !== piece.ownerId &&
                  !victim.metadata?.isShielded
                ) {
                  candidateDestinations.push(diag);
                }
              } else if (diag === state.turnState.enPassantTarget) {
                candidateDestinations.push(diag);
              }
            }
          }
        }
      }
    } else {
      // Primitive Betza behaviors
      const behaviors = BetzaParser.parse(piece.variantId);
      for (const behavior of behaviors) {
        const destinations = behavior.generatePseudoLegalMoves(piece.position, topology, state, piece, isWhite);
        for (const dest of destinations) {
          candidateDestinations.push(dest);
        }
      }
    }

    // 3. Special Moves for KING: Castling (FIDE Article 3.8 & RF-06, Classic & Chess960)
    if (
      parsedFrom &&
      (vUpper === 'KING' || vUpper === 'K') &&
      !piece.hasMoved &&
      !state.variantId?.toUpperCase().includes('NO_CASTLING') &&
      !(variantConfig as { specialRules?: { noCastling?: boolean } })?.specialRules?.noCastling
    ) {
      const enemyIds = (Object.values(state.boardEntities) as IPieceEntity[])
        .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== piece.ownerId && e.ownerId !== 'NONE')
        .map((e) => e.ownerId);
      const isSquareThreatened = (coord: CoordinateKey) =>
        enemyIds.some((eid) => CheckValidator.isSquareAttacked(coord, eid, state, topology));

      const rank = isWhite ? 0 : 7;
      const isChess960 = Boolean(
        state.variantId?.toUpperCase().includes('960') ||
        (variantConfig as { variantId?: string })?.variantId?.toUpperCase().includes('960')
      );

      if (parsedFrom.y === rank && !isSquareThreatened(piece.position)) {
        // Kingside Castling
        let kingsideRookCoord = toCoordKey(7, rank);
        let kingsideRookId = state.occupancy[kingsideRookCoord];
        if (!kingsideRookId && isChess960) {
          for (let x = parsedFrom.x + 1; x < 8; x++) {
            const id = state.occupancy[toCoordKey(x, rank)];
            if (id) {
              const r = state.boardEntities[id] as IPieceEntity | undefined;
              if (r && !r.hasMoved && (r.variantId.toUpperCase() === 'ROOK' || r.variantId.toUpperCase() === 'R') && r.ownerId === piece.ownerId) {
                kingsideRookCoord = toCoordKey(x, rank);
                kingsideRookId = id;
                break;
              }
            }
          }
        }
        if (kingsideRookId) {
          const rook = state.boardEntities[kingsideRookId] as IPieceEntity | undefined;
          if (rook && !rook.hasMoved && (rook.variantId.toUpperCase() === 'ROOK' || rook.variantId.toUpperCase() === 'R')) {
            const rookX = parseCoord(kingsideRookCoord)?.x ?? 7;
            const minX = Math.min(parsedFrom.x, 6, rookX, 5);
            const maxX = Math.max(parsedFrom.x, 6, rookX, 5);
            let pathClear = true;
            for (let x = minX; x <= maxX; x++) {
              const c = toCoordKey(x, rank);
              if (c !== piece.position && c !== kingsideRookCoord && state.occupancy[c]) {
                pathClear = false;
                break;
              }
            }
            if (pathClear) {
              const stepMin = Math.min(parsedFrom.x, 6);
              const stepMax = Math.max(parsedFrom.x, 6);
              let safeTransit = true;
              for (let x = stepMin; x <= stepMax; x++) {
                if (isSquareThreatened(toCoordKey(x, rank))) {
                  safeTransit = false;
                  break;
                }
              }
              if (safeTransit) {
                candidateDestinations.push(toCoordKey(6, rank));
              }
            }
          }
        }

        // Queenside Castling
        let queensideRookCoord = toCoordKey(0, rank);
        let queensideRookId = state.occupancy[queensideRookCoord];
        if (!queensideRookId && isChess960) {
          for (let x = 0; x < parsedFrom.x; x++) {
            const id = state.occupancy[toCoordKey(x, rank)];
            if (id) {
              const r = state.boardEntities[id] as IPieceEntity | undefined;
              if (r && !r.hasMoved && (r.variantId.toUpperCase() === 'ROOK' || r.variantId.toUpperCase() === 'R') && r.ownerId === piece.ownerId) {
                queensideRookCoord = toCoordKey(x, rank);
                queensideRookId = id;
                break;
              }
            }
          }
        }
        if (queensideRookId) {
          const rook = state.boardEntities[queensideRookId] as IPieceEntity | undefined;
          if (rook && !rook.hasMoved && (rook.variantId.toUpperCase() === 'ROOK' || rook.variantId.toUpperCase() === 'R')) {
            const rookX = parseCoord(queensideRookCoord)?.x ?? 0;
            const minX = Math.min(parsedFrom.x, 2, rookX, 3);
            const maxX = Math.max(parsedFrom.x, 2, rookX, 3);
            let pathClear = true;
            for (let x = minX; x <= maxX; x++) {
              const c = toCoordKey(x, rank);
              if (c !== piece.position && c !== queensideRookCoord && state.occupancy[c]) {
                pathClear = false;
                break;
              }
            }
            if (pathClear) {
              const stepMin = Math.min(parsedFrom.x, 2);
              const stepMax = Math.max(parsedFrom.x, 2);
              let safeTransit = true;
              for (let x = stepMin; x <= stepMax; x++) {
                if (isSquareThreatened(toCoordKey(x, rank))) {
                  safeTransit = false;
                  break;
                }
              }
              if (safeTransit) {
                candidateDestinations.push(toCoordKey(2, rank));
              }
            }
          }
        }
      }
    }

    // 4. Construct legal moves and filter out moves that expose king to check (RF-04)
    const enforceCheck = variantConfig?.enforceCheck ?? (variantConfig?.variantId !== 'ANTICHESS');
    const legalMoves: ILegalMove[] = [];

    for (const dest of candidateDestinations) {
      const destParsed = parseCoord(dest);
      if (destParsed && VariantMapConfig.isVoidSquare(state.variantId, destParsed.x, destParsed.y, boardWidth)) {
        continue;
      }
      const isXiangqi = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('XIANGQI') ||
        state.variantId?.toUpperCase().includes('XIANGQI')
      );
      if (isXiangqi && parsedFrom && destParsed) {
        if (vUpper === 'ELEPHANT') {
          if (piece.ownerId === 'P1' && destParsed.y > 4) continue;
          if (piece.ownerId === 'P2' && destParsed.y < 5) continue;
          const midX = (parsedFrom.x + destParsed.x) / 2;
          const midY = (parsedFrom.y + destParsed.y) / 2;
          if (state.occupancy[toCoordKey(midX, midY)]) continue;
        }
        if (vUpper === 'GENERAL' || vUpper === 'JIANG' || vUpper === 'SHUAI' || vUpper === 'ADVISOR') {
          if (destParsed.x < 3 || destParsed.x > 5) continue;
          if (piece.ownerId === 'P1' && (destParsed.y < 0 || destParsed.y > 2)) continue;
          if (piece.ownerId === 'P2' && (destParsed.y < 7 || destParsed.y > 9)) continue;
        }
      }
      const destTerrainId = state.terrain?.[dest];
      const destTerrain = destTerrainId ? state.boardEntities[destTerrainId] : undefined;
      if (destTerrain?.type === 'TERRAIN' && destTerrain.variantId === 'FROZEN') {
        continue;
      }
      const rawOccupant = state.occupancy[dest] ? state.boardEntities[state.occupancy[dest]!] : undefined;
      if (rawOccupant?.type === 'OBSTACLE') {
        continue;
      }
      if (rawOccupant?.type === 'PIECE' && (rawOccupant as IPieceEntity).metadata?.isShielded) {
        continue;
      }

      const isCastling =
        (vUpper === 'KING' || vUpper === 'K') && parsedFrom && Math.abs((destParsed?.x ?? 0) - parsedFrom.x) === 2
          ? (destParsed?.x ?? 0) > parsedFrom.x
            ? 'KINGSIDE'
            : 'QUEENSIDE'
          : undefined;

      const isEnPassant =
        (vUpper === 'PAWN' || vUpper === 'P') &&
        dest === state.turnState.enPassantTarget &&
        !state.occupancy[dest];

      const capturedPieceId: EntityId | undefined = isEnPassant
        ? (state.occupancy[toCoordKey(destParsed!.x, parsedFrom!.y)])
        : state.occupancy[dest];

      const isCapture = Boolean(capturedPieceId);

      const isAtomicRule = Boolean(
        variantConfig?.variantId?.toUpperCase().includes('ATOMIC') ||
        variantConfig?.captureExplosion ||
        state.variantId?.toUpperCase().includes('ATOMIC')
      );
      if (isAtomicRule && isCapture) {
        if (vUpper === 'KING' || vUpper === 'K') {
          continue;
        }
        const royalForAtomic = precomputedKing ?? CheckValidator.findRoyalPiece(piece.ownerId, state);
        if (royalForAtomic && destParsed) {
          const kParsed = parseCoord(royalForAtomic.position);
          if (kParsed && Math.max(Math.abs(kParsed.x - destParsed.x), Math.abs(kParsed.y - destParsed.y)) <= 1) {
            continue;
          }
        }
      }

      // Pawn promotion check
      const promotionRank = isWhite ? 7 : 0;
      const isPromotion =
        (vUpper === 'PAWN' || vUpper === 'P') && destParsed?.y === promotionRank;

      // King safety validation via zero-allocation in-place occupancy delta (RNF-01, RNF-07)
      if (enforceCheck) {
        const isFrozen = Object.isFrozen(state.occupancy);
        const occ: Record<string, EntityId | undefined> = isFrozen
          ? { ...state.occupancy }
          : (state.occupancy as Record<string, EntityId | undefined>);
        const evalState = (isFrozen ? { ...state, occupancy: occ } : state) as unknown as IDomainState;

        const prevFrom = piece.position;
        const prevDestOccupant = occ[dest];
        let epVictimCoord: CoordinateKey | null = null;
        let epVictimId: EntityId | undefined;

        if (isEnPassant && destParsed && parsedFrom) {
          epVictimCoord = toCoordKey(destParsed.x, parsedFrom.y);
          epVictimId = occ[epVictimCoord];
          delete occ[epVictimCoord];
        }

        delete occ[prevFrom];
        occ[dest] = piece.id;

        const isMovingKing = vUpper === 'KING' || vUpper === 'K';
        const royalPiece = isMovingKing ? piece : (precomputedKing ?? CheckValidator.findRoyalPiece(piece.ownerId, evalState));
        const kingCoord = isMovingKing ? dest : royalPiece?.position;

        const enemyOwners: readonly PlayerId[] = Array.isArray(precomputedOpponentIds)
          ? precomputedOpponentIds
          : precomputedOpponentIds
            ? [precomputedOpponentIds]
            : (Object.values(evalState.boardEntities) as IPieceEntity[])
                .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== piece.ownerId && e.ownerId !== 'NONE')
                .map((e) => e.ownerId);

        let leavesInCheck = kingCoord
          ? enemyOwners.some((eid) => CheckValidator.isSquareAttacked(kingCoord, eid, evalState, topology))
          : false;

        if (!leavesInCheck && isMovingKing && destParsed) {
          for (const ent of Object.values(evalState.boardEntities)) {
            if (
              ent &&
              ent.type === 'PIECE' &&
              !ent.isCaptured &&
              ent.ownerId !== piece.ownerId &&
              ent.ownerId !== 'NONE' &&
              (ent.variantId.toUpperCase() === 'KING' || ent.variantId.toUpperCase() === 'K')
            ) {
              const ekP = parseCoord(ent.position);
              if (ekP && Math.max(Math.abs(ekP.x - destParsed.x), Math.abs(ekP.y - destParsed.y)) <= 1) {
                leavesInCheck = true;
                break;
              }
            }
          }
        }

        const givesCheckInRacingKings =
          !leavesInCheck &&
          variantConfig?.variantId === 'RACING_KINGS' &&
          enemyOwners.some((eid) => CheckValidator.isRoyalInCheck(eid, evalState, topology));

        // Restore occupancy if not frozen
        if (!isFrozen) {
          occ[prevFrom] = piece.id;
          if (prevDestOccupant !== undefined) {
            occ[dest] = prevDestOccupant;
          } else {
            delete occ[dest];
          }
          if (epVictimCoord && epVictimId) {
            occ[epVictimCoord] = epVictimId;
          }
        }

        const isCapturingEnemyKing = Boolean(
          prevDestOccupant &&
          evalState.boardEntities[prevDestOccupant]?.type === 'PIECE' &&
          (evalState.boardEntities[prevDestOccupant] as IPieceEntity).variantId.toUpperCase().includes('KING') &&
          (evalState.boardEntities[prevDestOccupant] as IPieceEntity).ownerId !== piece.ownerId
        );
        const isSpellChess = Boolean(
          variantConfig?.variantId.toUpperCase().includes('SPELL') ||
          evalState.variantId?.toUpperCase().includes('SPELL')
        );

        if ((leavesInCheck && !(isSpellChess && isCapturingEnemyKing)) || givesCheckInRacingKings) {
          continue; // Leaves king in check (or gives check in Racing Kings): ILLEGAL
        }
      }

      legalMoves.push({
        pieceId: piece.id,
        from: piece.position,
        to: dest,
        isCapture,
        capturedPieceId,
        isCastling,
        isEnPassant,
        isPromotion,
        promotionOptions: isPromotion ? [...PROMOTION_OPTIONS] : undefined,
      });
    }

    return legalMoves;
  }

  /**
   * Fast, shallow simulation of a move for king safety verification.
   */
  public static simulateMove(
    state: IDomainState,
    piece: IPieceEntity,
    to: CoordinateKey,
    isCastling?: 'KINGSIDE' | 'QUEENSIDE',
    isEnPassant?: boolean
  ): IDomainState {
    const simulatedOccupancy: Record<CoordinateKey, EntityId> = { ...state.occupancy };
    const simulatedEntities: Record<EntityId, IPieceEntity> = { ...state.boardEntities } as Record<
      EntityId,
      IPieceEntity
    >;

    delete simulatedOccupancy[piece.position];

    if (isEnPassant) {
      const fromCoord = parseCoord(piece.position);
      const toCoord = parseCoord(to);
      if (fromCoord && toCoord) {
        const victimCoord = toCoordKey(toCoord.x, fromCoord.y);
        const victimId = simulatedOccupancy[victimCoord];
        if (victimId) {
          delete simulatedOccupancy[victimCoord];
          const victim = simulatedEntities[victimId];
          if (victim) {
            simulatedEntities[victimId] = { ...victim, isCaptured: true };
          }
        }
      }
    } else {
      const existingOccupantId = simulatedOccupancy[to];
      if (existingOccupantId) {
        const victim = simulatedEntities[existingOccupantId];
        if (victim) {
          simulatedEntities[existingOccupantId] = { ...victim, isCaptured: true };
        }
      }
    }

    simulatedOccupancy[to] = piece.id;
    simulatedEntities[piece.id] = { ...piece, position: to, hasMoved: true };

    const wasCapture = Boolean(isEnPassant || state.occupancy[to]);
    let atomicWinnerId: PlayerId | null = state.winnerId;
    let atomicGameOver = state.isGameOver;

    const rulesCfg = VariantRegistry.resolveRulesConfig(state.variantId);
    const isSimAtomic = Boolean(
      state.variantId?.toUpperCase().includes('ATOMIC') ||
      rulesCfg?.variantId?.toUpperCase().includes('ATOMIC') ||
      rulesCfg?.captureExplosion
    );

    if (isSimAtomic && wasCapture) {
      const toCoord = parseCoord(to);
      // Capturing piece also explodes
      delete simulatedOccupancy[to];
      simulatedEntities[piece.id] = { ...simulatedEntities[piece.id], isCaptured: true };

      if (toCoord) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const adjKey = toCoordKey(toCoord.x + dx, toCoord.y + dy);
            const adjId = simulatedOccupancy[adjKey];
            if (!adjId) continue;
            const adjEntity = simulatedEntities[adjId];
            if (!adjEntity || adjEntity.type !== 'PIECE' || adjEntity.isCaptured) continue;
            const adjVar = adjEntity.variantId.toUpperCase();
            if (adjVar === 'PAWN' || adjVar === 'P') continue; // Pawns survive collateral blast

            delete simulatedOccupancy[adjKey];
            simulatedEntities[adjId] = { ...adjEntity, isCaptured: true };
            if (adjVar === 'KING' || adjVar === 'K') {
              atomicGameOver = true;
              atomicWinnerId = adjEntity.ownerId === 'P1' ? 'P2' : 'P1';
            }
          }
        }
      }
    }

    // Move the Rook during castling in simulation
    if (isCastling) {
      const rank = piece.position.endsWith(',0') ? 0 : 7;
      if (isCastling === 'KINGSIDE') {
        const rookCoord = toCoordKey(7, rank);
        const rookTarget = toCoordKey(5, rank);
        const rookId = simulatedOccupancy[rookCoord];
        if (rookId) {
          delete simulatedOccupancy[rookCoord];
          simulatedOccupancy[rookTarget] = rookId;
          const rook = simulatedEntities[rookId];
          if (rook) {
            simulatedEntities[rookId] = { ...rook, position: rookTarget, hasMoved: true };
          }
        }
      } else {
        const rookCoord = toCoordKey(0, rank);
        const rookTarget = toCoordKey(3, rank);
        const rookId = simulatedOccupancy[rookCoord];
        if (rookId) {
          delete simulatedOccupancy[rookCoord];
          simulatedOccupancy[rookTarget] = rookId;
          const rook = simulatedEntities[rookId];
          if (rook) {
            simulatedEntities[rookId] = { ...rook, position: rookTarget, hasMoved: true };
          }
        }
      }
    }

    return {
      ...state,
      isGameOver: atomicGameOver,
      winnerId: atomicWinnerId,
      boardEntities: simulatedEntities,
      occupancy: simulatedOccupancy,
    };
  }

  /**
   * Universal game outcome evaluation.
   */
  public static getGameResult(
    state: IDomainState,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    positionHistory?: readonly string[]
  ): IGameResult {
    const history = positionHistory ?? state.turnState?.positionHistory;
    const legalMoves = this.getLegalMoves(state, topology, variantConfig);
    return GameOverDetector.evaluateGameResult(
      state,
      topology,
      legalMoves.length,
      variantConfig,
      history
    );
  }

  /**
   * Evaluates whether a claimable draw (3-fold repetition or 50-move rule) is currently claimable by the active player.
   */
  public static canClaimDraw(
    state: IDomainState,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    positionHistory?: readonly string[]
  ): boolean {
    const history = positionHistory ?? state.turnState?.positionHistory;
    const configWithClaimable: IVariantConfiguration = {
      ...(variantConfig ?? { variantId: state.variantId ?? 'CHESS_STANDARD' }),
      claimableDrawRules: true,
    };
    const result = this.getGameResult(state, topology, configWithClaimable, history);
    return Boolean(
      result.canClaimDraw ||
      (result.isGameOver && (result.status === 'THREEFOLD_REPETITION' || result.status === 'FIFTY_MOVE_RULE'))
    );
  }

  /**
   * Processes a formal draw claim by the active player.
   * If claim conditions are satisfied, returns a game-over draw result.
   */
  public static claimDraw(
    state: IDomainState,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    positionHistory?: readonly string[]
  ): IGameResult {
    const history = positionHistory ?? state.turnState?.positionHistory;
    const configWithClaimable: IVariantConfiguration = {
      ...(variantConfig ?? { variantId: state.variantId ?? 'CHESS_STANDARD' }),
      claimableDrawRules: true,
    };
    const result = this.getGameResult(state, topology, configWithClaimable, history);
    if (result.canClaimDraw) {
      return {
        isGameOver: true,
        status: result.status,
        winnerId: null,
        reason: `Draw claimed by player ${state.activePlayer}: ${result.reason}`,
      };
    }
    return result;
  }

  /**
   * Reverse Raycasting square attack query (RF-04).
   */
  public static isSquareAttacked(
    coord: CoordinateKey,
    attackerPlayerId: PlayerId,
    state: IDomainState,
    topology: ITopology
  ): boolean {
    return CheckValidator.isSquareAttacked(coord, attackerPlayerId, state, topology);
  }
}

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
import { parseCoord, toCoordKey } from './utils/CoordinateHelper';

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
      const advanceDy = isWhite ? 1 : -1;
      const startRank = isWhite ? 1 : 6;

      // 1-step forward
      if (parsedTo.x === parsedFrom.x && parsedTo.y === parsedFrom.y + advanceDy && !destOccupantId) {
        isReachable = true;
      }
      // 2-step forward (or Jump leap over 1 square)
      else if (
        parsedTo.x === parsedFrom.x &&
        ((parsedFrom.y === startRank && !piece.hasMoved) || hasJumpBuff) &&
        parsedTo.y === parsedFrom.y + advanceDy * 2 &&
        !destOccupantId
      ) {
        const intermediate = toCoordKey(parsedFrom.x, parsedFrom.y + advanceDy);
        if (!state.occupancy[intermediate] || hasJumpBuff) {
          isReachable = true;
        }
      }
      // Diagonal capture
      else if (Math.abs(parsedTo.x - parsedFrom.x) === 1 && parsedTo.y === parsedFrom.y + advanceDy) {
        if (destOccupantId) {
          isReachable = true;
        } else if (intent.to === state.turnState.enPassantTarget) {
          isReachable = true;
          isEnPassant = true;
        }
      }
    } else if (isKing && parsedFrom && parsedTo && Math.abs(parsedTo.x - parsedFrom.x) === 2 && !piece.hasMoved) {
      if (
        state.variantId?.toUpperCase().includes('NO_CASTLING') ||
        Boolean((variantConfig as { specialRules?: { noCastling?: boolean } })?.specialRules?.noCastling)
      ) {
        return {
          valid: false,
          reason: 'Roque estritamente proibido na variante No Castling.',
        };
      }
      // Castling attempt
      const rank = isWhite ? 0 : 7;
      const initialKingPos = toCoordKey(4, rank);
      const enemyIds = (Object.values(state.boardEntities) as IPieceEntity[])
        .filter((e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId !== piece.ownerId && e.ownerId !== 'NONE')
        .map((e) => e.ownerId);
      const isSquareThreatened = (coord: CoordinateKey) =>
        enemyIds.some((eid) => CheckValidator.isSquareAttacked(coord, eid, state, topology));

      if (piece.position === initialKingPos && !isSquareThreatened(initialKingPos)) {
        if (parsedTo.x === 6) {
          // Kingside
          const rookId = state.occupancy[toCoordKey(7, rank)];
          const rook = rookId ? (state.boardEntities[rookId] as IPieceEntity | undefined) : undefined;
          if (rook && !rook.hasMoved && !state.occupancy[toCoordKey(5, rank)] && !state.occupancy[toCoordKey(6, rank)]) {
            if (
              !isSquareThreatened(toCoordKey(5, rank)) &&
              !isSquareThreatened(toCoordKey(6, rank))
            ) {
              isReachable = true;
              isCastling = 'KINGSIDE';
            }
          }
        } else if (parsedTo.x === 2) {
          // Queenside
          const rookId = state.occupancy[toCoordKey(0, rank)];
          const rook = rookId ? (state.boardEntities[rookId] as IPieceEntity | undefined) : undefined;
          if (
            rook &&
            !rook.hasMoved &&
            !state.occupancy[toCoordKey(1, rank)] &&
            !state.occupancy[toCoordKey(2, rank)] &&
            !state.occupancy[toCoordKey(3, rank)]
          ) {
            if (
              !isSquareThreatened(toCoordKey(3, rank)) &&
              !isSquareThreatened(toCoordKey(2, rank))
            ) {
              isReachable = true;
              isCastling = 'QUEENSIDE';
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
      if (isKing) {
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
      const opponentId: PlayerId = piece.ownerId === 'P1' ? 'P2' : 'P1';

      const leavesInCheck = kingCoord
        ? CheckValidator.isSquareAttacked(kingCoord, opponentId, evalState, topology)
        : false;
      const givesCheckInRacingKings =
        !leavesInCheck &&
        variantConfig?.variantId === 'RACING_KINGS' &&
        CheckValidator.isRoyalInCheck(opponentId, evalState, topology);

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

      if (leavesInCheck || givesCheckInRacingKings) {
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
    const opponentId: PlayerId = activePlayer === 'P1' ? 'P2' : 'P1';

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
            opponentId
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
    precomputedOpponentId?: PlayerId
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
      const isToroidal = Boolean((topology as { readonly isToroidal?: boolean }).isToroidal);
      const tw = (topology as { readonly width?: number }).width ?? 8;
      const th = (topology as { readonly height?: number }).height ?? 8;
      const wrapY = (y: number) => (isToroidal ? ((y % th) + th) % th : y);
      const wrapX = (x: number) => (isToroidal ? ((x % tw) + tw) % tw : x);

      const advanceDy = isWhite ? 1 : -1;
      const startRank = isWhite ? 1 : 6;

      // 1-step forward
      const f1 = toCoordKey(parsedFrom.x, wrapY(parsedFrom.y + advanceDy));
      if (topology.isValidCoordinate(f1) && !state.occupancy[f1]) {
        candidateDestinations.push(f1);

        // 2-step forward
        if (parsedFrom.y === startRank && !piece.hasMoved) {
          const f2 = toCoordKey(parsedFrom.x, wrapY(parsedFrom.y + advanceDy * 2));
          if (topology.isValidCoordinate(f2) && !state.occupancy[f2]) {
            candidateDestinations.push(f2);
          }
        }
      } else if (hasJumpBuff) {
        const f2 = toCoordKey(parsedFrom.x, wrapY(parsedFrom.y + advanceDy * 2));
        if (topology.isValidCoordinate(f2) && !state.occupancy[f2]) {
          candidateDestinations.push(f2);
        }
      }

      // Diagonal captures & En Passant
      for (const dx of [-1, 1]) {
        const diag = toCoordKey(wrapX(parsedFrom.x + dx), wrapY(parsedFrom.y + advanceDy));
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

    // 3. Special Moves for KING: Castling (FIDE Article 3.8 & RF-06)
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
      const initialKingPos = toCoordKey(4, rank);

      // Only allow castling if King is on standard starting square and not in check
      if (
        piece.position === initialKingPos &&
        !isSquareThreatened(initialKingPos)
      ) {
        // Kingside Castling: Rook at (7, rank), empty at (5, rank) and (6, rank)
        const kingsideRookCoord = toCoordKey(7, rank);
        const kingsideRookId = state.occupancy[kingsideRookCoord];
        if (kingsideRookId) {
          const rook = state.boardEntities[kingsideRookId] as IPieceEntity | undefined;
          if (
            rook &&
            rook.type === 'PIECE' &&
            !rook.isCaptured &&
            rook.ownerId === piece.ownerId &&
            !rook.hasMoved &&
            (rook.variantId.toUpperCase() === 'ROOK' || rook.variantId.toUpperCase() === 'R')
          ) {
            const sq5 = toCoordKey(5, rank);
            const sq6 = toCoordKey(6, rank);
            if (!state.occupancy[sq5] && !state.occupancy[sq6]) {
              if (
                !isSquareThreatened(sq5) &&
                !isSquareThreatened(sq6)
              ) {
                candidateDestinations.push(sq6);
              }
            }
          }
        }

        // Queenside Castling: Rook at (0, rank), empty at (1, rank), (2, rank), (3, rank)
        const queensideRookCoord = toCoordKey(0, rank);
        const queensideRookId = state.occupancy[queensideRookCoord];
        if (queensideRookId) {
          const rook = state.boardEntities[queensideRookId] as IPieceEntity | undefined;
          if (
            rook &&
            rook.type === 'PIECE' &&
            !rook.isCaptured &&
            rook.ownerId === piece.ownerId &&
            !rook.hasMoved &&
            (rook.variantId.toUpperCase() === 'ROOK' || rook.variantId.toUpperCase() === 'R')
          ) {
            const sq1 = toCoordKey(1, rank);
            const sq2 = toCoordKey(2, rank);
            const sq3 = toCoordKey(3, rank);
            if (!state.occupancy[sq1] && !state.occupancy[sq2] && !state.occupancy[sq3]) {
              if (
                !isSquareThreatened(sq3) &&
                !isSquareThreatened(sq2)
              ) {
                candidateDestinations.push(sq2);
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
        const opponentId: PlayerId = precomputedOpponentId ?? (piece.ownerId === 'P1' ? 'P2' : 'P1');

        const leavesInCheck = kingCoord
          ? CheckValidator.isSquareAttacked(kingCoord, opponentId, evalState, topology)
          : false;
        const givesCheckInRacingKings =
          !leavesInCheck &&
          variantConfig?.variantId === 'RACING_KINGS' &&
          CheckValidator.isRoyalInCheck(opponentId, evalState, topology);

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

        if (leavesInCheck || givesCheckInRacingKings) {
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

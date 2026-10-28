import { NetworkEntitySchema } from '../schemas/RoomStateSchema';
import { asCoordinateKey, asEntityId, CoordinateKey, EntityId, PlayerId } from '../../../src/core/coordinates';
import { IDomainState } from '../../../src/core/state/gameState';
import { IPieceEntity } from '../../../src/core/entities/types';
import { SquareTopology } from '../../../src/core/topology/SquareTopology';
import { RulesEngine } from '../../../src/engine/rules/RulesEngine';

export interface IPosition2D {
  readonly x: number; // 0..7 (a..h)
  readonly y: number; // 0..7 (1..8)
}

export interface IMoveValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly capturedPiece?: NetworkEntitySchema;
  readonly isCastling?: 'KINGSIDE' | 'QUEENSIDE';
  readonly isEnPassant?: boolean;
  readonly isPromotion?: boolean;
}

/**
 * Parses algebraic notation (e.g. 'e2', 'e4') or Cartesian 'x,y' (e.g. '4,1', '4,3')
 * into standard 0-indexed 8x8 coordinates.
 * Returns null if malformed or outside the 8x8 chessboard.
 */
export function parseBoardPosition(coord: string): IPosition2D | null {
  if (!coord || typeof coord !== 'string') return null;
  const trimmed = coord.trim();

  // 1. Algebraic notation: 'a1' through 'h8'
  const algebraicRegex = /^([a-hA-H])([1-8])$/;
  const algMatch = algebraicRegex.exec(trimmed);
  if (algMatch) {
    const fileChar = algMatch[1].toLowerCase();
    const rankNum = parseInt(algMatch[2], 10);
    const x = fileChar.charCodeAt(0) - 97; // 'a' -> 0, 'h' -> 7
    const y = rankNum - 1; // '1' -> 0, '8' -> 7
    return { x, y };
  }

  // 2. Cartesian 'x,y' format: '0,0' through '7,7'
  const parts = trimmed.split(',');
  if (parts.length === 2) {
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 8 && y >= 0 && y < 8) {
      return { x, y };
    }
  }

  return null;
}

export function toAlgebraic(x: number, y: number): string {
  return `${String.fromCharCode(97 + x)}${y + 1}`;
}

/**
 * Maps Colyseus room entity schemas to the pure ECS domain state for the Rules Engine.
 */
export function buildDomainStateFromNetworkEntities(
  entities: Iterable<NetworkEntitySchema>,
  movingPieceOwnerId: string,
  isWhite: boolean,
  enPassantTarget?: string
): IDomainState {
  const boardEntities: Record<EntityId, IPieceEntity> = {};
  const occupancy: Record<CoordinateKey, EntityId> = {};

  for (const entity of entities) {
    if (!entity.isCaptured && entity.position) {
      const pos = parseBoardPosition(entity.position);
      if (pos) {
        const coordKey = asCoordinateKey(`${pos.x},${pos.y}`);
        const entityId = asEntityId(entity.id);
        occupancy[coordKey] = entityId;

        // In RulesEngine:
        // P1 is always White (rank 1 -> rank 7)
        // P2 is always Black (rank 6 -> rank 0)
        const isEntityOwnerMoving = entity.ownerId === movingPieceOwnerId;
        const owner: PlayerId = isWhite
          ? (isEntityOwnerMoving ? 'P1' : 'P2')
          : (isEntityOwnerMoving ? 'P2' : 'P1');

        boardEntities[entityId] = {
          id: entityId,
          type: 'PIECE',
          variantId: entity.variantId || 'PAWN',
          position: coordKey,
          ownerId: owner,
          hasMoved: entity.hasMoved ?? false,
          isCaptured: false,
        };
      }
    }
  }

  let epTargetKey: CoordinateKey | null = null;
  if (enPassantTarget) {
    const epPos = parseBoardPosition(enPassantTarget);
    if (epPos) {
      epTargetKey = asCoordinateKey(`${epPos.x},${epPos.y}`);
    }
  }

  const activePlayer: PlayerId = isWhite ? 'P1' : 'P2';

  return {
    matchId: 'server-match',
    variantId: 'STANDARD',
    boardEntities,
    occupancy,
    activePlayer,
    turnNumber: 1,
    turnState: {
      phase: 'WAITING',
      lastActionTimestamp: Date.now(),
      enPassantTarget: epTargetKey,
      fiftyMoveCounter: 0,
    },
    capturedInventory: {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    },
    revision: 1,
    isGameOver: false,
    winnerId: null,
  };
}

/**
 * Validates chess moves using the pure isomorphic Rules Engine.
 * Supports standard FIDE moves, check/checkmate verification, castling, en passant,
 * pawn promotion, and fairy pieces.
 * Conforms to Spec 03 Section 3.2 and Spec 04 RF-01 to RF-15.
 */
export function validateStandardMove(
  piece: NetworkEntitySchema,
  fromCoord: string,
  toCoord: string,
  isWhite: boolean,
  entities: Iterable<NetworkEntitySchema>,
  enPassantTarget?: string
): IMoveValidationResult {
  const fromPos = parseBoardPosition(fromCoord);
  if (!fromPos) {
    return { valid: false, reason: `Malformed or out-of-bounds origin coordinate: "${fromCoord}".` };
  }

  const toPos = parseBoardPosition(toCoord);
  if (!toPos) {
    return { valid: false, reason: `Malformed or out-of-bounds destination coordinate: "${toCoord}".` };
  }

  if (fromPos.x === toPos.x && fromPos.y === toPos.y) {
    return { valid: false, reason: 'Destination equals origin.' };
  }

  const entityList = Array.from(entities);
  const domainState = buildDomainStateFromNetworkEntities(entityList, piece.ownerId, isWhite, enPassantTarget);
  const topology = new SquareTopology({ width: 8, height: 8 });

  const fromKey = asCoordinateKey(`${fromPos.x},${fromPos.y}`);
  const toKey = asCoordinateKey(`${toPos.x},${toPos.y}`);
  const actingPlayer: PlayerId = isWhite ? 'P1' : 'P2';

  const validation = RulesEngine.validateMove(
    domainState,
    {
      pieceId: asEntityId(piece.id),
      actingPlayer,
      from: fromKey,
      to: toKey,
    },
    topology
  );

  if (!validation.valid) {
    let reason = validation.reason || `Move rejected: ${validation.code}`;
    const vUpper = (piece.variantId || 'P').toUpperCase();
    const destOccupant = domainState.occupancy[toKey];

    if (validation.code === 'DESTINATION_FRIENDLY_OCCUPIED') {
      reason = `Cannot capture friendly piece "${destOccupant}" at "${toCoord}". ${reason}`;
    } else if (vUpper === 'P' || vUpper === 'PAWN') {
      const dx = toPos.x - fromPos.x;
      if (dx === 0 && destOccupant) {
        reason = `Pawn cannot advance forward into an occupied square at "${toCoord}". ${reason}`;
      } else {
        reason = `Illegal pawn advance distance: ${reason}`;
      }
    } else if (vUpper === 'R' || vUpper === 'ROOK') {
      reason = `Illegal rook move from "${fromCoord}" to "${toCoord}": straight lines only. ${reason}`;
    } else if (vUpper === 'N' || vUpper === 'KNIGHT') {
      reason = `Illegal knight move from "${fromCoord}" to "${toCoord}": must be L-shaped jump. ${reason}`;
    } else if (vUpper === 'B' || vUpper === 'BISHOP' || vUpper === 'Q' || vUpper === 'QUEEN') {
      reason = `Move from "${fromCoord}" to "${toCoord}" is obstructed or invalid. ${reason}`;
    }

    return {
      valid: false,
      reason,
    };
  }

  let capturedPiece: NetworkEntitySchema | undefined;
  if (validation.capturedPieceId) {
    capturedPiece = entityList.find((e) => e.id === validation.capturedPieceId);
  }

  return {
    valid: true,
    capturedPiece,
    isCastling: validation.isCastling,
    isEnPassant: validation.isEnPassant,
    isPromotion: validation.isPromotion,
  };
}

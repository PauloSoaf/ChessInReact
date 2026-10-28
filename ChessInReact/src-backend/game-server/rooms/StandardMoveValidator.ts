import { NetworkEntitySchema } from '../schemas/RoomStateSchema';

export interface IPosition2D {
  readonly x: number; // 0..7 (a..h)
  readonly y: number; // 0..7 (1..8)
}

export interface IMoveValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly capturedPiece?: NetworkEntitySchema;
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

function isSquareOccupied(
  x: number,
  y: number,
  entities: Iterable<NetworkEntitySchema>
): NetworkEntitySchema | null {
  for (const entity of entities) {
    if (!entity.isCaptured && entity.position) {
      const pos = parseBoardPosition(entity.position);
      if (pos && pos.x === x && pos.y === y) {
        return entity;
      }
    }
  }
  return null;
}

/**
 * Validates chess moves for standard 1v1 pieces (Pawn, Knight, Bishop, Rook, Queen, King).
 * Pure function: performs ZERO mutations.
 * Conforms to Spec 03 Section 3.2 (Anti-Cheat & Authority) and respects Spec 04 boundaries.
 */
export function validateStandardMove(
  piece: NetworkEntitySchema,
  fromCoord: string,
  toCoord: string,
  isWhite: boolean,
  entities: Iterable<NetworkEntitySchema>
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
  const occupant = isSquareOccupied(toPos.x, toPos.y, entityList);
  if (occupant) {
    if (occupant.ownerId === piece.ownerId) {
      return {
        valid: false,
        reason: `Cannot capture friendly piece "${occupant.id}" at "${toCoord}".`,
      };
    }
  }

  const dx = toPos.x - fromPos.x;
  const dy = toPos.y - fromPos.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  const variant = (piece.variantId || 'P').toUpperCase();

  switch (variant) {
    case 'P': {
      // Pawn movement
      const forwardDir = isWhite ? 1 : -1;
      const startRankY = isWhite ? 1 : 6;

      if (dx === 0) {
        // Straight advance: target must be unoccupied
        if (occupant) {
          return { valid: false, reason: `Pawn cannot advance forward into an occupied square at "${toCoord}".` };
        }

        if (dy === forwardDir) {
          return { valid: true };
        }

        if (dy === 2 * forwardDir) {
          if (fromPos.y !== startRankY || piece.hasMoved) {
            return { valid: false, reason: 'Pawn can only advance 2 squares from its starting rank on its initial move.' };
          }
          const intermediateY = fromPos.y + forwardDir;
          if (isSquareOccupied(fromPos.x, intermediateY, entityList)) {
            return { valid: false, reason: `Pawn path is blocked at intermediate square (${fromPos.x}, ${intermediateY}).` };
          }
          return { valid: true };
        }

        return { valid: false, reason: `Illegal pawn advance distance: ${dy}.` };
      }

      if (adx === 1) {
        // Diagonal capture: MUST capture an opponent piece
        if (dy !== forwardDir) {
          return { valid: false, reason: 'Pawn can only capture diagonally moving forward.' };
        }
        if (!occupant) {
          return { valid: false, reason: `Pawn cannot move diagonally to "${toCoord}" without capturing an opponent piece.` };
        }
        return { valid: true, capturedPiece: occupant };
      }

      return { valid: false, reason: `Illegal pawn move from "${fromCoord}" to "${toCoord}".` };
    }

    case 'N': {
      // Knight: L-shaped jump (1x2 or 2x1)
      const isLJump = (adx === 1 && ady === 2) || (adx === 2 && ady === 1);
      if (!isLJump) {
        return { valid: false, reason: `Illegal knight move from "${fromCoord}" to "${toCoord}": must be L-shaped jump.` };
      }
      return { valid: true, capturedPiece: occupant || undefined };
    }

    case 'B': {
      // Bishop: strictly diagonal
      if (adx !== ady || adx === 0) {
        return { valid: false, reason: `Illegal bishop move from "${fromCoord}" to "${toCoord}": must move diagonally.` };
      }
      const stepX = dx > 0 ? 1 : -1;
      const stepY = dy > 0 ? 1 : -1;
      for (let i = 1; i < adx; i++) {
        const checkX = fromPos.x + i * stepX;
        const checkY = fromPos.y + i * stepY;
        if (isSquareOccupied(checkX, checkY, entityList)) {
          return { valid: false, reason: `Bishop path is obstructed at square (${checkX}, ${checkY}).` };
        }
      }
      return { valid: true, capturedPiece: occupant || undefined };
    }

    case 'R': {
      // Rook: strictly orthogonal
      const isOrthogonal = (dx === 0 && dy !== 0) || (dx !== 0 && dy === 0);
      if (!isOrthogonal) {
        return { valid: false, reason: `Illegal rook move from "${fromCoord}" to "${toCoord}": must move in straight lines.` };
      }
      const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
      const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
      const steps = Math.max(adx, ady);
      for (let i = 1; i < steps; i++) {
        const checkX = fromPos.x + i * stepX;
        const checkY = fromPos.y + i * stepY;
        if (isSquareOccupied(checkX, checkY, entityList)) {
          return { valid: false, reason: `Rook path is obstructed at square (${checkX}, ${checkY}).` };
        }
      }
      return { valid: true, capturedPiece: occupant || undefined };
    }

    case 'Q': {
      // Queen: diagonal or orthogonal
      const isDiagonal = adx === ady && adx > 0;
      const isOrthogonal = (dx === 0 && dy !== 0) || (dx !== 0 && dy === 0);
      if (!isDiagonal && !isOrthogonal) {
        return { valid: false, reason: `Illegal queen move from "${fromCoord}" to "${toCoord}": must move diagonally or orthogonally.` };
      }
      const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
      const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
      const steps = Math.max(adx, ady);
      for (let i = 1; i < steps; i++) {
        const checkX = fromPos.x + i * stepX;
        const checkY = fromPos.y + i * stepY;
        if (isSquareOccupied(checkX, checkY, entityList)) {
          return { valid: false, reason: `Queen path is obstructed at square (${checkX}, ${checkY}).` };
        }
      }
      return { valid: true, capturedPiece: occupant || undefined };
    }

    case 'K': {
      // King: 1 square in any direction
      if (adx > 1 || ady > 1 || (adx === 0 && ady === 0)) {
        return { valid: false, reason: `Illegal king move from "${fromCoord}" to "${toCoord}": king cannot move more than 1 square.` };
      }
      return { valid: true, capturedPiece: occupant || undefined };
    }

    default: {
      // Registered deferred interface for future Spec 04 fairy piece behaviors
      return {
        valid: false,
        reason: `Unsupported piece variant "${variant}". Fairy pieces require Spec 04 Betza resolver.`,
      };
    }
  }
}

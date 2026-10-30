import { CoordinateKey, PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { IPieceEntity } from '../../../core/entities/types';
import { parseCoord } from '../../../engine/rules/utils/CoordinateHelper';
import { BetzaParser } from '../../../engine/rules/behaviors/BetzaParser';

/**
 * Piece-Square Table values for standard 8x8 board (Spec 05 § 4 Fonte 1/2).
 */
const KNIGHT_PST: readonly number[] = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20,   0,   5,   5,   0, -20, -40,
  -30,   5,  10,  15,  15,  10,   5, -30,
  -30,   0,  15,  20,  20,  15,   0, -30,
  -30,   5,  15,  20,  20,  15,   5, -30,
  -30,   0,  10,  15,  15,  10,   0, -30,
  -40, -20,   0,   0,   0,   0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_PST: readonly number[] = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10,   5,   0,   0,   0,   0,   5, -10,
  -10,  10,  10,  10,  10,  10,  10, -10,
  -10,   0,  10,  10,  10,  10,   0, -10,
  -10,   5,   5,  10,  10,   5,   5, -10,
  -10,   0,   5,  10,  10,   5,   0, -10,
  -10,   0,   0,   0,   0,   0,   0, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const PAWN_PST_WHITE: readonly number[] = [
    0,   0,   0,   0,   0,   0,   0,   0,
    5,  10,  10, -20, -20,  10,  10,   5,
    5,  -5, -10,   0,   0, -10,  -5,   5,
    0,   0,   0,  20,  20,   0,   0,   0,
    5,   5,  10,  25,  25,  10,   5,   5,
   10,  10,  20,  30,  30,  20,  10,  10,
   50,  50,  50,  50,  50,  50,  50,  50,
    0,   0,   0,   0,   0,   0,   0,   0,
];

/**
 * Mobility and Positional Evaluation (Spec 05 § 4 Fonte 5, § 6 lines 120-128).
 */
export class MobilityEvaluator {
  /**
   * Calculates positional bonus from Piece-Square Tables or distance-to-center.
   */
  public static getPositionalScore(
    piece: IPieceEntity,
    coord: CoordinateKey
  ): number {
    const parts = coord.split(',');
    let x = 0;
    let y = 0;
    let isHex = false;

    if (parts.length === 3) {
      x = Number(parts[0]);
      y = Number(parts[1]);
      isHex = true;
    } else {
      const parsed = parseCoord(coord);
      if (!parsed) return 0;
      x = parsed.x;
      y = parsed.y;
    }

    const v = piece.variantId.toUpperCase();
    const isWhite = piece.ownerId === 'P1';

    // Standard 8x8 square PST
    if (!isHex && x >= 0 && x < 8 && y >= 0 && y < 8) {
      const rank = isWhite ? y : 7 - y;
      const file = x;
      const index = rank * 8 + file;

      if (v === 'N' || v === 'KNIGHT') {
        return KNIGHT_PST[index] ?? 0;
      }
      if (v === 'B' || v === 'BISHOP') {
        return BISHOP_PST[index] ?? 0;
      }
      if (v === 'P' || v === 'PAWN') {
        return PAWN_PST_WHITE[index] ?? 0;
      }
    }

    // Generic fallback for Hex or arbitrary topologies: Distance-to-Center (Spec 05 § 4 Fonte 5)
    // Centralization is favored for active pieces
    const centerDist = Math.sqrt(x * x + y * y);
    if (v === 'K' || v === 'KING') {
      return 0; // King safety is evaluated separately
    }
    return Math.max(0, Math.round((10 - centerDist) * 3));
  }

  /**
   * Evaluates mobility points for a piece (+5 centipawns per legal move).
   */
  public static evaluatePieceMobility(
    piece: IPieceEntity,
    state: IDomainState,
    topology: ITopology
  ): number {
    const vUpper = piece.variantId.toUpperCase();
    if (vUpper === 'KING' || vUpper === 'K' || vUpper === 'PAWN' || vUpper === 'P') {
      return 0;
    }

    try {
      const isWhite = piece.ownerId === 'P1';
      const behaviors = BetzaParser.parse(piece.variantId);
      let count = 0;
      for (const b of behaviors) {
        const dests = b.generatePseudoLegalMoves(piece.position, topology, state, piece, isWhite);
        count += dests.length;
      }
      return count * 5;
    } catch {
      return 0;
    }
  }

  /**
   * Evaluates aggregate mobility score across players.
   */
  public static evaluateMobility(
    state: IDomainState,
    topology: ITopology
  ): Record<PlayerId | string, number> {
    const scores: Record<PlayerId | string, number> = {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
      P5: 0,
      P6: 0,
      P7: 0,
      P8: 0,
    };

    for (const entity of Object.values(state.boardEntities)) {
      if (entity && entity.type === 'PIECE' && !(entity as IPieceEntity).isCaptured) {
        const piece = entity as IPieceEntity;
        const mobility = this.evaluatePieceMobility(piece, state, topology);
        const positional = this.getPositionalScore(piece, piece.position);

        if (scores[piece.ownerId] === undefined) {
          scores[piece.ownerId] = 0;
        }
        scores[piece.ownerId] += mobility + positional;
      }
    }

    return scores;
  }
}

import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { ScoreTuple } from '../interfaces/IAIEngineContracts';

/**
 * Static piece valuation and material balancing (Spec 05 § 6, § 17 RNF-15, § 19).
 */
export class MaterialEvaluator {
  /**
   * Static piece values in centipawns (Spec 05 § 6 lines 96-110).
   */
  public static getPieceValue(variantId: string): number {
    const v = variantId.toUpperCase();
    if (v === 'P' || v === 'PAWN') return 100;
    if (v === 'N' || v === 'KNIGHT') return 300;
    if (v === 'B' || v === 'BISHOP') return 320;
    if (v === 'R' || v === 'ROOK') return 500;
    if (v === 'Q' || v === 'QUEEN') return 900;
    if (v === 'K' || v === 'KING') return 100000;

    // Specific known fairy pieces
    if (v === 'AMAZON') return 1200; // Queen + Knight
    if (v === 'CHANCELLOR') return 800; // Rook + Knight
    if (v === 'ARCHBISHOP') return 620; // Bishop + Knight

    // Heuristic fallback for Betza notation strings
    let score = 100;
    if (v.includes('Q')) score += 800;
    else if (v.includes('R')) score += 400;
    if (v.includes('B')) score += 220;
    if (v.includes('N')) score += 200;
    return score;
  }

  /**
   * Evaluates pure material scores across all players on the board.
   */
  public static evaluateMaterial(state: IDomainState): ScoreTuple {
    const scores: ScoreTuple = {
      P1: 0,
      P2: 0,
      P3: 0,
      P4: 0,
      P5: 0,
      P6: 0,
      P7: 0,
      P8: 0,
    };

    const isAntichess = state.variantId === 'ANTICHESS';

    for (const entity of Object.values(state.boardEntities)) {
      if (entity && entity.type === 'PIECE' && !(entity as IPieceEntity).isCaptured) {
        const piece = entity as IPieceEntity;
        const val = this.getPieceValue(piece.variantId);

        if (scores[piece.ownerId] === undefined) {
          scores[piece.ownerId] = 0;
        }

        if (isAntichess) {
          // In Antichess, having fewer pieces is desirable
          scores[piece.ownerId] -= val;
        } else {
          scores[piece.ownerId] += val;
        }
      }
    }

    return scores;
  }

  /**
   * Computes zero-sum material advantage from perspective of activePlayer vs opponent (for 2 players).
   * Verified by RNF-15: identical opposing setups return exactly 0.0.
   */
  public static evaluateMaterialDifference(
    state: IDomainState,
    perspectivePlayer: PlayerId,
    opponentPlayer: PlayerId
  ): number {
    const scores = this.evaluateMaterial(state);
    const myScore = scores[perspectivePlayer] ?? 0;
    const oppScore = scores[opponentPlayer] ?? 0;
    return myScore - oppScore;
  }
}

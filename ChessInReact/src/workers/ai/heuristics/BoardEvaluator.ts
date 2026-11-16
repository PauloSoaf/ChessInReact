import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { ITopology } from '../../../core/topology/types';
import { ScoreTuple } from '../interfaces/IAIEngineContracts';
import { MaterialEvaluator } from './MaterialEvaluator';
import { MobilityEvaluator } from './MobilityEvaluator';

const HILL_SQUARES = new Set(['3,3', '4,3', '3,4', '4,4']);

/**
 * Universal Board Static Evaluator (Spec 05 § 6 lines 80-134).
 * Returns ScoreTuple of absolute evaluations for N players, including variant-specific
 * positional and terminal objectives (King of the Hill, Racing Kings, Antichess, Crazyhouse, Atomic).
 */
export class BoardEvaluator {
  /**
   * Evaluates absolute scores for each player in centipawns.
   */
  public static evaluate(state: IDomainState, topology: ITopology): ScoreTuple {
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

    // Terminal condition evaluation
    if (state.isGameOver) {
      if (state.winnerId) {
        scores[state.winnerId] = 100000;
        for (const p in scores) {
          if (p !== state.winnerId) {
            scores[p] = -100000;
          }
        }
        return scores;
      } else {
        // Draw
        return scores; // all 0
      }
    }

    const materialScores = MaterialEvaluator.evaluateMaterial(state);
    const mobilityScores = MobilityEvaluator.evaluateMobility(state, topology);

    for (const player in materialScores) {
      const mat = materialScores[player] ?? 0;
      const mob = mobilityScores[player] ?? 0;
      scores[player] = mat + mob;
    }

    const vUpper = (state.variantId ?? '').toUpperCase();

    // Variant-specific positional & terminal evaluations
    if (vUpper === 'KING_OF_THE_HILL' || vUpper.includes('HILL')) {
      for (const entity of Object.values(state.boardEntities)) {
        if (entity && entity.type === 'PIECE' && !(entity as IPieceEntity).isCaptured) {
          const piece = entity as IPieceEntity;
          const pv = piece.variantId.toUpperCase();
          if (pv === 'KING' || pv === 'K') {
            if (HILL_SQUARES.has(piece.position)) {
              scores[piece.ownerId] = 100000;
            } else {
              const [kx, ky] = piece.position.split(',').map(Number);
              if (!Number.isNaN(kx) && !Number.isNaN(ky)) {
                const dist = Math.abs(kx - 3.5) + Math.abs(ky - 3.5);
                scores[piece.ownerId] = (scores[piece.ownerId] ?? 0) + Math.round((7 - dist) * 55);
              }
            }
          }
        }
      }
    } else if (vUpper === 'RACING_KINGS' || vUpper.includes('RACING')) {
      for (const entity of Object.values(state.boardEntities)) {
        if (entity && entity.type === 'PIECE' && !(entity as IPieceEntity).isCaptured) {
          const piece = entity as IPieceEntity;
          const pv = piece.variantId.toUpperCase();
          if (pv === 'KING' || pv === 'K') {
            const [, ky] = piece.position.split(',').map(Number);
            if (!Number.isNaN(ky)) {
              if (ky >= 7) {
                scores[piece.ownerId] = 100000;
              } else {
                scores[piece.ownerId] = (scores[piece.ownerId] ?? 0) + Math.pow(ky + 1, 3) * 18;
              }
            }
          }
        }
      }
    } else if (vUpper === 'ANTICHESS' || vUpper.includes('GIVEAWAY')) {
      const pieceCounts: Record<string, number> = { P1: 0, P2: 0 };
      for (const entity of Object.values(state.boardEntities)) {
        if (entity && entity.type === 'PIECE' && !(entity as IPieceEntity).isCaptured) {
          const p = entity as IPieceEntity;
          pieceCounts[p.ownerId] = (pieceCounts[p.ownerId] ?? 0) + 1;
        }
      }
      if (pieceCounts.P1 === 0 && pieceCounts.P2 > 0) {
        scores.P1 = 100000;
        scores.P2 = -100000;
      } else if (pieceCounts.P2 === 0 && pieceCounts.P1 > 0) {
        scores.P2 = 100000;
        scores.P1 = -100000;
      }
    } else if (vUpper === 'CRAZYHOUSE') {
      const pockets =
        (state as unknown as { pockets?: Record<string, Record<string, number>> }).pockets ??
        (state.turnState as unknown as { pockets?: Record<string, Record<string, number>> })?.pockets;
      if (pockets) {
        for (const [player, pocket] of Object.entries(pockets)) {
          if (!pocket) continue;
          let pocketBonus = 0;
          for (const [pieceType, count] of Object.entries(pocket)) {
            if (typeof count === 'number' && count > 0) {
              pocketBonus += Math.round(MaterialEvaluator.getPieceValue(pieceType) * 1.15 * count);
            }
          }
          scores[player] = (scores[player] ?? 0) + pocketBonus;
        }
      }
    }

    return scores;
  }

  /**
   * Relative zero-sum evaluation from perspective of player A vs player B.
   */
  public static evaluateRelative2P(
    state: IDomainState,
    topology: ITopology,
    playerA: PlayerId,
    playerB: PlayerId
  ): number {
    const scores = this.evaluate(state, topology);
    const scoreA = scores[playerA] ?? 0;
    const scoreB = scores[playerB] ?? 0;
    return scoreA - scoreB;
  }
}

import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { ScoreTuple } from '../interfaces/IAIEngineContracts';
import { MaterialEvaluator } from './MaterialEvaluator';
import { MobilityEvaluator } from './MobilityEvaluator';

/**
 * Universal Board Static Evaluator (Spec 05 § 6 lines 80-134).
 * Returns ScoreTuple of absolute evaluations for N players.
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

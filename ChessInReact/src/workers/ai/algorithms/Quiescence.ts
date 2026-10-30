import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { ILegalMove, IVariantConfiguration } from '../../../engine/rules/interfaces/IRulesContracts';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { BoardEvaluator } from '../heuristics/BoardEvaluator';
import { MaterialEvaluator } from '../heuristics/MaterialEvaluator';

/**
 * Quiescence Search with MVV-LVA move ordering (Spec 05 § 10.1, § 14.1 Fonte 7, § 16 RF-07).
 * Combats the Horizon Effect by extending tactical capture sequences until a quiet state is reached.
 */
export class QuiescenceSearch {
  /**
   * Sorts capture moves using Most Valuable Victim - Least Valuable Attacker (MVV-LVA).
   */
  public static orderCaptures(moves: readonly ILegalMove[], state: IDomainState): ILegalMove[] {
    return [...moves].sort((a, b) => {
      const victimA = a.capturedPieceId
        ? MaterialEvaluator.getPieceValue(
            (state.boardEntities[a.capturedPieceId] as IPieceEntity | undefined)?.variantId ?? 'P'
          )
        : 0;
      const victimB = b.capturedPieceId
        ? MaterialEvaluator.getPieceValue(
            (state.boardEntities[b.capturedPieceId] as IPieceEntity | undefined)?.variantId ?? 'P'
          )
        : 0;

      const attackerA = MaterialEvaluator.getPieceValue(
        (state.boardEntities[a.pieceId] as IPieceEntity | undefined)?.variantId ?? 'P'
      );
      const attackerB = MaterialEvaluator.getPieceValue(
        (state.boardEntities[b.pieceId] as IPieceEntity | undefined)?.variantId ?? 'P'
      );

      const scoreA = victimA * 10 - attackerA;
      const scoreB = victimB * 10 - attackerB;

      return scoreB - scoreA;
    });
  }

  /**
   * Executes Quiescence search for 2 players.
   *
   * @param state Game state to evaluate
   * @param alpha Lower bound
   * @param beta Upper bound
   * @param activePlayer Current player
   * @param opponentPlayer Opponent player
   * @param topology Active board topology
   * @param variantConfig Optional variant rules
   * @param maxDepth Optional cap on quiescence depth (default 4 plies)
   */
  public static search(
    state: IDomainState,
    alpha: number,
    beta: number,
    activePlayer: PlayerId,
    opponentPlayer: PlayerId,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    maxDepth = 4
  ): number {
    // Stand-pat evaluation
    const standPat = BoardEvaluator.evaluateRelative2P(state, topology, activePlayer, opponentPlayer);

    if (standPat >= beta) {
      return beta;
    }
    if (alpha < standPat) {
      alpha = standPat;
    }

    if (maxDepth <= 0 || state.isGameOver) {
      return standPat;
    }

    // Generate only legal captures
    const allLegalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    const captureMoves = allLegalMoves.filter((m) => m.isCapture || m.isPromotion);

    if (captureMoves.length === 0) {
      return standPat;
    }

    const sortedCaptures = this.orderCaptures(captureMoves, state);

    for (const move of sortedCaptures) {
      // Big Delta Pruning: if even capturing a Queen (+900) cannot raise alpha, prune
      const victimValue = move.capturedPieceId
        ? MaterialEvaluator.getPieceValue(
            (state.boardEntities[move.capturedPieceId] as IPieceEntity | undefined)?.variantId ?? 'P'
          )
        : 0;
      if (standPat + victimValue + 200 < alpha && !move.isPromotion) {
        continue;
      }

      const piece = state.boardEntities[move.pieceId] as IPieceEntity;
      const nextState = RulesEngine.simulateMove(
        state,
        piece,
        move.to,
        move.isCastling,
        move.isEnPassant
      );
      // Flip active player for next ply
      const nextDomainState: IDomainState = {
        ...nextState,
        activePlayer: opponentPlayer,
      };

      const score = -this.search(
        nextDomainState,
        -beta,
        -alpha,
        opponentPlayer,
        activePlayer,
        topology,
        variantConfig,
        maxDepth - 1
      );

      if (score >= beta) {
        return beta;
      }
      if (score > alpha) {
        alpha = score;
      }
    }

    return alpha;
  }
}

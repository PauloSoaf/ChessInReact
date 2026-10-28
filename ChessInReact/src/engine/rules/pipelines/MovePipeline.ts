import { ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IGameResult, ILegalMove, IVariantConfiguration } from '../interfaces/IRulesContracts';
import { AtomicModifier } from './modifiers/AtomicModifier';
import { AntichessModifier } from './modifiers/AntichessModifier';
import { KingOfTheHillModifier } from './modifiers/KingOfTheHillModifier';
import { CrazyhouseModifier } from './modifiers/CrazyhouseModifier';
import { IPieceEntity } from '../../../core/entities/types';

export class MovePipeline {
  /**
   * Applies post-move variant effects (e.g. Atomic detonations, Crazyhouse captures).
   */
  public static applyPostMoveEffects(
    state: IDomainState,
    move: ILegalMove,
    topology: ITopology,
    config?: IVariantConfiguration
  ): IDomainState {
    let currentState = state;

    // 1. Atomic explosion on capture (RF-08)
    if (config?.captureExplosion || config?.variantId === 'ATOMIC') {
      const explosion = AtomicModifier.applyExplosion(currentState, move, topology);
      currentState = explosion.state;
    }

    // 2. Crazyhouse pocket inventory on capture (RF-09)
    if ((config?.allowDrops || config?.variantId === 'CRAZYHOUSE') && move.isCapture && move.capturedPieceId) {
      const victim = state.boardEntities[move.capturedPieceId] as IPieceEntity | undefined;
      if (victim) {
        currentState = CrazyhouseModifier.addCapturedPieceToInventory(
          currentState,
          victim,
          currentState.activePlayer
        );
      }
    }

    return currentState;
  }

  /**
   * Filters pseudo-legal moves according to variant modifiers (e.g. Antichess mandatory capture).
   */
  public static filterLegalMoves(
    moves: readonly ILegalMove[],
    _state: IDomainState,
    _topology: ITopology,
    config?: IVariantConfiguration
  ): ILegalMove[] {
    void _state;
    void _topology;

    let filtered = [...moves];

    // Antichess forced capture (RF-10)
    if (config?.variantId === 'ANTICHESS') {
      filtered = AntichessModifier.filterMandatoryCaptures(filtered);
    }

    return filtered;
  }

  /**
   * Evaluates special variant victory conditions (King of the Hill, Antichess).
   */
  public static evaluateVictoryCondition(
    state: IDomainState,
    legalMovesCount: number,
    config?: IVariantConfiguration
  ): IGameResult {
    // 1. King of the Hill (RF-12)
    if (config?.hillCenterCoords || config?.variantId === 'KING_OF_THE_HILL') {
      const koth = KingOfTheHillModifier.evaluateHillControl(state, config?.hillCenterCoords);
      if (koth.isGameOver) {
        return koth;
      }
    }

    // 2. Antichess victory (RF-10)
    if (config?.variantId === 'ANTICHESS') {
      const antichess = AntichessModifier.evaluateAntichessOutcome(state, legalMovesCount);
      if (antichess.isGameOver) {
        return antichess;
      }
    }

    return {
      isGameOver: false,
      status: 'IN_PROGRESS',
      winnerId: null,
    };
  }
}

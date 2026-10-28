import { EntityId } from '../../../../core/coordinates/types';
import { IDomainState } from '../../../../core/state/gameState';
import { ILegalMove, IGameResult } from '../../interfaces/IRulesContracts';

export class AntichessModifier {
  /**
   * Filters candidate legal moves enforcing mandatory capture rule (RF-10).
   * If any capture move exists, ALL quiet moves are eliminated!
   */
  public static filterMandatoryCaptures(moves: readonly ILegalMove[]): ILegalMove[] {
    const captures = moves.filter((m) => m.isCapture);
    if (captures.length > 0) {
      return captures;
    }
    return [...moves];
  }

  /**
   * Evaluates Antichess victory condition (RF-10).
   * A player wins by losing all their pieces or by being stalemated.
   */
  public static evaluateAntichessOutcome(
    state: IDomainState,
    legalMovesCount: number
  ): IGameResult {
    const activePlayer = state.activePlayer;

    // Check remaining pieces for active player
    let activePlayerPieceCount = 0;
    for (const id in state.boardEntities) {
      const entity = state.boardEntities[id as EntityId];
      if (entity && entity.type === 'PIECE' && !entity.isCaptured && entity.ownerId === activePlayer) {
        activePlayerPieceCount++;
      }
    }

    if (activePlayerPieceCount === 0) {
      return {
        isGameOver: true,
        status: 'ALL_PIECES_LOST',
        winnerId: activePlayer,
        reason: `Antichess: Player ${activePlayer} has lost all pieces and wins the game!`,
      };
    }

    if (legalMovesCount === 0) {
      return {
        isGameOver: true,
        status: 'STALEMATE',
        winnerId: activePlayer,
        reason: `Antichess: Player ${activePlayer} is stalemated with no legal moves and wins!`,
      };
    }

    return {
      isGameOver: false,
      status: 'IN_PROGRESS',
      winnerId: null,
    };
  }
}

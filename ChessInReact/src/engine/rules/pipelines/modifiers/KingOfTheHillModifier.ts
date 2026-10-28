import { CoordinateKey, EntityId, asCoordinateKey } from '../../../../core/coordinates';
import { IDomainState } from '../../../../core/state/gameState';
import { IGameResult } from '../../interfaces/IRulesContracts';

export const DEFAULT_HILL_COORDS: readonly CoordinateKey[] = [
  asCoordinateKey('3,3'),
  asCoordinateKey('4,3'),
  asCoordinateKey('3,4'),
  asCoordinateKey('4,4'),
];

export class KingOfTheHillModifier {
  /**
   * Checks if any King has successfully captured the center hill (RF-12).
   */
  public static evaluateHillControl(
    state: IDomainState,
    hillCoords: readonly CoordinateKey[] = DEFAULT_HILL_COORDS
  ): IGameResult {
    for (const id in state.boardEntities) {
      const entity = state.boardEntities[id as EntityId];
      if (
        entity &&
        entity.type === 'PIECE' &&
        !entity.isCaptured &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K') &&
        hillCoords.includes(entity.position)
      ) {
        return {
          isGameOver: true,
          status: 'HILL_CONTROLLED',
          winnerId: entity.ownerId,
          reason: `King of the Hill: Player ${entity.ownerId}'s King conquered center square ${entity.position}!`,
        };
      }
    }

    return {
      isGameOver: false,
      status: 'IN_PROGRESS',
      winnerId: null,
    };
  }
}

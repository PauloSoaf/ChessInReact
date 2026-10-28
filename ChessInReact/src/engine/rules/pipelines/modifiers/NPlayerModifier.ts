import { CoordinateKey, EntityId, PlayerId } from '../../../../core/coordinates/types';
import { IDomainState } from '../../../../core/state/gameState';
import { IPieceEntity } from '../../../../core/entities/types';

export type EliminationPolicy = 'NEUTRALIZE' | 'REMOVE' | 'TRANSFER';

export class NPlayerModifier {
  /**
   * Applies elimination policy to the defeated player's pieces (RF-13).
   */
  public static eliminatePlayer(
    state: IDomainState,
    defeatedPlayerId: PlayerId,
    policy: EliminationPolicy,
    victorPlayerId?: PlayerId
  ): IDomainState {
    const nextOccupancy: Record<CoordinateKey, EntityId> = { ...state.occupancy };
    const nextEntities: Record<EntityId, IPieceEntity> = { ...state.boardEntities } as Record<
      EntityId,
      IPieceEntity
    >;

    for (const id in nextEntities) {
      const piece = nextEntities[id as EntityId];
      if (piece && piece.type === 'PIECE' && !piece.isCaptured && piece.ownerId === defeatedPlayerId) {
        switch (policy) {
          case 'NEUTRALIZE':
            // Neutral inert obstacles: cannot move, stay on board
            nextEntities[id as EntityId] = {
              ...piece,
              ownerId: 'NONE',
            };
            break;

          case 'REMOVE':
            // Removed from board entirely
            nextEntities[id as EntityId] = {
              ...piece,
              isCaptured: true,
            };
            delete nextOccupancy[piece.position];
            break;

          case 'TRANSFER':
            // Transferred to the victor
            if (victorPlayerId) {
              nextEntities[id as EntityId] = {
                ...piece,
                ownerId: victorPlayerId,
              };
            }
            break;
        }
      }
    }

    return {
      ...state,
      boardEntities: nextEntities,
      occupancy: nextOccupancy,
    };
  }
}

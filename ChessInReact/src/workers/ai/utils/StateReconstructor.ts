import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';
import { IEntity, IPieceEntity, ITerrainEntity, IObstacleEntity } from '../../../core/entities/types';
import { IDomainState } from '../../../core/state/gameState';
import { DeserializedWorkerState } from '../../../core/serialization/types';

/**
 * Reconstructs a full authoritative IDomainState from a deserialized worker buffer snapshot (ADR-002).
 */
export function reconstructDomainState(
  workerState: DeserializedWorkerState,
  variantId = 'CHESS_STANDARD'
): IDomainState {
  const boardEntities: Record<EntityId, IEntity> = {};
  const occupancy: Record<CoordinateKey, EntityId> = {};
  const terrain: Record<CoordinateKey, EntityId> = {};

  for (const item of workerState.entities) {
    const coordKey = (
      item.kind === 'HEX_CUBIC'
        ? `${item.x},${item.y},${item.z}`
        : `${item.x},${item.y}`
    ) as CoordinateKey;

    const entityId = item.id as EntityId;

    if (item.type === 'PIECE') {
      const piece: IPieceEntity = {
        id: entityId,
        type: 'PIECE',
        ownerId: item.ownerId as PlayerId,
        position: coordKey,
        variantId: item.variantId,
        hasMoved: item.hasMoved,
        isCaptured: item.isCaptured,
      };
      boardEntities[entityId] = piece;
      if (!item.isCaptured) {
        occupancy[coordKey] = entityId;
      }
    } else if (item.type === 'TERRAIN') {
      const terr: ITerrainEntity = {
        id: entityId,
        type: 'TERRAIN',
        position: coordKey,
        variantId: item.variantId,
      };
      boardEntities[entityId] = terr;
      terrain[coordKey] = entityId;
    } else if (item.type === 'OBSTACLE') {
      const obst: IObstacleEntity = {
        id: entityId,
        type: 'OBSTACLE',
        position: coordKey,
        destructible: false,
      };
      boardEntities[entityId] = obst;
      occupancy[coordKey] = entityId;
    }
  }

  return {
    matchId: 'ai-worker-sim-match',
    variantId,
    isGameOver: false,
    winnerId: null,
    activePlayer: workerState.activePlayer,
    turnNumber: workerState.turnNumber,
    revision: 0,
    boardEntities,
    occupancy,
    terrain,
    capturedInventory: {
      P1: [],
      P2: [],
      P3: [],
      P4: [],
      P5: [],
      P6: [],
      P7: [],
      P8: [],
      NONE: [],
    },
    turnState: {
      phase: 'WAITING',
      lastActionTimestamp: Date.now(),
      enPassantTarget: null,
      fiftyMoveCounter: 0,
      positionHistory: [],
    },
  };
}

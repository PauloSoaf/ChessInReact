import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';
import { IEntity, IPieceEntity, ITerrainEntity, IObstacleEntity } from '../../../core/entities/types';
import { IDomainState } from '../../../core/state/gameState';
import { DeserializedWorkerState, IWorkerStateMetadata } from '../../../core/serialization/types';

/**
 * Reconstructs a full authoritative IDomainState from a deserialized worker buffer snapshot (ADR-002).
 * Preserves enPassant, fiftyMoveCounter, positionHistory, capturedInventory (Crazyhouse),
 * and game completion state with 100% domain fidelity.
 */
export function reconstructDomainState(
  workerState: DeserializedWorkerState,
  variantIdOrMetadata?: string | IWorkerStateMetadata
): IDomainState {
  const metadata: IWorkerStateMetadata | undefined =
    typeof variantIdOrMetadata === 'object'
      ? variantIdOrMetadata
      : workerState.metadata;

  const resolvedVariantId =
    typeof variantIdOrMetadata === 'string'
      ? variantIdOrMetadata
      : (metadata?.variantId ?? 'CHESS_STANDARD');

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

  const enPassantTarget =
    (workerState.enPassantTarget as CoordinateKey | undefined) ??
    (metadata?.turnState?.enPassantTarget as CoordinateKey | undefined) ??
    null;

  const fiftyMoveCounter =
    workerState.fiftyMoveCounter ??
    metadata?.turnState?.fiftyMoveCounter ??
    0;

  const isGameOver =
    workerState.isGameOver ??
    metadata?.isGameOver ??
    false;

  const winnerId =
    workerState.winnerId !== undefined
      ? workerState.winnerId
      : (metadata?.winnerId ?? null);

  const capturedInventory: Record<PlayerId, string[]> = {
    P1: [...(metadata?.capturedInventory?.P1 ?? [])],
    P2: [...(metadata?.capturedInventory?.P2 ?? [])],
    P3: [...(metadata?.capturedInventory?.P3 ?? [])],
    P4: [...(metadata?.capturedInventory?.P4 ?? [])],
    P5: [...(metadata?.capturedInventory?.P5 ?? [])],
    P6: [...(metadata?.capturedInventory?.P6 ?? [])],
    P7: [...(metadata?.capturedInventory?.P7 ?? [])],
    P8: [...(metadata?.capturedInventory?.P8 ?? [])],
    P9: [...(metadata?.capturedInventory?.P9 ?? [])],
    P10: [...(metadata?.capturedInventory?.P10 ?? [])],
    P11: [...(metadata?.capturedInventory?.P11 ?? [])],
    P12: [...(metadata?.capturedInventory?.P12 ?? [])],
    NONE: [],
  };

  return {
    matchId: metadata?.matchId ?? 'ai-worker-sim-match',
    variantId: resolvedVariantId,
    isGameOver,
    winnerId,
    activePlayer: workerState.activePlayer,
    turnNumber: workerState.turnNumber,
    revision: metadata?.revision ?? 0,
    boardEntities,
    occupancy,
    terrain,
    capturedInventory,
    turnState: {
      phase: metadata?.turnState?.phase ?? 'WAITING',
      lastActionTimestamp: metadata?.turnState?.lastActionTimestamp ?? Date.now(),
      enPassantTarget,
      fiftyMoveCounter,
      positionHistory: metadata?.turnState?.positionHistory
        ? [...metadata.turnState.positionHistory]
        : [],
    },
  };
}

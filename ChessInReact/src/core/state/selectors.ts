import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from '../entities/types';
import { IGameState } from './gameState';

export const selectDomain = (state: IGameState) => state.domain;
export const selectUI = (state: IGameState) => state.ui;

export const selectMatchId = (state: IGameState): string => state.domain.matchId;
export const selectVariantId = (state: IGameState): string => state.domain.variantId;
export const selectIsGameOver = (state: IGameState): boolean => state.domain.isGameOver;
export const selectWinnerId = (state: IGameState): PlayerId | null => state.domain.winnerId;
export const selectActivePlayer = (state: IGameState): PlayerId => state.domain.activePlayer;
export const selectTurnNumber = (state: IGameState): number => state.domain.turnNumber;
export const selectRevision = (state: IGameState): number => state.domain.revision;

export const selectBoardEntities = (state: IGameState): Record<EntityId, IEntity> =>
  state.domain.boardEntities;
export const selectOccupancy = (state: IGameState): Record<CoordinateKey, EntityId> =>
  state.domain.occupancy;

export const selectEntity = (id: EntityId | null) => (state: IGameState): IEntity | undefined =>
  id ? state.domain.boardEntities[id] : undefined;

export const selectOccupant = (coord: CoordinateKey | null) => (state: IGameState): IEntity | undefined => {
  if (!coord) return undefined;
  const id = state.domain.occupancy[coord];
  return id ? state.domain.boardEntities[id] : undefined;
};

export const selectCapturedInventory = (player: PlayerId) => (state: IGameState): readonly string[] =>
  state.domain.capturedInventory[player] ?? [];

export const selectActivePieces = (state: IGameState): IPieceEntity[] => {
  const pieces: IPieceEntity[] = [];
  for (const entity of Object.values(state.domain.boardEntities)) {
    if (entity.type === 'PIECE' && !entity.isCaptured) {
      pieces.push(entity);
    }
  }
  return pieces;
};

export const selectTurnState = (state: IGameState) => state.domain.turnState;

// UI Selectors
export const selectSelectedPieceId = (state: IGameState): EntityId | null => state.ui.selectedPieceId;
export const selectHighlightedCoords = (state: IGameState): readonly CoordinateKey[] =>
  state.ui.highlightedCoords;
export const selectHoveredCoord = (state: IGameState): CoordinateKey | null => state.ui.hoveredCoord;
export const selectVisibilityWindow = (state: IGameState) => state.ui.visibilityWindow;

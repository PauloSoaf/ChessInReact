import { type StoreApi, useStore } from 'zustand';
import { CoordinateKey, EntityId } from '../../core/coordinates';
import { gameStore } from '../../core/state/gameStore';
import { IGameStore } from '../../core/state/gameState';
import * as selectors from '../../core/state/selectors';

/**
 * React hook binding for the Vanilla Zustand gameStore.
 * Allows components to reactively subscribe to granular slices.
 */
export function useGameStore<T>(
  selector: (state: IGameStore) => T,
  equalityFn?: (left: T, right: T) => boolean
): T {
  return useStore(gameStore as StoreApi<IGameStore>, selector, equalityFn);
}

/**
 * Granular hooks for optimal component render isolation.
 */
export function useActivePlayer() {
  return useGameStore(selectors.selectActivePlayer);
}

export function useTurnNumber() {
  return useGameStore(selectors.selectTurnNumber);
}

export function useIsGameOver() {
  return useGameStore(selectors.selectIsGameOver);
}

export function usePiece(id: EntityId | null) {
  return useGameStore(selectors.selectEntity(id));
}

export function useOccupant(coord: CoordinateKey | null) {
  return useGameStore(selectors.selectOccupant(coord));
}

export function useSelectedPieceId() {
  return useGameStore(selectors.selectSelectedPieceId);
}

export function useHighlightedCoords() {
  return useGameStore(selectors.selectHighlightedCoords);
}

export function useGameActions() {
  return useGameStore((state) => ({
    executeCommand: state.executeCommand,
    undo: state.undo,
    redo: state.redo,
    syncDomainState: state.syncDomainState,
    resetDomainState: state.resetDomainState,
    setActivePlayer: state.setActivePlayer,
    selectPiece: state.selectPiece,
    setHighlights: state.setHighlights,
    setHoveredCoord: state.setHoveredCoord,
  }));
}

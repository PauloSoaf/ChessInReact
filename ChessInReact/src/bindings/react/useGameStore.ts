import { type StoreApi, useStore } from 'zustand';
import { CoordinateKey, EntityId } from '../../core/coordinates';
import { gameStore } from '../../core/state/gameStore';
import { IGameStore } from '../../core/state/gameState';
import { IPieceEntity } from '../../core/entities/types';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
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

const defaultTopologyForHook = new SquareTopology({ width: 8, height: 8 });

/**
 * Typed selector hook providing legal move targets for the currently selected piece (Spec 04 & Spec 06).
 */
export function useLegalMovesForSelectedPiece(): readonly CoordinateKey[] {
  const selectedPieceId = useSelectedPieceId();
  const domain = useGameStore((state) => state.domain);

  if (!selectedPieceId) return [];
  const piece = domain.boardEntities[selectedPieceId] as IPieceEntity | undefined;
  if (!piece || piece.type !== 'PIECE') return [];

  const legalMoves = RulesEngine.getLegalMovesForPiece(piece, domain, defaultTopologyForHook);
  return legalMoves.map((m) => m.to);
}

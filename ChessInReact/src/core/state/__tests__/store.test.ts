import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asCoordinateKey, asEntityId, CoordinateKey } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import {
  createDefaultDomainState,
  createGameStore,
  selectActivePieces,
  selectActivePlayer,
  selectBoardEntities,
  selectCapturedInventory,
  selectDomain,
  selectEntity,
  selectHoveredCoord,
  selectIsGameOver,
  selectOccupant,
  selectRevision,
  selectSelectedPieceId,
  selectTurnNumber,
  selectTurnState,
  selectUI,
  selectVariantId,
  selectVisibilityWindow,
  selectWinnerId,
} from '../index';
import { IStoreCommand } from '../gameState';

describe('Vanilla Zustand GameStore & Selectors', () => {
  let store: ReturnType<typeof createGameStore>;

  const samplePiece: IPieceEntity = {
    id: asEntityId('white-queen'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'QUEEN',
    position: asCoordinateKey('3,0'),
    hasMoved: false,
    isCaptured: false,
  };

  beforeEach(() => {
    const domain = createDefaultDomainState('test-match');
    domain.boardEntities[samplePiece.id] = samplePiece;
    domain.occupancy[samplePiece.position] = samplePiece.id;
    store = createGameStore(domain);
  });

  it('initializes domain and UI states correctly', () => {
    const state = store.getState();
    expect(state.domain.matchId).toBe('test-match');
    expect(state.domain.turnNumber).toBe(1);
    expect(state.domain.revision).toBe(0);
    expect(state.ui.selectedPieceId).toBeNull();
  });

  it('maintains strict domain vs UI state isolation (Section E)', () => {
    const initialDomain = store.getState().domain;

    // Mutate UI state
    store.getState().selectPiece(samplePiece.id);
    store.getState().setHighlights([asCoordinateKey('3,1'), asCoordinateKey('3,2')]);

    const stateAfterUI = store.getState();
    expect(stateAfterUI.ui.selectedPieceId).toBe(samplePiece.id);
    expect(stateAfterUI.ui.highlightedCoords).toHaveLength(2);

    // Domain state reference and revision MUST remain untouched
    expect(stateAfterUI.domain).toBe(initialDomain);
    expect(stateAfterUI.domain.revision).toBe(0);
  });

  it('executes command through Immer with structural sharing and increments revision', () => {
    const moveCommand: IStoreCommand = {
      execute: (draft) => {
        const piece = draft.boardEntities[samplePiece.id];
        delete draft.occupancy[piece.position];
        (piece as { position: CoordinateKey }).position = asCoordinateKey('3,4');
        draft.occupancy[asCoordinateKey('3,4')] = samplePiece.id;
        (piece as { hasMoved: boolean }).hasMoved = true;
      },
      undo: (draft) => {
        const piece = draft.boardEntities[samplePiece.id];
        delete draft.occupancy[piece.position];
        (piece as { position: CoordinateKey }).position = asCoordinateKey('3,0');
        draft.occupancy[asCoordinateKey('3,0')] = samplePiece.id;
        (piece as { hasMoved: boolean }).hasMoved = false;
      },
    };

    store.getState().executeCommand(moveCommand);

    const state = store.getState();
    expect(state.domain.revision).toBe(1);
    expect(state.domain.occupancy[asCoordinateKey('3,4')]).toBe(samplePiece.id);
    expect(state.domain.occupancy[asCoordinateKey('3,0')]).toBeUndefined();
    expect(state.domain.boardEntities[samplePiece.id].position).toBe('3,4');
  });

  it('allows granular selectors without whole-state extraction', () => {
    const state = store.getState();
    expect(selectActivePlayer(state)).toBe('P1');
    expect(selectTurnNumber(state)).toBe(1);
    expect(selectIsGameOver(state)).toBe(false);
    expect(selectSelectedPieceId(state)).toBeNull();

    expect(selectEntity(samplePiece.id)(state)).toEqual(samplePiece);
    expect(selectOccupant(samplePiece.position)(state)).toEqual(samplePiece);
    expect(selectOccupant(asCoordinateKey('9,9'))(state)).toBeUndefined();
    expect(selectBoardEntities(state)[samplePiece.id]).toBeDefined();
  });

  it('supports subscribeWithSelector for transient updates without re-renders', () => {
    const listener = vi.fn();

    // Subscribe ONLY to UI selectedPieceId
    const unsubscribe = store.subscribe(
      (state) => state.ui.selectedPieceId,
      listener
    );

    // Mutating hover or active player should NOT trigger this listener
    store.getState().setActivePlayer('P2');
    store.getState().setHoveredCoord(asCoordinateKey('1,1'));
    expect(listener).not.toHaveBeenCalled();

    // Mutating selectedPieceId triggers the listener with new value
    store.getState().selectPiece(samplePiece.id);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(samplePiece.id, null);

    unsubscribe();
  });

  it('syncs domain state cleanly for server reconciliation (RF-08)', () => {
    const freshDomain = {
      ...createDefaultDomainState('server-match-42'),
      turnNumber: 15,
    };

    store.getState().syncDomainState(freshDomain);

    expect(store.getState().domain.matchId).toBe('server-match-42');
    expect(store.getState().domain.turnNumber).toBe(15);
  });

  it('exercises remaining domain and UI actions and selectors', () => {
    const state0 = store.getState();
    expect(selectDomain(state0)).toBeDefined();
    expect(selectUI(state0)).toBeDefined();
    expect(selectVariantId(state0)).toBe('classic_square');
    expect(selectWinnerId(state0)).toBeNull();
    expect(selectRevision(state0)).toBe(0);

    // Active pieces selector
    const activePieces = selectActivePieces(state0);
    expect(activePieces).toHaveLength(1);
    expect(activePieces[0].id).toBe(samplePiece.id);

    // Turn state and captured inventory selectors
    expect(selectTurnState(state0).phase).toBe('WAITING');
    expect(selectCapturedInventory('P1')(state0)).toEqual([]);

    // UI actions: setHoveredCoord, setVisibilityWindow, resetUIState
    store.getState().setHoveredCoord(asCoordinateKey('5,5'));
    expect(selectHoveredCoord(store.getState())).toBe('5,5');

    const customWindow = { qMin: -10, qMax: 10, rMin: -10, rMax: 10 };
    store.getState().setVisibilityWindow(customWindow);
    expect(selectVisibilityWindow(store.getState())).toEqual(customWindow);

    store.getState().resetUIState();
    expect(selectHoveredCoord(store.getState())).toBeNull();

    // Domain actions: setGameStatus and resetDomainState
    store.getState().setGameStatus(true, 'P1');
    expect(selectIsGameOver(store.getState())).toBe(true);
    expect(selectWinnerId(store.getState())).toBe('P1');

    store.getState().resetDomainState(createDefaultDomainState('fresh-new-match'));
    expect(store.getState().domain.matchId).toBe('fresh-new-match');
    expect(selectIsGameOver(store.getState())).toBe(false);
  });
});

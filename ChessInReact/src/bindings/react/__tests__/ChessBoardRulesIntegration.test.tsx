// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import ChessBoard from '../../../components/ChessBoard/ChessBoard';
import { gameStore } from '../../../core/state/gameStore';
import { bootstrapGame } from '../../../core/bootstrap/GameInitializer';
import { asCoordinateKey } from '../../../core/coordinates';

describe('ChessBoard & Local Rules Engine Integration', () => {
  beforeEach(() => {
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {},
      occupancy: {},
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
    });
    bootstrapGame({ targetStore: gameStore });
  });

  it('rejects an illegal move and preserves board state and active player', () => {
    const { container } = render(<ChessBoard />);

    // White pawn at (4, 1) -> e2
    const pawnSquare = container.querySelector('[data-testid="square-4,1"]');
    expect(pawnSquare).not.toBeNull();
    act(() => {
      fireEvent.click(pawnSquare!);
    });

    // Check that selected entity is the pawn at (4, 1)
    const storeStateAfterSelect = gameStore.getState();
    const selectedId = storeStateAfterSelect.ui.selectedPieceId;
    expect(selectedId).not.toBeNull();

    // Attempt illegal move: Pawn e2 to e5 (4, 4), which is 3 squares forward
    const illegalDestSquare = container.querySelector('[data-testid="square-4,4"]');
    expect(illegalDestSquare).not.toBeNull();
    act(() => {
      fireEvent.click(illegalDestSquare!);
    });

    // Verification:
    // 1. Pawn is still at (4, 1)
    const stateAfterIllegal = gameStore.getState();
    expect(stateAfterIllegal.domain.occupancy[asCoordinateKey('4,1')]).toBe(selectedId);
    expect(stateAfterIllegal.domain.occupancy[asCoordinateKey('4,4')]).toBeUndefined();
    // 2. Active player is STILL P1 (White)
    expect(stateAfterIllegal.domain.activePlayer).toBe('P1');
  });

  it('accepts a legal move (e2 to e4) and updates state, occupancy, and turn, and supports undo', () => {
    const { container } = render(<ChessBoard />);

    // White pawn at (4, 1) -> e2
    const pawnSquare = container.querySelector('[data-testid="square-4,1"]');
    act(() => {
      fireEvent.click(pawnSquare!);
    });

    // Legal move: Pawn e2 to e4 (4, 3)
    const legalDestSquare = container.querySelector('[data-testid="square-4,3"]');
    act(() => {
      fireEvent.click(legalDestSquare!);
    });

    const stateAfterMove = gameStore.getState();
    expect(stateAfterMove.domain.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
    expect(stateAfterMove.domain.occupancy[asCoordinateKey('4,3')]).toBeDefined();
    // Turn switches to P2 (Black)
    expect(stateAfterMove.domain.activePlayer).toBe('P2');

    // Test undo restores previous state
    act(() => {
      const undoSuccess = gameStore.getState().undo();
      expect(undoSuccess).toBe(true);
    });

    const stateAfterUndo = gameStore.getState();
    expect(stateAfterUndo.domain.occupancy[asCoordinateKey('4,1')]).toBeDefined();
    expect(stateAfterUndo.domain.occupancy[asCoordinateKey('4,3')]).toBeUndefined();
    expect(stateAfterUndo.domain.activePlayer).toBe('P1');
  });
});

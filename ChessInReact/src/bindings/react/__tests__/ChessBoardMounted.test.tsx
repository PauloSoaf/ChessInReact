// @vitest-environment jsdom
import { render, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChessBoard from '../../../components/ChessBoard/ChessBoard';
import { bootstrapGame } from '../../../core/bootstrap/GameInitializer';
import { gameStore } from '../../../core/state/gameStore';
import { useActivePlayer, useGameActions, useTurnNumber } from '../useGameStore';

function TestGameApp() {
  const activePlayer = useActivePlayer();
  const turnNumber = useTurnNumber();
  const { undo, redo } = useGameActions();

  return (
    <div>
      <div data-testid="active-player">{activePlayer}</div>
      <div data-testid="turn-number">{turnNumber}</div>
      <button data-testid="btn-undo" onClick={() => undo()}>
        Undo
      </button>
      <button data-testid="btn-redo" onClick={() => redo()}>
        Redo
      </button>
      <button
        data-testid="btn-reset"
        onClick={() => {
          // Clean re-bootstrap
          gameStore.getState().resetDomainState({
            ...gameStore.getState().domain,
            boardEntities: {},
            occupancy: {},
            revision: 0,
            turnNumber: 1,
            activePlayer: 'P1',
          });
          bootstrapGame({ targetStore: gameStore });
        }}
      >
        Reset
      </button>
      <ChessBoard boardSize={8} />
    </div>
  );
}

describe('Mounted UI Integration: Reactive User Interactions & Turn Progression (PATCH-10)', () => {
  beforeEach(() => {
    // Fresh game bootstrap before each test
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

  it('executes full interactive user flow: select -> move -> reactive rerender -> undo -> redo -> reset', () => {
    render(<TestGameApp />);

    // 1. Initial State
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('1');

    const originSquare = screen.getByTestId('square-4,1');
    const destSquare = screen.getByTestId('square-4,3');

    expect(originSquare.textContent).toContain('♟');
    expect(destSquare.textContent).not.toContain('♟');

    // 2. Click origin pawn (e2) to select
    fireEvent.click(originSquare);
    expect(gameStore.getState().ui.selectedPieceId).toBe('w-pawn-4');

    // 3. Click destination (e4) to move
    fireEvent.click(destSquare);

    // Assert reactive UI updates without remounting
    expect(originSquare.textContent).not.toContain('♟');
    expect(destSquare.textContent).toContain('♟');
    expect(screen.getByTestId('active-player').textContent).toBe('P2');
    expect(screen.getByTestId('turn-number').textContent).toBe('2');
    expect(gameStore.getState().ui.selectedPieceId).toBeNull();

    // 4. Click Undo button
    fireEvent.click(screen.getByTestId('btn-undo'));

    // Assert original board layout and turn metadata restored
    expect(originSquare.textContent).toContain('♟');
    expect(destSquare.textContent).not.toContain('♟');
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('1');

    // 5. Click Redo button
    fireEvent.click(screen.getByTestId('btn-redo'));

    // Assert move reapplied
    expect(originSquare.textContent).not.toContain('♟');
    expect(destSquare.textContent).toContain('♟');
    expect(screen.getByTestId('active-player').textContent).toBe('P2');
    expect(screen.getByTestId('turn-number').textContent).toBe('2');

    // 6. Click Reset button
    fireEvent.click(screen.getByTestId('btn-reset'));

    // Assert initial configuration restored
    expect(originSquare.textContent).toContain('♟');
    expect(destSquare.textContent).not.toContain('♟');
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('1');
  });

  it('supports consecutive interactive moves by both players', () => {
    render(<TestGameApp />);

    // Turn 1: White moves e2 -> e4 (4,1 -> 4,3)
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    expect(screen.getByTestId('active-player').textContent).toBe('P2');
    expect(screen.getByTestId('turn-number').textContent).toBe('2');
    expect(screen.getByTestId('square-4,3').textContent).toContain('♟');

    // Turn 2: Black moves e7 -> e5 (4,6 -> 4,4)
    fireEvent.click(screen.getByTestId('square-4,6'));
    fireEvent.click(screen.getByTestId('square-4,4'));

    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('3');
    expect(screen.getByTestId('square-4,4').textContent).toContain('♟');

    // Undo Black's move
    fireEvent.click(screen.getByTestId('btn-undo'));
    expect(screen.getByTestId('active-player').textContent).toBe('P2');
    expect(screen.getByTestId('turn-number').textContent).toBe('2');
    expect(screen.getByTestId('square-4,4').textContent).not.toContain('♟');
    expect(screen.getByTestId('square-4,6').textContent).toContain('♟');

    // Undo White's move
    fireEvent.click(screen.getByTestId('btn-undo'));
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('1');
    expect(screen.getByTestId('square-4,3').textContent).not.toContain('♟');
    expect(screen.getByTestId('square-4,1').textContent).toContain('♟');
  });

  it('handles rejected moves without corrupting state or advancing turn, resetting selection', () => {
    render(<TestGameApp />);

    // White selects pawn at e2 (4,1)
    fireEvent.click(screen.getByTestId('square-4,1'));
    expect(gameStore.getState().ui.selectedPieceId).toBe('w-pawn-4');

    // White attempts illegal move onto friendly pawn at d2 (3,1)
    fireEvent.click(screen.getByTestId('square-3,1'));

    // Clicking friendly piece switches selection
    expect(gameStore.getState().ui.selectedPieceId).toBe('w-pawn-3');

    // Clicking same piece deselects
    fireEvent.click(screen.getByTestId('square-3,1'));
    expect(gameStore.getState().ui.selectedPieceId).toBeNull();

    // Turn and active player remain unchanged
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    expect(screen.getByTestId('turn-number').textContent).toBe('1');
  });

  it('dispatches exactly once per click on the real clickable square (no duplicated handler)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<TestGameApp />);

    const origin = screen.getByTestId('square-4,1');
    // The element carrying the test id must itself own the click handler (no wrapper handler)
    expect(origin.parentElement?.getAttribute('data-testid')).toBe('chess-board');

    fireEvent.click(origin);
    fireEvent.click(screen.getByTestId('square-4,3'));

    // A duplicated handler would re-run the move with stale state and be rejected (warn)
    expect(warnSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('turn-number').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('btn-undo'));
    // Exactly one history entry existed: a second undo is a no-op
    fireEvent.click(screen.getByTestId('btn-undo'));
    expect(screen.getByTestId('turn-number').textContent).toBe('1');
    expect(screen.getByTestId('active-player').textContent).toBe('P1');
    warnSpy.mockRestore();
  });
});

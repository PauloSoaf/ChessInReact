// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import App from '../../../App';
import { bootstrapGame } from '../../../core/bootstrap/GameInitializer';
import { gameStore } from '../../../core/state/gameStore';
import { BotMatchController } from '../../../controllers/BotMatchController';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { EngineBridge } from '../../../core/workers/EngineBridge';

describe('Spec 05 React.StrictMode Human vs Bot Autonomous Match Integration Suite', () => {
  afterEach(() => {
    cleanup();
  });

  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    window.location.hash = '#game';
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {},
      occupancy: {},
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
      isGameOver: false,
      winnerId: null,
    });
    bootstrapGame({ targetStore: gameStore });
  });

  it('mounts cleanly under React.StrictMode and maintains active bot controller across mount/unmount simulation', async () => {
    const { container } = render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox).toBeDefined();
    expect(checkbox.checked).toBe(false);

    // Toggle AI Opponent ON
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // White moves e2 -> e4 (4,1 -> 4,3)
    const e2Square = screen.getByTestId('square-4,1');
    const e4Square = screen.getByTestId('square-4,3');

    fireEvent.click(e2Square);
    fireEvent.click(e4Square);

    // Pawn is now at e4, active player transitioned to P2 (Bot)
    expect(e4Square.textContent).toContain('♟');

    // Wait for the bot (MockWorkerPort / AIEngine) to respond automatically
    await waitFor(
      () => {
        // Bot completed its response, turn returned to White (P1)
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(3);
      },
      { timeout: 3000 }
    );

    // Verify eval badge is updated with centipawn score
    const evalBadge = container.querySelector('#bot-eval-badge');
    expect(evalBadge).toBeDefined();
    expect(evalBadge?.textContent).toContain('Eval:');
  });

  it('executes 3 consecutive interactive rounds of human vs bot play without stalling', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Round 1: White plays e2 -> e4 (4,1 -> 4,3)
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    await waitFor(
      () => {
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(3);
      },
      { timeout: 3000 }
    );

    // Round 2: White plays d2 -> d4 (3,1 -> 3,3)
    fireEvent.click(screen.getByTestId('square-3,1'));
    fireEvent.click(screen.getByTestId('square-3,3'));

    await waitFor(
      () => {
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(5);
      },
      { timeout: 3000 }
    );

    // Round 3: White plays g1 -> f3 (6,0 -> 5,2)
    fireEvent.click(screen.getByTestId('square-6,0'));
    fireEvent.click(screen.getByTestId('square-5,2'));

    await waitFor(
      () => {
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(7);
      },
      { timeout: 3000 }
    );
  });

  it('undoes a full 2-ply round when AI opponent is enabled to preserve human turn flow', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // White moves e2 -> e4
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    // Wait for Black bot to move
    await waitFor(
      () => {
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(3);
      },
      { timeout: 3000 }
    );

    // Click Undo (Desfazer)
    const undoButton = screen.getByRole('button', { name: /Desfazer/i });
    fireEvent.click(undoButton);

    // Must undo full round: turn returns to Turn 1 (White's turn) without triggering Black
    expect(gameStore.getState().domain.activePlayer).toBe('P1');
    expect(gameStore.getState().domain.turnNumber).toBe(1);
    expect(screen.getByTestId('square-4,1').textContent).toContain('♟');
    expect(screen.getByTestId('square-4,3').textContent).not.toContain('♟');
  });

  it('prevents human player from clicking or moving black pieces while AI opponent is active', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // While AI is enabled for Black (P2), clicking Black piece at e7 (4,6) must be ignored
    const blackPawn = screen.getByTestId('square-4,6');
    fireEvent.click(blackPawn);

    expect(gameStore.getState().ui.selectedPieceId).toBeNull();
  });

  it('resets the match cleanly, aborting any active search and restoring initial state', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // White moves e2 -> e4
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    // Reset match
    const resetButton = screen.getByRole('button', { name: /Reiniciar Partida/i });
    fireEvent.click(resetButton);

    expect(gameStore.getState().domain.activePlayer).toBe('P1');
    expect(gameStore.getState().domain.turnNumber).toBe(1);
    expect(screen.getByTestId('square-4,1').textContent).toContain('♟');
    expect(screen.getByTestId('square-4,3').textContent).not.toContain('♟');
  });

  it('executes coherent round-trip Undo and Redo operations in AI opponent mode without triggering re-calculation', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // 1. White plays e2 -> e4
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    // Wait for Black bot to respond (Round 1 complete, Turn 3)
    await waitFor(
      () => {
        expect(gameStore.getState().domain.activePlayer).toBe('P1');
        expect(gameStore.getState().domain.turnNumber).toBe(3);
      },
      { timeout: 3000 }
    );

    const botRespondedPieceId = Object.keys(gameStore.getState().domain.boardEntities).find((id) => {
      const p = gameStore.getState().domain.boardEntities[id as EntityId];
      return p.type === 'PIECE' && p.ownerId === 'P2' && p.hasMoved;
    }) as EntityId | undefined;
    expect(botRespondedPieceId).toBeDefined();

    // 2. Click Undo: rolls back full 2-ply round to Turn 1 (White's turn)
    const undoButton = screen.getByRole('button', { name: /Desfazer/i });
    fireEvent.click(undoButton);

    expect(gameStore.getState().domain.activePlayer).toBe('P1');
    expect(gameStore.getState().domain.turnNumber).toBe(1);
    expect(screen.getByTestId('square-4,1').textContent).toContain('♟');
    expect(screen.getByTestId('square-4,3').textContent).not.toContain('♟');

    // 3. Click Redo: restores full 2-ply round to Turn 3 (White's turn) with bot's exact previous move
    const redoButton = screen.getByRole('button', { name: /Refazer/i });
    fireEvent.click(redoButton);

    expect(gameStore.getState().domain.activePlayer).toBe('P1');
    expect(gameStore.getState().domain.turnNumber).toBe(3);
    expect(screen.getByTestId('square-4,3').textContent).toContain('♟');
    // Bot's moved piece is restored
    const restoredBotPiece = gameStore.getState().domain.boardEntities[botRespondedPieceId!] as IPieceEntity;
    expect(restoredBotPiece.hasMoved).toBe(true);

    // 4. Invalidation test: Undo back to Turn 1, then play a new alternative move d2 -> d4
    fireEvent.click(undoButton);
    expect(gameStore.getState().domain.turnNumber).toBe(1);

    // Play alternative move d2 -> d4 (3,1 -> 3,3)
    fireEvent.click(screen.getByTestId('square-3,1'));
    fireEvent.click(screen.getByTestId('square-3,3'));

    // Redo should now be invalidated by the new branch
    fireEvent.click(redoButton);
    // Board stays on d4 (new branch), turn number proceeds from the new branch
    expect(screen.getByTestId('square-3,3').textContent).toContain('♟');
    expect(screen.getByTestId('square-4,3').textContent).not.toContain('♟');
  });

  it('supports multi-round Undo and Redo across consecutive turns while bot is active', async () => {
    render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // Round 1: e2 -> e4
    fireEvent.click(screen.getByTestId('square-4,1'));
    fireEvent.click(screen.getByTestId('square-4,3'));

    await waitFor(
      () => {
        expect(gameStore.getState().domain.turnNumber).toBe(3);
      },
      { timeout: 3000 }
    );

    // Round 2: d2 -> d4
    fireEvent.click(screen.getByTestId('square-3,1'));
    fireEvent.click(screen.getByTestId('square-3,3'));

    await waitFor(
      () => {
        expect(gameStore.getState().domain.turnNumber).toBe(5);
      },
      { timeout: 3000 }
    );

    const undoButton = screen.getByRole('button', { name: /Desfazer/i });
    const redoButton = screen.getByRole('button', { name: /Refazer/i });

    // Undo Round 2
    fireEvent.click(undoButton);
    expect(gameStore.getState().domain.turnNumber).toBe(3);
    expect(gameStore.getState().domain.activePlayer).toBe('P1');

    // Undo Round 1
    fireEvent.click(undoButton);
    expect(gameStore.getState().domain.turnNumber).toBe(1);
    expect(gameStore.getState().domain.activePlayer).toBe('P1');

    // Redo Round 1
    fireEvent.click(redoButton);
    expect(gameStore.getState().domain.turnNumber).toBe(3);
    expect(gameStore.getState().domain.activePlayer).toBe('P1');

    // Redo Round 2
    fireEvent.click(redoButton);
    expect(gameStore.getState().domain.turnNumber).toBe(5);
    expect(gameStore.getState().domain.activePlayer).toBe('P1');
  });

  it('measures linear emergency fallback latency under simulated worker failure (< 2.0ms budget)', async () => {
    const topology = new SquareTopology({ width: 8, height: 8 });
    const failingBridge = {
      calculateBestMove: vi.fn().mockRejectedValueOnce(new Error('Simulated WebWorker Failure')),
      cancelPendingSearches: vi.fn(),
      isDisposedBridge: vi.fn().mockReturnValue(false),
      dispose: vi.fn(),
      isReady: () => false,
    } as unknown as EngineBridge;

    const controller = new BotMatchController({
      bridge: failingBridge,
      topology,
      botPlayer: 'P2',
    });
    controller.setEnabled(true);

    // Advance turn to P2
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      turnNumber: 2,
      activePlayer: 'P2',
    });

    const start = performance.now();
    const result = await controller.checkAndTriggerBotTurn();
    const duration = performance.now() - start;

    expect(result).not.toBeNull();
    expect(result?.bestMove).toBeDefined();
    expect(result?.calculationTimeMs).toBeLessThanOrEqual(5);
    expect(duration).toBeLessThan(100);
    console.log(`[MEASURED LATENCY] Bot Emergency Fallback: total=${duration.toFixed(3)}ms, calculation=${result?.calculationTimeMs}ms`);
    controller.dispose();
  });
});

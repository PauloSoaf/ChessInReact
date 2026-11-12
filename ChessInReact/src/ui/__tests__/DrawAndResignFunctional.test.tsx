// @vitest-environment jsdom
import { render, fireEvent, screen, cleanup, waitFor, act } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { bootstrapGame } from '../../core/bootstrap/GameInitializer';
import { gameStore } from '../../core/state/gameStore';

describe('Draw and Resign Functional Suite (Spec 06 & Spec 04 Audit Patch 2)', () => {
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

  it('resigning against bot as Human (P1) awards victory to Bot (P2) even during P2 thinking turn', async () => {
    render(<App />);

    // Ensure bot is enabled
    const botToggle = document.getElementById('bot-toggle-checkbox') as HTMLInputElement;
    expect(botToggle).not.toBeNull();
    if (!botToggle.checked) {
      act(() => {
        fireEvent.click(botToggle);
      });
    }

    // Verify initial match state
    expect(gameStore.getState().domain.isGameOver).toBe(false);

    // Simulate turn currently on P2 (Bot's turn)
    act(() => {
      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          activePlayer: 'P2',
        },
      }));
    });

    const resignBtn = screen.getByRole('button', { name: /Abandonar Partida/i });
    expect(resignBtn).toBeDefined();

    act(() => {
      fireEvent.click(resignBtn);
    });

    // Match should be game over with winner P2 (Bot won because human resigned)
    const state = gameStore.getState().domain;
    expect(state.isGameOver).toBe(true);
    expect(state.winnerId).toBe('P2');

    // Feedback banner should inform that White resigned and victory was awarded to Black
    await waitFor(() => {
      const banner = screen.queryByTestId('check-constraint-banner');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('Brancas abandonaram a partida');
      expect(banner?.textContent).toContain('Pretas');
      expect(banner?.className).toContain('check-constraint-banner--info');
    });
  });

  it('in local 2-player pass & play, draw offer requires opponent confirmation', async () => {
    render(<App />);

    // Ensure bot is disabled for local 2-player mode
    const botToggle = document.getElementById('bot-toggle-checkbox') as HTMLInputElement;
    expect(botToggle).not.toBeNull();
    if (botToggle.checked) {
      act(() => {
        fireEvent.click(botToggle);
      });
    }

    expect(gameStore.getState().domain.isGameOver).toBe(false);

    const drawBtn = screen.getByRole('button', { name: /Propor Empate/i });
    expect(drawBtn).toBeDefined();

    // White (P1) proposes draw
    act(() => {
      fireEvent.click(drawBtn);
    });

    // Match must NOT be terminated yet! Opponent must accept!
    expect(gameStore.getState().domain.isGameOver).toBe(false);

    // Banner indicates offer was made
    const banner = screen.getByTestId('check-constraint-banner');
    expect(banner.textContent).toContain('propuseram empate');

    // Simulate switch of active player to Black (P2)
    act(() => {
      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          activePlayer: 'P2',
        },
      }));
    });

    // Wait for button to show "Aceitar Empate" for Black
    const acceptBtn = screen.getByRole('button', { name: /Aceitar Empate/i });
    expect(acceptBtn).toBeDefined();

    // Black accepts draw
    act(() => {
      fireEvent.click(acceptBtn);
    });

    // Match now terminates in mutual draw
    expect(gameStore.getState().domain.isGameOver).toBe(true);
    expect(gameStore.getState().domain.winnerId).toBeNull();
  });

  it('bot accepts draw offer if evaluation is balanced and terminates match', async () => {
    render(<App />);

    // Ensure bot is enabled
    const botToggle = document.getElementById('bot-toggle-checkbox') as HTMLInputElement;
    expect(botToggle).not.toBeNull();
    if (!botToggle.checked) {
      act(() => {
        fireEvent.click(botToggle);
      });
    }

    const drawBtn = screen.getByRole('button', { name: /Propor Empate/i });
    act(() => {
      fireEvent.click(drawBtn);
    });

    // Initial position has eval 0.00 (balanced <= 150 cp), so Bot accepts
    expect(gameStore.getState().domain.isGameOver).toBe(true);
    expect(gameStore.getState().domain.winnerId).toBeNull();
  });
});

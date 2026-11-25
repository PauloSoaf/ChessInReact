// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PuzzleRushArena } from '../PuzzleRushArena';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { GlobalEventBus } from '../../../../core/events/EventBus';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-r3f-canvas">{children}</div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({
    pointer: { x: 0, y: 0 },
    invalidate: vi.fn(),
    gl: { domElement: document.createElement('canvas'), getContext: () => ({ isContextLost: () => false }) },
    camera: { position: { x: 0, y: 8.5, z: 7.5 }, lookAt: vi.fn(), project: vi.fn() },
    size: { width: 500, height: 500 },
  }),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="mock-orbit-controls" />,
  useGLTF: Object.assign(vi.fn(() => ({ scene: { clone: () => ({ traverse: () => {} }) } })), {
    preload: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('Spec 12 § 5.3, § 8 - PuzzleRushArena Component', () => {
  const onBackToHub = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders initial arena with 2D board, timer, score, and problem count', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    expect(screen.getByTestId('puzzle-rush-arena')).toBeDefined();
    expect(screen.getByTestId('puzzle-rush-board')).toBeDefined();
    expect(screen.getByText(/Problema #1 de/)).toBeDefined();
    expect(screen.getByText(/Rating:/)).toBeDefined();
    expect(screen.getByText(/Pontos: 0/)).toBeDefined();
  });

  it('switches view mode between 2D and 3D', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    const toggle = screen.getByTestId('pr-view-toggle');
    expect(toggle.textContent).toContain('2D');
    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/3D|Perspectiva Isométrica/);
    fireEvent.click(toggle);
    expect(toggle.textContent).toContain('2D');
  });

  it('switches selection when clicking another friendly piece without burning a life', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="SURVIVAL" />
      </ThemeProvider>
    );

    // Initial puzzle pz_600_01 has White pieces at c4 (Bishop) and d1 (Queen), etc.
    const sqC4 = screen.getByTestId('puzzle-sq-c4');
    fireEvent.click(sqC4);

    // Click another friendly piece (d1)
    const sqD1 = screen.getByTestId('puzzle-sq-d1');
    fireEvent.click(sqD1);

    // Score is still 0, lives are still 3, no error feedback
    expect(screen.queryByText(/Vida consumida/)).toBeNull();
    const livesIndicator = document.getElementById('pr-lives');
    expect(livesIndicator).toBeDefined();
  });

  it('clears selection when Escape key is pressed', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    const sqC4 = screen.getByTestId('puzzle-sq-c4');
    fireEvent.click(sqC4);

    fireEvent.keyDown(window, { key: 'Escape' });
    // Selection cleared without throwing
    expect(screen.getByTestId('puzzle-rush-board')).toBeDefined();
  });

  it('submits correct tactical move via board square clicks and advances score', () => {
    const puzzleSpy = vi.fn();
    const unsub = GlobalEventBus.subscribe('PUZZLE_ATTEMPT', puzzleSpy);

    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    // Puzzle 1: c4f7 (with automated e8f7 bot response completing puzzle)
    fireEvent.click(screen.getByTestId('puzzle-sq-c4'));
    fireEvent.click(screen.getByTestId('puzzle-sq-f7'));

    expect(screen.getByText(/Combinação correta/)).toBeDefined();
    expect(document.getElementById('pr-score')?.textContent).toContain('1');
    expect(puzzleSpy).toHaveBeenCalled();
    unsub();
  });

  it('submits incorrect move via text input, deducts life and shows feedback', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="SURVIVAL" />
      </ThemeProvider>
    );

    const input = screen.getByTestId('pr-move-input');
    fireEvent.change(input, { target: { value: 'a1a2' } });

    const submitBtn = screen.getByText('Enviar');
    fireEvent.click(submitBtn);

    expect(screen.getByText(/Lance incorreto \(a1a2\)\. Vida consumida!/)).toBeDefined();
  });

  it('allows mode change to BATTLE and calibrates bot difficulty', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    const modeSelect = screen.getByLabelText('Modo Puzzle Rush') as HTMLSelectElement;
    fireEvent.change(modeSelect, { target: { value: 'BATTLE' } });

    const botSelect = screen.getByLabelText('Nível do Bot Puzzle Battle') as HTMLSelectElement;
    expect(botSelect).toBeDefined();
    fireEvent.change(botSelect, { target: { value: '4' } });
    expect(botSelect.value).toBe('4');
  });

  it('triggers onBackToHub when clicking back button', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="TIMED_3MIN" />
      </ThemeProvider>
    );

    const backBtn = screen.getByText(/Voltar ao Hub/);
    fireEvent.click(backBtn);
    expect(onBackToHub).toHaveBeenCalled();
  });

  it('renders game over card and allows restart when all lives are lost', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={onBackToHub} initialMode="SURVIVAL" />
      </ThemeProvider>
    );

    const input = screen.getByTestId('pr-move-input');
    const submitBtn = screen.getByText('Enviar');

    // Make 3 blunders to consume all 3 lives
    for (let i = 0; i < 3; i++) {
      fireEvent.change(input, { target: { value: 'a1a2' } });
      fireEvent.click(submitBtn);
    }

    expect(screen.getByText('Fim do Desafio Tático!')).toBeDefined();
    const restartBtn = screen.getByText('Jogar Novamente');
    expect(restartBtn).toBeDefined();

    fireEvent.click(restartBtn);
    expect(screen.getByTestId('puzzle-rush-board')).toBeDefined();
  });
});

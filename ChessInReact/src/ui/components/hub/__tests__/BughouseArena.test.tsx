// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BughouseArena } from '../BughouseArena';
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

describe('Spec 12 § 5.3, RF-10, RF-11 - BughouseArena Component', () => {
  const onBackToHub = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders twin boards (Board A & Board B), player controls, and 4 seats', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    expect(screen.getByTestId('bughouse-arena')).toBeDefined();
    expect(screen.getByTestId('bughouse-board-BOARD_A')).toBeDefined();
    expect(screen.getByTestId('bughouse-board-BOARD_B')).toBeDefined();
    expect(screen.getByText('Bughouse 2v2 · Mesas Gêmeas')).toBeDefined();
    expect(screen.getByLabelText('Controlador alice')).toBeDefined();
    expect(screen.getByLabelText('Controlador bob')).toBeDefined();
  });

  it('toggles view mode between 2D and 3D', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const toggle = screen.getByTestId('bughouse-view-toggle');
    expect(toggle.textContent).toContain('2D');
    fireEvent.click(toggle);
    expect(toggle.textContent).toMatch(/3D|Perspectiva Isométrica/);
    fireEvent.click(toggle);
    expect(toggle.textContent).toContain('2D');
  });

  it('toggles bot execution pause/resume with accessible indicator', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const pauseBtn = screen.getByTestId('bughouse-pause-toggle');
    expect(pauseBtn.textContent).toContain('Pausar Bots');
    fireEvent.click(pauseBtn);
    expect(pauseBtn.textContent).toContain('Retomar Bots');
    fireEvent.click(pauseBtn);
    expect(pauseBtn.textContent).toContain('Pausar Bots');
  });

  it('highlights legal moves when selecting a piece on Board A and executes move', () => {
    const moveSpy = vi.fn();
    const unsub = GlobalEventBus.subscribe('PIECE_MOVED', moveSpy);

    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    // Click White pawn at e2 (4,1) on Board A
    const sqE2 = screen.getByTestId('bughouse-sq-BOARD_A-4,1');
    fireEvent.click(sqE2);

    // Legal move dots appear
    const dots = screen.getAllByTestId('bughouse-legal-dot');
    expect(dots.length).toBeGreaterThan(0);

    // Click destination e4 (4,3)
    const sqE4 = screen.getByTestId('bughouse-sq-BOARD_A-4,3');
    fireEvent.click(sqE4);

    expect(moveSpy).toHaveBeenCalled();
    unsub();
  });

  it('configures seats between Human and AI Bot with difficulty levels', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const bobCtrl = screen.getByLabelText('Controlador bob') as HTMLSelectElement;
    fireEvent.change(bobCtrl, { target: { value: 'AI_BOT' } });

    const bobLvl = screen.getByLabelText('Nível Bot bob') as HTMLSelectElement;
    expect(bobLvl).toBeDefined();
    fireEvent.change(bobLvl, { target: { value: '5' } });
    expect(bobLvl.value).toBe('5');
  });

  it('allows partner piece requests and toggling request state', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const knightReqBtn = screen.getByText('KNIGHT');
    fireEvent.click(knightReqBtn);

    // Toggle off
    fireEvent.click(knightReqBtn);
  });

  it('clears drop and selection on Escape key', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const sqE2 = screen.getByTestId('bughouse-sq-BOARD_A-4,1');
    fireEvent.click(sqE2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByTestId('bughouse-legal-dot').length).toBe(0);
  });

  it('handles resignation and triggers game over event', () => {
    const endSpy = vi.fn();
    const unsub = GlobalEventBus.subscribe('GAME_ENDED', endSpy);

    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const resignBtn = screen.getByText('Abandonar');
    fireEvent.click(resignBtn);

    expect(endSpy).toHaveBeenCalled();
    expect(screen.getByText(/Vitória/)).toBeDefined();
    unsub();
  });

  it('calls onBackToHub when clicking back button', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={onBackToHub} />
      </ThemeProvider>
    );

    const backBtn = screen.getByText(/Voltar ao Hub/);
    fireEvent.click(backBtn);
    expect(onBackToHub).toHaveBeenCalled();
  });
});

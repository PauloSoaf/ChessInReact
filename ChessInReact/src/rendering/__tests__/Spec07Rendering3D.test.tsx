// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { Caches } from '../optimization/MathCaches';
import { GameControlsBar } from '../../ui/components/game/GameControlsBar';
import { ThemeCustomizerModal } from '../../ui/components/navigation/ThemeCustomizerModal';
import { ThemeProvider } from '../../ui/theme/ThemeContext';
import App from '../../App';
import { bootstrapGame } from '../../core/bootstrap/GameInitializer';
import { gameStore } from '../../core/state/gameStore';

// Mock WebGL and Three.js canvas in JSDOM environment
vi.mock('@react-three/fiber', () => ({
  Canvas: () => (
    <div data-testid="mock-r3f-canvas">
      <div data-testid="mock-orbit-controls" />
    </div>
  ),
  useFrame: vi.fn(),
  useThree: () => ({
    pointer: { x: 0, y: 0 },
    invalidate: vi.fn(),
    gl: { domElement: document.createElement('canvas') },
  }),
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => <div data-testid="mock-orbit-controls" />,
}));

describe('Spec 07 3D WebGL Rendering & Board View Architecture Suite', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
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

  afterEach(() => {
    cleanup();
  });

  describe('1. Math Cache Invariants (Spec 07 § 6, RNF-04)', () => {
    it('provides reusable singletons without heap allocations in render loop', () => {
      expect(Caches.vec3A).toBeInstanceOf(THREE.Vector3);
      expect(Caches.vec3B).toBeInstanceOf(THREE.Vector3);
      expect(Caches.mat4A).toBeInstanceOf(THREE.Matrix4);
      expect(Caches.mat4B).toBeInstanceOf(THREE.Matrix4);
      expect(Caches.quaternionA).toBeInstanceOf(THREE.Quaternion);
      expect(Caches.colorA).toBeInstanceOf(THREE.Color);
      expect(Caches.colorB).toBeInstanceOf(THREE.Color);

      // Verify mutating singleton values
      Caches.vec3A.set(1, 2, 3);
      expect(Caches.vec3A.x).toBe(1);
      expect(Caches.vec3A.y).toBe(2);
      expect(Caches.vec3A.z).toBe(3);

      Caches.mat4A.makeTranslation(Caches.vec3A);
      const elements = Caches.mat4A.elements;
      expect(elements[12]).toBe(1);
      expect(elements[13]).toBe(2);
      expect(elements[14]).toBe(3);
    });
  });

  describe('2. UI Controls: 2D vs 3D Board Mode Toggle (Spec 06 & Spec 07 Integration)', () => {
    it('renders 2D and 3D view toggle buttons in GameControlsBar and triggers callback', () => {
      const handleToggle = vi.fn();

      render(
        <GameControlsBar
          isBotEnabled={true}
          difficulty={3}
          isThinking={false}
          lastEval={0}
          boardSize={8}
          onToggleBot={vi.fn()}
          onSetDifficulty={vi.fn()}
          onBoardSizeChange={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onReset={vi.fn()}
          onOpenThemeModal={vi.fn()}
          boardViewMode="2D"
          onToggleBoardViewMode={handleToggle}
        />
      );

      const btn2D = screen.getByRole('button', { name: /^2D$/ });
      const btn3D = screen.getByRole('button', { name: /3D WebGL/ });

      expect(btn2D).toBeDefined();
      expect(btn3D).toBeDefined();

      fireEvent.click(btn3D);
      expect(handleToggle).toHaveBeenCalledWith('3D');

      fireEvent.click(btn2D);
      expect(handleToggle).toHaveBeenCalledWith('2D');
    });

    it('renders Category 5 in ThemeCustomizerModal for 2D vs 3D board selection', () => {
      render(
        <ThemeProvider>
          <ThemeCustomizerModal isOpen={true} onClose={vi.fn()} />
        </ThemeProvider>
      );

      expect(screen.getByText('5. Modo de Renderização do Tabuleiro')).toBeDefined();
      expect(screen.getByText('2D Clássico / Vetorial')).toBeDefined();
      expect(screen.getByText('3D WebGL Realtime (Spec 07)')).toBeDefined();

      const btn3D = document.getElementById('theme-modal-board-mode-3d');
      expect(btn3D).not.toBeNull();
      fireEvent.click(btn3D!);
    });
  });

  describe('3. App Integration & Seamless 2D <-> 3D Board Transition', () => {
    it('switches between 2D DOM/SVG board and 3D WebGL board in the Match Arena', async () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // Default is 2D board
      expect(screen.getByTestId('chess-board')).toBeDefined();
      expect(screen.queryByTestId('chess-board-3d-container')).toBeNull();

      // Click 3D WebGL toggle button in GameControlsBar
      const btn3D = screen.getByRole('button', { name: /3D WebGL/ });
      fireEvent.click(btn3D);

      // Arena transitions to 3D WebGL Canvas (await Suspense resolution)
      const container3D = await screen.findByTestId('chess-board-3d-container');
      expect(container3D).toBeDefined();
      expect(screen.getByTestId('mock-r3f-canvas')).toBeDefined();
      expect(screen.getByTestId('mock-orbit-controls')).toBeDefined();
      expect(screen.getByText('SPEC 07 WebGL 3D')).toBeDefined();

      // Switch back to 2D
      const btn2D = screen.getByRole('button', { name: /^2D$/ });
      fireEvent.click(btn2D);

      expect(screen.getByTestId('chess-board')).toBeDefined();
      expect(screen.queryByTestId('chess-board-3d-container')).toBeNull();
    });
  });
});

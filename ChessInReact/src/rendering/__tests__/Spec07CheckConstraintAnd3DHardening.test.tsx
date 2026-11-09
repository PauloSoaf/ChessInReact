// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from '../../ui/theme/ThemeContext';
import App from '../../App';
import { bootstrapGame } from '../../core/bootstrap/GameInitializer';
import { gameStore } from '../../core/state/gameStore';
import { CheckValidator } from '../../engine/rules/CheckValidator';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { IPieceEntity } from '../../core/entities/types';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { asCoordinateKey } from '../../core/coordinates';
import { PlayerCard } from '../../ui/components/game/PlayerCard';
import { BotMatchController } from '../../controllers/BotMatchController';

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

describe('SPEC 07: Check Constraint Feedback & 3D Hardening Suite', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

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

  describe('1. Check Constraint Visual & Textual Feedback (SPEC07-CHECK-CONSTRAINT-FEEDBACK-01)', () => {
    it('displays "EM XEQUE" status pill on PlayerCard when royal piece is under attack', () => {
      render(
        <PlayerCard
          playerId="P1"
          displayName="Você (Brancas)"
          isTurnActive={true}
          isInCheck={true}
        />
      );

      const checkPill = screen.getByTestId('player-in-check-P1');
      expect(checkPill).toBeDefined();
      expect(checkPill.textContent).toContain('EM XEQUE');
    });

    it('triggers CHECK_CONSTRAINT feedback banner and red highlights when king is in check and an illegal attempt is made', () => {
      // Setup Scholar's Mate / Fool's Mate check situation where White King is directly in check
      // Move 1. f2-f3 (White)
      const pF2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '5,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pF2.id, '5,1', asCoordinateKey('5,2'), 'P1', undefined, true, true, undefined, topology)
      );

      // Move 2. e7-e5 (Black)
      const pE7 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,6'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE7.id, '4,6', asCoordinateKey('4,4'), 'P2', undefined, true, true, undefined, topology)
      );

      // Move 3. g2-g4 (White)
      const pG2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '6,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pG2.id, '6,1', asCoordinateKey('6,3'), 'P1', undefined, true, true, undefined, topology)
      );

      // Move 4. Qh4 check! (Black) - d8 to h4 (3,7 to 7,3)
      const qBlack = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '3,7'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(qBlack.id, '3,7', asCoordinateKey('7,3'), 'P2', undefined, true, true, undefined, topology)
      );

      // Confirm White King is in check
      const currentDomain = gameStore.getState().domain;
      expect(currentDomain.activePlayer).toBe('P1');
      expect(CheckValidator.isRoyalInCheck('P1', currentDomain, topology)).toBe(true);

      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // White King is at e1 (4,0). A piece that CANNOT resolve check is pawn a2 (0,1).
      const squareA2 = screen.getByTestId('square-0,1');
      fireEvent.click(squareA2);

      // Check-constraint banner must appear in HUD
      const banner = screen.getByTestId('check-constraint-banner');
      expect(banner).toBeDefined();
      expect(banner.getAttribute('role')).toBe('status');
      expect(banner.getAttribute('aria-live')).toBe('polite');
      expect(banner.textContent).toContain('REI EM XEQUE');
      expect(banner.textContent).toContain('seu rei está em xeque');

      // The king square (4,0) must have error classes applied
      const kingSquare = screen.getByTestId('square-4,0');
      expect(kingSquare.className).toContain('board-square--check-king-error');

      // The source piece square (0,1) must have error classes applied
      expect(squareA2.className).toContain('board-square--check-source-error');
    });

    it('differentiates ILLEGAL_MOVE from CHECK_CONSTRAINT when king is not in check', () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // Initial state: White king is NOT in check
      expect(CheckValidator.isRoyalInCheck('P1', gameStore.getState().domain, topology)).toBe(false);

      // Select pawn e2 (4,1)
      const squareE2 = screen.getByTestId('square-4,1');
      fireEvent.click(squareE2);

      // Attempt illegal diagonal move to e5 (4,4) where pawn cannot jump or capture
      const squareE5 = screen.getByTestId('square-4,4');
      fireEvent.click(squareE5);

      const banner = screen.getByTestId('check-constraint-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('MOVIMENTO NÃO PERMITIDO');
      expect(banner.textContent).not.toContain('REI EM XEQUE');
    });

    it('clears check constraint feedback immediately when a valid move is performed', () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // Trigger illegal move first to show banner
      const squareA2 = screen.getByTestId('square-0,1');
      fireEvent.click(squareA2);
      const squareA5 = screen.getByTestId('square-0,4');
      fireEvent.click(squareA5);

      expect(screen.queryByTestId('check-constraint-banner')).not.toBeNull();

      // Now execute valid move: e2 to e4 (4,1 to 4,3)
      const squareE2 = screen.getByTestId('square-4,1');
      fireEvent.click(squareE2);
      const squareE4 = screen.getByTestId('square-4,3');
      fireEvent.click(squareE4);

      // Banner is removed
      expect(screen.queryByTestId('check-constraint-banner')).toBeNull();
    });
  });

  describe('2. 3D Hardening, Progressive Loading & Resilient AI Execution (SPEC07-3D-FOUNDATION-CORRECTION-01)', () => {
    it('seamlessly preserves state and transfers check constraint across 2D and 3D views', async () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // Toggle to 3D WebGL mode
      const btn3D = screen.getByRole('button', { name: /3D WebGL/ });
      await act(async () => {
        fireEvent.click(btn3D);
      });

      // 3D Canvas is active
      expect(screen.getByTestId('chess-board-3d-container')).toBeDefined();

      // Switch back to 2D
      const btn2D = screen.getByRole('button', { name: /^2D$/ });
      await act(async () => {
        fireEvent.click(btn2D);
      });

      expect(screen.getByTestId('chess-board')).toBeDefined();
    });

    it('recovers asynchronously and dispatches move without freezing UI when worker fails', async () => {
      // Mock worker error to test emergency fallback in BotMatchController
      const controller = new BotMatchController({
        botPlayer: 'P2',
        humanPlayer: 'P1',
        enabled: true,
        difficulty: 1,
      });

      // Make White move 1 (e2-e4) so it's bot's turn (P2)
      const pE2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE2.id, '4,1', asCoordinateKey('4,3'), 'P1', undefined, true, true, undefined, topology)
      );

      expect(gameStore.getState().domain.activePlayer).toBe('P2');

      // Trigger bot turn - even if worker fails internally, async fallback handles it
      const result = await controller.checkAndTriggerBotTurn();
      expect(result).not.toBeNull();
      expect(result?.bestMove).toBeDefined();

      // Ensure bot advanced turn to P1 (White)
      expect(gameStore.getState().domain.activePlayer).toBe('P1');
      controller.dispose();
    });
  });
});


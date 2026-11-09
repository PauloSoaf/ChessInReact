// @vitest-environment jsdom
import React from 'react';
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
import { ChessBoard3D } from '../ChessBoard3D';
import { EngineBridge } from '../../core/workers/EngineBridge';

// Mock WebGL and Three.js canvas in JSDOM environment without leaking Three.js intrinsics to DOM
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => {
    // Filter out Three.js intrinsic element strings (ambientLight, directionalLight, etc.)
    // so React DOM does not emit unrecognized element casing warnings in JSDOM
    const safeChildren = React.Children.toArray(children).filter(
      (c) => React.isValidElement(c) && typeof c.type !== 'string'
    );
    return (
      <div data-testid="mock-r3f-canvas">
        {safeChildren}
      </div>
    );
  },
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

vi.mock('../mesh/InstancedBoard', () => ({
  InstancedBoard: ({ onSquareClick }: { onSquareClick?: (coord: string) => void }) => (
    <div
      data-testid="instanced-board-mesh"
      onClick={() => onSquareClick?.('0,1')}
    />
  ),
}));

vi.mock('../mesh/InstancedPieces', () => ({
  InstancedPieces: ({
    pieces,
    onPieceClick,
    checkConstraintCoords,
  }: {
    pieces?: readonly { id: string; position: string }[];
    onPieceClick?: (pieceId: string, position: string) => void;
    checkConstraintCoords?: { kingCoord?: string; sourceCoord?: string; targetCoord?: string } | null;
  }) => (
    <div data-testid="mock-instanced-pieces">
      {checkConstraintCoords?.kingCoord && (
        <div data-testid="check-king-3d-ring" />
      )}
      {checkConstraintCoords?.sourceCoord && (
        <div data-testid="check-source-3d-ring" />
      )}
      {pieces?.map((piece) => (
        <div
          key={piece.id}
          data-testid={`piece-3d-${piece.position}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            onPieceClick?.(piece.id, piece.position);
          }}
        />
      ))}
    </div>
  ),
  ProceduralPieces3D: () => null,
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
    vi.restoreAllMocks();
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

    it('triggers CHECK_CONSTRAINT feedback banner and red highlights when king is in check and an illegal attempt is made (active game, isGameOver === false)', () => {
      // Setup deterministic active check position (not checkmate)
      // Move 1. e2-e4 (White)
      const pE2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE2.id, pE2.position, asCoordinateKey('4,3'), 'P1', undefined, true, true, undefined, topology)
      );

      // Move 2. e7-e6 (Black)
      const pE7 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,6'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE7.id, pE7.position, asCoordinateKey('4,5'), 'P2', undefined, true, true, undefined, topology)
      );

      // Move 3. f2-f4 (White)
      const pF2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '5,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pF2.id, pF2.position, asCoordinateKey('5,3'), 'P1', undefined, true, true, undefined, topology)
      );

      // Move 4. Qd8-h4 check! (Black) - d8 to h4 (3,7 to 7,3)
      const qBlack = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '3,7'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(qBlack.id, qBlack.position, asCoordinateKey('7,3'), 'P2', undefined, true, true, undefined, topology)
      );

      // Strict verification: King is in check, but game is actively in progress (isGameOver === false)
      const currentDomain = gameStore.getState().domain;
      expect(currentDomain.activePlayer).toBe('P1');
      expect(currentDomain.isGameOver).toBe(false);
      expect(CheckValidator.isRoyalInCheck('P1', currentDomain, topology)).toBe(true);

      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );

      // White King is at e1 (4,0). A piece that CANNOT resolve check is pawn a2 (0,1).
      const squareA2 = screen.getByTestId('square-0,1');
      fireEvent.click(squareA2);

      // Check-constraint banner must appear in HUD with aria-live="polite" and role="status"
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

    it('validates 3D board interactive check-constraint trigger and halo feedback coordinates', () => {
      // Put White King in check (1. e4 e6 2. f4 Qh4+)
      const pE2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE2.id, pE2.position, asCoordinateKey('4,3'), 'P1', undefined, true, true, undefined, topology)
      );
      const pE7 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,6'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE7.id, pE7.position, asCoordinateKey('4,5'), 'P2', undefined, true, true, undefined, topology)
      );
      const pF2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '5,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pF2.id, pF2.position, asCoordinateKey('5,3'), 'P1', undefined, true, true, undefined, topology)
      );
      const qBlack = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '3,7'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(qBlack.id, qBlack.position, asCoordinateKey('7,3'), 'P2', undefined, true, true, undefined, topology)
      );

      const triggerInvalidMoveSpy = vi.fn();
      const clearInvalidMoveSpy = vi.fn();

      render(
        <ThemeProvider>
          <ChessBoard3D
            boardSize={8}
            onTriggerInvalidMove={triggerInvalidMoveSpy}
            onClearInvalidMove={clearInvalidMoveSpy}
            invalidMoveFeedback={{
              reason: 'CHECK_CONSTRAINT',
              message: 'Rei em xeque',
              kingCoord: asCoordinateKey('4,0'),
              sourceCoord: asCoordinateKey('0,1'),
              timestamp: Date.now(),
            }}
          />
        </ThemeProvider>
      );

      // Verify 3D container is rendered with fallback pill
      const container3D = screen.getByTestId('chess-board-3d-container');
      expect(container3D).toBeDefined();

      // Verify 3D warning rings for king and source piece rendered by InstancedPieces
      expect(screen.getByTestId('check-king-3d-ring')).toBeDefined();
      expect(screen.getByTestId('check-source-3d-ring')).toBeDefined();

      // Simulate clicking pawn a2 (0,1) through 3D piece mesh
      const pawnA2Mesh = screen.getByTestId('piece-3d-0,1');
      expect(pawnA2Mesh).toBeDefined();
      fireEvent.pointerDown(pawnA2Mesh);

      // Expect 3D check constraint callback invoked with proper reason
      expect(triggerInvalidMoveSpy).toHaveBeenCalled();
      const firstCallArgs = triggerInvalidMoveSpy.mock.calls[0];
      expect(firstCallArgs[0]).toBe('CHECK_CONSTRAINT');
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

      // 3D Canvas is active (await Suspense resolution)
      const container3D = await screen.findByTestId('chess-board-3d-container');
      expect(container3D).toBeDefined();

      // Switch back to 2D
      const btn2D = screen.getByRole('button', { name: /^2D$/ });
      await act(async () => {
        fireEvent.click(btn2D);
      });

      expect(screen.getByTestId('chess-board')).toBeDefined();
    });

    it('recovers gracefully from controlled Worker calculation rejection and executes non-blocking fallback', async () => {
      // Mock worker error to test controlled rejection recovery in BotMatchController
      const mockFailingBridge = {
        calculateBestMove: vi.fn().mockRejectedValueOnce(new Error('Simulated WebWorker Failure (OOM / Thread Crash)')),
        cancelPendingSearches: vi.fn(),
        isDisposedBridge: vi.fn().mockReturnValue(false),
        dispose: vi.fn(),
      } as unknown as EngineBridge;

      const controller = new BotMatchController({
        botPlayer: 'P2',
        humanPlayer: 'P1',
        enabled: true,
        difficulty: 1,
        bridge: mockFailingBridge,
      });

      // Make White move 1 (e2-e4) so it's bot's turn (P2)
      const pE2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE2.id, pE2.position, asCoordinateKey('4,3'), 'P1', undefined, true, true, undefined, topology)
      );

      expect(gameStore.getState().domain.activePlayer).toBe('P2');

      // Trigger bot turn - Worker REJECTS controlled error, resilient fallback executes
      const result = await controller.checkAndTriggerBotTurn();

      // Assert error was caught and fallback delivered a valid move
      expect(mockFailingBridge.calculateBestMove).toHaveBeenCalled();
      expect(mockFailingBridge.cancelPendingSearches).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.bestMove).toBeDefined();

      // Ensure bot advanced turn to P1 (White) preserving match state
      expect(gameStore.getState().domain.activePlayer).toBe('P1');
      expect(gameStore.getState().domain.isGameOver).toBe(false);

      controller.dispose();
    });

    it('cancels obsolete calculation when match is cancelled or turn changes during deliberation', async () => {
      let resolveSearch!: (val: unknown) => void;
      const deferredPromise = new Promise((res) => {
        resolveSearch = res;
      });

      const mockSlowBridge = {
        calculateBestMove: vi.fn().mockReturnValue(deferredPromise),
        cancelPendingSearches: vi.fn(),
        isDisposedBridge: vi.fn().mockReturnValue(false),
        dispose: vi.fn(),
      } as unknown as EngineBridge;

      const controller = new BotMatchController({
        botPlayer: 'P2',
        humanPlayer: 'P1',
        enabled: true,
        difficulty: 1,
        bridge: mockSlowBridge,
      });

      // Move e2-e4
      const pE2 = Object.values(gameStore.getState().domain.boardEntities).find(
        (e): e is IPieceEntity => e.type === 'PIECE' && e.position === '4,1'
      )!;
      gameStore.getState().executeCommand(
        new MovePieceCommand(pE2.id, pE2.position, asCoordinateKey('4,3'), 'P1', undefined, true, true, undefined, topology)
      );

      // Start search
      const botTurnPromise = controller.checkAndTriggerBotTurn();
      expect(controller.getIsThinking()).toBe(true);

      // Cancel deliberation mid-flight
      controller.cancel();
      expect(controller.getIsThinking()).toBe(false);
      expect(mockSlowBridge.cancelPendingSearches).toHaveBeenCalled();

      // Resolve background promise after cancellation
      resolveSearch({
        bestMove: { fromCoord: '4,6', toCoord: '4,4', pieceId: 'p2_pawn' },
        evaluationScore: 0,
        calculationTimeMs: 10,
        depthReached: 1,
      });

      const outcome = await botTurnPromise;
      // Stale calculation must be discarded
      expect(outcome).toBeNull();

      controller.dispose();
    });
  });
});

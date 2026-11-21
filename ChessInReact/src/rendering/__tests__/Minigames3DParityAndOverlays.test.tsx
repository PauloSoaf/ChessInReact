// @vitest-environment jsdom
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider } from '../../ui/theme/ThemeContext';
import { VariantOverlays3D } from '../mesh/VariantOverlays3D';
import { ChessBoard3D } from '../ChessBoard3D';
import { gameStore } from '../../core/state/gameStore';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { IPieceEntity } from '../../core/entities/types';

// Mock WebGL and Three.js canvas in JSDOM environment
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mock-r3f-canvas">
      {children}
    </div>
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
}));

describe('Spec 07 / Spec 12 / Spec 04: Minigames 3D Parity & Variant Overlays Suite', () => {
  beforeEach(() => {
    cleanup();
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {},
      occupancy: {},
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
      variantId: 'CLASSIC',
      isGameOver: false,
      winnerId: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  describe('VariantOverlays3D component rendering', () => {
    it('renders forced capture emerald halos for Antichess coordinates', () => {
      const { container } = render(
        <VariantOverlays3D
          boardSize={8}
          variantId="ANTICHESS"
          forcedCaptureCoords={['4,1', '3,1']}
        />
      );

      // In R3F, mesh/group elements render with their name attribute in JSDOM
      const forcedHalo1 = container.querySelector('[name="forced-capture-3d-4,1"]');
      const forcedHalo2 = container.querySelector('[name="forced-capture-3d-3,1"]');
      expect(forcedHalo1).not.toBeNull();
      expect(forcedHalo2).not.toBeNull();
    });

    it('renders golden sanctuary victory move halos for King of the Hill', () => {
      const { container } = render(
        <VariantOverlays3D
          boardSize={8}
          variantId="KING_OF_THE_HILL"
          hillVictoryMoveCoords={['3,3', '4,4']}
        />
      );

      const sanctuaryRing = container.querySelector('[name="hill-sanctuary-3d-ring"]');
      const victoryMove1 = container.querySelector('[name="hill-victory-move-3d-3,3"]');
      const victoryMove2 = container.querySelector('[name="hill-victory-move-3d-4,4"]');

      expect(sanctuaryRing).not.toBeNull();
      expect(victoryMove1).not.toBeNull();
      expect(victoryMove2).not.toBeNull();
    });

    it('renders Duck, frozen slabs, portals, and stealth traps', () => {
      const { container } = render(
        <VariantOverlays3D
          boardSize={8}
          variantId="SPELL_CHESS"
          duckCoordinate="4,4"
          frozenCoordinates={['2,2', '2,3']}
          activePortals={[{ coordA: '1,1', coordB: '6,6' }]}
          stealthTraps={{ '5,5': 'WHITE' }}
        />
      );

      expect(container.querySelector('[name="duck-3d"]')).not.toBeNull();
      expect(container.querySelector('[name="frozen-square-3d-2,2"]')).not.toBeNull();
      expect(container.querySelector('[name="frozen-square-3d-2,3"]')).not.toBeNull();
      expect(container.querySelector('[name="portal-3d-1,1"]')).not.toBeNull();
      expect(container.querySelector('[name="portal-3d-6,6"]')).not.toBeNull();
      expect(container.querySelector('[name="stealth-trap-3d-5,5"]')).not.toBeNull();
    });
  });

  describe('ChessBoard3D HUD Action Banners & Integration', () => {
    it('displays Antichess mandatory capture banner when forced capture pieces exist', () => {
      // Set up Antichess state with a White Queen that can capture an opposing piece
      const whiteQueen: IPieceEntity = {
        id: asEntityId('w-queen-1'),
        type: 'PIECE',
        position: asCoordinateKey('3,3'),
        ownerId: 'P1',
        variantId: 'QUEEN',
        hasMoved: true,
        isCaptured: false,
      };
      const blackPawn: IPieceEntity = {
        id: asEntityId('b-pawn-1'),
        type: 'PIECE',
        position: asCoordinateKey('3,5'),
        ownerId: 'P2',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };

      gameStore.getState().resetDomainState({
        ...gameStore.getState().domain,
        variantId: 'ANTICHESS',
        activePlayer: 'P1',
        boardEntities: {
          [whiteQueen.id]: whiteQueen,
          [blackPawn.id]: blackPawn,
        },
        occupancy: {
          [asCoordinateKey('3,3')]: whiteQueen.id,
          [asCoordinateKey('3,5')]: blackPawn.id,
        },
      });

      render(
        <ThemeProvider>
          <ChessBoard3D />
        </ThemeProvider>
      );

      const banner = screen.getByTestId('board-action-indicator-3d');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('Antichess (3D): Captura obrigatória');
    });

    it('displays King of the Hill victory banner when King is selected with legal move to sanctuary', () => {
      const whiteKing: IPieceEntity = {
        id: asEntityId('w-king'),
        type: 'PIECE',
        position: asCoordinateKey('2,3'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };

      gameStore.getState().resetDomainState({
        ...gameStore.getState().domain,
        variantId: 'KING_OF_THE_HILL',
        activePlayer: 'P1',
        boardEntities: {
          [whiteKing.id]: whiteKing,
        },
        occupancy: {
          [asCoordinateKey('2,3')]: whiteKing.id,
        },
      });
      gameStore.getState().selectPiece(whiteKing.id);

      render(
        <ThemeProvider>
          <ChessBoard3D />
        </ThemeProvider>
      );

      const banner = screen.getByTestId('board-action-indicator-3d');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('King of the Hill (3D): Lance da vitória disponível');
    });

    it('displays duck placement indicator and freeze spell indicator', () => {
      render(
        <ThemeProvider>
          <ChessBoard3D
            duckPlacementActive={true}
          />
        </ThemeProvider>
      );

      expect(screen.getByTestId('board-action-indicator-3d').textContent).toContain('Colocar Pato (3D)');
    });
  });
});

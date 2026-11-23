// @vitest-environment jsdom
import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ThemeProvider } from '../theme/ThemeContext';
import { BughouseArena } from '../components/hub/BughouseArena';
import { PuzzleRushArena } from '../components/hub/PuzzleRushArena';
import { UniversalMatchController } from '../../controllers/UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { CompositeArenaLayouts } from '../../engine/multiplayer/arenas/CompositeArenaLayouts';
import { BughouseCoordinatedAgent } from '../../workers/ai/strategies/BughouseCoordinatedAgent';
import { MaxNMultiplayerStrategy } from '../../workers/ai/strategies/MaxNMultiplayerStrategy';

if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

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
  useGLTF: Object.assign(vi.fn(() => ({ scene: { clone: () => ({ traverse: () => {} }) } })), {
    preload: vi.fn(),
    clear: vi.fn(),
  }),
}));

describe('Minigames 2D/3D Interactive Boards & Multi-Level Rule-Intelligent Bots', () => {
  let controller: UniversalMatchController | null = null;

  afterEach(() => {
    controller?.dispose();
    controller = null;
  });

  it('renders PuzzleRushArena with an interactive 8x8 chessboard, 2D/3D toggle, and Battle bot levels N1-N5', () => {
    render(
      <ThemeProvider>
        <PuzzleRushArena onBackToHub={() => undefined} initialMode="BATTLE" />
      </ThemeProvider>
    );

    const board = screen.getByTestId('puzzle-rush-board');
    expect(board).toBeDefined();

    // View mode toggle switches between 2D and 3D perspective
    const viewBtn = screen.getByTestId('pr-view-toggle');
    expect(viewBtn.textContent).toContain('2D');
    fireEvent.click(viewBtn);
    expect(viewBtn.textContent).toMatch(/3D|Perspectiva Isométrica/);

    // Battle mode renders N1-N5 bot difficulty selector
    const botLevelSelect = screen.getByLabelText('Nível do Bot Puzzle Battle') as HTMLSelectElement;
    expect(botLevelSelect).toBeDefined();
    fireEvent.change(botLevelSelect, { target: { value: '5' } });
    expect(botLevelSelect.value).toBe('5');

    // First canonical puzzle (pz_600_01) solutionMoves: ['c4f7', 'e8f7']
    fireEvent.click(screen.getByTestId('puzzle-sq-c4'));
    fireEvent.click(screen.getByTestId('puzzle-sq-f7'));
    fireEvent.click(screen.getByTestId('puzzle-sq-e8'));
    fireEvent.click(screen.getByTestId('puzzle-sq-f7'));

    // Score increments from 0 to 1 via board click interaction!
    expect(document.getElementById('pr-score')?.textContent).toContain('1');
  });

  it('renders BughouseArena with PieceRenderer SVG pieces, legal dots, 2D/3D toggle, and 4-seat N1-N5 bot selectors', () => {
    render(
      <ThemeProvider>
        <BughouseArena onBackToHub={() => undefined} />
      </ThemeProvider>
    );

    const boardA = screen.getByTestId('bughouse-board-BOARD_A');
    const boardB = screen.getByTestId('bughouse-board-BOARD_B');
    expect(boardA).toBeDefined();
    expect(boardB).toBeDefined();

    // Toggle 2D/3D mode
    const viewToggle = screen.getByTestId('bughouse-view-toggle');
    expect(viewToggle.textContent).toContain('2D');
    fireEvent.click(viewToggle);
    expect(viewToggle.textContent).toMatch(/3D|Perspectiva Isométrica/);

    // Configure bob seat to AI_BOT N5
    const bobRoleSelect = screen.getByLabelText('Controlador bob') as HTMLSelectElement;
    fireEvent.change(bobRoleSelect, { target: { value: 'AI_BOT' } });
    const bobLevelSelect = screen.getByLabelText('Nível Bot bob') as HTMLSelectElement;
    fireEvent.change(bobLevelSelect, { target: { value: '5' } });
    expect(bobLevelSelect.value).toBe('5');

    // Click White pawn at e2 (4,1) on Board A -> shows legal move dots and moves to e4 (4,3)
    const sqE2 = screen.getByTestId('bughouse-sq-BOARD_A-4,1');
    fireEvent.click(sqE2);
    expect(screen.getAllByTestId('bughouse-legal-dot').length).toBeGreaterThan(0);

    const sqE4 = screen.getByTestId('bughouse-sq-BOARD_A-4,3');
    fireEvent.click(sqE4);
    expect(screen.getByTestId('bughouse-board-BOARD_A').parentElement?.textContent).toContain('Turno: Pretas');
  });

  it('BughouseCoordinatedAgent executes tactical reserve drops near opponent king at Master level', () => {
    const agent = new BughouseCoordinatedAgent();
    const decision = agent.decideMove({
      matchId: 'bug_test',
      variantId: 'BUGHOUSE',
      actingPlayer: 'P1',
      difficultyLevel: 4,
      timeBudgetMs: 250,
      legalMoves: [{ from: '0,1', to: '0,2', pieceId: 'w-pawn-0' }],
      specializedContext: {
        reservePieces: ['q', 'p'],
        emptySquares: ['0,3', '4,5', '7,2'],
        opponentKingCoord: '4,7',
      },
    });

    expect(decision.secondaryAction?.type).toBe('DROP_PIECE');
    expect(decision.secondaryAction?.payload.pieceType).toBe('q');
    expect(decision.secondaryAction?.payload.targetCoordinate).toBe('4,5');
  });

  it('MaxNMultiplayerStrategy hunts vulnerable opponent king for +20 FFA elimination bonus', () => {
    const strategy = new MaxNMultiplayerStrategy();
    const decision = strategy.decideMove({
      matchId: 'ffa_test',
      variantId: 'FOUR_PLAYER_FFA',
      actingPlayer: 'P1',
      difficultyLevel: 4,
      timeBudgetMs: 250,
      legalMoves: [
        { from: '3,0', to: '3,5', pieceId: 'p1-rook-0', isCapture: false },
        { from: '6,0', to: '0,7', pieceId: 'p1-queen-0', isCapture: true },
      ],
      specializedContext: {
        opponentKingCoord: '0,7',
      },
    });

    expect(decision.move.to).toBe('0,7');
    expect(decision.evaluationCentipawns).toBeGreaterThanOrEqual(20000);
  });

  it('spawns all 18 multiplayer arena layouts (3 to 12 players) strictly inside valid board bounds', () => {
    for (const layout of CompositeArenaLayouts.getAllLayouts()) {
      const cfg = MatchConfigurationManager.createDefaultMatch(layout.id, layout.totalParticipants);
      controller = new UniversalMatchController(cfg);
      controller.startMatch();

      const domain = gameStore.getState().domain;
      const topology = controller.getTopology();
      const pieces = Object.values(domain.boardEntities);

      expect(pieces.length).toBeGreaterThanOrEqual(layout.totalParticipants * 4);
      for (const p of pieces) {
        if (p.type === 'PIECE' && p.position) {
          expect(topology.isValidCoordinate(p.position)).toBe(true);
        }
      }

      const p1Moves = RulesEngine.getLegalMoves(domain, topology);
      expect(p1Moves.length).toBeGreaterThan(0);
      controller.dispose();
      controller = null;
    }
  });
});

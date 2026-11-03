// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { UI_THEMES, BOARD_THEMES, PIECE_SETS } from '../theme/themeRegistry';
import { PieceRenderer } from '../components/pieces/PieceRenderer';
import { TopNavBar } from '../components/navigation/TopNavBar';
import { ThemeCustomizerModal } from '../components/navigation/ThemeCustomizerModal';
import { GameHub } from '../components/hub/GameHub';
import { PlayerCard } from '../components/game/PlayerCard';
import { EvaluationBar } from '../components/game/EvaluationBar';
import { GameControlsBar } from '../components/game/GameControlsBar';
import ChessBoard from '../../components/ChessBoard/ChessBoard';
import { gameStore } from '../../core/state/gameStore';
import { bootstrapGame } from '../../core/bootstrap/GameInitializer';
import App from '../../App';

describe('Spec 06 UI/UX & Design System Suite (Sprint 01)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  afterEach(() => {
    cleanup();
  });

  describe('Theme Registry & Tokens (Spec 06 Independent 3-Category System)', () => {
    it('defines 3 distinct UI themes with high-contrast categories', () => {
      expect(Object.keys(UI_THEMES)).toEqual(['midnight', 'ivory', 'synthwave']);
      expect(UI_THEMES.midnight.category).toBe('DARK');
      expect(UI_THEMES.ivory.category).toBe('LIGHT');
      expect(UI_THEMES.synthwave.category).toBe('SPECIAL');
    });

    it('defines 3 tournament-grade board themes with verified color palettes', () => {
      expect(Object.keys(BOARD_THEMES)).toEqual(['slate-emerald', 'classic-wood', 'carbon-cyber']);
      expect(BOARD_THEMES['slate-emerald'].lightSquare).toBe('#e2e8f0');
      expect(BOARD_THEMES['slate-emerald'].darkSquare).toBe('#0f766e');
      expect(BOARD_THEMES['classic-wood'].lightSquare).toBe('#f0d9b5');
      expect(BOARD_THEMES['carbon-cyber'].darkSquare).toBe('#090d16');
    });

    it('defines 3 visual piece sets: Unicode, Vector SVG, and Pixel Art', () => {
      expect(Object.keys(PIECE_SETS)).toEqual(['neo-classic', 'tournament-vector', 'pixel-art']);
      expect(PIECE_SETS['neo-classic'].type).toBe('UNICODE');
      expect(PIECE_SETS['tournament-vector'].type).toBe('SVG_VECTOR');
      expect(PIECE_SETS['pixel-art'].type).toBe('PIXEL');
    });
  });

  describe('ThemeContext & Preference Persistence', () => {
    function ThemeTestConsumer() {
      const { uiTheme, boardTheme, pieceSet, setUITheme, setBoardTheme, setPieceSet } = useTheme();
      return (
        <div>
          <span data-testid="current-ui-theme">{uiTheme}</span>
          <span data-testid="current-board-theme">{boardTheme}</span>
          <span data-testid="current-piece-set">{pieceSet}</span>
          <button onClick={() => setUITheme('ivory')}>Set Ivory</button>
          <button onClick={() => setBoardTheme('classic-wood')}>Set Wood</button>
          <button onClick={() => setPieceSet('tournament-vector')}>Set Vector</button>
        </div>
      );
    }

    it('initializes with default midnight theme and syncs html document class', () => {
      render(
        <ThemeProvider>
          <ThemeTestConsumer />
        </ThemeProvider>
      );

      expect(screen.getByTestId('current-ui-theme').textContent).toBe('midnight');
      expect(document.documentElement.classList.contains('theme-midnight')).toBe(true);
    });

    it('switches themes independently and persists to LocalStorage', () => {
      render(
        <ThemeProvider>
          <ThemeTestConsumer />
        </ThemeProvider>
      );

      fireEvent.click(screen.getByText('Set Ivory'));
      expect(screen.getByTestId('current-ui-theme').textContent).toBe('ivory');
      expect(document.documentElement.classList.contains('theme-ivory')).toBe(true);

      fireEvent.click(screen.getByText('Set Wood'));
      expect(screen.getByTestId('current-board-theme').textContent).toBe('classic-wood');

      fireEvent.click(screen.getByText('Set Vector'));
      expect(screen.getByTestId('current-piece-set').textContent).toBe('tournament-vector');

      const saved = JSON.parse(localStorage.getItem('chess_in_react_theme_preferences') || '{}');
      expect(saved.uiTheme).toBe('ivory');
      expect(saved.boardTheme).toBe('classic-wood');
      expect(saved.pieceSet).toBe('tournament-vector');
    });
  });

  describe('PieceRenderer Component', () => {
    it('renders classic Unicode glyph for neo-classic piece set', () => {
      const { container } = render(
        <PieceRenderer variantId="KNIGHT" ownerId="P1" pieceSet="neo-classic" />
      );
      expect(container.textContent).toContain('♞');
    });

    it('renders pure vector SVG paths for tournament-vector set', () => {
      const { container } = render(
        <PieceRenderer variantId="QUEEN" ownerId="P2" pieceSet="tournament-vector" />
      );
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const path = container.querySelector('path');
      expect(path).not.toBeNull();
    });

    it('renders authentic crisp vector pixel-art sprites for pixel-art arcade set', () => {
      const { container } = render(
        <PieceRenderer variantId="KING" ownerId="P1" pieceSet="pixel-art" />
      );
      const svg = container.querySelector('[data-testid="pixel-art-piece"]');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges');

      // Verify all 6 pieces render for both players
      const pieceTypes = ['KING', 'QUEEN', 'ROOK', 'BISHOP', 'KNIGHT', 'PAWN'] as const;
      for (const pt of pieceTypes) {
        const { container: p1c } = render(<PieceRenderer variantId={pt} ownerId="P1" pieceSet="pixel-art" />);
        expect(p1c.querySelector('[data-testid="pixel-art-piece"]')).not.toBeNull();
        const { container: p2c } = render(<PieceRenderer variantId={pt} ownerId="P2" pieceSet="pixel-art" />);
        expect(p2c.querySelector('[data-testid="pixel-art-piece"]')).not.toBeNull();
      }
    });
  });

  describe('TopNavBar Navigation Component', () => {
    it('renders brand and navigation switcher between HUB and GAME', () => {
      const onNavigate = vi.fn();
      const onOpenThemeModal = vi.fn();

      render(
        <ThemeProvider>
          <TopNavBar
            currentView="GAME"
            onNavigate={onNavigate}
            onOpenThemeModal={onOpenThemeModal}
            isMatchActive={true}
            turnNumber={3}
            activePlayer="P1"
          />
        </ThemeProvider>
      );

      expect(screen.getByText('ChessInReact')).toBeDefined();
      expect(screen.getByText(/Turn #/i)).toBeDefined();

      const hubBtn = screen.getByRole('button', { name: /Game Hub/i });
      fireEvent.click(hubBtn);
      expect(onNavigate).toHaveBeenCalledWith('HUB');

      const themeBtn = screen.getByRole('button', { name: /Personalizar/i });
      fireEvent.click(themeBtn);
      expect(onOpenThemeModal).toHaveBeenCalled();
    });
  });

  describe('ThemeCustomizerModal Component', () => {
    it('renders live interactive preview and allows selecting themes', () => {
      const onClose = vi.fn();

      render(
        <ThemeProvider>
          <ThemeCustomizerModal isOpen={true} onClose={onClose} />
        </ThemeProvider>
      );

      expect(screen.getByText('Personalização & Temas')).toBeDefined();
      expect(screen.getByText('Tournament Emerald')).toBeDefined();
      expect(screen.getByText('Grandmaster Wood')).toBeDefined();
      expect(screen.getByText('Tournament Vector')).toBeDefined();

      // Click close button
      const closeBtn = document.getElementById('close-theme-customizer-btn');
      expect(closeBtn).not.toBeNull();
      fireEvent.click(closeBtn!);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('GameHub Component', () => {
    it('renders difficulty selector and dispatches bot match start', () => {
      const onStartBotMatch = vi.fn();
      const onStartLocalMatch = vi.fn();
      const onResumeMatch = vi.fn();
      const onSelectDifficulty = vi.fn();

      render(
        <GameHub
          onStartBotMatch={onStartBotMatch}
          onStartLocalMatch={onStartLocalMatch}
          onResumeMatch={onResumeMatch}
          hasActiveMatch={true}
          turnNumber={5}
          activePlayer="P1"
          isGameOver={false}
          botEnabled={true}
          botDifficulty={3}
          onSelectDifficulty={onSelectDifficulty}
          onOpenThemeModal={vi.fn()}
        />
      );

      expect(screen.getByText('Partida contra Robô (IA)')).toBeDefined();
      expect(screen.getByText(/Pass & Play/i)).toBeDefined();
      expect(screen.getByText(/Retomar Partida/i)).toBeDefined();

      // Start Bot Match
      const startBotBtn = screen.getByRole('button', { name: /Iniciar Nova Partida/i });
      fireEvent.click(startBotBtn);
      expect(onStartBotMatch).toHaveBeenCalledWith(3);
    });
  });

  describe('PlayerCard Component', () => {
    it('highlights active turn and displays thinking state', () => {
      const { rerender } = render(
        <PlayerCard
          playerId="P2"
          displayName="Robô MCTS"
          isTurnActive={true}
          isThinking={true}
          isBot={true}
          difficultyLabel="Nível 3"
        />
      );

      expect(screen.getByText('Robô MCTS')).toBeDefined();
      expect(screen.getByText(/Calculando/i)).toBeDefined();

      rerender(
        <PlayerCard
          playerId="P2"
          displayName="Robô MCTS"
          isTurnActive={false}
          isThinking={false}
          isBot={true}
        />
      );
      expect(screen.queryByText(/Calculando/i)).toBeNull();
    });
  });

  describe('EvaluationBar Component (Spec 06 RF-15)', () => {
    it('formats positive and negative centipawn evaluations', () => {
      const { rerender } = render(<EvaluationBar evalScore={150} />);
      const badge = document.getElementById('bot-eval-badge');
      expect(badge?.textContent).toBe('Eval: +1.50');

      rerender(<EvaluationBar evalScore={-80} />);
      expect(badge?.textContent).toBe('Eval: -0.80');

      rerender(<EvaluationBar evalScore={0} />);
      expect(badge?.textContent).toBe('Eval: 0.00');
    });
  });

  describe('GameControlsBar Component', () => {
    it('triggers bot toggle, difficulty change, undo, redo, and reset', () => {
      const onToggleBot = vi.fn();
      const onSetDifficulty = vi.fn();
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      const onReset = vi.fn();

      render(
        <GameControlsBar
          isBotEnabled={true}
          difficulty={3}
          isThinking={false}
          lastEval={45}
          boardSize={8}
          onToggleBot={onToggleBot}
          onSetDifficulty={onSetDifficulty}
          onBoardSizeChange={vi.fn()}
          onUndo={onUndo}
          onRedo={onRedo}
          onReset={onReset}
          onOpenThemeModal={vi.fn()}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onToggleBot).toHaveBeenCalledWith(false);

      const undoBtn = screen.getByRole('button', { name: /Undo/i });
      fireEvent.click(undoBtn);
      expect(onUndo).toHaveBeenCalled();

      const redoBtn = screen.getByRole('button', { name: /Redo/i });
      fireEvent.click(redoBtn);
      expect(onRedo).toHaveBeenCalled();

      const resetBtn = screen.getByRole('button', { name: /Reset Match/i });
      fireEvent.click(resetBtn);
      expect(onReset).toHaveBeenCalled();
    });
  });

  describe('ChessBoard Visual Controls & Board Flip (Spec 06 RF-14, RF-16)', () => {
    beforeEach(() => {
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

    it('renders coordinate labels when showCoordinates is true', () => {
      localStorage.setItem(
        'chess_in_react_theme_preferences',
        JSON.stringify({ showCoordinates: true })
      );

      const { container } = render(
        <ThemeProvider>
          <ChessBoard />
        </ThemeProvider>
      );

      const rankLabels = container.querySelectorAll('[data-testid="coordinate-rank"]');
      const fileLabels = container.querySelectorAll('[data-testid="coordinate-file"]');
      expect(rankLabels.length).toBeGreaterThan(0);
      expect(fileLabels.length).toBeGreaterThan(0);
    });

    it('hides coordinate labels when showCoordinates is false', () => {
      localStorage.setItem(
        'chess_in_react_theme_preferences',
        JSON.stringify({ showCoordinates: false })
      );

      const { container } = render(
        <ThemeProvider>
          <ChessBoard />
        </ThemeProvider>
      );

      const rankLabels = container.querySelectorAll('[data-testid="coordinate-rank"]');
      const fileLabels = container.querySelectorAll('[data-testid="coordinate-file"]');
      expect(rankLabels.length).toBe(0);
      expect(fileLabels.length).toBe(0);
    });

    it('renders legal move indicators when showLegalMoves is true and a piece is clicked', () => {
      localStorage.setItem(
        'chess_in_react_theme_preferences',
        JSON.stringify({ showLegalMoves: true })
      );

      const { container } = render(
        <ThemeProvider>
          <ChessBoard />
        </ThemeProvider>
      );

      // Click white pawn at e2 (4, 1)
      const sqE2 = container.querySelector('[data-testid="square-4,1"]');
      expect(sqE2).not.toBeNull();
      fireEvent.click(sqE2!);

      // Should render legal move dots on e3 (4,2) and e4 (4,3)
      const dots = container.querySelectorAll('[data-testid="legal-move-dot"]');
      expect(dots.length).toBeGreaterThanOrEqual(2);
    });

    it('logically inverts board rows and columns when flipBoard is true without rotating container', () => {
      localStorage.setItem(
        'chess_in_react_theme_preferences',
        JSON.stringify({ flipBoard: true })
      );

      const { container } = render(
        <ThemeProvider>
          <ChessBoard />
        </ThemeProvider>
      );

      // Top-left square in standard orientation is (0, 7) [a8]
      // In flipped orientation, top-left square is (7, 0) [h1]
      const firstSquare = container.querySelector('.chess-board-grid > :first-child');
      expect(firstSquare?.getAttribute('data-testid')).toBe('square-7,0');

      // The board itself must NOT have transform: rotate(180deg)
      const boardElement = container.querySelector('.chess-board-grid');
      expect(boardElement?.getAttribute('style') || '').not.toContain('rotate(180deg)');
    });
  });

  describe('App Navigation & Hash Synchronization (Spec 06 RF-01, RF-02)', () => {
    beforeEach(() => {
      window.location.hash = '';
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

    it('renders Game Hub by default when no hash is present', () => {
      render(<App />);
      expect(screen.getByText('Partida contra Robô (IA)')).toBeDefined();
      expect(screen.getByText(/Experiência de Xadrez Avançada/i)).toBeDefined();
    });

    it('renders Game directly when #game hash is present', () => {
      window.location.hash = '#game';
      render(<App />);
      expect(screen.getByTestId('top-nav-bar')).toBeDefined();
      expect(document.getElementById('bot-toggle-checkbox')).not.toBeNull();
    });

    it('preserves match state when navigating between Hub and Game', () => {
      window.location.hash = '#game';
      render(<App />);

      // Enable bot match
      const botCheckbox = document.getElementById('bot-toggle-checkbox')!;
      fireEvent.click(botCheckbox);

      // White moves e2 to e4
      const sqE2 = screen.getByTestId('square-4,1');
      const sqE4 = screen.getByTestId('square-4,3');
      fireEvent.click(sqE2);
      fireEvent.click(sqE4);

      // Turn advanced
      expect(gameStore.getState().domain.turnNumber).toBe(2);

      // Navigate to Hub
      const hubBtn = screen.getByRole('button', { name: /Game Hub/i });
      fireEvent.click(hubBtn);

      // Hub shows "Continuar contra Bot (Turno #2)"
      const resumeBtn = screen.getByRole('button', { name: /Continuar contra Bot/i });
      expect(resumeBtn).toBeDefined();
      expect(resumeBtn.textContent).toContain('Turno #2');

      // Click to resume
      fireEvent.click(resumeBtn);

      // Back on game, turn number is still 2!
      expect(gameStore.getState().domain.turnNumber).toBe(2);
      expect(document.getElementById('bot-toggle-checkbox')).not.toBeNull();
    });
  });
});

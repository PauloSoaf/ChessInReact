// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
import { UI_THEMES, BOARD_THEMES, PIECE_SETS } from '../theme/themeRegistry';
import { PieceRenderer } from '../components/pieces/PieceRenderer';
import { TopNavBar } from '../components/navigation/TopNavBar';
import { ThemeCustomizerModal } from '../components/navigation/ThemeCustomizerModal';
import { GameHub } from '../components/hub/GameHub';
import { PlayerCard } from '../components/game/PlayerCard';
import { EvaluationBar } from '../components/game/EvaluationBar';
import { GameControlsBar } from '../components/game/GameControlsBar';

describe('Spec 06 UI/UX & Design System Suite (Sprint 01)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
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

    it('renders pixelated typography for pixel-art arcade set', () => {
      const { container } = render(
        <PieceRenderer variantId="KING" ownerId="P1" pieceSet="pixel-art" />
      );
      expect(container.textContent).toContain('♚');
      const span = container.querySelector('span');
      expect(span?.style.fontFamily).toContain('Courier New');
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
      const startBotBtn = screen.getByRole('button', { name: /contra/i });
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
});

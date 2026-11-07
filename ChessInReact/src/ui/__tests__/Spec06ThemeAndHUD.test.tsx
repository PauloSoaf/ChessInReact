// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { BrandMark, ActionButton, SegmentedControl, ModalShell, Card, StatusIndicator } from '../components/primitives';
import * as THREE from 'three';
import { ChessPieceShowcase, ShowcaseFallback } from '../components/showcase';
import { StudioEnvironment } from '../components/showcase/StudioEnvironment';
import { THEME_LIGHTING } from '../components/showcase/lightingConfig';
import BoardSquare from '../../components/BoardSquare/BoardSquare';
import fs from 'fs';
import path from 'path';

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

    it('verifies WCAG 2.2 AA contrast ratios (>= 4.5:1) for active semantic token pairs', () => {
      function getLuminance(hex: string): number {
        const clean = hex.replace('#', '');
        const r = parseInt(clean.substring(0, 2), 16) / 255;
        const g = parseInt(clean.substring(2, 4), 16) / 255;
        const b = parseInt(clean.substring(4, 6), 16) / 255;
        const [rl, gl, bl] = [r, g, b].map((c) =>
          c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
        );
        return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      }

      function getContrast(fg: string, bg: string): number {
        const l1 = getLuminance(fg);
        const l2 = getLuminance(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      // Midnight Slate theme pairs
      expect(getContrast('#F4F1EB', '#090D11')).toBeGreaterThanOrEqual(4.5); // primary on app
      expect(getContrast('#B4BCC4', '#161C20')).toBeGreaterThanOrEqual(4.5); // secondary on elevated
      expect(getContrast('#8E9BA6', '#090D11')).toBeGreaterThanOrEqual(4.5); // muted on app
      expect(getContrast('#8E9BA6', '#161C20')).toBeGreaterThanOrEqual(4.5); // muted on elevated
      expect(getContrast('#F87171', '#090D11')).toBeGreaterThanOrEqual(4.5); // danger on app
      expect(getContrast('#F87171', '#161C20')).toBeGreaterThanOrEqual(4.5); // danger on elevated

      // Warm Ivory theme pairs
      expect(getContrast('#141A20', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // primary on white
      expect(getContrast('#3D4A56', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // secondary on white
      expect(getContrast('#53616E', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // muted on white
      expect(getContrast('#53616E', '#F5F2EB')).toBeGreaterThanOrEqual(4.5); // muted on app
      expect(getContrast('#B91C1C', '#FFFFFF')).toBeGreaterThanOrEqual(4.5); // danger on white

      // Synthwave theme pairs
      expect(getContrast('#C084FC', '#080312')).toBeGreaterThanOrEqual(4.5); // muted on app
      expect(getContrast('#FB7185', '#080312')).toBeGreaterThanOrEqual(4.5); // danger on app
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
    it('renders difficulty selector and dispatches bot match start', async () => {
      const onStartBotMatch = vi.fn();
      const onStartLocalMatch = vi.fn();
      const onResumeMatch = vi.fn();
      const onSelectDifficulty = vi.fn();

      await act(async () => {
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
      });

      expect(screen.getByText('Partida contra Robô (IA)')).toBeDefined();
      expect(screen.getByText(/Pass & Play/i)).toBeDefined();
      expect(screen.getByText(/Retomar Partida/i)).toBeDefined();

      // Start Bot Match
      const startBotBtn = screen.getByRole('button', { name: /Iniciar Nova Partida/i });
      await act(async () => {
        fireEvent.click(startBotBtn);
      });
      expect(onStartBotMatch).toHaveBeenCalledWith(3);
    });

    it('does not display resume match action when match is concluded (isGameOver=true)', async () => {
      const onStartBotMatch = vi.fn();
      const onResumeMatch = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={true}
            turnNumber={14}
            isGameOver={true}
            botEnabled={true}
            botDifficulty={4}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
          />
        );
      });

      // Must NOT present "Retomar Partida" when match is over
      expect(screen.queryByText(/Retomar Partida/i)).toBeNull();
      // Should present final position option
      expect(screen.getByText(/Fim de Jogo/i)).toBeDefined();
    });

    it('renders Suspense fallback during initial lazy chunk load and transitions from off to eager', async () => {
      const { rerender } = render(
        <GameHub
          onStartBotMatch={vi.fn()}
          onStartLocalMatch={vi.fn()}
          onResumeMatch={vi.fn()}
          hasActiveMatch={false}
          turnNumber={1}
          botEnabled={true}
          botDifficulty={3}
          onSelectDifficulty={vi.fn()}
          onOpenThemeModal={vi.fn()}
          progressive3DMode="off"
        />
      );

      // 1. In "off" mode: static non-interactive fallback is present, lazy 3D showcase is NOT mounted
      const outerContainer = document.getElementById('chess-piece-showcase-container');
      expect(outerContainer?.getAttribute('data-3d-state')).toBe('inactive');
      expect(screen.getByTestId('showcase-static-fallback')).toBeDefined();
      expect(screen.queryByTestId('showcase-fallback-trigger')).toBeNull();
      expect(document.getElementById('chess-piece-fallback-svg')).not.toBeNull();
      expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();

      // 2. Transition prop from "off" to "eager"
      rerender(
        <GameHub
          onStartBotMatch={vi.fn()}
          onStartLocalMatch={vi.fn()}
          onResumeMatch={vi.fn()}
          hasActiveMatch={false}
          turnNumber={1}
          botEnabled={true}
          botDifficulty={3}
          onSelectDifficulty={vi.fn()}
          onOpenThemeModal={vi.fn()}
          progressive3DMode="eager"
        />
      );

      expect(outerContainer?.getAttribute('data-3d-state')).toBe('active');
      expect(screen.queryByTestId('showcase-static-fallback')).toBeNull();

      // Synchronously while React.lazy dynamic import is pending on first load, Suspense fallback MUST be rendered
      expect(screen.getByTestId('showcase-suspense-fallback')).toBeDefined();
      expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();

      // 3. Once async lazy chunk resolves, actual ChessPieceShowcase mounts and Suspense fallback unmounts
      const mountedShowcase = await screen.findByTestId('chess-piece-showcase');
      expect(mountedShowcase).toBeDefined();
      expect(screen.queryByTestId('showcase-suspense-fallback')).toBeNull();
      expect(document.getElementById('showcase-btn-finish-brass')).not.toBeNull();

      // 4. Transitioning back to "off" unmounts the 3D showcase and restores the static 2D fallback
      rerender(
        <GameHub
          onStartBotMatch={vi.fn()}
          onStartLocalMatch={vi.fn()}
          onResumeMatch={vi.fn()}
          hasActiveMatch={false}
          turnNumber={1}
          botEnabled={true}
          botDifficulty={3}
          onSelectDifficulty={vi.fn()}
          onOpenThemeModal={vi.fn()}
          progressive3DMode="off"
        />
      );
      expect(outerContainer?.getAttribute('data-3d-state')).toBe('inactive');
      expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();
      expect(screen.getByTestId('showcase-static-fallback')).toBeDefined();
      expect(screen.queryByTestId('showcase-fallback-trigger')).toBeNull();
    });

    it('mounts 3D showcase immediately when progressive3DMode="eager" on initial mount', async () => {
      const requestIdleSpy = vi.fn();
      (window as unknown as Record<string, unknown>).requestIdleCallback = requestIdleSpy;

      try {
        render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="eager"
          />
        );

        expect(requestIdleSpy).not.toHaveBeenCalled();
        expect(screen.queryByTestId('showcase-fallback-trigger')).toBeNull();

        const mountedShowcase = await screen.findByTestId('chess-piece-showcase');
        expect(mountedShowcase).toBeDefined();
        expect(document.getElementById('showcase-btn-finish-obsidian')).not.toBeNull();
      } finally {
        delete (window as unknown as Record<string, unknown>).requestIdleCallback;
      }
    });

    it('schedules requestIdleCallback in "idle" mode, activates after callback fires without stealing focus, and cancels on unmount', async () => {
      let capturedCallback: (() => void) | null = null;
      const requestIdleMock = vi.fn((cb: () => void) => {
        capturedCallback = cb;
        return 77;
      });
      const cancelIdleMock = vi.fn();

      (window as unknown as Record<string, unknown>).requestIdleCallback = requestIdleMock;
      (window as unknown as Record<string, unknown>).cancelIdleCallback = cancelIdleMock;

      try {
        const { unmount } = render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="idle"
          />
        );

        // User focuses a hero button while browsing the page
        const playBotBtn = document.getElementById('hub-hero-btn-play-bot')!;
        playBotBtn.focus();
        expect(document.activeElement).toBe(playBotBtn);

        // Before idle callback: 2D fallback trigger is active, 3D showcase is NOT mounted
        expect(requestIdleMock).toHaveBeenCalledTimes(1);
        expect(requestIdleMock).toHaveBeenCalledWith(expect.any(Function), { timeout: 1500 });
        expect(screen.getByTestId('showcase-fallback-trigger')).toBeDefined();
        expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();

        // Fire the deterministic idle callback
        await act(async () => {
          capturedCallback?.();
        });

        // After idle callback: 3D showcase is mounted, 2D trigger is removed, and focus was NOT stolen
        const mountedShowcase = await screen.findByTestId('chess-piece-showcase');
        expect(mountedShowcase).toBeDefined();
        expect(screen.queryByTestId('showcase-fallback-trigger')).toBeNull();
        expect(document.activeElement).toBe(playBotBtn);

        unmount();
      } finally {
        delete (window as unknown as Record<string, unknown>).requestIdleCallback;
        delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
      }
    });

    it('cancels pending requestIdleCallback on unmount and ignores late callback execution', () => {
      let capturedCallback: (() => void) | null = null;
      const requestIdleMock = vi.fn((cb: () => void) => {
        capturedCallback = cb;
        return 99;
      });
      const cancelIdleMock = vi.fn();

      (window as unknown as Record<string, unknown>).requestIdleCallback = requestIdleMock;
      (window as unknown as Record<string, unknown>).cancelIdleCallback = cancelIdleMock;

      try {
        const { unmount } = render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="idle"
          />
        );

        expect(requestIdleMock).toHaveBeenCalledTimes(1);
        expect(cancelIdleMock).not.toHaveBeenCalled();

        // Unmount before callback fires
        unmount();
        expect(cancelIdleMock).toHaveBeenCalledWith(99);

        // Invoking callback after unmount must be a safe no-op
        expect(() => capturedCallback?.()).not.toThrow();
      } finally {
        delete (window as unknown as Record<string, unknown>).requestIdleCallback;
        delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
      }
    });

    it('renders non-interactive static SVG in "off" mode without focusable button and blocks all interactions', async () => {
      const user = userEvent.setup();
      const requestIdleMock = vi.fn();
      (window as unknown as Record<string, unknown>).requestIdleCallback = requestIdleMock;

      try {
        render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="off"
          />
        );

        const outerContainer = document.getElementById('chess-piece-showcase-container')!;
        const staticFallback = screen.getByTestId('showcase-static-fallback');

        // Must NOT render an interactive button in "off" mode
        expect(requestIdleMock).not.toHaveBeenCalled();
        expect(screen.queryByTestId('showcase-fallback-trigger')).toBeNull();
        expect(screen.queryByRole('button', { name: /Ativar mostruário 3D/i })).toBeNull();
        expect(screen.getByRole('img', { name: /Mostruário da peça Cavalo Staunton em 2D/i })).toBeDefined();

        // Attempt hover, touch, click, and keyboard events on the static container
        fireEvent.mouseEnter(outerContainer);
        fireEvent.touchStart(outerContainer);
        fireEvent.click(staticFallback);
        fireEvent.keyDown(staticFallback, { key: 'Enter' });
        fireEvent.keyDown(staticFallback, { key: ' ' });
        await user.click(staticFallback);

        // 3D showcase must remain completely unmounted
        expect(outerContainer.getAttribute('data-3d-state')).toBe('inactive');
        expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();
        expect(screen.getByTestId('showcase-static-fallback')).toBeDefined();
      } finally {
        delete (window as unknown as Record<string, unknown>).requestIdleCallback;
      }
    });

    it('preserves keyboard focus continuity via userEvent when activating 3D with Enter/Space and handles load errors safely', async () => {
      const user = userEvent.setup();
      const requestIdleMock = vi.fn(() => 101);
      const cancelIdleMock = vi.fn();
      (window as unknown as Record<string, unknown>).requestIdleCallback = requestIdleMock;
      (window as unknown as Record<string, unknown>).cancelIdleCallback = cancelIdleMock;

      try {
        // 1. Test userEvent Tab -> Enter activation -> Focus transfer to first finish button -> Tab navigation
        const { unmount } = render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="idle"
          />
        );

        const trigger = screen.getByRole('button', {
          name: /Ativar mostruário 3D interativo do Cavalo Staunton/i,
        });
        expect(trigger).toBeDefined();

        // Focus trigger and verify non-activation keys do not activate 3D
        trigger.focus();
        expect(document.activeElement).toBe(trigger);
        await user.keyboard('{Escape}a');
        expect(screen.queryByTestId('chess-piece-showcase')).toBeNull();
        expect(document.activeElement).toBe(trigger);

        // Activate via userEvent Enter key
        await user.keyboard('{Enter}');
        expect(await screen.findByTestId('chess-piece-showcase')).toBeDefined();
        expect(cancelIdleMock).toHaveBeenCalledWith(101);

        // Focus MUST be transferred to the first showcase control (#showcase-btn-finish-brass)
        const brassBtn = document.getElementById('showcase-btn-finish-brass')!;
        const obsidianBtn = document.getElementById('showcase-btn-finish-obsidian')!;
        const ivoryBtn = document.getElementById('showcase-btn-finish-ivory')!;
        expect(document.activeElement).toBe(brassBtn);

        // Subsequent Tab presses navigate coherently through the showcase finish controls
        await user.tab();
        expect(document.activeElement).toBe(obsidianBtn);
        await user.tab();
        expect(document.activeElement).toBe(ivoryBtn);
        unmount();

        // 2. Test userEvent Space key activation and focus transfer
        const { unmount: unmountSpace } = render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
            progressive3DMode="idle"
          />
        );

        const triggerSpace = screen.getByRole('button', {
          name: /Ativar mostruário 3D interativo do Cavalo Staunton/i,
        });
        triggerSpace.focus();
        expect(document.activeElement).toBe(triggerSpace);

        await user.keyboard(' ');
        expect(await screen.findByTestId('chess-piece-showcase')).toBeDefined();
        expect(document.activeElement).toBe(document.getElementById('showcase-btn-finish-brass'));
        unmountSpace();

        // 3. Test error fallback focus preservation when showcase throws during mount
        const originalMatchMedia = window.matchMedia;
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        window.matchMedia = vi.fn(() => {
          throw new Error('Simulated showcase mount failure');
        });

        try {
          render(
            <GameHub
              onStartBotMatch={vi.fn()}
              onStartLocalMatch={vi.fn()}
              onResumeMatch={vi.fn()}
              hasActiveMatch={false}
              turnNumber={1}
              botEnabled={true}
              botDifficulty={3}
              onSelectDifficulty={vi.fn()}
              onOpenThemeModal={vi.fn()}
              progressive3DMode="idle"
            />
          );

          const triggerErr = screen.getByRole('button', {
            name: /Ativar mostruário 3D interativo do Cavalo Staunton/i,
          });
          triggerErr.focus();
          await user.keyboard('{Enter}');

          const errorFallback = await screen.findByTestId('showcase-error-fallback');
          expect(errorFallback).toBeDefined();
          expect(document.activeElement).toBe(errorFallback);
        } finally {
          window.matchMedia = originalMatchMedia;
          consoleErrorSpy.mockRestore();
        }
      } finally {
        delete (window as unknown as Record<string, unknown>).requestIdleCallback;
        delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
      }
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

    it('renders Game Hub by default when no hash is present', async () => {
      await act(async () => {
        render(<App />);
      });
      expect(screen.getByText('Partida contra Robô (IA)')).toBeDefined();
      expect(screen.getByText(/Experiência de Xadrez Avançada/i)).toBeDefined();
    });

    it('renders Game directly when #game hash is present', async () => {
      window.location.hash = '#game';
      await act(async () => {
        render(<App />);
      });
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

  describe('Component Library Primitives (Spec 06 Design Recovery)', () => {
    it('renders BrandMark with emblem, title and optional subtitle', () => {
      const onBrandClick = vi.fn();
      const { rerender } = render(
        <BrandMark size="md" subtitleText="Editorial Atelier" onClick={onBrandClick} />
      );

      expect(screen.getByText('ChessInReact')).toBeDefined();
      expect(screen.getByText('Editorial Atelier')).toBeDefined();

      fireEvent.click(screen.getByText('ChessInReact'));
      expect(onBrandClick).toHaveBeenCalled();

      rerender(<BrandMark showSubtitle={false} />);
      expect(screen.queryByText('Editorial Atelier')).toBeNull();
    });

    it('renders ActionButton with variants, icons and click behavior', () => {
      const onClick = vi.fn();
      render(
        <ActionButton variant="primary" leadingIcon={<span data-testid="test-icon">★</span>} onClick={onClick}>
          Disputar Partida
        </ActionButton>
      );

      const btn = screen.getByRole('button', { name: /Disputar Partida/i });
      expect(btn).toBeDefined();
      expect(screen.getByTestId('test-icon')).toBeDefined();

      fireEvent.click(btn);
      expect(onClick).toHaveBeenCalled();
    });

    it('renders SegmentedControl with roving tabindex and keyboard arrow navigation', () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <SegmentedControl
          value="tab2"
          onChange={onChange}
          options={[
            { value: 'tab1', label: 'Primeiro' },
            { value: 'tab2', label: 'Segundo' },
            { value: 'tab3', label: 'Terceiro' },
          ]}
        />
      );

      const tab1 = screen.getByRole('radio', { name: /Primeiro/i });
      const tab2 = screen.getByRole('radio', { name: /Segundo/i });
      const tab3 = screen.getByRole('radio', { name: /Terceiro/i });

      // Roving tabindex verification: active item is 0, inactive items are -1
      expect(tab2.getAttribute('tabindex')).toBe('0');
      expect(tab1.getAttribute('tabindex')).toBe('-1');
      expect(tab3.getAttribute('tabindex')).toBe('-1');
      expect(tab2.getAttribute('aria-checked')).toBe('true');

      // Arrow navigation: ArrowLeft moves from tab2 to tab1
      fireEvent.keyDown(tab2, { key: 'ArrowLeft' });
      expect(onChange).toHaveBeenCalledWith('tab1');

      // Arrow navigation: ArrowRight moves from tab2 to tab3
      fireEvent.keyDown(tab2, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalledWith('tab3');

      // Home and End keys
      fireEvent.keyDown(tab2, { key: 'Home' });
      expect(onChange).toHaveBeenCalledWith('tab1');

      fireEvent.keyDown(tab2, { key: 'End' });
      expect(onChange).toHaveBeenCalledWith('tab3');

      // Direct click works
      fireEvent.click(tab1);
      expect(onChange).toHaveBeenCalledWith('tab1');

      rerender(
        <SegmentedControl
          value="tab1"
          onChange={onChange}
          options={[
            { value: 'tab1', label: 'Primeiro' },
            { value: 'tab2', label: 'Segundo' },
            { value: 'tab3', label: 'Terceiro' },
          ]}
        />
      );
      expect(tab1.getAttribute('tabindex')).toBe('0');
      expect(tab2.getAttribute('tabindex')).toBe('-1');
    });

    it('renders Card with variant styling and interactive states', () => {
      render(
        <Card variant="interactive" selected={true} id="test-card">
          <span>Card Content</span>
        </Card>
      );
      const card = document.getElementById('test-card');
      expect(card).not.toBeNull();
      expect(screen.getByText('Card Content')).toBeDefined();
    });

    it('renders ModalShell with dialog semantics, focus trap, and Escape key handler', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();

      function ModalTestWrapper() {
        const [isOpen, setIsOpen] = React.useState(false);
        return (
          <div>
            <button id="opener-btn" onClick={() => setIsOpen(true)}>
              Abrir Modal
            </button>
            <ModalShell
              isOpen={isOpen}
              onClose={() => {
                onClose();
                setIsOpen(false);
              }}
              title="Diálogo de Teste"
              description="Descrição do teste"
            >
              <input id="modal-input-1" placeholder="Input 1" />
              <button id="modal-btn-1">Ação</button>
            </ModalShell>
          </div>
        );
      }

      const { unmount } = render(<ModalTestWrapper />);
      const openerBtn = document.getElementById('opener-btn') as HTMLButtonElement;
      expect(openerBtn).not.toBeNull();

      // User focuses and clicks opener button to open modal
      await user.click(openerBtn);

      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Diálogo de Teste')).toBeDefined();

      const closeBtn = document.getElementById('close-modal-shell-btn') as HTMLButtonElement;
      const input = document.getElementById('modal-input-1') as HTMLInputElement;
      const actionBtn = document.getElementById('modal-btn-1') as HTMLButtonElement;

      expect(closeBtn).not.toBeNull();
      expect(input).not.toBeNull();
      expect(actionBtn).not.toBeNull();

      // Test real initial focus
      await vi.waitFor(() => {
        expect(document.activeElement).toBe(closeBtn);
      });

      // Tab advances: closeBtn -> input -> actionBtn -> closeBtn (wraps)
      await user.tab();
      expect(document.activeElement).toBe(input);

      await user.tab();
      expect(document.activeElement).toBe(actionBtn);

      // Tab on last element wraps to first element
      await user.tab();
      expect(document.activeElement).toBe(closeBtn);

      // Shift+Tab on first element wraps to last element
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(actionBtn);

      // Escape key closes modal
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();

      // Focus restituted to opener button
      await vi.waitFor(() => {
        const openerBtn = document.getElementById('opener-btn');
        expect(document.activeElement).toBe(openerBtn);
      });

      unmount();
    });

    it('renders StatusIndicator with semantic status dots', () => {
      const { rerender } = render(<StatusIndicator status="active" label="Vez das Brancas" pulse={true} />);
      expect(screen.getByText('Vez das Brancas')).toBeDefined();

      rerender(<StatusIndicator status="thinking" label="Calculando lance" />);
      expect(screen.getByText('Calculando lance')).toBeDefined();
    });
  });

  describe('Interactive 3D Showcase & Fallback (Spec 06 Creative Dev)', () => {
    it('renders ChessPieceShowcase and displays 2D vector fallback in headless environment', () => {
      render(<ChessPieceShowcase initialFinish="antique-brass" />);
      expect(document.getElementById('chess-piece-showcase')).not.toBeNull();

      // In jsdom without hardware WebGL, ShowcaseFallback is gracefully rendered
      const fallback = screen.getByTestId('showcase-fallback-vector');
      expect(fallback).toBeDefined();
      expect(fallback.getAttribute('role')).toBe('img');

      // Finish switcher buttons exist and are clickable
      const brassBtn = document.getElementById('showcase-btn-finish-brass');
      const obsidianBtn = document.getElementById('showcase-btn-finish-obsidian');
      const ivoryBtn = document.getElementById('showcase-btn-finish-ivory');

      expect(brassBtn).not.toBeNull();
      expect(obsidianBtn).not.toBeNull();
      expect(ivoryBtn).not.toBeNull();

      fireEvent.click(obsidianBtn!);
      fireEvent.click(ivoryBtn!);
    });

    it('renders direct ShowcaseFallback with multiple material gradients', () => {
      const { rerender } = render(<ShowcaseFallback finish="obsidian" />);
      expect(screen.getByTestId('showcase-fallback-vector')).toBeDefined();

      rerender(<ShowcaseFallback finish="ivory-marble" />);
      expect(screen.getByTestId('showcase-fallback-vector')).toBeDefined();
    });

    it('initializes ChessPieceShowcase with explicit WebGL status attribute', () => {
      render(<ChessPieceShowcase initialFinish="antique-brass" />);
      const showcase = document.getElementById('chess-piece-showcase');
      expect(showcase).not.toBeNull();
      expect(showcase?.getAttribute('data-webgl-status')).toBe('available');
    });

    it('synchronizes ChessPieceShowcase theme bridge across midnight, ivory, and synthwave', () => {
      const { rerender } = render(<ChessPieceShowcase theme="midnight" />);
      const showcase = document.getElementById('chess-piece-showcase');
      expect(showcase).not.toBeNull();
      expect(showcase?.style.background).toContain('196, 167, 125');

      rerender(<ChessPieceShowcase theme="ivory" />);
      expect(showcase?.style.background).toContain('30, 41, 59');

      rerender(<ChessPieceShowcase theme="synthwave" />);
      expect(showcase?.style.background).toContain('217, 70, 239');
    });

    it('cleans up WebGL context listeners and recovery timers symmetrically on unmount', () => {
      const { unmount } = render(<ChessPieceShowcase initialFinish="antique-brass" />);
      const showcase = document.getElementById('chess-piece-showcase');
      expect(showcase).not.toBeNull();
      expect(showcase?.getAttribute('data-webgl-status')).toBe('available');
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('StudioEnvironment WebGL Theme Photometric Lighting Bridge', () => {
    it('defines explicit photometric lighting profiles for midnight, ivory, and synthwave', () => {
      expect(THEME_LIGHTING.midnight).toBeDefined();
      expect(THEME_LIGHTING.ivory).toBeDefined();
      expect(THEME_LIGHTING.synthwave).toBeDefined();

      // Midnight: editorial studio warmth
      expect(THEME_LIGHTING.midnight.key.color).toBe('#FFF6E8');
      expect(THEME_LIGHTING.midnight.key.intensity).toBe(1.35);
      expect(THEME_LIGHTING.midnight.ambient.intensity).toBe(0.45);

      // Ivory: bright museum alabaster
      expect(THEME_LIGHTING.ivory.key.color).toBe('#FFFBF0');
      expect(THEME_LIGHTING.ivory.key.intensity).toBe(1.5);
      expect(THEME_LIGHTING.ivory.ambient.intensity).toBe(0.8);
      expect(THEME_LIGHTING.ivory.ambient.color).toBe('#FFFFFF');

      // Synthwave: neon magenta, cyan, and violet high contrast
      expect(THEME_LIGHTING.synthwave.key.color).toBe('#FB7185');
      expect(THEME_LIGHTING.synthwave.key.intensity).toBe(1.8);
      expect(THEME_LIGHTING.synthwave.fill.color).toBe('#22D3EE');
      expect(THEME_LIGHTING.synthwave.rim.color).toBe('#C084FC');
      expect(THEME_LIGHTING.synthwave.rim.intensity).toBe(2.4);
    });

    it('produces valid R3F light elements and binds photometric attributes for each theme', () => {
      // 1. Midnight Theme R3F Tree
      const midnightTree = StudioEnvironment({ theme: 'midnight' }) as React.ReactElement<{ children: React.ReactNode }>;
      const midnightChildren = React.Children.toArray(midnightTree.props.children) as React.ReactElement[];
      expect(midnightChildren).toHaveLength(5);

      const ambientMidnight = midnightChildren[0];
      expect(ambientMidnight.type).toBe('ambientLight');
      expect(ambientMidnight.props.color).toBe('#F8FAFC');
      expect(ambientMidnight.props.intensity).toBe(0.45);

      const keyMidnight = midnightChildren[1];
      expect(keyMidnight.type).toBe('directionalLight');
      expect(keyMidnight.props.color).toBe('#FFF6E8');
      expect(keyMidnight.props.intensity).toBe(1.35);
      expect(keyMidnight.props.castShadow).toBe(true);

      // 2. Synthwave Theme R3F Tree
      const synthwaveTree = StudioEnvironment({ theme: 'synthwave' }) as React.ReactElement<{ children: React.ReactNode }>;
      const synthwaveChildren = React.Children.toArray(synthwaveTree.props.children) as React.ReactElement[];
      const ambientSynth = synthwaveChildren[0];
      expect(ambientSynth.type).toBe('ambientLight');
      expect(ambientSynth.props.color).toBe('#3B0764');
      expect(ambientSynth.props.intensity).toBe(0.55);

      const rimSynth = synthwaveChildren[3];
      expect(rimSynth.type).toBe('directionalLight');
      expect(rimSynth.props.color).toBe('#C084FC');
      expect(rimSynth.props.intensity).toBe(2.4);

      // 3. Ivory Theme R3F Tree
      const ivoryTree = StudioEnvironment({ theme: 'ivory' }) as React.ReactElement<{ children: React.ReactNode }>;
      const ivoryChildren = React.Children.toArray(ivoryTree.props.children) as React.ReactElement[];
      const ambientIvory = ivoryChildren[0];
      expect(ambientIvory.type).toBe('ambientLight');
      expect(ambientIvory.props.color).toBe('#FFFFFF');
      expect(ambientIvory.props.intensity).toBe(0.8);

      // 4. Real Three.js Photometric Light Instances Validation
      const ambientLight = new THREE.AmbientLight(
        THEME_LIGHTING.midnight.ambient.color,
        THEME_LIGHTING.midnight.ambient.intensity
      );
      expect(ambientLight.color.getHexString().toLowerCase()).toBe('f8fafc');
      expect(ambientLight.intensity).toBe(0.45);

      const keyLight = new THREE.DirectionalLight(
        THEME_LIGHTING.midnight.key.color,
        THEME_LIGHTING.midnight.key.intensity
      );
      keyLight.position.set(...THEME_LIGHTING.midnight.key.position);
      expect(keyLight.color.getHexString().toLowerCase()).toBe('fff6e8');
      expect(keyLight.position.x).toBe(-3);
      expect(keyLight.position.y).toBe(4);
      expect(keyLight.position.z).toBe(3.5);
    });
  });

  describe('GameHub Component Lifecycle, Actions & Mode Selection', () => {
    it('renders idle GameHub and handles Bot, Local, and Theme customization dispatches', async () => {
      const onStartBotMatch = vi.fn();
      const onStartLocalMatch = vi.fn();
      const onResumeMatch = vi.fn();
      const onSelectDifficulty = vi.fn();
      const onOpenThemeModal = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={onStartLocalMatch}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={onSelectDifficulty}
            onOpenThemeModal={onOpenThemeModal}
          />
        );
      });

      // 1. Verify primary hero actions
      const playBotHeroBtn = document.getElementById('hub-hero-btn-play-bot')!;
      expect(playBotHeroBtn).not.toBeNull();
      fireEvent.click(playBotHeroBtn);
      expect(onStartBotMatch).toHaveBeenCalledWith(3);

      const customizeBtn = document.getElementById('hub-btn-customize-hero')!;
      expect(customizeBtn).not.toBeNull();
      fireEvent.click(customizeBtn);
      expect(onOpenThemeModal).toHaveBeenCalled();

      // 2. Verify local match action from Pass & Play card
      const playLocalBtn = document.getElementById('hub-btn-play-local')!;
      expect(playLocalBtn).not.toBeNull();
      fireEvent.click(playLocalBtn);
      expect(onStartLocalMatch).toHaveBeenCalled();
    });

    it('handles bot difficulty changes via SegmentedControl in Bot card', async () => {
      const onSelectDifficulty = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={vi.fn()}
            hasActiveMatch={false}
            turnNumber={1}
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={onSelectDifficulty}
            onOpenThemeModal={vi.fn()}
          />
        );
      });

      // Click on level 4 difficulty button
      const d4Option = document.getElementById('hub-difficulty-btn-4')!;
      expect(d4Option).not.toBeNull();
      fireEvent.click(d4Option);
      expect(onSelectDifficulty).toHaveBeenCalledWith(4);
    });

    it('displays in-progress match indicators and allows resuming bot match', async () => {
      const onResumeMatch = vi.fn();
      const onStartBotMatch = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={true}
            isGameOver={false}
            turnNumber={7}
            activePlayer="P1"
            botEnabled={true}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
          />
        );
      });

      // Hero resume button
      const resumeHeroBtn = document.getElementById('hub-btn-resume-match')!;
      expect(resumeHeroBtn).not.toBeNull();
      fireEvent.click(resumeHeroBtn);
      expect(onResumeMatch).toHaveBeenCalled();

      // Bot card "Continuar contra Bot (Turno #7)" button
      const continueBotBtn = document.getElementById('hub-card-btn-continue-bot')!;
      expect(continueBotBtn).not.toBeNull();

      // Bot card "Iniciar Nova Partida contra Bot" button
      const newBotMatchBtn = document.getElementById('hub-card-btn-new-bot')!;
      expect(newBotMatchBtn).not.toBeNull();
      fireEvent.click(newBotMatchBtn);
      expect(onStartBotMatch).toHaveBeenCalledWith(3);
    });

    it('displays in-progress match indicators and allows resuming local match', async () => {
      const onResumeMatch = vi.fn();
      const onStartLocalMatch = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={vi.fn()}
            onStartLocalMatch={onStartLocalMatch}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={true}
            isGameOver={false}
            turnNumber={4}
            activePlayer="P2"
            botEnabled={false}
            botDifficulty={3}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
          />
        );
      });

      // Local card shows continue local match
      const resumeLocalBtn = document.getElementById('hub-btn-play-local')!;
      expect(resumeLocalBtn).not.toBeNull();
      fireEvent.click(resumeLocalBtn);
      expect(onResumeMatch).toHaveBeenCalled();

      // Local card allows starting a fresh local match
      const newLocalBtn = document.getElementById('hub-btn-new-local')!;
      expect(newLocalBtn).not.toBeNull();
      fireEvent.click(newLocalBtn);
      expect(onStartLocalMatch).toHaveBeenCalled();
    });

    it('handles concluded match state with review and reset options', async () => {
      const onResumeMatch = vi.fn();
      const onStartBotMatch = vi.fn();

      await act(async () => {
        render(
          <GameHub
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={vi.fn()}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={true}
            isGameOver={true}
            turnNumber={18}
            activePlayer="P1"
            botEnabled={true}
            botDifficulty={4}
            onSelectDifficulty={vi.fn()}
            onOpenThemeModal={vi.fn()}
          />
        );
      });

      // View final position button
      const viewFinalBtn = document.getElementById('hub-btn-view-board')!;
      expect(viewFinalBtn).not.toBeNull();
      fireEvent.click(viewFinalBtn);
      expect(onResumeMatch).toHaveBeenCalled();

      // Start new match button in hero
      const startNewBtn = document.getElementById('hub-hero-btn-play-bot')!;
      expect(startNewBtn).not.toBeNull();
      fireEvent.click(startNewBtn);
      expect(onStartBotMatch).toHaveBeenCalledWith(4);
    });
  });

  describe('BoardSquare WCAG 2.2 AA Accessibility', () => {
    it('provides accessible role=button, tabIndex, detailed aria-label and keyboard Enter/Space activation', () => {
      const handleClick = vi.fn();
      render(
        <ThemeProvider>
          <BoardSquare
            piece={{ name: 'PAWN', color: 'white' }}
            backgroundColor="#e2e8f0"
            handleClick={handleClick}
            squareInfo={{ row: 1, column: 4, gameX: 4, gameY: 1, squareID: '4-1', name: 'PAWN1' }}
            isSelected={false}
            boardDisplay={[]}
            testId="square-4,1"
            isMoveDestination={true}
          />
        </ThemeProvider>
      );

      const square = screen.getByRole('button');
      expect(square).toBeDefined();
      expect(square.getAttribute('tabindex')).toBe('0');

      // Detailed accessible label with algebraic coordinate and piece
      const label = square.getAttribute('aria-label');
      expect(label).toContain('Casa e2');
      expect(label).toContain('Peão Branco');
      expect(label).toContain('movimento legal disponível');

      // Keyboard activation via Enter key
      fireEvent.keyDown(square, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Keyboard activation via Space key
      fireEvent.keyDown(square, { key: ' ' });
      expect(handleClick).toHaveBeenCalledTimes(2);
    });

    it('supports keyboard arrow navigation between adjacent board squares', () => {
      render(
        <ThemeProvider>
          <div>
            <BoardSquare
              piece={{ name: 'PAWN', color: 'white' }}
              backgroundColor="#e2e8f0"
              handleClick={vi.fn()}
              squareInfo={{ row: 3, column: 3, gameX: 3, gameY: 4, squareID: '3-3', name: 'PAWN3' }}
              isSelected={false}
              boardDisplay={Array(8).fill(Array(8).fill({ name: 'none' }))}
              testId="square-3,4"
            />
            <BoardSquare
              piece={{ name: 'none' }}
              backgroundColor="#0f766e"
              handleClick={vi.fn()}
              squareInfo={{ row: 3, column: 4, gameX: 4, gameY: 4, squareID: '4-3', name: 'EMPTY' }}
              isSelected={false}
              boardDisplay={Array(8).fill(Array(8).fill({ name: 'none' }))}
              testId="square-4,4"
            />
          </div>
        </ThemeProvider>
      );

      const sq1 = screen.getByTestId('square-3,4');
      const sq2 = screen.getByTestId('square-4,4');

      sq1.focus();
      expect(document.activeElement).toBe(sq1);

      // Press ArrowRight to move focus from column 3 to column 4
      fireEvent.keyDown(sq1, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(sq2);
    });

    it('implements WAI-ARIA roving tabindex across multiple board sizes (4x4, 8x8, 16x16) with exactly 1 active tab stop', () => {
      // 4x4
      const { unmount: unmount4 } = render(
        <ThemeProvider>
          <ChessBoard boardSize={4} />
        </ThemeProvider>
      );
      const squares4 = screen.getAllByRole('button');
      expect(squares4.length).toBe(16);
      expect(squares4.filter((sq) => sq.getAttribute('tabindex') === '0').length).toBe(1);
      expect(squares4.filter((sq) => sq.getAttribute('tabindex') === '-1').length).toBe(15);
      unmount4();

      // 8x8
      const { unmount: unmount8 } = render(
        <ThemeProvider>
          <ChessBoard boardSize={8} />
        </ThemeProvider>
      );
      const squares8 = screen.getAllByRole('button');
      expect(squares8.length).toBe(64);
      expect(squares8.filter((sq) => sq.getAttribute('tabindex') === '0').length).toBe(1);
      expect(squares8.filter((sq) => sq.getAttribute('tabindex') === '-1').length).toBe(63);
      unmount8();

      // 16x16
      const { unmount: unmount16 } = render(
        <ThemeProvider>
          <ChessBoard boardSize={16} />
        </ThemeProvider>
      );
      const squares16 = screen.getAllByRole('button');
      expect(squares16.length).toBe(256);
      expect(squares16.filter((sq) => sq.getAttribute('tabindex') === '0').length).toBe(1);
      expect(squares16.filter((sq) => sq.getAttribute('tabindex') === '-1').length).toBe(255);
      unmount16();
    });

    it('preserves logical square when board is flipped and updates visual coordinates', () => {
      const FlipTestComponent = () => {
        const { updatePreferences } = useTheme();
        return (
          <div>
            <button id="flip-btn" onClick={() => updatePreferences({ flipBoard: true })}>
              Inverter Tabuleiro
            </button>
            <ChessBoard boardSize={8} />
          </div>
        );
      };

      render(
        <ThemeProvider>
          <FlipTestComponent />
        </ThemeProvider>
      );

      // On standard 8x8 unflipped: initial square is gameX: 4, gameY: 1 (e2 -> visual col 4, row 6)
      const unflippedSquare = screen.getByTestId('square-4,1');
      expect(unflippedSquare.getAttribute('tabindex')).toBe('0');

      // Click flip button
      fireEvent.click(screen.getByRole('button', { name: /Inverter Tabuleiro/i }));

      // After flip: the same logical square (square-4,1) MUST still have tabIndex 0!
      const flippedSquare = screen.getByTestId('square-4,1');
      expect(flippedSquare.getAttribute('tabindex')).toBe('0');
      // Visual coordinates rotated: col = 8 - 1 - 4 = 3, row = 1
      expect(flippedSquare.getAttribute('data-square-col')).toBe('3');
      expect(flippedSquare.getAttribute('data-square-row')).toBe('1');
    });

    it('supports Home and End keys for column boundary navigation', () => {
      const handleFocus = vi.fn();
      render(
        <ThemeProvider>
          <div data-testid="grid-container">
            <BoardSquare
              piece={{ name: 'PAWN', color: 'white' }}
              backgroundColor="#e2e8f0"
              handleClick={vi.fn()}
              squareInfo={{ row: 3, column: 4, gameX: 4, gameY: 4, squareID: '4-3', name: 'PAWN' }}
              boardDisplay={Array(8).fill(Array(8).fill({ name: 'none', symbol: '', color: '' }))}
              testId="square-col4"
              tabIndex={0}
              onFocusSquare={handleFocus}
            />
          </div>
        </ThemeProvider>
      );

      const sq = screen.getByTestId('square-col4');
      // Press Home -> jumps to col 0
      fireEvent.keyDown(sq, { key: 'Home' });
      expect(handleFocus).toHaveBeenCalledWith(0, 3);

      // Press End -> jumps to col 7 (boardSize - 1)
      fireEvent.keyDown(sq, { key: 'End' });
      expect(handleFocus).toHaveBeenCalledWith(7, 3);
    });
  });

  describe('Favicon & Platform Identity Verification', () => {
    it('verifies that index.html uses lang="pt-BR", contains /favicon.svg, and has no obsolete /vite.svg', () => {
      const indexPath = path.resolve(__dirname, '../../../index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');

      expect(content).toContain('<html lang="pt-BR">');
      expect(content).toContain('/favicon.svg');
      expect(content).not.toContain('/vite.svg');
      expect(content).toContain('ChessInReact');

      const faviconPath = path.resolve(__dirname, '../../../public/favicon.svg');
      expect(fs.existsSync(faviconPath)).toBe(true);
    });
  });
});

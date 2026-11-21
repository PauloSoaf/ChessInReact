// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import BoardSquare from '../../../../components/BoardSquare/BoardSquare';
import { EvaluationBar } from '../EvaluationBar';
import { GameControlsBar } from '../GameControlsBar';
import { ThemeProvider } from '../../../theme/ThemeContext';
import { bootstrapGame } from '../../../../core/bootstrap/GameInitializer';
import { gameStore } from '../../../../core/state/gameStore';
import { BOARD_THEMES } from '../../../theme/themeRegistry';
import { chessPieces } from '../../../../constants/chessPieces';

describe('Intuitive UI & Fluid Polish Suite (Spec 06 RF-14, RF-15 & Lichess/Chess.com Standards)', () => {
  beforeEach(() => {
    localStorage.clear();
    bootstrapGame({ targetStore: gameStore });
  });

  afterEach(() => {
    cleanup();
  });

  describe('BoardSquare Last Move & Check Radial Gradient', () => {
    it('decorates square with activeBoardColors.lastMoveHighlight when isLastMove is true', () => {
      const dummySquareInfo = {
        row: 6,
        column: 4,
        squareID: '4-6',
        gameX: 4,
        gameY: 1,
      };

      const theme = BOARD_THEMES['slate-emerald'];

      render(
        <ThemeProvider>
          <BoardSquare
            testId="square-e2"
            piece={chessPieces.none}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isLastMove={true}
          />
        </ThemeProvider>
      );

      const squareEl = screen.getByTestId('square-e2');
      expect(squareEl).toBeDefined();
      // Should have lastMoveHighlight color applied
      expect(squareEl.style.backgroundColor).toBe(theme.lastMoveHighlight);
      expect(squareEl.style.boxShadow).toContain('inset 0 0 0 1.5px');
    });

    it('renders checkKingPulse animation and radial gradient when King is under check', () => {
      const dummySquareInfo = {
        row: 7,
        column: 4,
        squareID: '4-7',
        gameX: 4,
        gameY: 0,
      };

      render(
        <ThemeProvider>
          <BoardSquare
            testId="square-e1"
            piece={chessPieces.w_king ?? { name: 'KING', symbol: '♚', color: 'white' }}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isCheckWarning={true}
          />
        </ThemeProvider>
      );

      const squareEl = screen.getByTestId('square-e1');
      expect(squareEl).toBeDefined();
      expect(squareEl.style.background).toContain('radial-gradient');
      expect(squareEl.style.animation).toContain('checkKingPulse');
    });
  });

  describe('EvaluationBar Fluid Polish', () => {
    it('renders advantage gauge with smooth transition curve and positive score prefix', () => {
      render(<EvaluationBar evalScore={175} />);

      const bar = screen.getByTestId('evaluation-bar');
      expect(bar).toBeDefined();
      expect(screen.getByText('Eval: +1.75')).toBeDefined();
    });

    it('formats negative evaluations for black advantage correctly', () => {
      render(<EvaluationBar evalScore={-320} />);

      expect(screen.getByText('Eval: -3.20')).toBeDefined();
    });
  });

  describe('GameControlsBar Hotkey Indicators & Intuitive Layout', () => {
    it('displays ergonomic hotkey badges [Z], [Y], and [F] for quick muscle memory', () => {
      render(
        <ThemeProvider>
          <GameControlsBar
            isBotEnabled={false}
            difficulty={1}
            isThinking={false}
            lastEval={0}
            boardSize={8}
            onToggleBot={() => {}}
            onSetDifficulty={() => {}}
            onBoardSizeChange={() => {}}
            onUndo={() => {}}
            onRedo={() => {}}
            onReset={() => {}}
            onOpenThemeModal={() => {}}
            onFlipBoard={() => {}}
          />
        </ThemeProvider>
      );

      expect(screen.getByText('Z')).toBeDefined();
      expect(screen.getByText('Y')).toBeDefined();
      expect(screen.getByText('F')).toBeDefined();
    });
  });
});

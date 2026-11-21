// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import BoardSquare from '../../../../components/BoardSquare/BoardSquare';
import { EvaluationBar } from '../EvaluationBar';
import { GameControlsBar } from '../GameControlsBar';
import { MoveHistoryList, IMoveItem } from '../MoveHistoryList';
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

    it('renders quick sound toggle button and toggles audio preference', () => {
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
          />
        </ThemeProvider>
      );

      const soundBtn = screen.getByTestId('quick-sound-toggle');
      expect(soundBtn).toBeDefined();
      expect(soundBtn.textContent).toContain('Som');

      fireEvent.click(soundBtn);
      expect(soundBtn.textContent).toContain('Mudo');

      fireEvent.click(soundBtn);
      expect(soundBtn.textContent).toContain('Som');
    });
  });

  describe('MoveHistoryList Step Navigation (Spec 06 & Spec 09 PGN Navigation)', () => {
    const mockMoves: IMoveItem[] = [
      { turnNumber: 1, white: 'e2-e4', black: 'e7-e5' },
      { turnNumber: 2, white: 'g1-f3', black: 'b8-c6' },
      { turnNumber: 3, white: 'f1-c4', black: 'f8-c5' },
    ];

    it('renders step navigation controls with proper first/prev/next/last callbacks', () => {
      const handleSelect = vi.fn();
      render(
        <MoveHistoryList
          moves={mockMoves}
          onSelectMoveIndex={handleSelect}
          activeMoveIndex={1}
        />
      );

      const navBar = screen.getByTestId('move-history-nav-bar');
      expect(navBar).toBeDefined();

      const btnFirst = screen.getByTestId('btn-move-first');
      const btnPrev = screen.getByTestId('btn-move-prev');
      const btnNext = screen.getByTestId('btn-move-next');
      const btnLast = screen.getByTestId('btn-move-last');

      expect(btnFirst).toBeDefined();
      expect(btnPrev).toBeDefined();
      expect(btnNext).toBeDefined();
      expect(btnLast).toBeDefined();

      fireEvent.click(btnFirst);
      expect(handleSelect).toHaveBeenCalledWith(0);

      fireEvent.click(btnPrev);
      expect(handleSelect).toHaveBeenCalledWith(0);

      fireEvent.click(btnNext);
      expect(handleSelect).toHaveBeenCalledWith(2);

      fireEvent.click(btnLast);
      expect(handleSelect).toHaveBeenCalledWith(2);
    });
  });

  describe('BoardSquare Tactile Piece Elevation & Destination Indicators', () => {
    it('applies board-square--selected class and piece-wrapper elevation when selected', () => {
      const dummySquareInfo = {
        row: 6,
        column: 4,
        squareID: '4-6',
        gameX: 4,
        gameY: 1,
      };

      render(
        <ThemeProvider>
          <BoardSquare
            testId="square-selected-e2"
            piece={chessPieces.w_pawn ?? { name: 'PAWN', symbol: '♟', color: 'white' }}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isSelected={true}
          />
        </ThemeProvider>
      );

      const squareEl = screen.getByTestId('square-selected-e2');
      expect(squareEl.className).toContain('board-square--selected');

      const pieceEl = squareEl.querySelector('.piece-wrapper') as HTMLElement;
      expect(pieceEl).toBeDefined();
      expect(pieceEl.style.transform).toBe('translateY(-2px) scale(1.08)');
      expect(pieceEl.style.filter).toContain('drop-shadow(0 6px 12px rgba(0, 0, 0, 0.55))');
    });

    it('attaches legal-move-dot and legal-capture-ring animation classes', () => {
      const dummySquareInfo = {
        row: 4,
        column: 4,
        squareID: '4-4',
        gameX: 4,
        gameY: 3,
      };

      const { rerender } = render(
        <ThemeProvider>
          <BoardSquare
            testId="square-move-dest"
            piece={chessPieces.none}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isMoveDestination={true}
          />
        </ThemeProvider>
      );

      const moveDot = screen.getByTestId('legal-move-dot');
      expect(moveDot.className).toBe('legal-move-dot');

      rerender(
        <ThemeProvider>
          <BoardSquare
            testId="square-move-dest"
            piece={chessPieces.b_pawn ?? { name: 'PAWN', symbol: '♙', color: 'black' }}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isCaptureDestination={true}
          />
        </ThemeProvider>
      );

      const captureRing = screen.getByTestId('legal-capture-ring');
      expect(captureRing.className).toBe('legal-capture-ring');
    });

    it('renders atomic shockwave animation and explosion epicenter burst on detonation', () => {
      const dummySquareInfo = {
        row: 3,
        column: 3,
        squareID: '3-3',
        gameX: 3,
        gameY: 4,
      };

      const { rerender } = render(
        <ThemeProvider>
          <BoardSquare
            testId="square-exploding"
            piece={chessPieces.none}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isExploding={true}
            isExplosionCenter={false}
          />
        </ThemeProvider>
      );

      const shockwaveCell = screen.getByTestId('atomic-shockwave-cell');
      expect(shockwaveCell).toBeDefined();
      expect(shockwaveCell.className).toBe('atomic-shockwave-cell');
      expect(shockwaveCell.textContent).toBe('');

      // When it is the epicenter
      rerender(
        <ThemeProvider>
          <BoardSquare
            testId="square-exploding"
            piece={chessPieces.none}
            boardDisplay={[]}
            squareInfo={dummySquareInfo}
            handleClick={() => {}}
            isExploding={true}
            isExplosionCenter={true}
          />
        </ThemeProvider>
      );

      expect(screen.getByTestId('atomic-shockwave-cell').textContent).toContain('💥');
    });
  });
});

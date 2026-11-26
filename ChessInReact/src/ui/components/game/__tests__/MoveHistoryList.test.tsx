// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MoveHistoryList, IMoveItem } from '../MoveHistoryList';

describe('MoveHistoryList UI Component (Spec 06 Section 18.1 & Spec 09 RF-05)', () => {
  const sampleMoves: IMoveItem[] = [
    { turnNumber: 1, white: 'e2-e4', black: 'e7-e5' },
    { turnNumber: 2, white: 'g1-f3', black: 'b8-c6' },
    { turnNumber: 3, white: 'f1-c4', black: undefined },
  ];

  it('renders empty state placeholder when no moves have been played', () => {
    render(<MoveHistoryList moves={[]} />);

    expect(screen.getByTestId('move-history-empty')).toBeDefined();
    const copyBtn = screen.getByTestId('btn-copy-pgn');
    expect(copyBtn.hasAttribute('disabled')).toBe(true);
  });

  it('renders list of moves with turn numbers and coordinates', () => {
    render(<MoveHistoryList moves={sampleMoves} />);

    expect(screen.getByText('3 lances')).toBeDefined();
    expect(screen.getByText('e2-e4')).toBeDefined();
    expect(screen.getByText('e7-e5')).toBeDefined();
    expect(screen.getByText('g1-f3')).toBeDefined();
    expect(screen.getByText('b8-c6')).toBeDefined();
    expect(screen.getByText('f1-c4')).toBeDefined();
  });

  it('supports selecting individual moves via callback', () => {
    const handleSelect = vi.fn();
    render(
      <MoveHistoryList
        moves={sampleMoves}
        onSelectMoveIndex={handleSelect}
        activeMoveIndex={0}
      />
    );

    const firstRow = screen.getByTestId('move-row-1');
    fireEvent.click(firstRow);

    expect(handleSelect).toHaveBeenCalledWith(0);
  });

  it('copies PGN string to clipboard on button click and provides visual feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<MoveHistoryList moves={sampleMoves} />);

    const copyBtn = screen.getByTestId('btn-copy-pgn');
    expect(copyBtn.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith('1. e2-e4 e7-e5 2. g1-f3 b8-c6 3. f1-c4');
    expect(screen.getByText('Copiado!')).toBeDefined();
  });

  it('copies the authoritative spell PGN rather than the human-readable spell label', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const pgn = '[Variant "SPELL_CHESS_KING_CAPTURE_ONLY"]\n\n1. {[%spell JUMP e6]} Bxf7 1-0';
    render(<MoveHistoryList moves={[{ turnNumber: 1, white: 'Jump(e6) + Bxf7' }]} onExportPGN={() => pgn} />);
    await act(async () => { fireEvent.click(screen.getByTestId('btn-copy-pgn')); });
    expect(writeText).toHaveBeenCalledWith(pgn);
  });

  it('renders and exports canonical Crazyhouse drop notation and Atomic explosion annotations', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const variantMoves: IMoveItem[] = [
      { turnNumber: 1, white: 'e2-e4', black: 'd7-d5' },
      { turnNumber: 2, white: 'e4-d5💥', black: 'N@f6' },
      { turnNumber: 3, white: 'B@c4', black: undefined },
    ];

    render(<MoveHistoryList moves={variantMoves} />);

    expect(screen.getByText('e4-d5💥')).toBeDefined();
    expect(screen.getByText('N@f6')).toBeDefined();
    expect(screen.getByText('B@c4')).toBeDefined();

    const copyBtn = screen.getByTestId('btn-copy-pgn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalledWith('1. e2-e4 d7-d5 2. e4-d5💥 N@f6 3. B@c4');
  });
});

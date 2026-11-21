// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReserveDropsBar } from '../ReserveDropsBar';
import { IPieceEntity } from '../../../../core/entities/types';
import { asEntityId, asCoordinateKey } from '../../../../core/coordinates/types';

describe('ReserveDropsBar (Crazyhouse, Bughouse, Shogi & Seirawan Drops)', () => {
  const mockReservePieces: IPieceEntity[] = [
    {
      id: asEntityId('pawn_1'),
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('0,0'),
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    },
    {
      id: asEntityId('pawn_2'),
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('0,0'),
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    },
    {
      id: asEntityId('knight_1'),
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('0,0'),
      variantId: 'KNIGHT',
      hasMoved: false,
      isCaptured: false,
    },
  ];

  it('renders grouped reserve pieces with correct count badges and canonical hotkeys', () => {
    render(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={mockReservePieces}
        selectedPieceVariant={null}
        onSelectDropPiece={() => {}}
        playerLabel="Brancas"
      />
    );

    expect(screen.getByTestId('reserve-drops-bar')).toBeDefined();
    expect(screen.getByText('Reserva (Brancas):')).toBeDefined();

    // Pawn badge
    const pawnBtn = screen.getByTestId('drop-btn-pawn');
    expect(pawnBtn).toBeDefined();
    expect(pawnBtn.textContent).toContain('×2');
    expect(pawnBtn.textContent).toContain('P');

    // Knight badge (canonical chess hotkey N instead of K)
    const knightBtn = screen.getByTestId('drop-btn-knight');
    expect(knightBtn).toBeDefined();
    expect(knightBtn.textContent).toContain('N');
  });

  it('toggles selection when button is clicked', () => {
    const handleSelect = vi.fn();
    const { rerender } = render(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={mockReservePieces}
        selectedPieceVariant={null}
        onSelectDropPiece={handleSelect}
        playerLabel="Brancas"
      />
    );

    const knightBtn = screen.getByTestId('drop-btn-knight');
    fireEvent.click(knightBtn);
    expect(handleSelect).toHaveBeenCalledWith('KNIGHT');

    // When already selected, clicking again deselects
    rerender(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={mockReservePieces}
        selectedPieceVariant="KNIGHT"
        onSelectDropPiece={handleSelect}
        playerLabel="Brancas"
      />
    );

    fireEvent.click(knightBtn);
    expect(handleSelect).toHaveBeenCalledWith(null);
  });

  it('supports canonical keyboard shortcut N for Knight and Escape to cancel', () => {
    const handleSelect = vi.fn();
    const { rerender } = render(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={mockReservePieces}
        selectedPieceVariant={null}
        onSelectDropPiece={handleSelect}
        playerLabel="Brancas"
      />
    );

    // Press N for Knight
    fireEvent.keyDown(window, { key: 'n' });
    expect(handleSelect).toHaveBeenCalledWith('KNIGHT');

    // Now with Knight selected, press Escape
    rerender(
      <ReserveDropsBar
        activePlayer="P1"
        reservePieces={mockReservePieces}
        selectedPieceVariant="KNIGHT"
        onSelectDropPiece={handleSelect}
        playerLabel="Brancas"
      />
    );

    const cancelBtn = screen.getByTestId('btn-cancel-drop');
    expect(cancelBtn).toBeDefined();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleSelect).toHaveBeenCalledWith(null);
  });
});

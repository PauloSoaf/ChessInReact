// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VictoryCelebrationModal } from '../VictoryCelebrationModal';

describe('VictoryCelebrationModal (Spec 06 & Spec 12)', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <VictoryCelebrationModal
        isOpen={false}
        winnerId="P1"
        onRematch={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders victory message, reason, and action buttons when player wins', () => {
    const onRematch = vi.fn();
    const onOpenReview = vi.fn();
    const onClose = vi.fn();

    render(
      <VictoryCelebrationModal
        isOpen={true}
        winnerId="P1"
        reason="Captura Real: Brancas venceu por captura do Rei adversário."
        turnNumber={6}
        variantName="Spell Chess Oficial"
        isRanked={true}
        onRematch={onRematch}
        onOpenReview={onOpenReview}
        onClose={onClose}
      />
    );

    expect(screen.getByTestId('victory-celebration-modal')).toBeDefined();
    expect(screen.getByText('Vitória!')).toBeDefined();
    expect(screen.getByText(/Captura Real/)).toBeDefined();
    expect(screen.getByText('6 Turnos')).toBeDefined();
    expect(screen.getByText('Ranqueada')).toBeDefined();

    const reviewBtn = screen.getByTestId('victory-btn-game-review');
    fireEvent.click(reviewBtn);
    expect(onOpenReview).toHaveBeenCalledTimes(1);

    const rematchBtn = screen.getByTestId('victory-btn-rematch');
    fireEvent.click(rematchBtn);
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it('handles escape key to close', () => {
    const onClose = vi.fn();

    render(
      <VictoryCelebrationModal
        isOpen={true}
        winnerId="P2"
        onRematch={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

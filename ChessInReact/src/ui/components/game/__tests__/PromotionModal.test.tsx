// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromotionModal } from '../PromotionModal';
import { ThemeProvider } from '../../../theme/ThemeContext';

describe('Spec 06 RF-08 & Spec 01 US01-C10: Accessible Pawn Promotion Modal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof PromotionModal>> = {}) => {
    const defaultProps = {
      isOpen: true,
      onSelectPromotion: vi.fn(),
      onCancel: vi.fn(),
      ownerId: 'P1' as const,
      targetCoord: 'e8',
      allowedVariants: ['QUEEN', 'KNIGHT', 'ROOK', 'BISHOP'],
    };
    return {
      ...render(
        <ThemeProvider>
          <PromotionModal {...defaultProps} {...props} />
        </ThemeProvider>
      ),
      props: { ...defaultProps, ...props },
    };
  };

  it('does not render into DOM when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId('promotion-modal-overlay')).toBeNull();
  });

  it('renders all classical promotion options with proper labels and coordinates', () => {
    renderModal({ targetCoord: 'e8' });

    expect(screen.getByTestId('promotion-modal-overlay')).toBeDefined();
    expect(screen.getByTestId('promotion-modal-title').textContent).toContain('Promoção de Peão');
    expect(screen.getByTestId('promotion-modal-title').textContent).toContain('e8');

    // 4 classical options
    expect(screen.getByTestId('btn-promote-queen')).toBeDefined();
    expect(screen.getByTestId('btn-promote-knight')).toBeDefined();
    expect(screen.getByTestId('btn-promote-rook')).toBeDefined();
    expect(screen.getByTestId('btn-promote-bishop')).toBeDefined();
  });

  it('has proper accessibility attributes (dialog, modal, labels)', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('promotion-modal-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('promotion-modal-description');
  });

  it('dispatches Queen promotion on click', () => {
    const onSelectPromotion = vi.fn();
    renderModal({ onSelectPromotion });

    fireEvent.click(screen.getByTestId('btn-promote-queen'));
    expect(onSelectPromotion).toHaveBeenCalledTimes(1);
    expect(onSelectPromotion).toHaveBeenCalledWith('QUEEN');
  });

  it('dispatches Knight underpromotion on click', () => {
    const onSelectPromotion = vi.fn();
    renderModal({ onSelectPromotion });

    fireEvent.click(screen.getByTestId('btn-promote-knight'));
    expect(onSelectPromotion).toHaveBeenCalledTimes(1);
    expect(onSelectPromotion).toHaveBeenCalledWith('KNIGHT');
  });

  it('dispatches Rook and Bishop underpromotion on click', () => {
    const onSelectPromotion = vi.fn();
    renderModal({ onSelectPromotion });

    fireEvent.click(screen.getByTestId('btn-promote-rook'));
    expect(onSelectPromotion).toHaveBeenCalledWith('ROOK');

    fireEvent.click(screen.getByTestId('btn-promote-bishop'));
    expect(onSelectPromotion).toHaveBeenCalledWith('BISHOP');
  });

  it('cancels promotion when clicking the close button or cancel button', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    fireEvent.click(screen.getByTestId('btn-close-promotion-modal'));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('btn-cancel-promotion'));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('cancels promotion when clicking on the backdrop overlay', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    const overlay = screen.getByTestId('promotion-modal-overlay');
    fireEvent.click(overlay);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('handles keyboard hotkeys Q, N, R, B for rapid single-stroke promotion', () => {
    const onSelectPromotion = vi.fn();
    renderModal({ onSelectPromotion });

    // Press 'q'
    fireEvent.keyDown(window, { key: 'q' });
    expect(onSelectPromotion).toHaveBeenCalledWith('QUEEN');

    // Press 'N'
    fireEvent.keyDown(window, { key: 'N' });
    expect(onSelectPromotion).toHaveBeenCalledWith('KNIGHT');

    // Press 'c' (Cavalo in Portuguese)
    fireEvent.keyDown(window, { key: 'c' });
    expect(onSelectPromotion).toHaveBeenCalledWith('KNIGHT');

    // Press 'r'
    fireEvent.keyDown(window, { key: 'r' });
    expect(onSelectPromotion).toHaveBeenCalledWith('ROOK');

    // Press 'b'
    fireEvent.keyDown(window, { key: 'b' });
    expect(onSelectPromotion).toHaveBeenCalledWith('BISHOP');
  });

  it('handles Escape key to cancel promotion', () => {
    const onCancel = vi.fn();
    renderModal({ onCancel });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('supports custom / fairy promotion options dynamically', () => {
    const onSelectPromotion = vi.fn();
    renderModal({
      onSelectPromotion,
      allowedVariants: ['QUEEN', 'KNIGHT', 'ARCHBISHOP', 'CHANCELLOR'],
    });

    expect(screen.getByTestId('btn-promote-queen')).toBeDefined();
    expect(screen.getByTestId('btn-promote-knight')).toBeDefined();
    expect(screen.getByTestId('btn-promote-archbishop')).toBeDefined();
    expect(screen.getByTestId('btn-promote-chancellor')).toBeDefined();

    fireEvent.click(screen.getByTestId('btn-promote-archbishop'));
    expect(onSelectPromotion).toHaveBeenCalledWith('ARCHBISHOP');
  });
});

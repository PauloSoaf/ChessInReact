/**
 * @vitest-environment jsdom
 */
/**
 * ChessInReact - OpeningExplorerModal Component Test Suite
 * Spec 17: RF-17-03, RF-17-06, RNF-17-02
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OpeningExplorerModal } from '../OpeningExplorerModal';

describe('OpeningExplorerModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <OpeningExplorerModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with ECO code and opening name when open', () => {
    render(
      <OpeningExplorerModal isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/ECO A00/i)).toBeDefined();
    expect(screen.getByText(/Posição Inicial/i)).toBeDefined();
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  it('displays candidate moves table and invokes onSelectMove', () => {
    const handleSelectMove = vi.fn();
    render(
      <OpeningExplorerModal
        isOpen={true}
        onClose={() => {}}
        onSelectMove={handleSelectMove}
      />
    );

    const playButtons = screen.getAllByRole('button', { name: /Jogar/i });
    expect(playButtons.length).toBeGreaterThan(0);

    fireEvent.click(playButtons[0]);
    expect(handleSelectMove).toHaveBeenCalledWith('e4');
  });

  it('switches to Repertoire Trainer tab and allows submitting drills', () => {
    render(
      <OpeningExplorerModal isOpen={true} onClose={() => {}} />
    );

    const trainerTab = screen.getByRole('button', { name: /Treinador de Repertório/i });
    fireEvent.click(trainerTab);

    expect(screen.getByText(/Repertório de Brancas/i)).toBeDefined();
    expect(screen.getByText(/Caixa 1 \/ 5/i)).toBeDefined();

    const input = screen.getByPlaceholderText(/Digite o lance/i);
    const verifyButton = screen.getByRole('button', { name: /Verificar/i });

    // Submit correct move
    fireEvent.change(input, { target: { value: 'e4' } });
    fireEvent.click(verifyButton);

    expect(screen.getByText(/Excelente!/i)).toBeDefined();
  });

  it('calls onClose when close button or Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <OpeningExplorerModal isOpen={true} onClose={handleClose} />
    );

    const closeButton = screen.getByRole('button', { name: /Fechar explorador/i });
    fireEvent.click(closeButton);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});

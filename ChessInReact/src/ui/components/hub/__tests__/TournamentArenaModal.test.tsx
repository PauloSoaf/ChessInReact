/**
 * @vitest-environment jsdom
 */
/**
 * ChessInReact - TournamentArenaModal Component Test Suite
 * Spec 18: RF-18-01, RF-18-04, RF-18-05, RF-18-06
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TournamentArenaModal } from '../TournamentArenaModal';

describe('TournamentArenaModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <TournamentArenaModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with Swiss format and standings table when open', () => {
    render(
      <TournamentArenaModal isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/FIDE SWISS/i)).toBeDefined();
    expect(screen.getByText(/GM Magnus Carlsen/i)).toBeDefined();
    expect(screen.getByText(/Buchholz Cut 1/i)).toBeDefined();
  });

  it('generates next round and allows recording match results in Swiss mode', () => {
    render(
      <TournamentArenaModal isOpen={true} onClose={() => {}} />
    );

    const startRoundBtn = screen.getByRole('button', { name: /Iniciar Rodada 1/i });
    fireEvent.click(startRoundBtn);

    expect(screen.getByText(/Confrontos da Rodada 1/i)).toBeDefined();

    // Click 1 - 0 on first match
    const winButtons = screen.getAllByRole('button', { name: /1 - 0/i });
    expect(winButtons.length).toBeGreaterThan(0);

    fireEvent.click(winButtons[0]);
    expect(screen.getAllByText(/1 - 0/i).length).toBeGreaterThan(0);
  });

  it('switches to Arena format, toggles Berserk and generates fast pairings', () => {
    render(
      <TournamentArenaModal isOpen={true} onClose={() => {}} />
    );

    const arenaTab = screen.getByRole('button', { name: /Arena Contínua & Berserk/i });
    fireEvent.click(arenaTab);

    expect(screen.getByText(/ARENA BERSERK/i)).toBeDefined();
    expect(screen.getByText(/Parear Jogadores Livres/i)).toBeDefined();

    // Toggle Berserk
    const berserkBtns = screen.getAllByRole('button', { name: /Ativar Berserk/i });
    expect(berserkBtns.length).toBeGreaterThan(0);

    fireEvent.click(berserkBtns[0]);
    expect(screen.getByText(/Berserk ATIVO/i)).toBeDefined();

    // Fast pairings
    const pairBtn = screen.getByRole('button', { name: /Parear Jogadores Livres/i });
    fireEvent.click(pairBtn);

    expect(screen.getByText(/Partidas em Andamento/i)).toBeDefined();
  });

  it('calls onClose when close button or Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <TournamentArenaModal isOpen={true} onClose={handleClose} />
    );

    const closeBtn = screen.getByRole('button', { name: /Fechar torneio/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});


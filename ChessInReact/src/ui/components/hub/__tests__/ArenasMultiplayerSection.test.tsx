// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArenasMultiplayerSection } from '../ArenasMultiplayerSection';
import { CompositeArenaLayouts } from '../../../../engine/multiplayer/arenas/CompositeArenaLayouts';

describe('Spec 08 - ArenasMultiplayerSection Component', () => {
  const defaultProps = {
    onOpenStagingModal: vi.fn(),
    onOpenMatchmaking: vi.fn(),
    onOpenLobbyBrowser: vi.fn(),
    onOpenTournamentModal: vi.fn(),
  };

  it('renders quick access bar with buttons for matchmaking, lobbies, and tournaments', () => {
    render(<ArenasMultiplayerSection {...defaultProps} />);

    expect(screen.getByText(/Multijogador & Pareamento Online/i)).toBeDefined();
    expect(screen.getByText(/Fila Ranqueada Global/i)).toBeDefined();
    expect(screen.getByText(/Saguão de Lobbies/i)).toBeDefined();
    expect(screen.getByText(/Arena de Torneios/i)).toBeDefined();
  });

  it('triggers onOpenMatchmaking when ranked queue button is clicked', () => {
    const onOpenMatchmaking = vi.fn();
    render(<ArenasMultiplayerSection {...defaultProps} onOpenMatchmaking={onOpenMatchmaking} />);

    const btn = screen.getByText(/Fila Ranqueada Global/i);
    fireEvent.click(btn);

    expect(onOpenMatchmaking).toHaveBeenCalled();
  });

  it('triggers onOpenLobbyBrowser when lobbies button is clicked', () => {
    const onOpenLobbyBrowser = vi.fn();
    render(<ArenasMultiplayerSection {...defaultProps} onOpenLobbyBrowser={onOpenLobbyBrowser} />);

    const btn = screen.getByText(/Saguão de Lobbies/i);
    fireEvent.click(btn);

    expect(onOpenLobbyBrowser).toHaveBeenCalled();
  });

  it('triggers onOpenTournamentModal when tournament button is clicked', () => {
    const onOpenTournament = vi.fn();
    render(<ArenasMultiplayerSection {...defaultProps} onOpenTournamentModal={onOpenTournament} />);

    const btn = screen.getByText(/Arena de Torneios/i);
    fireEvent.click(btn);

    expect(onOpenTournament).toHaveBeenCalled();
  });

  it('triggers onOpenLiveSpectate when spectate button is clicked', () => {
    const onOpenLiveSpectate = vi.fn();
    render(<ArenasMultiplayerSection {...defaultProps} onOpenLiveSpectate={onOpenLiveSpectate} />);

    const btn = screen.getByText(/Assistir ao Vivo/i);
    fireEvent.click(btn);

    expect(onOpenLiveSpectate).toHaveBeenCalled();
  });

  it('renders massive arena layout cards and triggers onOpenStagingModal on click', () => {
    const onOpenStaging = vi.fn();
    const { container } = render(
      <ArenasMultiplayerSection {...defaultProps} onOpenStagingModal={onOpenStaging} />
    );

    const layouts = CompositeArenaLayouts.getAllLayouts();
    expect(layouts.length).toBeGreaterThan(0);

    const firstArena = layouts[0];
    expect(screen.getByText(firstArena.name)).toBeDefined();

    const configBtn = container.querySelector(`#hub-btn-arena-${firstArena.id}`) as HTMLButtonElement;
    fireEvent.click(configBtn);

    expect(onOpenStaging).toHaveBeenCalledWith(firstArena.id, firstArena.totalParticipants);
  });
});

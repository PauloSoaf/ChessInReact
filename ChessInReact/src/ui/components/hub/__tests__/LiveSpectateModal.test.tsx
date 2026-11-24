// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveSpectateModal } from '../LiveSpectateModal';
import { ILiveMatchSummary } from '../../../../matchmaking/interfaces/IMatchmakingContracts';

describe('Spec 08 - LiveSpectateModal (US08-P06, RF-11)', () => {
  const mockMatches: readonly ILiveMatchSummary[] = [
    {
      matchId: 'match-alpha',
      roomId: 'room-alpha',
      variantId: 'STANDARD_BLITZ',
      topology: 'SQUARE_8X8',
      whitePlayer: { userId: 'p1', displayName: 'GM Carlsen', elo: 2880 },
      blackPlayer: { userId: 'p2', displayName: 'GM Nakamura', elo: 2875 },
      currentPly: 30,
      fen: 'rnbqkbnr/8/8/8/8/8/8/RNBQKBNR w KQkq - 0 1',
      spectatorCount: 520,
      startedAt: 1000,
    },
    {
      matchId: 'match-beta',
      roomId: 'room-beta',
      variantId: 'HEXAGONAL_4P',
      topology: 'HEXAGONAL',
      whitePlayer: { userId: 'p3', displayName: 'HexWarrior', elo: 2100 },
      blackPlayer: { userId: 'p4', displayName: 'VectorMaster', elo: 2050 },
      currentPly: 15,
      fen: 'hex:sample:fen',
      spectatorCount: 42,
      startedAt: 2000,
    },
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <LiveSpectateModal isOpen={false} onClose={vi.fn()} initialMatches={mockMatches} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders active live matches with player names and spectator counts', () => {
    render(<LiveSpectateModal isOpen={true} onClose={vi.fn()} initialMatches={mockMatches} />);

    expect(screen.getByText('Partidas ao Vivo (Spec 08)')).toBeDefined();
    expect(screen.getByText(/GM Carlsen/)).toBeDefined();
    expect(screen.getByText(/520 espectadores/)).toBeDefined();
    expect(screen.getByText(/HexWarrior/)).toBeDefined();
    expect(screen.getByText(/42 espectadores/)).toBeDefined();
  });

  it('filters live matches based on user input', () => {
    render(<LiveSpectateModal isOpen={true} onClose={vi.fn()} initialMatches={mockMatches} />);

    const searchInput = screen.getByPlaceholderText('Filtrar por jogador ou variante...');
    fireEvent.change(searchInput, { target: { value: 'HexWarrior' } });

    expect(screen.queryByText(/GM Carlsen/)).toBeNull();
    expect(screen.getByText(/HexWarrior/)).toBeDefined();
  });

  it('transitions to active spectator view upon clicking Assistir Partida', () => {
    const { container } = render(
      <LiveSpectateModal isOpen={true} onClose={vi.fn()} initialMatches={mockMatches} />
    );

    const watchBtn = container.querySelector('#btn-watch-match-match-alpha') as HTMLButtonElement;
    expect(watchBtn).not.toBeNull();
    fireEvent.click(watchBtn);

    expect(screen.getByText(/Assistindo: STANDARD_BLITZ/)).toBeDefined();
    expect(screen.getByText(/rnbqkbnr\/8\/8\/8\/8\/8\/8\/RNBQKBNR/)).toBeDefined();

    // Click back button to return to list
    const backBtn = container.querySelector('#btn-leave-spectate') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();
    fireEvent.click(backBtn);

    expect(screen.getByText('Partidas ao Vivo (Spec 08)')).toBeDefined();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<LiveSpectateModal isOpen={true} onClose={onClose} initialMatches={mockMatches} />);

    const closeBtn = document.querySelector('#btn-close-live-spectate');
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});


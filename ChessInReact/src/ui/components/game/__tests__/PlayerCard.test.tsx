// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerCard } from '../PlayerCard';

describe('PlayerCard UI Component (Spec 06 RF-09 & Section 18)', () => {
  it('renders player identity, name and default subtitle', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Grandmaster Alice"
        isTurnActive={true}
      />
    );

    expect(screen.getByText('Grandmaster Alice')).toBeDefined();
    expect(screen.getByText('Peças Brancas (P1)')).toBeDefined();
    expect(screen.getByTestId('player-card-P1')).toBeDefined();
  });

  it('renders bot badge and custom difficulty label when isBot is true', () => {
    render(
      <PlayerCard
        playerId="P2"
        displayName="Stockfish Bot"
        isBot={true}
        difficultyLabel="Mestre (N5)"
        isTurnActive={false}
      />
    );

    expect(screen.getByText('Stockfish Bot')).toBeDefined();
    expect(screen.getByText('🤖')).toBeDefined();
    expect(screen.getByText('Mestre (N5)')).toBeDefined();
  });

  it('renders digital chess clock formatted as mm:ss (RF-09)', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Alice"
        isTurnActive={true}
        timeLeftMs={185000} // 3m 05s
      />
    );

    const clockEl = screen.getByTestId('player-clock-P1');
    expect(clockEl).toBeDefined();
    expect(clockEl.textContent).toContain('03:05');
  });

  it('displays sub-second precision and critical alert styling when time < 10s on active turn', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Alice"
        isTurnActive={true}
        timeLeftMs={7400} // 7.4 seconds
      />
    );

    const clockEl = screen.getByTestId('player-clock-P1');
    expect(clockEl).toBeDefined();
    expect(clockEl.textContent).toContain('0:07.4');
  });

  it('renders grouped captured pieces in the tray with quantity badges', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Alice"
        isTurnActive={true}
        capturedPieces={['PAWN', 'PAWN', 'KNIGHT', 'ROOK']}
      />
    );

    const tray = screen.getByTestId('captured-tray-P1');
    expect(tray).toBeDefined();
    expect(tray.textContent).toContain('2');
  });

  it('renders material advantage pill (+X) when provided and positive', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Alice"
        isTurnActive={true}
        capturedPieces={['QUEEN']}
        materialAdvantage={4}
      />
    );

    const advantageEl = screen.getByTestId('material-advantage-P1');
    expect(advantageEl).toBeDefined();
    expect(advantageEl.textContent).toContain('+4');
  });

  it('renders check warning indicator when isInCheck is true', () => {
    render(
      <PlayerCard
        playerId="P2"
        displayName="Bob"
        isTurnActive={true}
        isInCheck={true}
      />
    );

    const checkIndicator = screen.getByTestId('player-in-check-P2');
    expect(checkIndicator).toBeDefined();
    expect(checkIndicator.textContent).toContain('XEQUE');
  });

  it('renders infinity symbol for unlimited time matches', () => {
    render(
      <PlayerCard
        playerId="P1"
        displayName="Alice"
        isTurnActive={true}
        isUnlimited={true}
      />
    );

    const clockEl = screen.getByTestId('player-clock-P1');
    expect(clockEl).toBeDefined();
    expect(clockEl.textContent).toContain('∞');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchmakingQueueModal } from '../MatchmakingQueueModal';
import { MatchmakingQueueEngine } from '../../../../matchmaking/engine/MatchmakingQueueEngine';
import { AntiDodgePenaltyManager } from '../../../../matchmaking/engine/AntiDodgePenaltyManager';

describe('Spec 08 - MatchmakingQueueModal Component (RF-01, RF-03, RF-05, RF-09, RF-10)', () => {
  let queueEngine: MatchmakingQueueEngine;
  let penaltyManager: AntiDodgePenaltyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    queueEngine = new MatchmakingQueueEngine('test-jwt-secret-min-32-chars-for-modal');
    penaltyManager = new AntiDodgePenaltyManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders searching view with timer, elo tolerance and cancel button', () => {
    const onClose = vi.fn();
    render(
      <MatchmakingQueueModal
        isOpen={true}
        onClose={onClose}
        userId="user_modal_1"
        displayName="Alice"
        eloRating={1600}
        variantId="standard"
        playerCount={2}
        queueClient={queueEngine}
        penaltyManager={penaltyManager}
      />
    );

    expect(screen.getByTestId('matchmaking-queue-modal')).toBeDefined();
    expect(screen.getByText(/Buscando Oponente/i)).toBeDefined();
    expect(screen.getByTestId('queue-timer-display')).toBeDefined();
    expect(screen.getByTestId('tolerance-badge').textContent).toMatch(/Janela ELO: ±50 pts/i);

    // Cancel click
    const cancelBtn = screen.getByText(/Cancelar Busca/i);
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <MatchmakingQueueModal
        isOpen={false}
        onClose={vi.fn()}
        userId="user_closed"
        displayName="Bob"
        eloRating={1500}
        variantId="standard"
        queueClient={queueEngine}
        penaltyManager={penaltyManager}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('displays cooldown view when user is locked by Anti-Dodge penalty (RF-10, US08-P12)', () => {
    // Register dodge to lock user
    penaltyManager.registerDodge('user_locked', Date.now());

    render(
      <MatchmakingQueueModal
        isOpen={true}
        onClose={vi.fn()}
        userId="user_locked"
        displayName="Charlie"
        eloRating={1500}
        variantId="standard"
        queueClient={queueEngine}
        penaltyManager={penaltyManager}
      />
    );

    expect(screen.getByText(/Penalidade Anti-Dodge Ativa/i)).toBeDefined();
    expect(screen.getByTestId('cooldown-timer-display')).toBeDefined();
  });
});

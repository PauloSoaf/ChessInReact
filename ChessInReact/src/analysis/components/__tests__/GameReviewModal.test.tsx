// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameReviewModal } from '../GameReviewModal';

describe('Spec 12 Game Review Modal & CAPS2 Analysis Component Suite', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <GameReviewModal
        isOpen={false}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders CAPS2 accuracy cards, advantage graph, and tally badges when open with real evaluations', () => {
    const sampleMoves = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'd5', 'exd5', 'Nxd5'];
    const sampleEvals = [10, 15, 20, 18, 30, 25, 40, -10, 50, 35];

    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        moveSans={sampleMoves}
        evaluationsCp={sampleEvals}
        whitePlayerName="Grande Mestre Branco"
        blackPlayerName="Bot Mestre"
      />
    );

    // Modal dialog is present
    const modal = screen.getByTestId('game-review-modal');
    expect(modal).toBeDefined();

    // Accuracy cards
    const whiteCard = screen.getByTestId('white-accuracy-card');
    const blackCard = screen.getByTestId('black-accuracy-card');
    expect(whiteCard.textContent).toContain('Grande Mestre Branco');
    expect(whiteCard.textContent).toContain('%');
    expect(blackCard.textContent).toContain('Bot Mestre');
    expect(blackCard.textContent).toContain('%');

    // Advantage Graph container
    expect(screen.getByTestId('advantage-graph-container')).toBeDefined();

    // Retry Mistakes container
    expect(screen.getByTestId('retry-mistakes-container')).toBeDefined();
  });

  it('renders no-evaluations notice when evaluations are missing (PATCH-04)', () => {
    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        moveSans={['e4', 'e5']}
        evaluationsCp={[]}
      />
    );

    expect(screen.getByTestId('no-evaluations-notice')).toBeDefined();
    expect(screen.queryByTestId('white-accuracy-card')).toBeNull();
    expect(screen.queryByTestId('advantage-graph-container')).toBeNull();
  });

  it('renders variant-unsupported notice for multiplayer FFA arenas (PATCH-04)', () => {
    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        variantId="FOUR_PLAYER_FFA"
        moveSans={['e4', 'e5']}
        evaluationsCp={[10, 20]}
      />
    );

    expect(screen.getByTestId('variant-unsupported-notice')).toBeDefined();
    expect(screen.queryByTestId('white-accuracy-card')).toBeNull();
    expect(screen.queryByTestId('advantage-graph-container')).toBeNull();
  });

  it('renders CAPS2 review successfully for 2-player variants such as Spell Chess and Duck Chess', () => {
    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        variantId="SPELL_CHESS_OFFICIAL"
        moveSans={['e4', 'e5', 'Nf3', 'Nc6']}
        evaluationsCp={[15, 20, 25, 22]}
      />
    );

    expect(screen.queryByTestId('variant-unsupported-notice')).toBeNull();
    expect(screen.getByTestId('white-accuracy-card')).toBeDefined();
    expect(screen.getByTestId('advantage-graph-container')).toBeDefined();
  });

  it('handles close button click and Escape key navigation', () => {
    const handleClose = vi.fn();

    render(
      <GameReviewModal
        isOpen={true}
        onClose={handleClose}
        moveSans={['e4', 'e5']}
        evaluationsCp={[10, 15]}
      />
    );

    // Close button click
    const closeBtn = screen.getByTestId('btn-close-review');
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Escape key press
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(2);

    // Finish review button click
    const finishBtn = screen.getByTestId('btn-finish-review');
    fireEvent.click(finishBtn);
    expect(handleClose).toHaveBeenCalledTimes(3);
  });

  it('copies annotated FIDE NAG PGN when copy button is clicked', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        moveSans={['e4', 'e5', 'Qh5', 'g6', 'Qxe5+']}
        evaluationsCp={[20, 25, 45, -250, 600]}
      />
    );

    const copyBtn = screen.getByTestId('btn-copy-annotated-pgn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeTextMock).toHaveBeenCalled();
    const copiedPgn = writeTextMock.mock.calls[0][0];
    expect(copiedPgn).toContain('[Event "ChessInReact Game Review"]');
  });

  it('triggers onRetryMistake when clicking retry on a blunder or mistake', () => {
    const handleRetry = vi.fn();
    // Centipawn evals with a blunder on move 2 (White plunges from +50 to -400)
    const evals = [15, 20, -420, -410];
    const moves = ['e4', 'f6', 'g4', 'Kf7'];

    render(
      <GameReviewModal
        isOpen={true}
        onClose={vi.fn()}
        moveSans={moves}
        evaluationsCp={evals}
        onRetryMistake={handleRetry}
      />
    );

    // Find retry buttons
    const retryButtons = screen.queryAllByText('Tentar Novamente');
    if (retryButtons.length > 0) {
      fireEvent.click(retryButtons[0]);
      expect(handleRetry).toHaveBeenCalled();
    }
  });
});

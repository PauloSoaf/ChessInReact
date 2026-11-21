// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThreeCheckCounterBadge } from '../ThreeCheckCounterBadge';
import { VariantMatchBanner } from '../VariantMatchBanner';
import { UniversalMatchController } from '../../../../controllers/UniversalMatchController';
import { MatchConfigurationManager } from '../../../../matchmaking/config/MatchConfigurationManager';
import { ThreeCheckTracker } from '../../../../engine/variants/modifiers/ThreeCheckTracker';

describe('Variant HUD Telepathy & State Tracking (Spec 06, Spec 13, RF-13-07, RF-13-09)', () => {
  it('1. Renders ThreeCheckCounterBadge with correct pips and accessible ARIA label', () => {
    const state = {
      whiteChecksDelivered: 2,
      blackChecksDelivered: 1,
      threshold: 3,
      isGameOver: false,
      winner: null,
    };

    render(<ThreeCheckCounterBadge state={state} />);

    const badge = screen.getByTestId('three-check-badge');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('aria-label')).toBe('Xeque Triplo: Brancas 2 de 3, Pretas 1 de 3');
    expect(badge.textContent).toContain('(2/3)');
    expect(badge.textContent).toContain('(1/3)');
  });

  it('2. Renders Five-Check mode threshold correctly', () => {
    const state = {
      whiteChecksDelivered: 4,
      blackChecksDelivered: 2,
      threshold: 5,
      isGameOver: false,
      winner: null,
    };

    render(<ThreeCheckCounterBadge state={state} />);

    const badge = screen.getByTestId('three-check-badge');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('aria-label')).toBe('Xeque Triplo: Brancas 4 de 5, Pretas 2 de 5');
    expect(badge.textContent).toContain('(4/5)');
    expect(badge.textContent).toContain('(2/5)');
  });

  it('3. VariantMatchBanner seamlessly integrates ThreeCheckCounterBadge when state is provided', () => {
    const threeCheckState = ThreeCheckTracker.createInitialState(3);

    render(
      <VariantMatchBanner
        variantId="THREE_CHECK"
        threeCheckState={threeCheckState}
      />
    );

    const badge = screen.getByTestId('three-check-badge');
    expect(badge).toBeDefined();
    expect(screen.getByText('Three-Check Chess')).toBeDefined();
  });

  it('4. VariantMatchBanner renders Racing Kings equalizing turn alert banner', () => {
    const racingKingsState = {
      whiteReachedRank8: true,
      isGameOver: false,
      winner: null,
    };

    render(
      <VariantMatchBanner
        variantId="RACING_KINGS"
        racingKingsState={racingKingsState}
      />
    );

    const alert = screen.getByTestId('racing-kings-equalizing-turn');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain('Turno de Equalização');
  });

  it('5. UniversalMatchController initializes and exposes threeCheckState in its snapshot for THREE_CHECK', () => {
    const config = MatchConfigurationManager.createDefaultMatch('three_check', 2);
    const controller = new UniversalMatchController(config);
    const snap = controller.getSnapshot();

    expect(snap.threeCheckState).not.toBeNull();
    expect(snap.threeCheckState?.threshold).toBe(3);
    expect(snap.threeCheckState?.whiteChecksDelivered).toBe(0);
    expect(snap.threeCheckState?.blackChecksDelivered).toBe(0);
    controller.dispose();
  });

  it('6. UniversalMatchController initializes and exposes racingKingsState in its snapshot for RACING_KINGS', () => {
    const config = MatchConfigurationManager.createDefaultMatch('racing_kings', 2);
    const controller = new UniversalMatchController(config);
    const snap = controller.getSnapshot();

    expect(snap.racingKingsState).not.toBeNull();
    expect(snap.racingKingsState?.whiteReachedRank8).toBe(false);
    expect(snap.racingKingsState?.isGameOver).toBe(false);
    controller.dispose();
  });
});

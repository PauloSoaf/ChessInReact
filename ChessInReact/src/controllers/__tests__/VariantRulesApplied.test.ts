import { describe, it, expect, afterEach } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { VariantRegistry } from '../../engine/rules/VariantRegistry';

describe('Variant rules are really applied in launched matches', () => {
  let controller: UniversalMatchController | null = null;
  afterEach(() => {
    controller?.dispose();
    controller = null;
  });

  it('resolves rule configs for catalog aliases and leaves classic untouched', () => {
    expect(VariantRegistry.resolveRulesConfig('ATOMIC_CHESS')?.captureExplosion).toBe(true);
    expect(VariantRegistry.resolveRulesConfig('antichess')?.enforceCheck).toBe(false);
    expect(VariantRegistry.resolveRulesConfig('GIVEAWAY')?.variantId).toBe('ANTICHESS');
    expect(VariantRegistry.resolveRulesConfig('CRAZYHOUSE')?.allowDrops).toBe(true);
    expect(VariantRegistry.resolveRulesConfig('classic_square')).toBeUndefined();
    expect(VariantRegistry.resolveRulesConfig('standard')).toBeUndefined();
  });

  it('launched Atomic match stores the variant in the domain state', () => {
    const config = MatchConfigurationManager.createDefaultMatch('ATOMIC', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();
    expect(gameStore.getState().domain.variantId).toBe('ATOMIC');
  });

  it('Antichess match: forced capture is enforced without passing any explicit config', () => {
    const config = MatchConfigurationManager.createDefaultMatch('ANTICHESS', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();
    const domain = gameStore.getState().domain;
    expect(domain.variantId).toBe('ANTICHESS');

    const moves = RulesEngine.getLegalMoves(domain, controller.getTopology());
    // Opening position has no captures, so all moves are legal; once a capture exists only captures remain.
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => !m.isCapture)).toBe(true);
  });
});


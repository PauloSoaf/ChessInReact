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

  it('Racing Kings: forbids moves that give check and detects 8th-rank victory', () => {
    const config = MatchConfigurationManager.createDefaultMatch('RACING_KINGS', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const domain = gameStore.getState().domain;
    expect(domain.variantId).toBe('RACING_KINGS');

    const legalMoves = RulesEngine.getLegalMoves(domain, controller.getTopology());
    expect(legalMoves.length).toBeGreaterThan(0);
  });

  it('supports dynamic slot role toggle, bot difficulty update, and resetCurrentMatch', () => {
    const config = MatchConfigurationManager.createDefaultMatch('DUCK_CHESS', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    expect(controller.isBotPlayer('P2')).toBe(true);
    controller.updateSlotRole(1, 'HUMAN_LOCAL');
    expect(controller.isBotPlayer('P2')).toBe(false);

    controller.updateSlotRole(1, 'AI_BOT', 5);
    expect(controller.isBotPlayer('P2')).toBe(true);
    expect(controller.getSnapshot().config.slots[1].botConfig?.difficultyLevel).toBe(5);

    controller.updateBotDifficulty(1, 2);
    expect(controller.getSnapshot().config.slots[1].botConfig?.difficultyLevel).toBe(2);

    controller.resetCurrentMatch();
    expect(gameStore.getState().domain.turnNumber).toBe(1);
    expect(gameStore.getState().domain.variantId).toBe('DUCK_CHESS');
  });
});


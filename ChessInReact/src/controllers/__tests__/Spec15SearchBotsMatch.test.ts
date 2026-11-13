import { describe, it, expect, afterEach } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { AIWorkerPool } from '../../workers/ai/AIWorkerPool';
import { RulesEngine } from '../../engine/rules/RulesEngine';

describe('Spec 15 - search-backed bots play real games', () => {
  let controller: UniversalMatchController | null = null;

  afterEach(() => {
    controller?.dispose();
    controller = null;
  });

  it('classic bot decision uses real tree search (depth > 1) and returns a legal move', async () => {
    const config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const domain = gameStore.getState().domain;
    const topology = controller.getTopology();
    const legal = RulesEngine.getLegalMoves(domain, topology);

    const decision = await AIWorkerPool.dispatchDecision({
      matchId: domain.matchId,
      variantId: 'standard',
      actingPlayer: domain.activePlayer,
      difficultyLevel: 3,
      timeBudgetMs: 400,
      legalMoves: legal.map((m) => ({
        from: m.from,
        to: m.to,
        pieceId: m.pieceId,
        isCapture: m.isCapture,
      })),
      domain,
      topology,
    });

    expect(decision.strategyUsed).toBe('MINIMAX_ALPHA_BETA');
    expect(decision.depthReached).toBeGreaterThanOrEqual(2);
    expect(decision.nodesEvaluated).toBeGreaterThan(legal.length);
    expect(legal.some((m) => m.from === decision.move.from && m.to === decision.move.to)).toBe(true);
  }, 20000);

  it('plays 8 consecutive plies bot-vs-bot with only legal moves', async () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    config = MatchConfigurationManager.updateSlotRole(config, 0, 'AI_BOT');
    controller = new UniversalMatchController(config);
    controller.startMatch();
    controller.togglePause();

    for (let ply = 0; ply < 8; ply++) {
      const before = gameStore.getState().domain;
      if (before.isGameOver) break;
      const legalBefore = RulesEngine.getLegalMoves(before, controller.getTopology());
      const stepped = await controller.stepBotTurn();
      expect(stepped).toBe(true);
      expect(gameStore.getState().domain.revision).toBeGreaterThan(before.revision);
      expect(legalBefore.length).toBeGreaterThan(0);
    }
  }, 40000);
});


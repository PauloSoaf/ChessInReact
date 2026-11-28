import { afterEach, describe, expect, it, vi } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { AIWorkerPool } from '../../workers/ai/AIWorkerPool';
import { queenTrap } from '../../workers/ai/strategies/spell/testing/KingSafetyFixtures';

afterEach(() => { vi.restoreAllMocks(); });
describe('PATCH-13: controller invalidates pending Spell Worker', () => {
  it.each(['undo', 'redo', 'startMatch', 'dispose'] as const)('%s aborts search and applies neither spell nor move', async (operation) => {
    const config = MatchConfigurationManager.createDefaultMatch('SPELL_CHESS_KING_CAPTURE_ONLY', 2);
    const controller = new UniversalMatchController(config);
    controller.startMatch();
    if (!controller.isPaused()) controller.togglePause();
    const fixture = { ...queenTrap({ beforeCapture: true }), matchId: controller.getConfig().matchId };
    gameStore.getState().resetDomainState(fixture);
    let signal: AbortSignal | undefined;
    const dispatch = vi.spyOn(AIWorkerPool, 'dispatchDecision').mockImplementation(request => new Promise((_resolve, reject) => {
      signal = request.signal;
      request.signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
    }));
    try {
      const pending = controller.stepBotTurn();
      await Promise.resolve();
      expect(dispatch).toHaveBeenCalledOnce();
      controller[operation]();
      expect(signal?.aborted).toBe(true);
      expect(await pending).toBe(false);
      expect(controller.getMoveHistory()).toHaveLength(0);
      expect(controller.getSpellAudit().events).toHaveLength(0);
    } finally { controller.dispose(); }
  });
});

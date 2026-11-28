import { afterEach, describe, expect, it, vi } from 'vitest';
import { asCoordinateKey } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { gameStore } from '../../core/state/gameStore';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import {
  canHumanInteract, defaultFlipped, resigningPlayer, resolveColorChoice, seatHuman, slotOfPlayer,
} from '../../matchmaking/config/participants';
import { AIWorkerPool } from '../../workers/ai/AIWorkerPool';
import { UniversalMatchController } from '../UniversalMatchController';

const controllers: UniversalMatchController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.restoreAllMocks();
});

function start(config = MatchConfigurationManager.createDefaultMatch('standard', 2)): UniversalMatchController {
  const controller = new UniversalMatchController(config);
  controllers.push(controller);
  controller.startMatch(config);
  return controller;
}
const duel = (human: 'P1' | 'P2', level: 1 | 2 | 3 | 4 | 5 = 1, variant = 'standard') =>
  seatHuman(MatchConfigurationManager.createDefaultMatch(variant, 2), human, level);
const botDuel = () => {
  const config = MatchConfigurationManager.createDefaultMatch('standard', 2);
  return MatchConfigurationManager.updateSlotRole(config, 0, 'AI_BOT', {
    difficultyLevel: 2, archetype: 'TACTICAL', thinkTimeMs: 350,
  });
};
const domain = () => gameStore.getState().domain;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (condition: () => boolean, label: string, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await wait(20);
  }
};

/** Plays a human move exactly as the board does. */
function humanMove(controller: UniversalMatchController, from?: string, to?: string): void {
  const state = domain();
  const legal = RulesEngine.getLegalMoves(state, controller.getTopology());
  const move = from ? legal.find((m) => m.from === from && m.to === to) : legal[0];
  if (!move) throw new Error(`Illegal test move ${from}>${to}`);
  gameStore.getState().executeCommand(new MovePieceCommand(move.pieceId, asCoordinateKey(move.from),
    asCoordinateKey(move.to), state.activePlayer, undefined, true, true, undefined, controller.getTopology()));
  controller.onHumanPieceMoved(move.from, move.to, move.pieceId);
}

describe('PATCH-15: participants come from the configuration', () => {
  it('derives orientation, permissions and the resigning side for every seating', () => {
    expect(defaultFlipped(duel('P1'))).toBe(false);
    expect(defaultFlipped(duel('P2'), false)).toBe(true);
    const twoHumans = MatchConfigurationManager.updateSlotRole(
      MatchConfigurationManager.createDefaultMatch('standard', 2), 1, 'HUMAN_LOCAL');
    expect(defaultFlipped(twoHumans, true)).toBe(false);
    expect(defaultFlipped(botDuel(), true)).toBe(true);

    const black = duel('P2', 5);
    expect([slotOfPlayer(black, 'P1')?.role, slotOfPlayer(black, 'P2')?.role]).toEqual(['AI_BOT', 'HUMAN_LOCAL']);
    expect(slotOfPlayer(black, 'P1')?.botConfig).toMatchObject({ difficultyLevel: 5, thinkTimeMs: 2500 });
    // The human resigns even while the bot is on turn.
    expect(resigningPlayer(black, 'P1')).toBe('P2');
    expect(resigningPlayer(duel('P1'), 'P2')).toBe('P1');
    expect(resigningPlayer(botDuel(), 'P1')).toBeNull();
    expect(resolveColorChoice('RANDOM', () => 0.2)).toBe('P1');
    expect(resolveColorChoice('RANDOM', () => 0.8)).toBe('P2');
  });

  it('never lets anyone but a local human on turn interact, including arenas of 3 to 12 players', () => {
    const base = { isGameOver: false, isSpectator: false, isReviewing: false };
    expect(canHumanInteract({ ...base, actingRole: 'HUMAN_LOCAL' })).toBe(true);
    for (const role of ['AI_BOT', 'BOT_STANDIN', 'HUMAN_REMOTE', undefined] as const) {
      expect(canHumanInteract({ ...base, actingRole: role })).toBe(false);
    }
    for (const count of [3, 4, 8, 12]) {
      const arena = MatchConfigurationManager.createDefaultMatch('standard', count);
      const allowed = arena.slots.filter((slot) => canHumanInteract({ ...base, actingRole: slot.role }));
      expect(allowed.map((slot) => slot.slotIndex)).toEqual([0]);
      expect(defaultFlipped(arena, true)).toBe(false);
    }
  });

  it('the white bot opens on its own, then answers the black human, one decision per turn', async () => {
    const decide = vi.spyOn(AIWorkerPool, 'dispatchDecision');
    const controller = start(duel('P2'));
    await until(() => domain().activePlayer === 'P2', 'bot opening move');
    expect(controller.getMoveHistory().map((m) => m.playerId)).toEqual(['P1']);
    expect(controller.getIsThinking()).toBe(false);

    humanMove(controller, '4,6', '4,4');
    await until(() => controller.getMoveHistory().length === 3 && domain().activePlayer === 'P2', 'bot reply');
    await wait(900);
    expect(controller.getMoveHistory()).toHaveLength(3);
    expect(decide).toHaveBeenCalledTimes(2);
  }, 20000);

  it('undo and redo always land on the black human turn', async () => {
    const controller = start(duel('P2'));
    await until(() => domain().activePlayer === 'P2', 'opening');
    // Nothing of the human exists yet, so there is nothing to take back.
    expect(controller.undoToHumanTurn()).toBe(false);
    for (let turn = 0; turn < 2; turn++) {
      const before = controller.getMoveHistory().length;
      humanMove(controller);
      await until(() => controller.getMoveHistory().length === before + 2, 'reply');
    }
    const full = controller.getMoveHistory().map((m) => m.san);
    const board = JSON.stringify(domain().occupancy);

    expect(controller.undoToHumanTurn()).toBe(true);
    expect(domain().activePlayer).toBe('P2');
    expect(controller.getMoveHistory()).toHaveLength(full.length - 2);
    expect(controller.redoToHumanTurn()).toBe(true);
    expect(domain().activePlayer).toBe('P2');
    expect(controller.getMoveHistory().map((m) => m.san)).toEqual(full);
    expect(JSON.stringify(domain().occupancy)).toBe(board);
    expect(controller.journal.current.moves.map((m) => m.san)).toEqual(full);
    expect(controller.journal.current.findCorruption()).toBeNull();
  }, 20000);

  it.each(['P1', 'P2'] as const)('resigning as %s gives the other colour the win', (human) => {
    const controller = start(duel(human));
    expect(controller.resign(resigningPlayer(controller.getConfig(), domain().activePlayer)!)).toBe(true);
    expect(domain()).toMatchObject({ isGameOver: true, winnerId: human === 'P1' ? 'P2' : 'P1' });
    expect(controller.journal.current.result).toMatchObject({ reason: 'RESIGNATION' });
  });

  it('rejects a human spell during the bot turn without spending the charge', () => {
    const controller = start(duel('P2', 1, 'SPELL_CHESS_KING_CAPTURE_ONLY'));
    const charges = JSON.stringify(controller.getSnapshot().officialSpellState);
    expect(controller.castOfficialSpell('FREEZE', 'e7')).toBe(false);
    expect(JSON.stringify(controller.getSnapshot().officialSpellState)).toBe(charges);
  });
});

describe('PATCH-16A: a concluded or reviewed match never moves by itself', () => {
  const fingerprint = (controller: UniversalMatchController) => JSON.stringify({
    matchId: domain().matchId, winner: domain().winnerId, over: domain().isGameOver, occupancy: domain().occupancy,
    moves: controller.getMoveHistory().length, events: controller.journal.current.length,
    clocks: controller.getClockManager().getClocksMap(),
    spells: controller.getSnapshot().officialSpellState,
  });

  it.each([['human vs bot', () => duel('P2')], ['bot vs bot', botDuel]])(
    '%s: browsing a finished match asks for no decision and changes nothing', async (_name, config) => {
      const controller = start(config());
      await until(() => controller.getMoveHistory().length >= 1, 'first move');
      expect(controller.declareDraw()).toBe(true);
      await wait(50);
      const decide = vi.spyOn(AIWorkerPool, 'dispatchDecision');
      const frozen = fingerprint(controller);
      expect(controller.getInteractionMode()).toBe('POST_GAME_REVIEW');

      controller.enterReview();
      const line = controller.journal.current;
      for (const ply of [0, 1, line.livePly, 0, 1]) {
        expect(line.stateAtPly(ply).domain.matchId).toBe(domain().matchId);
      }
      expect(line.stateAtPly(0).domain.isGameOver).toBe(false);
      expect(controller.undo()).toBe(false);
      expect(controller.redo()).toBe(false);
      expect(controller.undoToHumanTurn()).toBe(false);
      expect(await controller.stepBotTurn()).toBe(false);
      controller.exitReview();
      controller.togglePause();
      controller.togglePause();
      controller.scheduleAutonomousTurnIfNeeded();
      await wait(1200);

      expect(decide).not.toHaveBeenCalled();
      expect(fingerprint(controller)).toBe(frozen);
      expect(controller.getInteractionMode()).toBe('POST_GAME_REVIEW');
    }, 20000);

  it('stays ended even if something rewinds the store behind its back', async () => {
    const controller = start(botDuel());
    await until(() => controller.getMoveHistory().length >= 1, 'first move');
    controller.declareDraw();
    const decide = vi.spyOn(AIWorkerPool, 'dispatchDecision');
    gameStore.setState((s) => ({ domain: { ...s.domain, isGameOver: false, winnerId: null } }));
    await wait(1000);
    expect(decide).not.toHaveBeenCalled();
    expect(controller.getInteractionMode()).toBe('POST_GAME_REVIEW');
  }, 15000);

  it('discards a decision that arrives after the review started, then resumes on exit', async () => {
    const original = AIWorkerPool.dispatchDecision.bind(AIWorkerPool);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requests = 0;
    vi.spyOn(AIWorkerPool, 'dispatchDecision').mockImplementation(async (request) => {
      const first = ++requests === 1;
      const decision = await original({ ...request, signal: undefined });
      if (first) await gate; // the first answer is held back, like a slow Worker
      return decision;
    });
    const controller = start(duel('P2'));
    await until(() => requests === 1, 'first request');
    controller.enterReview();
    expect(controller.getInteractionMode()).toBe('REPLAY');
    const clocks = JSON.stringify(controller.getClockManager().getClocksMap());
    release();
    await wait(1100);
    expect(controller.getMoveHistory()).toHaveLength(0);
    expect(requests).toBe(1);
    // The held bot does not lose time while the past is on screen.
    expect(JSON.stringify(controller.getClockManager().getClocksMap())).toBe(clocks);

    controller.exitReview();
    await until(() => controller.getMoveHistory().length === 1, 'bot resumes');
    await wait(900);
    expect(controller.getMoveHistory()).toHaveLength(1);
    expect(requests).toBe(2);
  }, 20000);
});

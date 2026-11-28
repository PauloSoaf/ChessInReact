import { afterEach, describe, expect, it, vi } from 'vitest';
import { asCoordinateKey } from '../../coordinates';
import { MovePieceCommand } from '../../commands/MovePieceCommand';
import { gameStore } from '../../state/gameStore';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { UniversalMatchController } from '../../../controllers/UniversalMatchController';
import { MatchConfigurationManager } from '../../../matchmaking/config/MatchConfigurationManager';
import { GUEST_STORAGE_KEY, getOrCreateGuestIdentity } from '../../identity/GuestIdentityService';
import { ISessionState } from '../../timeline/sessionState';
import { MemoryMatchStore } from '../local/MemoryMatchStore';
import { MatchPersistenceCoordinator } from '../MatchPersistenceCoordinator';
import { RecoveryError, recoverMatch } from '../MatchRecoveryService';
import { exportBackup, exportPgn, importBackup } from '../MatchBackup';

const controllers: UniversalMatchController[] = [];
afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.restoreAllMocks();
});

const humans = (variant: string) => {
  const base = MatchConfigurationManager.createDefaultMatch(variant, 2);
  return MatchConfigurationManager.updateSlotRole(base, 1, 'HUMAN_LOCAL');
};
const domain = () => gameStore.getState().domain;

function setup(variant = 'standard', store = new MemoryMatchStore(), owner = 'user-a-0000000000000000') {
  const config = humans(variant);
  const controller = new UniversalMatchController(config);
  controllers.push(controller);
  const coordinator = new MatchPersistenceCoordinator(store, owner, null);
  controller.journal.subscribe(coordinator.listener);
  controller.startMatch(config);
  return { controller, coordinator, store, owner, matchId: config.matchId };
}

function move(controller: UniversalMatchController, pick: string | number = 0, to?: string): void {
  const state = domain();
  const legal = RulesEngine.getLegalMoves(state, controller.getTopology());
  const chosen = typeof pick === 'string' ? legal.find((m) => m.from === pick && m.to === to) : legal[pick % legal.length];
  if (!chosen) throw new Error(`Illegal test move ${pick}>${to}`);
  const promotion = chosen.isPromotion ? 'QUEEN' : undefined;
  gameStore.getState().executeCommand(new MovePieceCommand(chosen.pieceId, asCoordinateKey(chosen.from),
    asCoordinateKey(chosen.to), state.activePlayer, undefined, true, true, promotion, controller.getTopology()));
  controller.onHumanPieceMoved(chosen.from, chosen.to, chosen.pieceId, promotion);
}

/** Everything that must survive a reload. */
const comparable = (state: ISessionState) => {
  const turn = { ...state.domain.turnState, lastActionTimestamp: 0 };
  return JSON.parse(JSON.stringify({
    entities: state.domain.boardEntities, occupancy: state.domain.occupancy, player: state.domain.activePlayer,
    turnNumber: state.domain.turnNumber, over: state.domain.isGameOver, winner: state.domain.winnerId,
    captured: state.domain.capturedInventory, metadata: state.domain.metadata, turn, variant: state.variant,
  }));
};

describe('PATCH-17: committed events are saved and rebuild the exact session', () => {
  it('restores a Spell Chess turn interrupted between the Freeze and the mandatory move', async () => {
    const first = setup('SPELL_CHESS_KING_CAPTURE_ONLY');
    move(first.controller, '4,1', '4,2');
    move(first.controller, '1,7', '2,5');
    expect(first.controller.castOfficialSpell('FREEZE', 'e7')).toBe(true);
    await first.coordinator.drain();
    const before = comparable(first.controller.captureSessionState());
    const sans = first.controller.getMoveHistory().map((m) => m.san);
    const clocks = { ...first.controller.getClockManager().getClocksMap() };
    const recovered = (await recoverMatch(first.store, first.matchId, first.owner))!;
    first.controller.dispose();

    const second = new UniversalMatchController();
    controllers.push(second);
    second.restoreSession(recovered.events, clocks);
    expect(comparable(second.captureSessionState())).toEqual(before);
    expect(second.getMoveHistory().map((m) => m.san)).toEqual(sans);
    expect(second.getClockManager().getClocksMap()).toEqual(clocks);
    // The spell stays cast: it cannot be cast again, and the move completes the turn.
    expect(second.getSnapshot().hasCastSpellThisTurn).toBe(true);
    expect(second.castOfficialSpell('JUMP', 'e2')).toBe(false);
    move(second);
    expect(second.journal.current.entry(3)?.spells.map((s) => s.payload)).toEqual([
      expect.objectContaining({ chargesBefore: 5, chargesAfter: 4, cooldownBefore: 0, cooldownAfter: 3 }),
    ]);
    expect(second.getSpellAudit().events).toHaveLength(1);
  });

  it('stores en passant, castling, captures and promotion, and replays each position', async () => {
    const { controller, coordinator, store, owner, matchId } = setup();
    const script: Array<[string, string]> = [
      ['4,1', '4,3'], ['0,6', '0,5'], ['4,3', '4,4'], ['3,6', '3,4'], ['4,4', '3,5'], // en passant
      ['2,6', '3,5'], ['6,0', '5,2'], ['0,5', '0,4'], ['5,0', '4,1'], ['0,4', '0,3'], ['4,0', '6,0'], // castling
    ];
    const positions = [comparable(controller.captureSessionState()).occupancy];
    for (const [from, to] of script) {
      move(controller, from, to);
      positions.push(comparable(controller.captureSessionState()).occupancy);
    }
    await coordinator.drain();
    const { events } = (await recoverMatch(store, matchId, owner))!;
    const replay = new UniversalMatchController();
    controllers.push(replay);
    replay.restoreSession(events);
    for (let ply = 0; ply <= script.length; ply++) {
      expect(replay.journal.current.stateAtPly(ply).domain.occupancy, `ply ${ply}`).toEqual(positions[ply]);
    }
    const afterEnPassant = replay.journal.current.stateAtPly(5).domain;
    expect(afterEnPassant.occupancy[asCoordinateKey('3,4')]).toBeUndefined();
    expect(replay.journal.current.stateAtPly(11).domain.occupancy[asCoordinateKey('5,0')]).toContain('rook');
    // A white and a black move of the same row are different positions.
    expect(positions[9]).not.toEqual(positions[10]);
  });

  it('handles a 150+ ply match with compact events and random access', async () => {
    const { controller, coordinator, store, owner, matchId } = setup();
    const positions: string[] = [JSON.stringify(domain().occupancy)];
    let seed = 7;
    while (positions.length <= 170 && !domain().isGameOver) {
      seed = (seed * 48271) % 2147483647;
      move(controller, seed);
      positions.push(JSON.stringify(domain().occupancy));
    }
    const plies = positions.length - 1;
    expect(plies).toBeGreaterThan(150);
    await coordinator.drain();
    const { events } = (await recoverMatch(store, matchId, owner))!;
    const largest = Math.max(...events.slice(1).map((event) => JSON.stringify(event).length));
    expect(largest).toBeLessThan(8000);
    const line = new UniversalMatchController();
    controllers.push(line);
    line.restoreSession(events);
    for (const ply of [plies, 3, 120, 0, 77, plies - 1, 1]) {
      expect(JSON.stringify(line.journal.current.stateAtPly(ply).domain.occupancy), `ply ${ply}`).toBe(positions[ply]);
    }
  }, 60000);

  it('never overwrites a newer history written by someone else', async () => {
    const { controller, coordinator, store, owner, matchId } = setup();
    move(controller);
    await coordinator.drain();
    const stale = (await recoverMatch(store, matchId, owner))!;
    move(controller);
    await coordinator.drain();
    const newest = await store.events(matchId);

    const other = new UniversalMatchController();
    controllers.push(other);
    const late = new MatchPersistenceCoordinator(store, owner, null);
    other.journal.subscribe(late.listener);
    other.restoreSession(stale.events);
    await late.resume(stale.match);
    move(other, 3);
    await late.drain();
    expect(late.currentStatus).toBe('CONFLICT');
    expect(await store.events(matchId)).toEqual(newest);
    // Re-sending a stored event changes nothing.
    const summary = (await store.get(matchId))!;
    expect(await store.append(summary, newest[2])).toBe('DUPLICATE');
    expect(await store.events(matchId)).toHaveLength(newest.length);
  });

  it('refuses to write a match held by another tab', async () => {
    const store = new MemoryMatchStore();
    const config = humans('standard');
    const controller = new UniversalMatchController(config);
    controllers.push(controller);
    const coordinator = new MatchPersistenceCoordinator(store, 'user-a-0000000000000000', null, async () => false);
    controller.journal.subscribe(coordinator.listener);
    controller.startMatch(config);
    await coordinator.drain();
    expect(coordinator.currentStatus).toBe('CONFLICT');
    expect(await store.get(config.matchId)).toBeUndefined();
  });

  it('retries a failed write in order and only then reports it as saved', async () => {
    const store = new MemoryMatchStore();
    const append = store.append.bind(store);
    let failures = 1;
    vi.spyOn(store, 'append').mockImplementation((match, event) =>
      failures-- > 0 ? Promise.reject(new Error('quota')) : append(match, event));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { controller, coordinator, matchId } = setup('standard', store);
    move(controller);
    await coordinator.drain();
    await new Promise((resolve) => setTimeout(resolve, 800));
    await coordinator.drain();
    expect(coordinator.currentStatus).toBe('LOCAL_SAVED');
    expect((await store.events(matchId)).map((event) => event.sequence)).toEqual([0, 1]);
  });

  it('rejects damaged or foreign saves without touching them', async () => {
    const { controller, coordinator, store, owner, matchId } = setup();
    move(controller);
    move(controller);
    await coordinator.drain();
    await expect(recoverMatch(store, matchId, 'user-b-1111111111111111')).rejects.toThrow(RecoveryError);
    const events = await store.events(matchId);
    const damaged = new MemoryMatchStore();
    await damaged.insert((await store.get(matchId))!,
      [events[0], { ...events[1], checksum: 'ffffffff' }, events[2]]);
    await expect(recoverMatch(damaged, matchId, owner)).rejects.toThrow(RecoveryError);
    expect(await damaged.events(matchId)).toHaveLength(3);
  });

  it('exports a backup without the owner id, imports it as a copy and writes PGN with spells', async () => {
    const { controller, coordinator, store, owner, matchId } = setup('SPELL_CHESS_KING_CAPTURE_ONLY');
    expect(controller.castOfficialSpell('FREEZE', 'e7')).toBe(true);
    move(controller, '4,1', '4,2');
    controller.resign('P2');
    await coordinator.drain();
    const match = (await store.get(matchId))!;
    expect(match).toMatchObject({ status: 'COMPLETED', winnerId: 'P1', endReason: 'RESIGNATION', lastPly: 1 });
    const events = await store.events(matchId);
    const file = exportBackup(events);
    expect(file).not.toContain(owner);
    expect(exportPgn(match, events)).toContain('{[%spell FREEZE e7]}');

    let counter = 0;
    const copy = await importBackup(store, file, owner, () => `abcdef0${++counter}-0000`);
    expect(copy.matchId).not.toBe(matchId);
    await expect(recoverMatch(store, copy.matchId, owner)).resolves.toBeTruthy();
    expect(await store.list(owner, 10)).toHaveLength(2);
    for (const bad of ['not json', '{"format":"x"}', file.replace('"sequence":1', '"sequence":9')]) {
      await expect(importBackup(store, bad, owner, () => 'ffffffff-0000')).rejects.toThrow(RecoveryError);
    }
    expect(await store.list(owner, 10)).toHaveLength(2);
  });

  it('keeps the same guest identity and preserves an unreadable one', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
    const first = getOrCreateGuestIdentity(storage);
    expect(first.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(getOrCreateGuestIdentity(storage).userId).toBe(first.userId);
    values.set(GUEST_STORAGE_KEY, '{broken');
    expect(getOrCreateGuestIdentity(storage).userId).not.toBe(first.userId);
    expect(values.get(`${GUEST_STORAGE_KEY}:unreadable`)).toBe('{broken');
  });
});

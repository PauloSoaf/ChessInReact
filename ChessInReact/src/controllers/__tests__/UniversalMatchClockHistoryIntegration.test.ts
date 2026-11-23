import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { GlobalEventBus } from '../../core/events/EventBus';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { asCoordinateKey } from '../../core/coordinates';

describe('UniversalMatchController - PATCH-03 Clocks, SAN, History & Lossless Undo/Redo Integration', () => {
  let controller: UniversalMatchController | null = null;

  beforeEach(() => {
    controller = null;
  });

  afterEach(() => {
    if (controller) {
      controller.dispose();
      controller = null;
    }
  });

  it('initializes monotonic clocks for all configured participant slots', () => {
    const config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    // Config: 300s initial (5 min), 5s increment
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const snapshot = controller.getSnapshot();
    expect(snapshot.clocks['P1']).toBe(300000);
    expect(snapshot.clocks['P2']).toBe(300000);
    expect(snapshot.moveHistory).toHaveLength(0);
    expect(controller.getFormattedMoveItems()).toHaveLength(0);
  });

  it('generates standard algebraic notation (SAN) and UCI when piece moves are executed', () => {
    const config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    // 1. Move White Pawn from e2 (4,1) to e4 (4,3)
    const domain = gameStore.getState().domain;
    const p1PawnId = domain.occupancy[asCoordinateKey('4,1')]!;
    const cmd1 = new MovePieceCommand(
      p1PawnId,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1',
      undefined,
      true,
      true,
      undefined,
      controller.getTopology()
    );
    gameStore.getState().executeCommand(cmd1);
    controller.onHumanPieceMoved('4,1', '4,3', p1PawnId);

    const snap1 = controller.getSnapshot();
    expect(snap1.moveHistory).toHaveLength(1);
    const m1 = snap1.moveHistory[0];
    expect(m1.san).toBe('e4');
    expect(m1.uci).toBe('e2e4');
    expect(m1.playerId).toBe('P1');
    expect(m1.turnNumber).toBe(1);

    // 2. Move Black Pawn from e7 (4,6) to e5 (4,4)
    const domain2 = gameStore.getState().domain;
    const p2PawnId = domain2.occupancy[asCoordinateKey('4,6')]!;
    const cmd2 = new MovePieceCommand(
      p2PawnId,
      asCoordinateKey('4,6'),
      asCoordinateKey('4,4'),
      'P2',
      undefined,
      true,
      true,
      undefined,
      controller.getTopology()
    );
    gameStore.getState().executeCommand(cmd2);
    controller.onHumanPieceMoved('4,6', '4,4', p2PawnId);

    const snap2 = controller.getSnapshot();
    expect(snap2.moveHistory).toHaveLength(2);
    const m2 = snap2.moveHistory[1];
    expect(m2.san).toBe('e5');
    expect(m2.uci).toBe('e7e5');
    expect(m2.playerId).toBe('P2');

    // 3. Formatted move items for UI pairing
    const items = controller.getFormattedMoveItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(
      expect.objectContaining({
        turnNumber: 1,
        white: 'e4',
        black: 'e5',
      })
    );
  });

  it('applies Fischer increment upon turn completion and updates clocks', () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    config = MatchConfigurationManager.updateTimeControl(config, 300, 5); // 5 sec increment
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const initialP1Clock = controller.getSnapshot().clocks['P1'];
    expect(initialP1Clock).toBe(300000);

    // White moves e2 -> e4
    const domain = gameStore.getState().domain;
    const p1PawnId = domain.occupancy[asCoordinateKey('4,1')]!;
    const cmd = new MovePieceCommand(
      p1PawnId,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1',
      undefined,
      true,
      true,
      undefined,
      controller.getTopology()
    );
    gameStore.getState().executeCommand(cmd);
    controller.onHumanPieceMoved('4,1', '4,3', p1PawnId);

    const postP1Clock = controller.getSnapshot().clocks['P1'];
    // 300,000 + 5,000 increment = 305,000 (modulo minor tick delta)
    expect(postP1Clock).toBeGreaterThanOrEqual(304900);
  });

  it('defers Fischer increment in Duck Chess until rubber duck is placed in Phase 2', () => {
    let config = MatchConfigurationManager.createDefaultMatch('duck_chess', 2);
    config = MatchConfigurationManager.updateTimeControl(config, 300, 5);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const initialP1Clock = controller.getSnapshot().clocks['P1'];
    expect(initialP1Clock).toBe(300000);

    // Phase 1: White moves Pawn
    const domain = gameStore.getState().domain;
    const p1PawnId = domain.occupancy[asCoordinateKey('4,1')]!;
    const cmd = new MovePieceCommand(
      p1PawnId,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1',
      undefined,
      true,
      true,
      undefined,
      controller.getTopology()
    );
    gameStore.getState().executeCommand(cmd);
    controller.onHumanPieceMoved('4,1', '4,3', p1PawnId);

    // In Phase 1 waiting for Duck placement: increment is NOT applied yet!
    const midP1Clock = controller.getSnapshot().clocks['P1'];
    expect(midP1Clock).toBeLessThanOrEqual(300000);
    expect(controller.getSnapshot().duckPhase).toBe('PLACE_DUCK');

    // Phase 2: White places Duck on d4 (3,3)
    const placed = controller.placeDuck('3,3');
    expect(placed).toBe(true);

    // Now after Phase 2, Fischer increment is applied!
    const postDuckP1Clock = controller.getSnapshot().clocks['P1'];
    expect(postDuckP1Clock).toBeGreaterThanOrEqual(304900);
    expect(controller.getSnapshot().duckPhase).toBe('PIECE_MOVE');
  });

  it('restores participant clocks and move history losslessly on undo/redo', () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    config = MatchConfigurationManager.updateTimeControl(config, 300, 5);
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const initialClockSnapshot = controller.getSnapshot().clocks;

    // Move e2 -> e4
    const domain = gameStore.getState().domain;
    const p1PawnId = domain.occupancy[asCoordinateKey('4,1')]!;
    const cmd = new MovePieceCommand(
      p1PawnId,
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1',
      undefined,
      true,
      true,
      undefined,
      controller.getTopology()
    );
    gameStore.getState().executeCommand(cmd);
    controller.onHumanPieceMoved('4,1', '4,3', p1PawnId);

    expect(controller.getSnapshot().moveHistory).toHaveLength(1);
    expect(controller.canUndo()).toBe(true);

    // Undo move
    const undone = controller.undo();
    expect(undone).toBe(true);

    const undoneSnapshot = controller.getSnapshot();
    expect(undoneSnapshot.moveHistory).toHaveLength(0);
    expect(undoneSnapshot.clocks['P1']).toBe(initialClockSnapshot['P1']);
    expect(controller.canRedo()).toBe(true);

    // Redo move
    const redone = controller.redo();
    expect(redone).toBe(true);
    expect(controller.getSnapshot().clocks['P1']).toBeGreaterThanOrEqual(304900);
  });

  it('triggers authoritative timeout and ends match on domain state when clock reaches 0', () => {
    let config = MatchConfigurationManager.createDefaultMatch('standard', 2);
    config = MatchConfigurationManager.updateTimeControl(config, 5, 0); // 5 seconds
    controller = new UniversalMatchController(config);
    controller.startMatch();

    const gameEndedSpy = vi.fn();
    const unsub = GlobalEventBus.subscribe('GAME_ENDED', gameEndedSpy);

    // Directly set clock to 0 to simulate timeout
    const clockMgr = controller.getClockManager();
    clockMgr.tick(performance.now() + 6000); // 6s elapse > 5s budget

    // Tick controller clock loop
    (controller as unknown as { tickClocks: () => void }).tickClocks();

    const domain = gameStore.getState().domain;
    expect(domain.isGameOver).toBe(true);
    expect(domain.winnerId).toBe('P2'); // P1 timed out, so P2 wins
    expect(gameEndedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        winnerId: 'P2',
        reason: 'Tempo Esgotado',
      })
    );

    unsub();
  });
});

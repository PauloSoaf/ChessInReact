import { describe, it, expect, beforeEach } from 'vitest';
import { UniversalMatchController } from '../UniversalMatchController';
import { MatchConfigurationManager } from '../../matchmaking/config/MatchConfigurationManager';
import { gameStore } from '../../core/state/gameStore';
import { DropPieceCommand } from '../../core/commands/DropPieceCommand';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';

describe('Spec 12 & Spec 01 - Spell Chess and Minigame Lossless Undo/Redo & State Parity', () => {
  beforeEach(() => {
    // Reset store
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {},
      occupancy: {},
      activePlayer: 'P1',
      turnNumber: 1,
      isGameOver: false,
      winnerId: null,
    });
  });

  it('restores official Spell Chess freeze charges and active frozen squares on undo', () => {
    const config = MatchConfigurationManager.createDefaultMatch('spell_chess_official', 2);
    const controller = new UniversalMatchController(config);
    controller.startMatch(config);

    const initialSnap = controller.getSnapshot();
    expect(initialSnap.officialSpellState?.whiteCharges.freezeCharges).toBe(2);
    expect(initialSnap.frozenCoordinates.length).toBe(0);

    // Human white casts Freeze on d4 (file 3, rank 3)
    const castOk = controller.castOfficialSpell('FREEZE', { file: 3, rank: 3 });
    expect(castOk).toBe(true);

    const afterCastSnap = controller.getSnapshot();
    expect(afterCastSnap.officialSpellState?.whiteCharges.freezeCharges).toBe(1);
    expect(afterCastSnap.frozenCoordinates.length).toBeGreaterThan(0);

    // Call undo() on controller
    const undone = controller.undo();
    expect(undone).toBe(true);

    const afterUndoSnap = controller.getSnapshot();
    // Freeze charges must be refunded from 1 back to 2!
    expect(afterUndoSnap.officialSpellState?.whiteCharges.freezeCharges).toBe(2);
    expect(afterUndoSnap.frozenCoordinates.length).toBe(0);

    // Call redo() on controller
    const redone = controller.redo();
    expect(redone).toBe(true);

    const afterRedoSnap = controller.getSnapshot();
    expect(afterRedoSnap.officialSpellState?.whiteCharges.freezeCharges).toBe(1);
    expect(afterRedoSnap.frozenCoordinates.length).toBeGreaterThan(0);
  });

  it('executes DropPieceCommand and cleanly undoes the drop restoring reserve state', () => {
    const domain = gameStore.getState().domain;
    const capturedKnightId = asEntityId('captured_knight_1');
    gameStore.setState((s) => ({
      domain: {
        ...s.domain,
        activePlayer: 'P1',
        turnNumber: 1,
        boardEntities: {
          [capturedKnightId]: {
            id: capturedKnightId,
            type: 'PIECE',
            ownerId: 'P2',
            variantId: 'KNIGHT',
            position: asCoordinateKey('0,0'),
            isCaptured: true,
            hasMoved: true,
          },
        },
        occupancy: {},
      },
    }));

    const target = asCoordinateKey('4,4');
    const dropCmd = new DropPieceCommand('P1', 'KNIGHT', target);
    gameStore.getState().executeCommand(dropCmd);

    const postDrop = gameStore.getState().domain;
    expect(postDrop.occupancy[target]).toBe(capturedKnightId);
    expect(postDrop.boardEntities[capturedKnightId]?.isCaptured).toBe(false);
    expect(postDrop.boardEntities[capturedKnightId]?.ownerId).toBe('P1');
    expect(postDrop.activePlayer).toBe('P2');
    expect(postDrop.turnNumber).toBe(2);

    // Undo drop
    const undone = gameStore.getState().undo();
    expect(undone).toBe(true);

    const postUndo = gameStore.getState().domain;
    expect(postUndo.occupancy[target]).toBeUndefined();
    expect(postUndo.boardEntities[capturedKnightId]?.isCaptured).toBe(true);
    expect(postUndo.activePlayer).toBe('P1');
    expect(postUndo.turnNumber).toBe(1);
  });

  it('canUndo and canRedo report accurate availability across actions and undos', () => {
    const config = MatchConfigurationManager.createDefaultMatch('spell_chess_official', 2);
    const controller = new UniversalMatchController(config);
    controller.startMatch(config);

    expect(controller.canUndo()).toBe(false);
    expect(controller.canRedo()).toBe(false);

    controller.castOfficialSpell('FREEZE', { file: 4, rank: 4 });
    expect(controller.canUndo()).toBe(true);
    expect(controller.canRedo()).toBe(false);

    controller.undo();
    expect(controller.canUndo()).toBe(false);
    expect(controller.canRedo()).toBe(true);

    controller.redo();
    expect(controller.canUndo()).toBe(true);
    expect(controller.canRedo()).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../../coordinates';
import { IPieceEntity } from '../../entities/types';
import { MovePieceCommand } from '../../commands';
import { createDefaultDomainState } from '../../state/initialState';
import { IDomainState } from '../../state/gameState';
import { HistoryManager } from '../HistoryManager';

describe('HistoryManager (Undo / Redo / Stack limit)', () => {
  let history: HistoryManager;
  let domain: IDomainState;

  const piece: IPieceEntity = {
    id: asEntityId('test-piece'),
    type: 'PIECE',
    ownerId: 'P1',
    variantId: 'PAWN',
    position: asCoordinateKey('0,0'),
    hasMoved: false,
    isCaptured: false,
  };

  beforeEach(() => {
    history = new HistoryManager({ maxHistoryLength: 5 }); // Set small limit for testing eviction
    domain = createDefaultDomainState('history-test');
    domain.boardEntities[piece.id] = { ...piece };
    domain.occupancy[piece.position] = piece.id;
  });

  it('handles execute, undo, and redo sequence accurately', () => {
    const cmd1 = new MovePieceCommand(piece.id, asCoordinateKey('0,0'), asCoordinateKey('0,1'), 'P1');
    const cmd2 = new MovePieceCommand(piece.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');

    history.execute(cmd1, domain);
    history.execute(cmd2, domain);

    expect(domain.boardEntities[piece.id].position).toBe('0,2');
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoCount()).toBe(2);

    // Undo cmd2
    expect(history.undo(domain)).toBe(true);
    expect(domain.boardEntities[piece.id].position).toBe('0,1');
    expect(history.canRedo()).toBe(true);

    // Undo cmd1
    expect(history.undo(domain)).toBe(true);
    expect(domain.boardEntities[piece.id].position).toBe('0,0');
    expect(history.canUndo()).toBe(false);

    // Redo cmd1
    expect(history.redo(domain)).toBe(true);
    expect(domain.boardEntities[piece.id].position).toBe('0,1');

    // Redo cmd2
    expect(history.redo(domain)).toBe(true);
    expect(domain.boardEntities[piece.id].position).toBe('0,2');
    expect(history.canRedo()).toBe(false);
  });

  it('invalidates redo stack when a new command is executed after undo (Branching)', () => {
    const cmd1 = new MovePieceCommand(piece.id, asCoordinateKey('0,0'), asCoordinateKey('0,1'), 'P1');
    const cmd2 = new MovePieceCommand(piece.id, asCoordinateKey('0,1'), asCoordinateKey('0,2'), 'P1');
    const branchCmd = new MovePieceCommand(piece.id, asCoordinateKey('0,1'), asCoordinateKey('1,1'), 'P1');

    history.execute(cmd1, domain);
    history.execute(cmd2, domain);

    // Undo cmd2
    history.undo(domain);
    expect(history.canRedo()).toBe(true);

    // Execute alternative branch
    history.execute(branchCmd, domain);

    // Redo stack must now be empty
    expect(history.canRedo()).toBe(false);
    expect(history.getRedoCount()).toBe(0);
    expect(domain.boardEntities[piece.id].position).toBe('1,1');
  });

  it('enforces maximum history length and evicts oldest items (RF-06)', () => {
    // History limit was configured to 5
    for (let i = 0; i < 8; i++) {
      const from = asCoordinateKey(`${i},0`);
      const to = asCoordinateKey(`${i + 1},0`);
      // Update piece position manually to simulate chain
      (domain.boardEntities[piece.id] as { position: unknown }).position = from;
      domain.occupancy[from] = piece.id;

      const cmd = new MovePieceCommand(piece.id, from, to, 'P1');
      history.execute(cmd, domain);
    }

    expect(history.getUndoCount()).toBe(5);
  });
});

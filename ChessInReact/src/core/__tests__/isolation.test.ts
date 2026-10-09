import { describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../coordinates';
import { EntityManager } from '../entities';
import { MovePieceCommand } from '../commands';
import { GlobalEventBus } from '../events';
import { HistoryManager } from '../history';
import { serializeStateForWorker } from '../serialization';
import { bootstrapGame } from '../bootstrap';

describe('Core Headless Isolation (Zero DOM, Zero React, Zero THREE)', () => {
  it('proves Core can run completely headless in Node without DOM globals (US01-D09 & RNF-05)', () => {
    // Assert DOM globals do NOT exist in clean node environment
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof HTMLElement).toBe('undefined');

    // 1. Bootstrap standard game
    const context = bootstrapGame({ matchId: 'headless-isolation' });
    const store = context.store;

    expect(store.getState().domain.matchId).toBe('headless-isolation');
    expect(Object.keys(store.getState().domain.boardEntities)).toHaveLength(32);

    // 2. Perform entity manager operations
    const manager = new EntityManager();
    const testPiece = store.getState().domain.boardEntities[asEntityId('w-pawn-0')];
    expect(testPiece).toBeDefined();

    manager.addEntity(testPiece);
    expect(manager.getOccupant(testPiece.position)?.id).toBe(testPiece.id);

    // 3. Dispatch command through history
    const history = new HistoryManager();
    const moveCmd = new MovePieceCommand(
      testPiece.id,
      testPiece.position,
      asCoordinateKey('0,2'),
      'P1'
    );

    const draft = JSON.parse(JSON.stringify(store.getState().domain));
    history.execute(moveCmd, draft);
    expect(draft.boardEntities[testPiece.id].position).toBe('0,2');

    // 4. Undo command
    history.undo(draft);
    expect(draft.boardEntities[testPiece.id].position).toBe('0,1');

    // 5. Serialize to Int32Array with stringTable sidecar
    const snapshot = serializeStateForWorker(draft);
    expect(snapshot.buffer).toBeInstanceOf(Int32Array);
    expect(snapshot.buffer.length).toBeGreaterThan(0);
    expect(snapshot.stringTable.length).toBeGreaterThan(0);

    // 6. Emit event through EventBus
    let eventFired = false;
    const unsub = GlobalEventBus.subscribe('PIECE_MOVED', () => {
      eventFired = true;
    });

    GlobalEventBus.emit('PIECE_MOVED', {
      pieceId: testPiece.id,
      from: asCoordinateKey('0,1'),
      to: asCoordinateKey('0,2'),
      actingPlayer: 'P1',
    });

    expect(eventFired).toBe(true);
    unsub();
  });
});

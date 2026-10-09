import { beforeEach, describe, expect, it } from 'vitest';
import { asCoordinateKey, asEntityId } from '../coordinates';
import { bootstrapGame } from '../bootstrap/GameInitializer';
import { createGameStore, GameStoreInstance } from '../state/gameStore';
import { MovePieceCommand } from '../commands/MovePieceCommand';
import {
  selectActivePlayer,
  selectEntity,
  selectOccupant,
  selectRevision,
  selectTurnNumber,
} from '../state/selectors';
import { IPieceEntity } from '../entities/types';

describe('End-to-End Multi-Layer Integration: Core State Pipeline', () => {
  let store: GameStoreInstance;

  beforeEach(() => {
    store = createGameStore();
    bootstrapGame({ targetStore: store, matchId: 'match-e2e-integration' });
  });

  it('executes full pipeline: bootstrap -> select -> dispatch -> reactively update -> undo -> S0 restoration', () => {
    // 1. Verify bootstrap correctly populated store
    const initialDomain = store.getState().domain;
    expect(initialDomain.matchId).toBe('match-e2e-integration');
    expect(selectActivePlayer(store.getState())).toBe('P1');
    expect(selectTurnNumber(store.getState())).toBe(1);
    expect(selectRevision(store.getState())).toBe(0);

    // Initial piece lookups via selectors
    const pawnPos = asCoordinateKey('4,1'); // e2 pawn
    const initialOccupant = selectOccupant(pawnPos)(store.getState()) as IPieceEntity;
    expect(initialOccupant).toBeDefined();
    expect(initialOccupant.id).toBe('w-pawn-4');
    expect(initialOccupant.position).toBe('4,1');
    expect(initialOccupant.hasMoved).toBe(false);

    // Track subscriber notification
    let subscriptionNotifications = 0;
    let lastObservedRevision = 0;
    const unsubscribe = store.subscribe(
      (state) => state.domain.revision,
      (revision) => {
        subscriptionNotifications++;
        lastObservedRevision = revision;
      }
    );

    // 2. Execute MovePieceCommand (e2 -> e4: 4,1 -> 4,3)
    const targetPos = asCoordinateKey('4,3');
    const moveCmd = new MovePieceCommand(
      initialOccupant.id,
      pawnPos,
      targetPos,
      'P1'
    );

    store.getState().executeCommand(moveCmd);

    // 3. Verify store updated and selectors observe the change
    const updatedState = store.getState();
    expect(selectRevision(updatedState)).toBe(1);
    expect(lastObservedRevision).toBe(1);
    expect(subscriptionNotifications).toBe(1);

    // Origin is now vacant
    expect(selectOccupant(pawnPos)(updatedState)).toBeUndefined();
    // Destination is occupied by the pawn
    expect(selectOccupant(targetPos)(updatedState)?.id).toBe(initialOccupant.id);

    const movedPiece = selectEntity(initialOccupant.id)(updatedState) as IPieceEntity;
    expect(movedPiece.position).toBe('4,3');
    expect(movedPiece.hasMoved).toBe(true);

    // 4. Execute Undo through the store
    const undoSuccess = store.getState().undo();
    expect(undoSuccess).toBe(true);

    const undoneState = store.getState();
    // Revision incremented because state changed
    expect(selectRevision(undoneState)).toBe(2);
    expect(subscriptionNotifications).toBe(2);

    // Origin is re-occupied
    expect(selectOccupant(pawnPos)(undoneState)?.id).toBe(initialOccupant.id);
    // Target is vacant again
    expect(selectOccupant(targetPos)(undoneState)).toBeUndefined();

    const restoredPiece = selectEntity(initialOccupant.id)(undoneState) as IPieceEntity;
    expect(restoredPiece.position).toBe('4,1');
    expect(restoredPiece.hasMoved).toBe(false);

    // 5. Execute Redo through the store
    const redoSuccess = store.getState().redo();
    expect(redoSuccess).toBe(true);

    const redoneState = store.getState();
    expect(selectOccupant(targetPos)(redoneState)?.id).toBe(initialOccupant.id);
    expect(selectOccupant(pawnPos)(redoneState)).toBeUndefined();

    unsubscribe();
  });

  it('handles capture and undo across store layers', () => {
    // Setup a capture scenario: White pawn captures Black pawn
    const whitePawnId = asEntityId('w-pawn-4');
    const blackPawnId = asEntityId('b-pawn-3');

    // Move black pawn to d3 (3,2) directly in initial state for setup
    const setupDomain = { ...store.getState().domain };
    setupDomain.boardEntities[blackPawnId] = {
      ...setupDomain.boardEntities[blackPawnId],
      position: asCoordinateKey('3,2'),
    } as IPieceEntity;
    setupDomain.occupancy[asCoordinateKey('3,2')] = blackPawnId;
    delete setupDomain.occupancy[asCoordinateKey('3,6')];
    store.getState().resetDomainState(setupDomain);

    // White pawn at 4,1 captures black pawn at 3,2
    const captureCmd = new MovePieceCommand(
      whitePawnId,
      asCoordinateKey('4,1'),
      asCoordinateKey('3,2'),
      'P1'
    );

    store.getState().executeCommand(captureCmd);

    const stateAfterCapture = store.getState();
    expect(selectOccupant(asCoordinateKey('3,2'))(stateAfterCapture)?.id).toBe(whitePawnId);
    const capturedBlackPawn = selectEntity(blackPawnId)(stateAfterCapture) as IPieceEntity;
    expect(capturedBlackPawn.isCaptured).toBe(true);

    // Undo capture
    store.getState().undo();

    // Verify complete restoration of captured piece
    const stateAfterUndo = store.getState();
    expect(selectOccupant(asCoordinateKey('3,2'))(stateAfterUndo)?.id).toBe(blackPawnId);
    expect(selectOccupant(asCoordinateKey('4,1'))(stateAfterUndo)?.id).toBe(whitePawnId);
    const restoredBlackPawn = selectEntity(blackPawnId)(stateAfterUndo) as IPieceEntity;
    expect(restoredBlackPawn.isCaptured).toBe(false);
  });
});

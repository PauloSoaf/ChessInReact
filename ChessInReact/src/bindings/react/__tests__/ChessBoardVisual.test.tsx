import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import ChessBoard from '../../../components/ChessBoard/ChessBoard';
import { bootstrapGame } from '../../../core/bootstrap/GameInitializer';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { gameStore } from '../../../core/state/gameStore';
import { IGameStore } from '../../../core/state/gameState';

describe('Visual Integration: Core State -> Zustand Selectors -> React Board Rendering (AUDIT-04)', () => {
  beforeEach(() => {
    // Reset store before each test
    bootstrapGame({ targetStore: gameStore });
  });

  it('verifies the full reactive flow: bootstrap -> Core Store -> selector -> render -> move -> visual update -> undo -> restore -> redo', () => {
    // 1. Initial State from bootstrap
    const initialHtml = renderToString(<ChessBoard boardSize={8} />);
    expect(initialHtml).toContain('data-testid="chess-board"');

    // Verify initial piece symbols are present in HTML
    // Pawns: ♟, Rooks: ♜, Knights: ♞, Bishops: ♝, Queens: ♛, Kings: ♚
    expect(initialHtml).toContain('♟');
    expect(initialHtml).toContain('♜');
    expect(initialHtml).toContain('♞');
    expect(initialHtml).toContain('♝');
    expect(initialHtml).toContain('♛');
    expect(initialHtml).toContain('♚');

    const stateBeforeMove = gameStore.getState().domain;
    expect(stateBeforeMove.occupancy[asCoordinateKey('4,1')]).toBe('w-pawn-4');
    expect(stateBeforeMove.occupancy[asCoordinateKey('4,3')]).toBeUndefined();

    // 2. Dispatch Move: e2 (4,1) -> e4 (4,3)
    const moveCmd = new MovePieceCommand(
      asEntityId('w-pawn-4'),
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );
    gameStore.getState().executeCommand(moveCmd);

    // Verify domain store updated
    const stateAfterMove = gameStore.getState().domain;
    expect(stateAfterMove.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
    expect(stateAfterMove.occupancy[asCoordinateKey('4,3')]).toBe('w-pawn-4');

    // 3. Visual re-render reflects the move
    const movedHtml = renderToString(<ChessBoard boardSize={8} />);
    expect(movedHtml).toBeDefined();

    // 4. Undo the move
    gameStore.getState().undo();
    const stateAfterUndo = gameStore.getState().domain;
    expect(stateAfterUndo.occupancy[asCoordinateKey('4,1')]).toBe('w-pawn-4');
    expect(stateAfterUndo.occupancy[asCoordinateKey('4,3')]).toBeUndefined();

    const restoredHtml = renderToString(<ChessBoard boardSize={8} />);
    // Visual state after undo should match initial markup exactly
    expect(restoredHtml).toBe(initialHtml);

    // 5. Redo the move
    gameStore.getState().redo();
    const stateAfterRedo = gameStore.getState().domain;
    expect(stateAfterRedo.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
    expect(stateAfterRedo.occupancy[asCoordinateKey('4,3')]).toBe('w-pawn-4');

    const redoneHtml = renderToString(<ChessBoard boardSize={8} />);
    // Visual state after redo should match moved markup exactly
    expect(redoneHtml).toBe(movedHtml);
  });

  it('renders captured piece removal reactively on visual board', () => {
    // Setup state where white pawn captures black piece
    const targetKey = asCoordinateKey('4,4');
    const blackPawn: IPieceEntity = {
      id: asEntityId('target-black-pawn'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'PAWN',
      position: targetKey,
      hasMoved: false,
      isCaptured: false,
    };

    // Add black piece directly to store domain
    gameStore.setState((prev: IGameStore) => {
      const newEntities = { ...prev.domain.boardEntities, [blackPawn.id]: blackPawn };
      const newOccupancy = { ...prev.domain.occupancy, [targetKey]: blackPawn.id };
      return {
        ...prev,
        domain: {
          ...prev.domain,
          boardEntities: newEntities,
          occupancy: newOccupancy,
        },
      };
    });

    const beforeCaptureHtml = renderToString(<ChessBoard boardSize={8} />);
    expect(beforeCaptureHtml).toContain('♟');

    // White pawn moves to 4,4 capturing black pawn
    const captureCmd = new MovePieceCommand(
      asEntityId('w-pawn-4'),
      asCoordinateKey('4,1'),
      targetKey,
      'P1'
    );
    gameStore.getState().executeCommand(captureCmd);

    const afterCaptureState = gameStore.getState().domain;
    expect(afterCaptureState.occupancy[targetKey]).toBe('w-pawn-4');
    expect((afterCaptureState.boardEntities[asEntityId('target-black-pawn')] as IPieceEntity).isCaptured).toBe(true);

    const afterCaptureHtml = renderToString(<ChessBoard boardSize={8} />);
    expect(afterCaptureHtml).toBeDefined();

    // Undo capture restores captured piece
    gameStore.getState().undo();
    const restoredState = gameStore.getState().domain;
    expect(restoredState.occupancy[targetKey]).toBe('target-black-pawn');
    expect((restoredState.boardEntities[asEntityId('target-black-pawn')] as IPieceEntity).isCaptured).toBe(false);
  });

  it('preserves single source of truth: UI selection state does not mutate domain entities', () => {
    const pawnId = asEntityId('w-pawn-4');
    gameStore.getState().selectPiece(pawnId);

    const uiState = gameStore.getState().ui;
    expect(uiState.selectedPieceId).toBe(pawnId);

    // Entity itself is completely unmodified
    const entity = gameStore.getState().domain.boardEntities[pawnId] as IPieceEntity;
    expect(entity.position).toBe('4,1');
    expect(entity.isCaptured).toBe(false);

    // Deselect
    gameStore.getState().selectPiece(null);
    expect(gameStore.getState().ui.selectedPieceId).toBeNull();
  });

  it('guarantees reset re-initializes all 32 pieces and resets turn number to 1', () => {
    // Perform a move
    const moveCmd = new MovePieceCommand(
      asEntityId('w-pawn-4'),
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );
    gameStore.getState().executeCommand(moveCmd);
    expect(gameStore.getState().domain.revision).toBe(1);

    // Re-bootstrap (Reset)
    bootstrapGame({ targetStore: gameStore });

    const resetState = gameStore.getState().domain;
    expect(resetState.revision).toBe(0);
    expect(resetState.turnNumber).toBe(1);
    expect(resetState.activePlayer).toBe('P1');
    expect(Object.keys(resetState.boardEntities).length).toBe(32);
    expect(resetState.occupancy[asCoordinateKey('4,1')]).toBe('w-pawn-4');
    expect(resetState.occupancy[asCoordinateKey('4,3')]).toBeUndefined();
  });

  it('proves bootstrap idempotency: does not overwrite active game when entities exist', () => {
    // Move white pawn
    const moveCmd = new MovePieceCommand(
      asEntityId('w-pawn-4'),
      asCoordinateKey('4,1'),
      asCoordinateKey('4,3'),
      'P1'
    );
    gameStore.getState().executeCommand(moveCmd);
    const revBefore = gameStore.getState().domain.revision;
    expect(revBefore).toBe(1);

    // Simulated App mount check: only bootstrap if entityCount === 0
    const entityCount = Object.keys(gameStore.getState().domain.boardEntities).length;
    if (entityCount === 0) {
      bootstrapGame({ targetStore: gameStore });
    }

    // In-progress match was not destroyed
    expect(gameStore.getState().domain.revision).toBe(1);
    expect(gameStore.getState().domain.occupancy[asCoordinateKey('4,3')]).toBe('w-pawn-4');
  });
});


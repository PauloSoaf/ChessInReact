// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import ChessBoard from '../../../components/ChessBoard/ChessBoard';
import { gameStore } from '../../../core/state/gameStore';
import { bootstrapGame } from '../../../core/bootstrap/GameInitializer';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';

describe('ChessBoard & Local Rules Engine Integration', () => {
  beforeEach(() => {
    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {},
      occupancy: {},
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
    });
    bootstrapGame({ targetStore: gameStore });
  });

  it('rejects an illegal move and preserves board state and active player', () => {
    const { container } = render(<ChessBoard />);

    // White pawn at (4, 1) -> e2
    const pawnSquare = container.querySelector('[data-testid="square-4,1"]');
    expect(pawnSquare).not.toBeNull();
    act(() => {
      fireEvent.click(pawnSquare!);
    });

    // Check that selected entity is the pawn at (4, 1)
    const storeStateAfterSelect = gameStore.getState();
    const selectedId = storeStateAfterSelect.ui.selectedPieceId;
    expect(selectedId).not.toBeNull();

    // Attempt illegal move: Pawn e2 to e5 (4, 4), which is 3 squares forward
    const illegalDestSquare = container.querySelector('[data-testid="square-4,4"]');
    expect(illegalDestSquare).not.toBeNull();
    act(() => {
      fireEvent.click(illegalDestSquare!);
    });

    // Verification:
    // 1. Pawn is still at (4, 1)
    const stateAfterIllegal = gameStore.getState();
    expect(stateAfterIllegal.domain.occupancy[asCoordinateKey('4,1')]).toBe(selectedId);
    expect(stateAfterIllegal.domain.occupancy[asCoordinateKey('4,4')]).toBeUndefined();
    // 2. Active player is STILL P1 (White)
    expect(stateAfterIllegal.domain.activePlayer).toBe('P1');
  });

  it('accepts a legal move (e2 to e4) and updates state, occupancy, and turn, and supports undo', () => {
    const { container } = render(<ChessBoard />);

    // White pawn at (4, 1) -> e2
    const pawnSquare = container.querySelector('[data-testid="square-4,1"]');
    act(() => {
      fireEvent.click(pawnSquare!);
    });

    // Legal move: Pawn e2 to e4 (4, 3)
    const legalDestSquare = container.querySelector('[data-testid="square-4,3"]');
    act(() => {
      fireEvent.click(legalDestSquare!);
    });

    const stateAfterMove = gameStore.getState();
    expect(stateAfterMove.domain.occupancy[asCoordinateKey('4,1')]).toBeUndefined();
    expect(stateAfterMove.domain.occupancy[asCoordinateKey('4,3')]).toBeDefined();
    // Turn switches to P2 (Black)
    expect(stateAfterMove.domain.activePlayer).toBe('P2');

    // Test undo restores previous state
    act(() => {
      const undoSuccess = gameStore.getState().undo();
      expect(undoSuccess).toBe(true);
    });

    const stateAfterUndo = gameStore.getState();
    expect(stateAfterUndo.domain.occupancy[asCoordinateKey('4,1')]).toBeDefined();
    expect(stateAfterUndo.domain.occupancy[asCoordinateKey('4,3')]).toBeUndefined();
    expect(stateAfterUndo.domain.activePlayer).toBe('P1');
  });

  it('opens accessible PromotionModal on pawn reaching final rank and supports Knight underpromotion (Spec 06 RF-08)', () => {
    // Custom position: White King at 0,0, Black King at 7,7, White Pawn at 4,6 (e7), target empty 4,7 (e8)
    const p1KingId = asEntityId('p1-king');
    const p2KingId = asEntityId('p2-king');
    const p1PawnId = asEntityId('p1-pawn');
    const p1King: IPieceEntity = { id: p1KingId, type: 'PIECE', variantId: 'KING', ownerId: 'P1', position: asCoordinateKey('0,0'), isCaptured: false, hasMoved: false };
    const p2King: IPieceEntity = { id: p2KingId, type: 'PIECE', variantId: 'KING', ownerId: 'P2', position: asCoordinateKey('7,7'), isCaptured: false, hasMoved: false };
    const p1Pawn: IPieceEntity = { id: p1PawnId, type: 'PIECE', variantId: 'PAWN', ownerId: 'P1', position: asCoordinateKey('4,6'), isCaptured: false, hasMoved: true };

    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {
        [p1KingId]: p1King,
        [p2KingId]: p2King,
        [p1PawnId]: p1Pawn,
      },
      occupancy: {
        [asCoordinateKey('0,0')]: p1KingId,
        [asCoordinateKey('7,7')]: p2KingId,
        [asCoordinateKey('4,6')]: p1PawnId,
      },
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
    });

    const { container } = render(<ChessBoard />);

    // 1. Select the White pawn at e7 (4,6)
    const pawnSquare = container.querySelector('[data-testid="square-4,6"]');
    act(() => {
      fireEvent.click(pawnSquare!);
    });

    // 2. Click the promotion target at e8 (4,7)
    const destSquare = container.querySelector('[data-testid="square-4,7"]');
    act(() => {
      fireEvent.click(destSquare!);
    });

    // 3. Promotion Modal must be open and displayed
    const modalOverlay = document.querySelector('[data-testid="promotion-modal-overlay"]');
    expect(modalOverlay).not.toBeNull();
    const knightBtn = document.querySelector('[data-testid="btn-promote-knight"]');
    expect(knightBtn).not.toBeNull();

    // 4. Select Knight underpromotion
    act(() => {
      fireEvent.click(knightBtn!);
    });

    // 5. Verification: Modal closes, pawn has promoted to KNIGHT at 4,7, and turn switches to P2
    expect(document.querySelector('[data-testid="promotion-modal-overlay"]')).toBeNull();
    const finalState = gameStore.getState();
    expect(finalState.domain.occupancy[asCoordinateKey('4,6')]).toBeUndefined();
    expect(finalState.domain.occupancy[asCoordinateKey('4,7')]).toBe(p1PawnId);
    const promotedPiece = finalState.domain.boardEntities[p1PawnId] as IPieceEntity;
    expect(promotedPiece.variantId).toBe('KNIGHT');
    expect(finalState.domain.activePlayer).toBe('P2');
  });

  it('cancels pending promotion when user clicks cancel button without altering board state', () => {
    const p1KingId = asEntityId('p1-king');
    const p2KingId = asEntityId('p2-king');
    const p1PawnId = asEntityId('p1-pawn');
    const p1King: IPieceEntity = { id: p1KingId, type: 'PIECE', variantId: 'KING', ownerId: 'P1', position: asCoordinateKey('0,0'), isCaptured: false, hasMoved: false };
    const p2King: IPieceEntity = { id: p2KingId, type: 'PIECE', variantId: 'KING', ownerId: 'P2', position: asCoordinateKey('7,7'), isCaptured: false, hasMoved: false };
    const p1Pawn: IPieceEntity = { id: p1PawnId, type: 'PIECE', variantId: 'PAWN', ownerId: 'P1', position: asCoordinateKey('4,6'), isCaptured: false, hasMoved: true };

    gameStore.getState().resetDomainState({
      ...gameStore.getState().domain,
      boardEntities: {
        [p1KingId]: p1King,
        [p2KingId]: p2King,
        [p1PawnId]: p1Pawn,
      },
      occupancy: {
        [asCoordinateKey('0,0')]: p1KingId,
        [asCoordinateKey('7,7')]: p2KingId,
        [asCoordinateKey('4,6')]: p1PawnId,
      },
      revision: 0,
      turnNumber: 1,
      activePlayer: 'P1',
    });

    const { container } = render(<ChessBoard />);

    // Select pawn at e7 and click e8
    act(() => {
      fireEvent.click(container.querySelector('[data-testid="square-4,6"]')!);
    });
    act(() => {
      fireEvent.click(container.querySelector('[data-testid="square-4,7"]')!);
    });

    // Click cancel button in modal
    const cancelBtn = document.querySelector('[data-testid="btn-cancel-promotion"]');
    expect(cancelBtn).not.toBeNull();
    act(() => {
      fireEvent.click(cancelBtn!);
    });

    // Verification: Modal closed, pawn remains at 4,6, active player is still P1
    expect(document.querySelector('[data-testid="promotion-modal-overlay"]')).toBeNull();
    const state = gameStore.getState();
    expect(state.domain.occupancy[asCoordinateKey('4,6')]).toBe(p1PawnId);
    expect(state.domain.occupancy[asCoordinateKey('4,7')]).toBeUndefined();
    expect(state.domain.activePlayer).toBe('P1');
  });
});

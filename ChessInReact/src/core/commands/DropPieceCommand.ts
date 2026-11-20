import { CoordinateKey, EntityId, PlayerId, asCoordinateKey, asEntityId } from '../coordinates/types';
import { IPieceEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';

/**
 * DropPieceCommand - Transactional drop command for Shogi, Crazyhouse, Bughouse & Seirawan.
 * Integrates with HistoryManager to support lossless undo/redo of piece drops (Spec 01 & Spec 12).
 */
export class DropPieceCommand implements ICommand {
  readonly id: string;
  readonly type = 'DROP_PIECE';
  readonly description: string;
  readonly actingPlayer: PlayerId;
  private readonly pieceVariant: string;
  private readonly targetCoord: CoordinateKey;
  private droppedPieceId?: EntityId;
  private previousEntity?: IPieceEntity;
  private previousActivePlayer?: PlayerId;
  private previousTurnNumber?: number;

  constructor(actingPlayer: PlayerId, pieceVariant: string, targetCoord: CoordinateKey) {
    this.id = `drop_${actingPlayer}_${Date.now()}`;
    this.actingPlayer = actingPlayer;
    this.pieceVariant = pieceVariant;
    this.targetCoord = asCoordinateKey(targetCoord);
    this.description = `Drop ${pieceVariant} at ${targetCoord} by ${actingPlayer}`;
  }

  execute(draft: IDomainState): void {
    this.previousActivePlayer = draft.activePlayer;
    this.previousTurnNumber = draft.turnNumber;

    // Find captured piece of this variant
    const captured = Object.values(draft.boardEntities).find(
      (e): e is IPieceEntity =>
        e.type === 'PIECE' &&
        e.isCaptured &&
        e.variantId.toUpperCase() === this.pieceVariant.toUpperCase()
    );

    if (captured) {
      this.droppedPieceId = captured.id;
      this.previousEntity = { ...captured };
      draft.boardEntities[captured.id] = {
        ...captured,
        ownerId: this.actingPlayer,
        position: this.targetCoord,
        isCaptured: false,
        hasMoved: true,
      };
    } else {
      const newId = asEntityId(`drop_${this.actingPlayer}_${this.pieceVariant.toLowerCase()}_${Date.now()}`);
      this.droppedPieceId = newId;
      draft.boardEntities[newId] = {
        id: newId,
        type: 'PIECE',
        ownerId: this.actingPlayer,
        variantId: this.pieceVariant.toUpperCase(),
        position: this.targetCoord,
        isCaptured: false,
        hasMoved: true,
      };
    }

    draft.occupancy[this.targetCoord] = this.droppedPieceId;
    (draft as { activePlayer: PlayerId }).activePlayer = this.actingPlayer === 'P1' ? 'P2' : 'P1';
    (draft as { turnNumber: number }).turnNumber += 1;
  }

  undo(draft: IDomainState): void {
    if (!this.droppedPieceId) return;

    delete draft.occupancy[this.targetCoord];

    if (this.previousEntity) {
      draft.boardEntities[this.droppedPieceId] = this.previousEntity;
    } else {
      delete draft.boardEntities[this.droppedPieceId];
    }

    if (this.previousActivePlayer) {
      (draft as { activePlayer: PlayerId }).activePlayer = this.previousActivePlayer;
    }
    if (this.previousTurnNumber !== undefined) {
      (draft as { turnNumber: number }).turnNumber = this.previousTurnNumber;
    }
  }
}

import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';

/**
 * MovePieceCommand executes a piece movement from one coordinate to another,
 * handling captures, crazyhouse inventory, and full atomic reversibility.
 */
export class MovePieceCommand implements ICommand {
  public readonly id: string;
  public readonly type = 'MOVE_PIECE';
  public readonly description: string;

  private capturedEntitySnapshot: IEntity | null = null;
  private previousHasMovedState = false;

  constructor(
    public readonly pieceId: EntityId,
    public readonly from: CoordinateKey,
    public readonly to: CoordinateKey,
    public readonly actingPlayer: PlayerId,
    id?: string
  ) {
    this.id = id ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description = `Move ${pieceId} from ${from} to ${to}`;
  }

  public execute(draft: IDomainState): void {
    const piece = draft.boardEntities[this.pieceId] as IPieceEntity | undefined;
    if (!piece) {
      throw new Error(`Invalid move: Entity with ID "${this.pieceId}" does not exist.`);
    }

    // RF-03: Validate piece exists at origin coordinate before dispatching
    if (piece.position !== this.from) {
      throw new Error(
        `Invalid move: Piece "${this.pieceId}" is at "${piece.position}", not origin "${this.from}".`
      );
    }

    if (draft.occupancy[this.from] !== this.pieceId) {
      throw new Error(
        `Invalid move: Spatial occupancy mismatch at origin "${this.from}". Expected "${this.pieceId}", got "${draft.occupancy[this.from]}".`
      );
    }

    // Handle capture at destination coordinate
    const targetEntityId = draft.occupancy[this.to];
    if (targetEntityId) {
      const targetEntity = draft.boardEntities[targetEntityId];
      if (targetEntity) {
        // Deep clone snapshot of captured entity for lossless undo
        this.capturedEntitySnapshot = JSON.parse(JSON.stringify(targetEntity));

        // Mark captured in domain entity storage (RF-09: keep entity record, set isCaptured)
        if (targetEntity.type === 'PIECE') {
          (targetEntity as { isCaptured: boolean }).isCaptured = true;

          // Crazyhouse variant support
          if (draft.capturedInventory && draft.capturedInventory[this.actingPlayer]) {
            draft.capturedInventory[this.actingPlayer].push(targetEntity.variantId);
          }
        }
      }
    }

    // Record and set hasMoved
    this.previousHasMovedState = piece.hasMoved;
    (piece as { hasMoved: boolean }).hasMoved = true;

    // Update spatial indices atomically
    delete draft.occupancy[this.from];
    (piece as { position: CoordinateKey }).position = this.to;
    draft.occupancy[this.to] = this.pieceId;
  }

  public undo(draft: IDomainState): void {
    const piece = draft.boardEntities[this.pieceId] as IPieceEntity | undefined;
    if (!piece) {
      throw new Error(`Cannot undo: Piece "${this.pieceId}" not found in domain entities.`);
    }

    // Restore previous hasMoved flag
    (piece as { hasMoved: boolean }).hasMoved = this.previousHasMovedState;

    // Revert spatial occupancy
    delete draft.occupancy[this.to];
    (piece as { position: CoordinateKey }).position = this.from;
    draft.occupancy[this.from] = this.pieceId;

    // If an entity was captured, restore it completely
    if (this.capturedEntitySnapshot) {
      const restored = JSON.parse(JSON.stringify(this.capturedEntitySnapshot));
      draft.boardEntities[restored.id] = restored;
      draft.occupancy[this.to] = restored.id;

      // Revert crazyhouse inventory
      if (
        draft.capturedInventory &&
        draft.capturedInventory[this.actingPlayer] &&
        restored.type === 'PIECE'
      ) {
        const inv = draft.capturedInventory[this.actingPlayer];
        const lastIdx = inv.lastIndexOf(restored.variantId);
        if (lastIdx !== -1) {
          inv.splice(lastIdx, 1);
        }
      }
    }
  }
}

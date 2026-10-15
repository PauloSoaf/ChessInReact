import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';

/**
 * MovePieceCommand executes a piece movement from one coordinate to another,
 * handling captures, crazyhouse inventory, turn progression, and full atomic reversibility.
 * (AUDIT-02, PATCH-04, PATCH-05)
 */
export class MovePieceCommand implements ICommand {
  public readonly id: string;
  public readonly type = 'MOVE_PIECE';
  public readonly description: string;

  private capturedEntitySnapshot: IEntity | null = null;
  private previousHasMovedState = false;
  private previousActivePlayer: PlayerId | null = null;
  private previousTurnNumber: number | null = null;

  constructor(
    public readonly pieceId: EntityId,
    public readonly from: CoordinateKey,
    public readonly to: CoordinateKey,
    public readonly actingPlayer: PlayerId,
    id?: string,
    public advanceTurn: boolean = true
  ) {
    this.id = id ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description = `Move ${pieceId} from ${from} to ${to}`;
  }

  public execute(draft: IDomainState): void {
    const piece = draft.boardEntities[this.pieceId] as IPieceEntity | undefined;
    if (!piece) {
      throw new Error(`Invalid move: Entity with ID "${this.pieceId}" does not exist.`);
    }

    // AUDIT-02: Core invariant: Only non-captured PIECE entities can be moved
    if (piece.type !== 'PIECE') {
      throw new Error(`Invalid move: Entity "${this.pieceId}" is of type "${piece.type}", only "PIECE" entities can be moved.`);
    }

    if (piece.isCaptured) {
      throw new Error(`Invalid move: Cannot move piece "${this.pieceId}" because it is already captured.`);
    }

    // AUDIT-02: Core invariant: Players may only command their own pieces
    if (piece.ownerId !== this.actingPlayer) {
      throw new Error(
        `Invalid move: Piece "${this.pieceId}" belongs to player "${piece.ownerId}", not acting player "${this.actingPlayer}".`
      );
    }

    // PATCH-04: Turn validation for ordinary turn-based command execution
    if (this.advanceTurn && draft.activePlayer !== this.actingPlayer) {
      throw new Error(
        `Invalid move: It is player "${draft.activePlayer}"'s turn, not acting player "${this.actingPlayer}".`
      );
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

    // Handle destination terrain: check if background terrain is impassable
    const terrainEntityId =
      draft.terrain?.[this.to] ??
      Object.values(draft.boardEntities).find(
        (e) => e.type === 'TERRAIN' && e.position === this.to
      )?.id;

    if (terrainEntityId) {
      const terrainEntity = draft.boardEntities[terrainEntityId];
      if (terrainEntity && terrainEntity.type === 'TERRAIN') {
        const isImpassable =
          terrainEntity.variantId === 'WATER' ||
          terrainEntity.variantId === 'CHASM' ||
          terrainEntity.variantId === 'MOUNTAIN' ||
          terrainEntity.metadata?.isObstacle === true ||
          (typeof terrainEntity.metadata?.costMultiplier === 'number' &&
            terrainEntity.metadata.costMultiplier >= 900);
        if (isImpassable) {
          throw new Error(
            `Invalid move: Destination coordinate "${this.to}" is impassable terrain (${terrainEntity.variantId}).`
          );
        }
      }
    }

    // Handle destination target (PATCH-05)
    const targetEntityId = draft.occupancy[this.to];
    if (targetEntityId) {
      if (targetEntityId === this.pieceId) {
        return; // No-op move to identical square
      }

      const targetEntity = draft.boardEntities[targetEntityId];
      if (!targetEntity) {
        throw new Error(
          `Invalid move: Destination coordinate "${this.to}" references occupant ID "${targetEntityId}", but entity does not exist in boardEntities.`
        );
      }

      // PATCH-05: Non-piece entities cannot be moved onto or captured in standard chess
      if (targetEntity.type === 'TERRAIN' || targetEntity.type === 'OBSTACLE') {
        throw new Error(
          `Invalid move: Destination coordinate "${this.to}" is occupied by ${targetEntity.type} entity "${targetEntityId}". Standard piece movement cannot capture or pass through ${targetEntity.type.toLowerCase()}.`
        );
      }

      if (targetEntity.type === 'PIECE') {
        // AUDIT-02: Core invariant: Self-capture of friendly pieces is prohibited
        if (targetEntity.ownerId === this.actingPlayer) {
          throw new Error(
            `Invalid move: Destination coordinate "${this.to}" is occupied by friendly piece "${targetEntityId}". Self-capture is forbidden.`
          );
        }

        // Deep clone snapshot of captured entity for lossless undo
        this.capturedEntitySnapshot = JSON.parse(JSON.stringify(targetEntity));

        // Mark captured in domain entity storage (RF-09: keep entity record, set isCaptured)
        (targetEntity as { isCaptured: boolean }).isCaptured = true;

        // Crazyhouse variant support
        if (draft.capturedInventory && draft.capturedInventory[this.actingPlayer]) {
          draft.capturedInventory[this.actingPlayer].push(targetEntity.variantId);
        }
      } else {
        throw new Error(
          `Invalid move: Destination coordinate "${this.to}" is occupied by unsupported entity type "${(targetEntity as { type: string }).type}".`
        );
      }
    }

    // Record and set hasMoved
    this.previousHasMovedState = piece.hasMoved;
    (piece as { hasMoved: boolean }).hasMoved = true;

    // Update spatial indices atomically
    delete draft.occupancy[this.from];
    (piece as { position: CoordinateKey }).position = this.to;
    draft.occupancy[this.to] = this.pieceId;

    // PATCH-04: Turn state progression
    if (this.advanceTurn) {
      this.previousActivePlayer = draft.activePlayer;
      this.previousTurnNumber = draft.turnNumber;
      (draft as { activePlayer: PlayerId }).activePlayer = draft.activePlayer === 'P1' ? 'P2' : 'P1';
      (draft as { turnNumber: number }).turnNumber += 1;
    }
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

    // PATCH-04: Revert turn state
    if (this.advanceTurn) {
      if (this.previousActivePlayer !== null) {
        (draft as { activePlayer: PlayerId }).activePlayer = this.previousActivePlayer;
      }
      if (this.previousTurnNumber !== null) {
        (draft as { turnNumber: number }).turnNumber = this.previousTurnNumber;
      }
    }
  }
}

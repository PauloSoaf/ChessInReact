import { CoordinateKey, EntityId, PlayerId, asCoordinateKey } from '../coordinates/types';
import { IEntity, IPieceEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';
import { ITopology } from '../topology/types';
import { SquareTopology } from '../topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { parseCoord, toCoordKey } from '../../engine/rules/utils/CoordinateHelper';

/**
 * MovePieceCommand executes a piece movement from one coordinate to another,
 * handling captures, crazyhouse inventory, turn progression, FIDE rules, and full atomic reversibility.
 * (AUDIT-02, PATCH-04, PATCH-05, Spec 04 RF-02 to RF-14)
 */
export class MovePieceCommand implements ICommand {
  public readonly id: string;
  public readonly type = 'MOVE_PIECE';
  public readonly description: string;

  private capturedEntitySnapshot: IEntity | null = null;
  private castledRookSnapshot: { readonly id: EntityId; readonly from: CoordinateKey; readonly to: CoordinateKey; readonly previousHasMoved: boolean } | null = null;
  private previousVariantId: string | null = null;
  private previousEnPassantTarget: CoordinateKey | null = null;
  private previousFiftyMoveCounter: number | null = null;
  private previousIsGameOver: boolean | null = null;
  private previousWinnerId: PlayerId | null = null;
  private previousHasMovedState = false;
  private previousActivePlayer: PlayerId | null = null;
  private previousTurnNumber: number | null = null;
  private readonly defaultTopology: ITopology;

  constructor(
    public readonly pieceId: EntityId,
    public readonly from: CoordinateKey,
    public readonly to: CoordinateKey,
    public readonly actingPlayer: PlayerId,
    id?: string,
    public advanceTurn: boolean = true,
    public readonly enforceRules: boolean = false,
    public readonly promotionVariant?: string,
    topology?: ITopology
  ) {
    this.id = id ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description = `Move ${pieceId} from ${from} to ${to}`;
    this.defaultTopology = topology ?? new SquareTopology({ width: 8, height: 8 });
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

    // Rules Engine Validation gate if enforceRules is active (Spec 04 RF-14)
    if (this.enforceRules) {
      const validation = RulesEngine.validateMove(
        draft,
        {
          pieceId: this.pieceId,
          from: this.from,
          to: this.to,
          actingPlayer: this.actingPlayer,
          promotionVariant: this.promotionVariant,
        },
        this.defaultTopology
      );
      if (!validation.valid) {
        throw new Error(`Invalid move (${validation.code}): ${validation.reason}`);
      }
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

    const parsedFrom = parseCoord(this.from);
    const parsedTo = parseCoord(this.to);
    const vUpper = piece.variantId.toUpperCase();
    const isPawn = vUpper === 'PAWN' || vUpper === 'P';
    const isKing = vUpper === 'KING' || vUpper === 'K';

    // Handle destination target (PATCH-05)
    const targetEntityId = draft.occupancy[this.to];
    let isCapture = false;

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
        (targetEntity as { isCaptured: boolean }).isCaptured = true;
        isCapture = true;

        // Crazyhouse variant support
        if (draft.capturedInventory && draft.capturedInventory[this.actingPlayer]) {
          draft.capturedInventory[this.actingPlayer].push(targetEntity.variantId);
        }
      } else {
        throw new Error(
          `Invalid move: Destination coordinate "${this.to}" is occupied by unsupported entity type "${(targetEntity as { type: string }).type}".`
        );
      }
    } else if (isPawn && this.to === draft.turnState?.enPassantTarget && parsedFrom && parsedTo) {
      // En Passant capture execution
      const victimCoord = toCoordKey(parsedTo.x, parsedFrom.y);
      const victimId = draft.occupancy[victimCoord];
      if (victimId) {
        const victimEntity = draft.boardEntities[victimId];
        if (victimEntity && victimEntity.type === 'PIECE') {
          this.capturedEntitySnapshot = JSON.parse(JSON.stringify(victimEntity));
          (victimEntity as { isCaptured: boolean }).isCaptured = true;
          delete draft.occupancy[victimCoord];
          isCapture = true;
        }
      }
    }

    // Castling execution: Move corresponding Rook
    if (isKing && parsedFrom && parsedTo && Math.abs(parsedTo.x - parsedFrom.x) === 2) {
      const rank = parsedFrom.y;
      if (parsedTo.x === 6) {
        // Kingside castling
        const rookCoord = toCoordKey(7, rank);
        const rookTarget = toCoordKey(5, rank);
        const rookId = draft.occupancy[rookCoord];
        if (rookId) {
          const rook = draft.boardEntities[rookId] as IPieceEntity | undefined;
          if (rook) {
            this.castledRookSnapshot = {
              id: rookId,
              from: rookCoord,
              to: rookTarget,
              previousHasMoved: rook.hasMoved,
            };
            delete draft.occupancy[rookCoord];
            draft.occupancy[rookTarget] = rookId;
            (rook as { position: CoordinateKey; hasMoved: boolean }).position = rookTarget;
            (rook as { position: CoordinateKey; hasMoved: boolean }).hasMoved = true;
          }
        }
      } else if (parsedTo.x === 2) {
        // Queenside castling
        const rookCoord = toCoordKey(0, rank);
        const rookTarget = toCoordKey(3, rank);
        const rookId = draft.occupancy[rookCoord];
        if (rookId) {
          const rook = draft.boardEntities[rookId] as IPieceEntity | undefined;
          if (rook) {
            this.castledRookSnapshot = {
              id: rookId,
              from: rookCoord,
              to: rookTarget,
              previousHasMoved: rook.hasMoved,
            };
            delete draft.occupancy[rookCoord];
            draft.occupancy[rookTarget] = rookId;
            (rook as { position: CoordinateKey; hasMoved: boolean }).position = rookTarget;
            (rook as { position: CoordinateKey; hasMoved: boolean }).hasMoved = true;
          }
        }
      }
    }

    // Pawn Promotion execution
    if (isPawn && parsedTo && (parsedTo.y === 7 || parsedTo.y === 0)) {
      this.previousVariantId = piece.variantId;
      (piece as { variantId: string }).variantId = this.promotionVariant ?? 'QUEEN';
    }

    // Record and set hasMoved
    this.previousHasMovedState = piece.hasMoved;
    (piece as { hasMoved: boolean }).hasMoved = true;

    // Update spatial indices atomically
    delete draft.occupancy[this.from];
    (piece as { position: CoordinateKey }).position = this.to;
    draft.occupancy[this.to] = this.pieceId;

    // Turn state progression & FIDE counters
    if (draft.turnState) {
      this.previousEnPassantTarget = draft.turnState.enPassantTarget;
      this.previousFiftyMoveCounter = draft.turnState.fiftyMoveCounter;

      // Update En Passant Target
      if (isPawn && parsedFrom && parsedTo && Math.abs(parsedTo.y - parsedFrom.y) === 2) {
        (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = toCoordKey(
          parsedFrom.x,
          (parsedFrom.y + parsedTo.y) / 2
        );
      } else {
        (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = null;
      }

      // Update 50-move counter
      if (isPawn || isCapture) {
        (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = 0;
      } else {
        (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter += 1;
      }
    }

    // PATCH-04: Turn progression
    if (this.advanceTurn) {
      this.previousActivePlayer = draft.activePlayer;
      this.previousTurnNumber = draft.turnNumber;
      (draft as { activePlayer: PlayerId }).activePlayer = draft.activePlayer === 'P1' ? 'P2' : 'P1';
      (draft as { turnNumber: number }).turnNumber += 1;
    }

    // Game over evaluation
    if (this.enforceRules) {
      this.previousIsGameOver = draft.isGameOver;
      this.previousWinnerId = draft.winnerId;

      const result = RulesEngine.getGameResult(draft, this.defaultTopology);
      if (result.isGameOver) {
        (draft as { isGameOver: boolean }).isGameOver = true;
        (draft as { winnerId: PlayerId | null }).winnerId = result.winnerId;
      }
    }
  }

  public undo(draft: IDomainState): void {
    const piece = draft.boardEntities[this.pieceId] as IPieceEntity | undefined;
    if (!piece) {
      throw new Error(`Cannot undo: Piece "${this.pieceId}" not found in domain entities.`);
    }

    // Revert promotion
    if (this.previousVariantId !== null) {
      (piece as { variantId: string }).variantId = this.previousVariantId;
    }

    // Restore previous hasMoved flag
    (piece as { hasMoved: boolean }).hasMoved = this.previousHasMovedState;

    // Revert spatial occupancy
    delete draft.occupancy[this.to];
    (piece as { position: CoordinateKey }).position = this.from;
    draft.occupancy[this.from] = this.pieceId;

    // Revert castled rook
    if (this.castledRookSnapshot) {
      const rook = draft.boardEntities[this.castledRookSnapshot.id] as IPieceEntity | undefined;
      if (rook) {
        delete draft.occupancy[this.castledRookSnapshot.to];
        draft.occupancy[this.castledRookSnapshot.from] = this.castledRookSnapshot.id;
        (rook as { position: CoordinateKey; hasMoved: boolean }).position = this.castledRookSnapshot.from;
        (rook as { position: CoordinateKey; hasMoved: boolean }).hasMoved = this.castledRookSnapshot.previousHasMoved;
      }
    }

    // If an entity was captured (regular or en passant), restore it completely
    if (this.capturedEntitySnapshot) {
      const restored = JSON.parse(JSON.stringify(this.capturedEntitySnapshot));
      draft.boardEntities[restored.id] = restored;
      draft.occupancy[restored.position] = restored.id;

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

    // Revert turnState metadata
    if (draft.turnState) {
      if (this.previousEnPassantTarget !== null) {
        (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = this.previousEnPassantTarget;
      }
      if (this.previousFiftyMoveCounter !== null) {
        (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = this.previousFiftyMoveCounter;
      }
    }

    // Revert game over status
    if (this.previousIsGameOver !== null) {
      (draft as { isGameOver: boolean }).isGameOver = this.previousIsGameOver;
    }
    if (this.previousWinnerId !== null) {
      (draft as { winnerId: PlayerId | null }).winnerId = this.previousWinnerId;
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

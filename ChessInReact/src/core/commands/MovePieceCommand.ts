import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ICommand } from './types';
import { ITopology } from '../topology/types';
import { SquareTopology } from '../topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { parseCoord, toCoordKey } from '../../engine/rules/utils/CoordinateHelper';
import { VariantRegistry } from '../../engine/rules/VariantRegistry';
import { IVariantConfiguration } from '../../engine/rules/interfaces/IRulesContracts';

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
  private atomicDestroyedEntitiesSnapshot: IEntity[] = [];
  private droppedPieceSnapshot: { readonly pieceId: EntityId; readonly variant: string } | null = null;
  private previousVariantId: string | null = null;
  private previousEnPassantTarget: CoordinateKey | null | undefined = undefined;
  private previousFiftyMoveCounter: number | null = null;
  private previousIsGameOver: boolean | null | undefined = undefined;
  private previousWinnerId: PlayerId | null | undefined = undefined;
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
    topology?: ITopology,
    public readonly variantConfig?: IVariantConfiguration,
    public readonly isDropMove: boolean = false,
    public readonly dropPieceVariant?: string
  ) {
    this.id = id ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.description = this.isDropMove
      ? `Drop ${this.dropPieceVariant ?? pieceId} at ${to}`
      : `Move ${pieceId} from ${from} to ${to}`;
    this.defaultTopology = topology ?? new SquareTopology({ width: 8, height: 8 });
  }

  public execute(draft: IDomainState): void {
    this.previousIsGameOver = draft.isGameOver;
    this.previousWinnerId = draft.winnerId;

    const activeConfig: IVariantConfiguration | undefined =
      this.variantConfig ?? (draft.variantId ? VariantRegistry.getVariant(draft.variantId)?.config : undefined);

    // Crazyhouse drop move execution
    if (this.isDropMove) {
      const dropVariant = (this.dropPieceVariant ?? 'PAWN').toUpperCase();
      const pocket = draft.capturedInventory?.[this.actingPlayer];
      const pocketIdx = pocket ? pocket.indexOf(dropVariant) : -1;
      if (pocketIdx === -1) {
        throw new Error(
          `Invalid drop move: Piece variant "${dropVariant}" is not available in player "${this.actingPlayer}" inventory.`
        );
      }
      if (draft.occupancy[this.to]) {
        throw new Error(
          `Invalid drop move: Destination coordinate "${this.to}" is already occupied.`
        );
      }
      if (!this.defaultTopology.isValidCoordinate(this.to)) {
        throw new Error(
          `Invalid drop move: Destination coordinate "${this.to}" is out of bounds.`
        );
      }

      // Remove from pocket inventory
      pocket.splice(pocketIdx, 1);
      this.droppedPieceSnapshot = {
        pieceId: this.pieceId,
        variant: dropVariant,
      };

      // Place newly dropped piece on board
      const droppedEntity: IPieceEntity = {
        id: this.pieceId,
        type: 'PIECE',
        ownerId: this.actingPlayer,
        variantId: dropVariant,
        position: this.to,
        hasMoved: true,
        isCaptured: false,
      };
      draft.boardEntities[this.pieceId] = droppedEntity;
      draft.occupancy[this.to] = this.pieceId;

      // Turn state progression
      if (draft.turnState) {
        this.previousEnPassantTarget = draft.turnState.enPassantTarget;
        this.previousFiftyMoveCounter = draft.turnState.fiftyMoveCounter;
        (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = null;
        (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = 0;
      }

      if (this.advanceTurn) {
        this.previousActivePlayer = draft.activePlayer;
        this.previousTurnNumber = draft.turnNumber;
        (draft as { activePlayer: PlayerId }).activePlayer = draft.activePlayer === 'P1' ? 'P2' : 'P1';
        (draft as { turnNumber: number }).turnNumber += 1;
      }

      if (this.enforceRules || activeConfig) {
        this.previousIsGameOver = draft.isGameOver;
        this.previousWinnerId = draft.winnerId;
        const result = RulesEngine.getGameResult(draft, this.defaultTopology, activeConfig);
        if (result.isGameOver) {
          (draft as { isGameOver: boolean }).isGameOver = true;
          (draft as { winnerId: PlayerId | null }).winnerId = result.winnerId;
        }
      }
      return;
    }

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
        this.defaultTopology,
        activeConfig
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

    // Castling execution: Move corresponding Rook (only when enforceRules is active)
    if (this.enforceRules && isKing && parsedFrom && parsedTo && Math.abs(parsedTo.x - parsedFrom.x) === 2) {
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

    // Atomic variant explosion handling (RF-08)
    const isAtomic = Boolean(
      activeConfig?.captureExplosion ||
      activeConfig?.variantId === 'ATOMIC' ||
      draft.variantId === 'ATOMIC'
    );
    if (isCapture && isAtomic) {
      // 1. Epicenter: Capturing piece itself is destroyed in the explosion
      (piece as { isCaptured: boolean }).isCaptured = true;
      delete draft.occupancy[this.to];

      // 2. Blast radius 1: All adjacent non-pawn pieces destroyed
      const neighbors = this.defaultTopology.getAllNeighbors(this.to);
      for (const neighborCoord of neighbors) {
        const occId = draft.occupancy[neighborCoord];
        if (occId && occId !== this.pieceId) {
          const adjPiece = draft.boardEntities[occId] as IPieceEntity | undefined;
          if (adjPiece && adjPiece.type === 'PIECE' && !adjPiece.isCaptured) {
            const vUpper = adjPiece.variantId.toUpperCase();
            const isPawnNeighbor = vUpper === 'PAWN' || vUpper === 'P';
            if (!isPawnNeighbor) {
              this.atomicDestroyedEntitiesSnapshot.push(JSON.parse(JSON.stringify(adjPiece)));
              (adjPiece as { isCaptured: boolean }).isCaptured = true;
              delete draft.occupancy[neighborCoord];
            }
          }
        }
      }

      // Check king survival in Atomic detonation
      let whiteKingAlive = false;
      let blackKingAlive = false;
      for (const e of Object.values(draft.boardEntities)) {
        if (e.type === 'PIECE' && !(e as IPieceEntity).isCaptured) {
          const v = (e as IPieceEntity).variantId.toUpperCase();
          if (v === 'KING' || v === 'K') {
            if ((e as IPieceEntity).ownerId === 'P1') whiteKingAlive = true;
            if ((e as IPieceEntity).ownerId === 'P2') blackKingAlive = true;
          }
        }
      }

      if (!whiteKingAlive && !blackKingAlive) {
        (draft as { isGameOver: boolean }).isGameOver = true;
        (draft as { winnerId: PlayerId | null }).winnerId = null;
      } else if (!whiteKingAlive) {
        (draft as { isGameOver: boolean }).isGameOver = true;
        (draft as { winnerId: PlayerId | null }).winnerId = 'P2';
      } else if (!blackKingAlive) {
        (draft as { isGameOver: boolean }).isGameOver = true;
        (draft as { winnerId: PlayerId | null }).winnerId = 'P1';
      }
    }

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
    if ((this.enforceRules || activeConfig) && !draft.isGameOver) {
      const result = RulesEngine.getGameResult(draft, this.defaultTopology, activeConfig);
      if (result.isGameOver) {
        (draft as { isGameOver: boolean }).isGameOver = true;
        (draft as { winnerId: PlayerId | null }).winnerId = result.winnerId;
      }
    }
  }

  public undo(draft: IDomainState): void {
    // 1. Revert Drop Move
    if (this.droppedPieceSnapshot) {
      delete draft.occupancy[this.to];
      delete draft.boardEntities[this.droppedPieceSnapshot.pieceId];
      if (draft.capturedInventory?.[this.actingPlayer]) {
        draft.capturedInventory[this.actingPlayer].push(this.droppedPieceSnapshot.variant);
      }

      if (draft.turnState) {
        if (this.previousEnPassantTarget !== undefined) {
          (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = this.previousEnPassantTarget;
        }
        if (this.previousFiftyMoveCounter !== null) {
          (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = this.previousFiftyMoveCounter;
        }
      }

      if (this.previousIsGameOver !== undefined) {
        (draft as { isGameOver: boolean }).isGameOver = Boolean(this.previousIsGameOver);
      }
      if (this.previousWinnerId !== undefined) {
        (draft as { winnerId: PlayerId | null }).winnerId = this.previousWinnerId;
      }

      if (this.advanceTurn) {
        if (this.previousActivePlayer !== null) {
          (draft as { activePlayer: PlayerId }).activePlayer = this.previousActivePlayer;
        }
        if (this.previousTurnNumber !== null) {
          (draft as { turnNumber: number }).turnNumber = this.previousTurnNumber;
        }
      }
      return;
    }

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
    (piece as { position: CoordinateKey; isCaptured: boolean }).position = this.from;
    (piece as { position: CoordinateKey; isCaptured: boolean }).isCaptured = false;
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

    // Revert atomic explosion casualties
    if (this.atomicDestroyedEntitiesSnapshot.length > 0) {
      for (const destroyed of this.atomicDestroyedEntitiesSnapshot) {
        const restored = JSON.parse(JSON.stringify(destroyed));
        draft.boardEntities[restored.id] = restored;
        draft.occupancy[restored.position] = restored.id;
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
        const lastIdx = inv.lastIndexOf(restored.variantId.toUpperCase());
        if (lastIdx !== -1) {
          inv.splice(lastIdx, 1);
        }
      }
    }

    // Revert turnState metadata
    if (draft.turnState) {
      if (this.previousEnPassantTarget !== undefined) {
        (draft.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = this.previousEnPassantTarget;
      }
      if (this.previousFiftyMoveCounter !== null) {
        (draft.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = this.previousFiftyMoveCounter;
      }
    }

    // Revert game over status
    if (this.previousIsGameOver !== undefined) {
      (draft as { isGameOver: boolean }).isGameOver = Boolean(this.previousIsGameOver);
    }
    if (this.previousWinnerId !== undefined) {
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

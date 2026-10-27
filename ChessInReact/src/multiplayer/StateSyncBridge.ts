import { Room } from 'colyseus.js';
import { ChessRoomStateSchema } from '../../src-backend/game-server/schemas/RoomStateSchema';
import { GameStoreInstance } from '../core/state/gameStore';
import { IDomainState } from '../core/state/gameState';
import { IPieceEntity, IEntity } from '../core/entities/types';
import { CoordinateKey, EntityId, PlayerId, asCoordinateKey, asEntityId } from '../core/coordinates/types';
import { MovePieceCommand } from '../core/commands/MovePieceCommand';
import { OptimisticManager } from '../core/optimistic/OptimisticManager';
import { IServerMoveAckPayload, IServerRejectMovePayload } from './types';

export interface IPendingCommandRecord {
  seqId: number;
  command: MovePieceCommand;
  optimisticId: string;
}

/**
 * StateSyncBridge bridges Colyseus binary schema state into Zustand store O(1) mutations.
 * Coordinates Gabriel Gambetta client-side prediction, command buffering, and authoritative rollback.
 * Conforms to Spec 03 Section 7, Section 16 (RF-02, RF-03, RF-04), and Section 20.
 */
export class StateSyncBridge {
  private optimisticManager: OptimisticManager = new OptimisticManager();
  private pendingCommands: Map<number, IPendingCommandRecord> = new Map();
  private sequenceCounter: number = 0;
  private lastAuthoritativeState: IDomainState | null = null;

  constructor(
    private room: Room<ChessRoomStateSchema>,
    private store: GameStoreInstance,
    private myPlayerId: PlayerId
  ) {
    this.setupNetworkHandlers();
  }

  public getMyPlayerId(): PlayerId {
    return this.myPlayerId;
  }

  public setMyPlayerId(playerId: PlayerId): void {
    this.myPlayerId = playerId;
  }

  public getPendingCommandsCount(): number {
    return this.pendingCommands.size;
  }

  /**
   * Dispatches optimistic move immediately (<2ms, RNF-06) and sends network command.
   */
  public sendOptimisticMove(
    pieceId: EntityId,
    from: CoordinateKey,
    to: CoordinateKey
  ): number {
    const seqId = ++this.sequenceCounter;
    const command = new MovePieceCommand(pieceId, from, to, this.myPlayerId);

    // 1. Optimistic local prediction execution
    this.store.getState().executeCommand(command);

    // 2. Track in pending queue
    const optimisticId = `opt-${seqId}-${Date.now()}`;
    this.pendingCommands.set(seqId, {
      seqId,
      command,
      optimisticId,
    });

    // 3. Transmit authoritative command to Colyseus server
    this.room.send('PLAYER_MOVE', {
      pieceId: String(pieceId),
      from: String(from),
      to: String(to),
      seqId,
      clientTimestamp: Date.now(),
    });

    return seqId;
  }

  /**
   * Translates Colyseus binary RoomStateSchema into pure DomainState.
   */
  public schemaToDomainState(schema: ChessRoomStateSchema): IDomainState {
    const boardEntities: Record<EntityId, IEntity> = {};
    const occupancy: Record<CoordinateKey, EntityId> = {};

    schema.boardEntities.forEach((netEnt, key) => {
      const eId = asEntityId(netEnt.id || key);
      const pos = asCoordinateKey(netEnt.position);

      const piece: IPieceEntity = {
        id: eId,
        type: 'PIECE',
        position: pos,
        ownerId: (netEnt.ownerId as PlayerId) || 'NONE',
        variantId: netEnt.variantId || 'P',
        hasMoved: Boolean(netEnt.hasMoved),
        isCaptured: Boolean(netEnt.isCaptured),
        provenance: 'GAMEPLAY',
      };

      boardEntities[eId] = piece;

      if (!piece.isCaptured && piece.position) {
        occupancy[piece.position] = piece.id;
      }
    });

    const activePlayer = (schema.activePlayerId as PlayerId) || 'P1';
    const winnerId = schema.winnerId ? (schema.winnerId as PlayerId) : null;

    return {
      matchId: schema.matchId || this.room.id,
      variantId: 'classic',
      isGameOver: schema.phase === 'GAME_OVER',
      winnerId,
      activePlayer,
      turnNumber: schema.turnNumber,
      revision: schema.lastProcessedSequenceId,
      boardEntities,
      occupancy,
      terrain: {},
      capturedInventory: {
        P1: [],
        P2: [],
        P3: [],
        P4: [],
        P5: [],
        P6: [],
        P7: [],
        P8: [],
        NONE: [],
      },
      turnState: {
        phase: schema.phase === 'RESOLVING' ? 'RESOLUTION' : 'COMMIT',
        lastActionTimestamp: Date.now(),
        enPassantTarget: null,
        fiftyMoveCounter: 0,
      },
    };
  }

  private setupNetworkHandlers(): void {
    // 1. Listen for Server Acknowledgment
    this.room.onMessage('MOVE_ACK', (ack: IServerMoveAckPayload) => {
      const pending = this.pendingCommands.get(ack.seqId);
      if (pending) {
        this.optimisticManager.acknowledge(pending.optimisticId);
        this.pendingCommands.delete(ack.seqId);
      }
    });

    // 2. Listen for Server Rejection / Force Rollback (RF-03)
    this.room.onMessage('REJECT_MOVE', (reject: IServerRejectMovePayload) => {
      this.handleServerRejection(reject.seqId);
    });

    this.room.onMessage('FORCE_ROLLBACK', (reject: IServerRejectMovePayload) => {
      this.handleServerRejection(reject.seqId);
    });

    // 3. State sync delta reception from Colyseus binary schema
    this.room.onStateChange((state: ChessRoomStateSchema) => {
      this.handleServerStateChange(state);
    });
  }

  private handleServerRejection(seqId: number): void {
    const pending = this.pendingCommands.get(seqId);
    if (pending) {
      this.pendingCommands.delete(seqId);
    }

    if (this.lastAuthoritativeState) {
      // Reconcile: restore authoritative base and replay any other unrejected commands
      const clonedBase: IDomainState = JSON.parse(JSON.stringify(this.lastAuthoritativeState));
      for (const record of this.pendingCommands.values()) {
        try {
          record.command.execute(clonedBase);
        } catch (err) {
          console.warn(`[StateSyncBridge] Replaying pending move ${record.seqId} failed:`, err);
          this.pendingCommands.delete(record.seqId);
        }
      }
      this.store.getState().syncDomainState(clonedBase);
    }
  }

  private handleServerStateChange(state: ChessRoomStateSchema): void {
    const authoritativeDomain = this.schemaToDomainState(state);
    this.lastAuthoritativeState = authoritativeDomain;

    // Prune acknowledged commands whose sequence is <= state.lastProcessedSequenceId
    for (const [seqId, record] of Array.from(this.pendingCommands.entries())) {
      if (seqId <= state.lastProcessedSequenceId) {
        this.optimisticManager.acknowledge(record.optimisticId);
        this.pendingCommands.delete(seqId);
      }
    }

    if (this.pendingCommands.size === 0) {
      // Clean authoritative sync
      this.store.getState().syncDomainState(authoritativeDomain);
    } else {
      // Reconcile Gambetta prediction: authoritative base + pending unacknowledged commands
      const reconciled: IDomainState = JSON.parse(JSON.stringify(authoritativeDomain));
      for (const record of this.pendingCommands.values()) {
        try {
          record.command.execute(reconciled);
        } catch (err) {
          console.warn(`[StateSyncBridge] Optimistic replay failed on sync:`, err);
          this.pendingCommands.delete(record.seqId);
        }
      }
      this.store.getState().syncDomainState(reconciled);
    }
  }

  public dispose(): void {
    this.pendingCommands.clear();
    this.lastAuthoritativeState = null;
  }
}

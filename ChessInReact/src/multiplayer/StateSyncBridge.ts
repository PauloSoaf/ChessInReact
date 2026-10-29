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

    // Initial state sync if state is already populated (avoids missing initial snapshot)
    if (this.room.state && this.room.state.boardEntities && this.room.state.boardEntities.size > 0) {
      this.handleServerStateChange(this.room.state);
    }
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

  public toCanonicalPlayerId(id: PlayerId | string): PlayerId {
    let whitePlayerId = '';
    let blackPlayerId = '';
    this.room.state?.players?.forEach((p) => {
      if (p.role === 'WHITE') whitePlayerId = p.playerId;
      if (p.role === 'BLACK') blackPlayerId = p.playerId;
    });

    const str = String(id).toLowerCase();
    if (id === 'P1' || id === 'WHITE' || (whitePlayerId && id === whitePlayerId) || str.includes('white')) {
      return 'P1';
    }
    if (id === 'P2' || id === 'BLACK' || (blackPlayerId && id === blackPlayerId) || str.includes('black')) {
      return 'P2';
    }
    return id as PlayerId;
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
    const actingPlayer = this.toCanonicalPlayerId(this.myPlayerId);
    const command = new MovePieceCommand(pieceId, from, to, actingPlayer);

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

    let whitePlayerId = '';
    let blackPlayerId = '';
    schema.players.forEach((p) => {
      if (p.role === 'WHITE') whitePlayerId = p.playerId;
      if (p.role === 'BLACK') blackPlayerId = p.playerId;
    });

    schema.boardEntities.forEach((netEnt, key) => {
      const eId = asEntityId(netEnt.id || key);
      const pos = asCoordinateKey(netEnt.position);

      let canonicalOwner: PlayerId = 'NONE';
      if (netEnt.ownerId === whitePlayerId || netEnt.ownerId === 'P1' || netEnt.ownerId.includes('white')) {
        canonicalOwner = 'P1';
      } else if (netEnt.ownerId === blackPlayerId || netEnt.ownerId === 'P2' || netEnt.ownerId.includes('black')) {
        canonicalOwner = 'P2';
      } else {
        canonicalOwner = (netEnt.ownerId as PlayerId) || 'NONE';
      }

      const piece: IPieceEntity = {
        id: eId,
        type: 'PIECE',
        position: pos,
        ownerId: canonicalOwner,
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

    let activePlayer: PlayerId = 'P1';
    if (schema.activePlayerId === whitePlayerId || schema.activePlayerId === 'P1' || schema.activePlayerId.includes('white')) {
      activePlayer = 'P1';
    } else if (schema.activePlayerId === blackPlayerId || schema.activePlayerId === 'P2' || schema.activePlayerId.includes('black')) {
      activePlayer = 'P2';
    } else {
      activePlayer = (schema.activePlayerId as PlayerId) || 'P1';
    }

    const winnerId = schema.winnerId ? this.toCanonicalPlayerId(schema.winnerId) : null;

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
        enPassantTarget: schema.enPassantTarget ? asCoordinateKey(schema.enPassantTarget) : null,
        fiftyMoveCounter: schema.fiftyMoveCounter ?? 0,
        positionHistory: schema.positionHistory
          ? Array.from(schema.positionHistory).filter((k): k is string => typeof k === 'string')
          : [],
      },
    };
  }

  private setupNetworkHandlers(): void {
    // 1. Listen for Server Acknowledgment
    this.room.onMessage('MOVE_ACK', (ack: IServerMoveAckPayload & { playerId?: string }) => {
      if (ack.playerId && ack.playerId !== String(this.myPlayerId)) {
        return;
      }
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

    // Prune acknowledged commands for THIS player based on per-player ACK (S03-04)
    let serverPlayerId = String(this.myPlayerId);
    state.players?.forEach((p) => {
      if (this.myPlayerId === 'P1' && p.role === 'WHITE') serverPlayerId = p.playerId;
      if (this.myPlayerId === 'P2' && p.role === 'BLACK') serverPlayerId = p.playerId;
    });

    const myAck = state.playerSequenceAcks
      ? (state.playerSequenceAcks.get(serverPlayerId) ?? state.playerSequenceAcks.get(String(this.myPlayerId)))
      : undefined;
    if (typeof myAck === 'number') {
      if (myAck > this.sequenceCounter) {
        this.sequenceCounter = myAck;
      }
      for (const [seqId, record] of Array.from(this.pendingCommands.entries())) {
        if (seqId <= myAck) {
          this.optimisticManager.acknowledge(record.optimisticId);
          this.pendingCommands.delete(seqId);
        }
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

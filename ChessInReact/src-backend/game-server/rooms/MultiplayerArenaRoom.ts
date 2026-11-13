/**
 * ChessInReact - Multiplayer Arena Authoritative Room (Spec 14 § 7, RF-14-07, RNF-14-01, RNF-14-02)
 *
 * Colyseus authoritative room for massive multiplayer arenas (3 to 12 players):
 * - Fixed 20 Hz simulation loop (50ms interval) for real-time delta compression.
 * - Manages all 18 arena layouts (FFA, Teams, Diplomacy simultaneous turns).
 * - Clockwise turn rotation skipping eliminated factions via TurnCycleManager.
 * - Real-time competitive scoring via FFAScoringEngine (material + 20pt elimination bonus).
 * - 4 configurable elimination policies via EliminationManager (EVAPORATION, GREY_OBSTACLES, CONQUEST, ZOMBIE_BOT).
 * - Simultaneous order buffering and collision arbitration via SimultaneousResolutionEngine.
 * - Memory footprint < 4.0 MB for 12 players and 192 pieces.
 */

import { Room, Client } from 'colyseus';
import {
  ArenaRoomStateSchema,
  NetworkEntitySchema,
  PlayerSchema,
} from '../schemas/RoomStateSchema';
import { verifyAuthToken, IAuthUser } from '../auth/jwtAuth';
import { CompositeArenaLayouts } from '../../../src/engine/multiplayer/arenas/CompositeArenaLayouts';
import {
  ArenaModeId,
  EliminationPolicy,
  ISimultaneousMoveOrder,
} from '../../../src/engine/multiplayer/arenas/interfaces/IArenaContracts';
import {
  TurnCycleManager,
  ITurnCycleState,
} from '../../../src/engine/multiplayer/arenas/TurnCycleManager';
import {
  FFAScoringEngine,
  IFFAPlayerScore,
} from '../../../src/engine/multiplayer/arenas/FFAScoringEngine';
import {
  EliminationManager,
  IArenaPiece,
} from '../../../src/engine/multiplayer/arenas/EliminationManager';
import { SimultaneousResolutionEngine } from '../../../src/engine/multiplayer/arenas/SimultaneousResolutionEngine';

export interface IMultiplayerArenaRoomOptions {
  matchId?: string;
  arenaId?: ArenaModeId;
  totalParticipants?: number;
  eliminationPolicy?: EliminationPolicy;
  token?: string;
  authToken?: string;
  maxClients?: number;
  autoStart?: boolean;
}

export interface IArenaMoveMessage {
  from: string;
  to: string;
  pieceId: string;
  seqId?: number;
}

export interface IArenaSecretOrderMessage {
  from: string;
  to: string;
  pieceId: string;
}

export class MultiplayerArenaRoom extends Room<ArenaRoomStateSchema> {
  private turnCycleState!: ITurnCycleState;
  private scoresState: Record<string, IFFAPlayerScore> = {};
  private arenaLayout!: ReturnType<typeof CompositeArenaLayouts.getLayout> & object;
  private eliminationPolicy: EliminationPolicy = 'EVAPORATION';
  private bufferedSecretOrders: Map<string, ISimultaneousMoveOrder> = new Map();

  public onCreate(options: IMultiplayerArenaRoomOptions): void {
    const matchId = options.matchId || this.roomId;
    const requestedArenaId = options.arenaId || 'FOUR_PLAYER_FFA';
    const layout = CompositeArenaLayouts.getLayout(requestedArenaId);

    if (!layout) {
      throw new Error(`Arena layout desconhecido: ${requestedArenaId}`);
    }

    this.arenaLayout = layout;
    this.eliminationPolicy = options.eliminationPolicy || 'EVAPORATION';
    this.maxClients = options.maxClients || 30; // 12 players + up to 18 spectators

    this.setState(
      new ArenaRoomStateSchema({
        matchId,
        arenaId: requestedArenaId,
        totalParticipants: layout.totalParticipants,
        eliminationPolicy: this.eliminationPolicy,
        activeFactionId: 'FACTION_1',
        phase: options.autoStart ? 'PLAYING' : 'WAITING',
      })
    );

    // 1. Spawn initial pieces across radial/perimeter spawn areas
    this.spawnArenaPieces();

    // 2. Initialize Clockwise Turn Cycle
    const factions = layout.factions.map((f) => f.factionId);
    this.turnCycleState = TurnCycleManager.createInitialState(factions);

    // 3. Initialize FFA Scoring
    for (const f of factions) {
      this.scoresState[f] = FFAScoringEngine.createInitialScore(f);
      this.state.factionScores.set(f, 0);
    }

    // 4. Fixed 20 Hz simulation loop (50ms interval, RF-14-07, RNF-14-02)
    this.setSimulationInterval(() => this.update(), 50);

    // 5. Message Handlers
    this.onMessage('PLAYER_MOVE', (client: Client, message: IArenaMoveMessage) => {
      this.handlePlayerMove(client, message);
    });

    this.onMessage(
      'COMMIT_SECRET_ORDER',
      (client: Client, message: IArenaSecretOrderMessage) => {
        this.handleCommitSecretOrder(client, message);
      }
    );

    this.onMessage('START_MATCH', () => {
      this.state.phase = 'PLAYING';
    });

    this.onMessage('PING', (client: Client, message: { clientSendTime?: number }) => {
      client.send('PONG', {
        clientSendTime: message?.clientSendTime ?? Date.now(),
        serverReceiveTime: Date.now(),
      });
    });
  }

  public onAuth(_client: Client, options: IMultiplayerArenaRoomOptions): IAuthUser {
    const token = options.token || options.authToken;
    if (!token) {
      throw new Error('Handshake rejeitado: Token JWT ausente.');
    }
    return verifyAuthToken(token);
  }

  public onJoin(client: Client, _options: IMultiplayerArenaRoomOptions, auth?: IAuthUser): void {
    const existingPlayers = Array.from(this.state.players.values()) as PlayerSchema[];

    // Find next available faction slot (1 to totalParticipants)
    let assignedRole = 'SPECTATOR';
    for (let i = 0; i < this.arenaLayout.totalParticipants; i++) {
      const candidateFaction = `FACTION_${i + 1}`;
      const isTaken = existingPlayers.some((p: PlayerSchema) => p.role === candidateFaction && p.connected);
      if (!isTaken) {
        assignedRole = candidateFaction;
        break;
      }
    }

    const player = new PlayerSchema({
      sessionId: client.sessionId,
      playerId: auth?.playerId || client.sessionId,
      username: auth?.username || `Jogador ${assignedRole}`,
      role: assignedRole,
      connected: true,
    });

    this.state.players.set(client.sessionId, player);

    // Auto-start match when all participant factions are joined
    if (this.state.phase === 'WAITING') {
      const connectedFactions = new Set(
        (Array.from(this.state.players.values()) as PlayerSchema[])
          .filter((p: PlayerSchema) => p.connected && p.role.startsWith('FACTION_'))
          .map((p: PlayerSchema) => p.role)
      );

      if (connectedFactions.size >= this.arenaLayout.totalParticipants) {
        this.state.phase = 'PLAYING';
      }
    }
  }

  public onLeave(client: Client, consented?: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.connected = false;

    if (this.state.phase === 'PLAYING' && player.role.startsWith('FACTION_')) {
      if (consented) {
        // Player forfeited: eliminate faction or assign zombie bot
        if (this.eliminationPolicy === 'ZOMBIE_BOT') {
          player.username = `Bot (Substituto de ${player.username})`;
          // Remains as ZOMBIE_BOT in play
        } else {
          this.executeElimination(player.role, undefined);
        }
      }
    }
  }

  private spawnArenaPieces(): void {
    this.arenaLayout.factions.forEach((faction) => {
      faction.initialCoordinates.forEach((coord, idx) => {
        const entityId = `${faction.factionId}-${coord.pieceVariantId.toLowerCase()}-${idx}`;
        const entity = new NetworkEntitySchema({
          id: entityId,
          entityType: 'PIECE',
          ownerId: faction.factionId,
          variantId: coord.pieceVariantId,
          position: coord.coordKey,
          hasMoved: false,
          isCaptured: false,
        });
        this.state.boardEntities.set(entityId, entity);
      });
    });
  }

  private handlePlayerMove(client: Client, message: IArenaMoveMessage): void {
    if (this.state.phase !== 'PLAYING') return;

    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const currentFaction = this.state.activeFactionId;
    if (player.role !== currentFaction) {
      client.send('MOVE_REJECTED', { reason: 'Não é o turno da sua facção.' });
      return;
    }

    const piece = this.state.boardEntities.get(message.pieceId);
    if (!piece || piece.isCaptured || piece.ownerId !== currentFaction) {
      client.send('MOVE_REJECTED', { reason: 'Peça inválida ou não pertencente à facção ativa.' });
      return;
    }

    // Check for target occupant (capture)
    let capturedPiece: NetworkEntitySchema | undefined;
    for (const ent of this.state.boardEntities.values()) {
      if (!ent.isCaptured && ent.position === message.to && ent.id !== piece.id) {
        capturedPiece = ent;
        break;
      }
    }

    if (capturedPiece) {
      // Capture friendly fire check in same team
      if (capturedPiece.ownerId === currentFaction) {
        client.send('MOVE_REJECTED', { reason: 'Fogo amigo não permitido na mesma facção.' });
        return;
      }

      // 1. Process capture points
      capturedPiece.isCaptured = true;
      capturedPiece.position = '';
      this.scoresState[currentFaction] = FFAScoringEngine.addCapture(
        this.scoresState[currentFaction],
        capturedPiece.variantId
      );

      // 2. King capture triggers Elimination Policy (Spec 14 § 5, RF-14-04)
      if (capturedPiece.variantId.toUpperCase() === 'KING') {
        // +20 Elimination Bonus
        this.scoresState[currentFaction] = FFAScoringEngine.addElimination(
          this.scoresState[currentFaction]
        );
        this.executeElimination(capturedPiece.ownerId, currentFaction);
      }

      this.state.factionScores.set(currentFaction, this.scoresState[currentFaction].totalScore);
    }

    // Execute Move
    piece.position = message.to;
    piece.hasMoved = true;

    // Advance Clockwise Turn Cycle
    this.turnCycleState = TurnCycleManager.advanceTurn(this.turnCycleState);
    this.state.activeFactionId = TurnCycleManager.getActiveFaction(this.turnCycleState);
    this.state.roundNumber = this.turnCycleState.roundNumber;

    // Check if match concluded (1 surviving faction remaining)
    const surviving = TurnCycleManager.getSurvivingFactions(this.turnCycleState);
    if (surviving.length <= 1) {
      this.state.phase = 'GAME_OVER';
      this.state.winnerFactionId = surviving[0] ?? currentFaction;
      this.broadcast('ARENA_CONCLUDED', {
        winnerFactionId: this.state.winnerFactionId,
        scores: Object.fromEntries(
          Object.entries(this.scoresState).map(([k, v]) => [k, v.totalScore])
        ),
      });
    }

    if (message.seqId) {
      client.send('MOVE_ACK', { seqId: message.seqId });
    }
  }

  private handleCommitSecretOrder(
    client: Client,
    message: IArenaSecretOrderMessage
  ): void {
    if (this.state.phase !== 'PLAYING') return;

    const player = this.state.players.get(client.sessionId);
    if (!player || !player.role.startsWith('FACTION_')) return;

    const factionId = player.role;
    if (this.turnCycleState.eliminatedFactions.has(factionId)) return;

    this.bufferedSecretOrders.set(factionId, {
      factionId,
      pieceId: message.pieceId,
      fromCoord: message.from,
      toCoord: message.to,
    });

    const surviving = TurnCycleManager.getSurvivingFactions(this.turnCycleState);

    // If all surviving factions committed, arbitrate simultaneously (RF-14-05, RNF-14-02)
    if (this.bufferedSecretOrders.size >= surviving.length) {
      this.resolveSimultaneousRound();
    }
  }

  private resolveSimultaneousRound(): void {
    const orders = Array.from(this.bufferedSecretOrders.values());
    const initialOccupancy: Record<string, string> = {};

    for (const ent of this.state.boardEntities.values()) {
      if (!ent.isCaptured && ent.position) {
        initialOccupancy[ent.position] = ent.id;
      }
    }

    const arbitration = SimultaneousResolutionEngine.arbitrateTurn(orders, initialOccupancy);

    // Apply executed moves
    for (const exec of arbitration.executedMoves) {
      const piece = this.state.boardEntities.get(exec.pieceId);
      if (piece) {
        piece.position = exec.toCoord;
        piece.hasMoved = true;
      }
    }

    // Bounced moves stay at fromCoord without state corruption
    this.bufferedSecretOrders.clear();
    this.state.roundNumber += 1;

    this.broadcast('SIMULTANEOUS_ROUND_RESOLVED', {
      roundNumber: this.state.roundNumber,
      bouncedCount: arbitration.bouncedMoves.length,
      executedCount: arbitration.executedMoves.length,
    });
  }

  private executeElimination(victimFactionId: string, conquerorFactionId?: string): void {
    const currentPieces: IArenaPiece[] = (
      Array.from(this.state.boardEntities.values()) as NetworkEntitySchema[]
    ).map((ent: NetworkEntitySchema) => ({
      id: ent.id,
      ownerFactionId: ent.ownerId,
      coordKey: ent.position,
    }));

    const result = EliminationManager.processElimination(
      this.eliminationPolicy,
      victimFactionId,
      currentPieces,
      conquerorFactionId
    );

    // Update board entities according to policy
    if (this.eliminationPolicy === 'EVAPORATION') {
      for (const ent of this.state.boardEntities.values()) {
        if (ent.ownerId === victimFactionId) {
          ent.isCaptured = true;
          ent.position = '';
        }
      }
    } else if (this.eliminationPolicy === 'CONQUEST' && conquerorFactionId) {
      for (const [pieceId, newOwner] of Object.entries(result.reassignedFactionIds)) {
        const ent = this.state.boardEntities.get(pieceId);
        if (ent) ent.ownerId = newOwner;
      }
    } else if (this.eliminationPolicy === 'GREY_OBSTACLES') {
      for (const ent of this.state.boardEntities.values()) {
        if (ent.ownerId === victimFactionId) {
          ent.ownerId = 'NEUTRAL_GREY';
        }
      }
    }

    this.turnCycleState = TurnCycleManager.eliminateFaction(
      this.turnCycleState,
      victimFactionId
    );
    this.state.eliminatedFactions.push(victimFactionId);
  }

  private update(): void {
    // 20 Hz tick simulation: delta sync performed automatically by Colyseus Schema
  }

  public getScores(): Readonly<Record<string, number>> {
    const map: Record<string, number> = {};
    for (const [f, s] of Object.entries(this.scoresState)) {
      map[f] = s.totalScore;
    }
    return map;
  }
}

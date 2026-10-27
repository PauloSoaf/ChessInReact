import { Room, Client } from 'colyseus';
import { ChessRoomStateSchema, NetworkEntitySchema, PlayerSchema } from '../schemas/RoomStateSchema';
import { TurnResolver } from './TurnResolver';
import { RateLimiter } from './RateLimiter';
import { verifyAuthToken, IAuthUser } from '../auth/jwtAuth';

export interface IChessRoomOptions {
  matchId?: string;
  token?: string;
  authToken?: string;
  spectatorMode?: boolean;
  maxClients?: number;
}

export interface IClientMoveMessage {
  from: string;
  to: string;
  pieceId: string;
  seqId?: number;
  clientTimestamp?: number;
}

export interface IPingMessage {
  clientSendTime?: number;
}

/**
 * Authoritative ChessRoom managing game lifecycle, anti-cheat, 20 ticks/sec simulation,
 * reconnection with 60s lease, and spectator channel separation.
 * Conforms to Spec 03 Sections 9, 16, 17.
 */
export class ChessRoom extends Room<ChessRoomStateSchema> {
  private turnResolver: TurnResolver = new TurnResolver();
  private rateLimiter: RateLimiter = new RateLimiter(10, 1000); // 10 msgs/s (RF-11)

  /**
   * Room initialization
   */
  public onCreate(options: IChessRoomOptions): void {
    const matchId = options.matchId || this.roomId;
    this.setState(new ChessRoomStateSchema({ matchId }));
    this.maxClients = options.maxClients || 20;

    // Fixed simulation loop: 20 ticks/second (50ms interval) - RNF-15
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 50);

    // Register command handlers
    this.onMessage('PLAYER_MOVE', (client: Client, message: IClientMoveMessage) => {
      this.handlePlayerMove(client, message);
    });

    this.onMessage('PING', (client: Client, message: IPingMessage) => {
      // Clock synchronization via Cristian's algorithm (RF-05, RF-13)
      client.send('PONG', {
        clientSendTime: message?.clientSendTime ?? Date.now(),
        serverReceiveTime: Date.now(),
      });
    });
  }

  /**
   * Cryptographic JWT validation on WebSocket handshake (RF-12, US03-D06).
   */
  public onAuth(_client: Client, options: IChessRoomOptions): IAuthUser {
    const token = options.token || options.authToken;
    if (!token) {
      throw new Error('Handshake rejected: Missing authentication token.');
    }

    try {
      return verifyAuthToken(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication rejected';
      throw new Error(`Handshake unauthorized: ${message}`);
    }
  }

  private getPlayers(): PlayerSchema[] {
    const list: PlayerSchema[] = [];
    this.state.players.forEach((p) => list.push(p));
    return list;
  }

  /**
   * Client joined the room.
   */
  public onJoin(client: Client, options?: IChessRoomOptions, auth?: IAuthUser): void {
    const playerId = auth?.playerId ?? client.sessionId;
    const username = auth?.username ?? 'Anonymous';

    // Determine slot role
    const existingPlayers = this.getPlayers();
    const hasWhite = existingPlayers.some((p) => p.role === 'WHITE');
    const hasBlack = existingPlayers.some((p) => p.role === 'BLACK');

    let role: string = 'SPECTATOR';
    if (!options?.spectatorMode && auth?.role !== 'SPECTATOR') {
      if (!hasWhite) {
        role = 'WHITE';
      } else if (!hasBlack) {
        role = 'BLACK';
      }
    }

    const player = new PlayerSchema({
      sessionId: client.sessionId,
      playerId,
      username,
      role,
      connected: true,
      ping: 0,
    });

    this.state.players.set(client.sessionId, player);

    // If both White and Black are present and game is waiting, start match
    if (this.state.phase === 'WAITING' && (role === 'WHITE' || role === 'BLACK')) {
      const updatedPlayers = this.getPlayers();
      const white = updatedPlayers.find((p) => p.role === 'WHITE');
      const black = updatedPlayers.find((p) => p.role === 'BLACK');

      if (white && black) {
        this.initializeBoard(white.playerId, black.playerId);
        this.state.phase = 'PLAYING';
        this.state.activePlayerId = white.playerId;
        this.broadcast('GAME_STARTED', {
          matchId: this.state.matchId,
          whitePlayerId: white.playerId,
          blackPlayerId: black.playerId,
        });
      }
    }
  }

  /**
   * Handles disconnections and 60-second reconnection window (RF-08, RF-09).
   */
  public async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.connected = false;

    if (consented) {
      // Voluntary exit / forfeit
      this.handlePlayerForfeit(player, 'Player voluntarily resigned.');
      this.state.players.delete(client.sessionId);
      this.rateLimiter.removeClient(client.sessionId);
      return;
    }

    // Network interruption: grant 60s reconnection lease (RF-08)
    this.broadcast('PLAYER_DISCONNECTED', {
      playerId: player.playerId,
      reconnectWindowSeconds: 60,
    });

    try {
      const reconnectedClient = await this.allowReconnection(client, 60);
      player.connected = true;
      player.sessionId = reconnectedClient.sessionId;
      this.broadcast('PLAYER_RECONNECTED', { playerId: player.playerId });
    } catch {
      // 60-second window expired without reconnect (RF-09)
      this.handlePlayerForfeit(player, 'Reconnection window expired (60s timeout).');
      this.state.players.delete(client.sessionId);
      this.rateLimiter.removeClient(client.sessionId);
    }
  }

  /**
   * Fixed 20-tick update simulation (RNF-15).
   */
  public update(deltaTime: number): void {
    if (this.state.phase !== 'PLAYING') return;

    this.state.turnTimeRemainingMs = Math.max(0, this.state.turnTimeRemainingMs - deltaTime);

    if (this.state.turnTimeRemainingMs <= 0) {
      // Timeout forfeiture (US03-P12)
      const timedOutPlayerId = this.state.activePlayerId;
      const opponent = this.getPlayers().find(
        (p) => (p.role === 'WHITE' || p.role === 'BLACK') && p.playerId !== timedOutPlayerId
      );

      this.state.phase = 'GAME_OVER';
      this.state.winnerId = opponent ? opponent.playerId : '';
      this.broadcast('GAME_OVER', {
        reason: 'TIMEOUT',
        timedOutPlayerId,
        winnerId: this.state.winnerId,
      });
    }
  }

  /**
   * Safe disposal of all timers and memory buffers (RNF-08).
   */
  public onDispose(): void {
    this.rateLimiter.clear();
  }

  /**
   * Processes player move with authoritative checks (Anti-Cheat & Validation).
   */
  private handlePlayerMove(client: Client, message: IClientMoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) {
      client.send('REJECT_MOVE', { reason: 'Unauthorized: Session not registered in room.' });
      return;
    }

    // 1. Spectator protection (RF-10, US03-P05)
    if (player.role === 'SPECTATOR') {
      client.send('REJECT_MOVE', {
        seqId: message?.seqId ?? 0,
        reason: 'Spectators are read-only and cannot execute moves.',
      });
      return;
    }

    // 2. Anti-DoS Rate Limiting (RF-11: max 10 msgs/s)
    if (!this.rateLimiter.checkRateLimit(client.sessionId)) {
      client.send('REJECT_MOVE', {
        seqId: message?.seqId ?? 0,
        reason: 'Rate limit exceeded: maximum 10 commands per second.',
      });
      return;
    }

    // 3. Move payload structure validation
    if (!message || typeof message.from !== 'string' || typeof message.to !== 'string' || typeof message.pieceId !== 'string') {
      client.send('REJECT_MOVE', {
        seqId: message?.seqId ?? 0,
        reason: 'Malformed move payload.',
      });
      return;
    }

    // 4. Authoritative execution via TurnResolver
    const resolution = this.turnResolver.executeSequentialMove(
      {
        playerId: player.playerId,
        pieceId: message.pieceId,
        from: message.from,
        to: message.to,
        seqId: Number(message.seqId) || 0,
        timestamp: Date.now(),
      },
      this.state
    );

    if (resolution.success) {
      // Send ACK to player
      client.send('MOVE_ACK', {
        seqId: resolution.seqId,
        pieceId: resolution.pieceId,
        from: resolution.from,
        to: resolution.to,
      });

      // Ephemeral sound / capture events (RF-14)
      if (resolution.capturedPieceId) {
        this.broadcast('PIECE_CAPTURED_EVENT', {
          capturedPieceId: resolution.capturedPieceId,
          atCoord: resolution.to,
          capturedBy: player.playerId,
        });
      }
    } else {
      // Server Authority Victory: Rollback instruction sent to client (RF-03)
      client.send('REJECT_MOVE', {
        seqId: message.seqId,
        reason: resolution.reason || 'Illegal move.',
      });
      client.send('FORCE_ROLLBACK', {
        seqId: message.seqId,
        reason: resolution.reason || 'Illegal move.',
      });
    }
  }

  private handlePlayerForfeit(player: PlayerSchema, reason: string): void {
    if (this.state.phase === 'PLAYING' && (player.role === 'WHITE' || player.role === 'BLACK')) {
      const winner = this.getPlayers().find(
        (p) => (p.role === 'WHITE' || p.role === 'BLACK') && p.playerId !== player.playerId
      );

      this.state.phase = 'GAME_OVER';
      this.state.winnerId = winner ? winner.playerId : '';
      this.broadcast('GAME_OVER', {
        reason: 'FORFEIT',
        forfeitedPlayerId: player.playerId,
        winnerId: this.state.winnerId,
        details: reason,
      });
    }
  }

  /**
   * Initializes standard chess board entities for a 1v1 match.
   */
  private initializeBoard(whiteId: string, blackId: string): void {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

    // White pieces
    for (let i = 0; i < files.length; i++) {
      const pId = `piece-w-p-${files[i]}`;
      this.state.boardEntities.set(
        pId,
        new NetworkEntitySchema({
          id: pId,
          entityType: 'PIECE',
          position: `${files[i]}2`,
          ownerId: whiteId,
          variantId: 'P',
        })
      );
    }
    const whiteMajors: [string, string][] = [
      ['a1', 'R'], ['b1', 'N'], ['c1', 'B'], ['d1', 'Q'],
      ['e1', 'K'], ['f1', 'B'], ['g1', 'N'], ['h1', 'R'],
    ];
    for (const [pos, variant] of whiteMajors) {
      const pId = `piece-w-${variant}-${pos}`;
      this.state.boardEntities.set(
        pId,
        new NetworkEntitySchema({
          id: pId,
          entityType: 'PIECE',
          position: pos,
          ownerId: whiteId,
          variantId: variant,
        })
      );
    }

    // Black pieces
    for (let i = 0; i < files.length; i++) {
      const pId = `piece-b-p-${files[i]}`;
      this.state.boardEntities.set(
        pId,
        new NetworkEntitySchema({
          id: pId,
          entityType: 'PIECE',
          position: `${files[i]}7`,
          ownerId: blackId,
          variantId: 'P',
        })
      );
    }
    const blackMajors: [string, string][] = [
      ['a8', 'R'], ['b8', 'N'], ['c8', 'B'], ['d8', 'Q'],
      ['e8', 'K'], ['f8', 'B'], ['g8', 'N'], ['h8', 'R'],
    ];
    for (const [pos, variant] of blackMajors) {
      const pId = `piece-b-${variant}-${pos}`;
      this.state.boardEntities.set(
        pId,
        new NetworkEntitySchema({
          id: pId,
          entityType: 'PIECE',
          position: pos,
          ownerId: blackId,
          variantId: variant,
        })
      );
    }
  }
}

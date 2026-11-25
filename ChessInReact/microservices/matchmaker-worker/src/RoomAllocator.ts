/**
 * ChessInReact - Matchmaker Worker: Room Allocator (Spec 08 § 6, § 7, RF-10)
 *
 * Allocates rooms on Colyseus and generates cryptographically signed JWT Match Ticket Tokens.
 */

import crypto from 'crypto';

export interface IMatchCandidate {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly eloRating: number;
}

export interface IRoomAllocationRequest {
  readonly variantId: string;
  readonly players: readonly IMatchCandidate[];
}

export interface IRoomAllocationResult {
  readonly roomId: string;
  readonly serverUrl: string;
  readonly playerAssignments: readonly {
    readonly userId: string;
    readonly factionIndex: number;
    readonly token: string;
  }[];
}

export class RoomAllocator {
  private readonly jwtSecret: string;
  private readonly serverUrl: string;

  public constructor(
    jwtSecret = process.env.JWT_SECRET || 'local_dev_secret_key_spec08',
    serverUrl = 'wss://chess-game-server.onrender.com'
  ) {
    this.jwtSecret = jwtSecret;
    this.serverUrl = serverUrl;
  }

  /**
   * Generates a tamper-proof signed JWT payload for the Colyseus handshake (Spec 08 § 7.1).
   */
  public generateTicketJwt(payload: {
    userId: string;
    matchId: string;
    elo: number;
    factionIndex: number;
    exp: number;
  }): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  /**
   * Allocates a room for the matched group and distributes signed tokens.
   */
  public allocateRoom(
    request: IRoomAllocationRequest,
    nowMs: number = Date.now()
  ): IRoomAllocationResult {
    const roomId = `room_${request.variantId.toLowerCase()}_${nowMs}_${Math.random().toString(36).slice(2, 7)}`;
    const expiresAt = nowMs + 30_000; // 30s ticket token validity

    const playerAssignments = request.players.map((p, idx) => {
      const token = this.generateTicketJwt({
        userId: p.userId,
        matchId: roomId,
        elo: p.eloRating,
        factionIndex: idx,
        exp: Math.floor(expiresAt / 1000),
      });

      return {
        userId: p.userId,
        factionIndex: idx,
        token,
      };
    });

    return {
      roomId,
      serverUrl: this.serverUrl,
      playerAssignments,
    };
  }
}

/**
 * ChessInReact - Stateful Game Server Room Authority & onAuth Handshake (Spec 08 § 7.1, Acceptance Criteria 3)
 *
 * Implements Colyseus Room handshake security:
 * - Validates HMAC-SHA256 JWT signature.
 * - Confirms ticket belongs specifically to this roomId.
 * - Prevents multi-tab connection hijack on the same seat.
 * - Protects CPU from unauthorized WSS upgrade floods.
 */

import crypto from 'crypto';

export interface IClientConnection {
  readonly id: string;
  userData?: {
    userId: string;
    elo: number;
    factionIndex: number;
  };
}

export interface IAuthOptions {
  readonly matchTicket?: string;
}

export class ChessRoom {
  public readonly roomId: string;
  private readonly jwtSecret: string;
  private readonly connectedUsers = new Set<string>();

  public constructor(
    roomId: string,
    jwtSecret: string = process.env.JWT_SECRET || 'local_dev_secret_key_spec08'
  ) {
    this.roomId = roomId;
    this.jwtSecret = jwtSecret;
  }

  /**
   * Verifies JWT ticket token signature and payload claims.
   */
  public verifyToken(token: string): { userId: string; matchId: string; elo: number; factionIndex: number } | null {
    try {
      const [headerB64, bodyB64, signature] = token.split('.');
      if (!headerB64 || !bodyB64 || !signature) {
        return null;
      }

      const expectedSig = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${headerB64}.${bodyB64}`)
        .digest('base64url');

      if (signature !== expectedSig) {
        return null; // Signature mismatch
      }

      const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));

      // Check expiration
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired token
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Colyseus onAuth handshake hook (Spec 08 § 7.1).
   * Rejects connection early at the TCP/HTTP upgrade phase if unauthorized.
   */
  public async onAuth(
    client: IClientConnection,
    options: IAuthOptions
  ): Promise<{ userId: string; elo: number; factionIndex: number } | false> {
    const token = options.matchTicket;
    if (!token) {
      return false; // Connection rejected: missing auth ticket
    }

    const payload = this.verifyToken(token);
    if (!payload) {
      return false; // Invalid token or forged signature
    }

    // Verify room alignment
    if (payload.matchId !== this.roomId) {
      return false; // Wrong Room Ticket
    }

    // Anti-duplicate session: prevent same user in 2 tabs on the same seat
    if (this.connectedUsers.has(payload.userId)) {
      return false; // Already connected
    }

    this.connectedUsers.add(payload.userId);
    client.userData = {
      userId: payload.userId,
      elo: payload.elo,
      factionIndex: payload.factionIndex,
    };

    return client.userData;
  }

  public onLeave(userId: string): void {
    this.connectedUsers.delete(userId);
  }

  public getConnectedUserCount(): number {
    return this.connectedUsers.size;
  }
}


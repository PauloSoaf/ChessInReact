/**
 * ChessInReact - Stateless Matchmaker API Controller (Spec 08 § 2, § 5, § 6, US08-D01)
 */

import {
  IJoinQueueRequest,
  IMatchTicket,
  ICreateLobbyRequest,
} from '../../../../src/matchmaking/interfaces/IMatchmakingContracts';
import { MatchmakerRateLimiter } from '../../../../src/matchmaking/engine/MatchmakerRateLimiter';
import { LobbyManager } from '../../../../src/matchmaking/engine/LobbyManager';

export interface IHttpRequest {
  readonly ip: string;
  readonly userId?: string;
  readonly body: Record<string, unknown>;
  readonly params?: Record<string, string>;
  readonly query?: Record<string, string>;
}

export interface IHttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Record<string, string>;
}

export class MatchmakerController {
  private readonly rateLimiter: MatchmakerRateLimiter;
  private readonly lobbyManager: LobbyManager;
  private readonly queueStorage = new Map<string, IMatchTicket>(); // Simulating Redis Sorted Set / Hash

  public constructor(
    rateLimiter = new MatchmakerRateLimiter({ maxRequests: 2, windowMs: 1000 }),
    lobbyManager = new LobbyManager()
  ) {
    this.rateLimiter = rateLimiter;
    this.lobbyManager = lobbyManager;
  }

  /**
   * POST /api/matchmaking/join (Spec 08 § 6)
   */
  public handleJoinQueue(req: IHttpRequest, nowMs: number = Date.now()): IHttpResponse {
    const clientKey = req.userId ?? req.ip;
    const rateCheck = this.rateLimiter.consume(clientKey, nowMs);

    if (!rateCheck.allowed) {
      return {
        status: 429,
        body: {
          error: 'Rate limit exceeded. Maximum 2 requests per second.',
          retryAfterMs: rateCheck.resetMs,
        },
        headers: {
          'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)),
        },
      };
    }

    const payload = req.body as unknown as IJoinQueueRequest;
    if (!payload.userId || !payload.variantId) {
      return {
        status: 400,
        body: { error: 'Missing required fields: userId and variantId are mandatory.' },
      };
    }

    const ticketId = `ticket_${payload.userId}_${nowMs}`;
    const ticket: IMatchTicket = {
      ticketId,
      userId: payload.userId,
      displayName: payload.displayName || payload.userId,
      eloRating: payload.eloRating ?? 1500,
      ratingDeviation: 350,
      variantId: payload.variantId,
      topology: payload.topology ?? 'SQUARE_8X8',
      playerCount: payload.playerCount ?? 2,
      createdAtTimestamp: nowMs,
      lastHeartbeatTimestamp: nowMs,
      ttlSeconds: 30,
    };

    this.queueStorage.set(ticketId, ticket);

    return {
      status: 200,
      body: {
        success: true,
        ticket,
      },
    };
  }

  /**
   * POST /api/matchmaking/leave (Spec 08 § 6)
   */
  public handleLeaveQueue(req: IHttpRequest): IHttpResponse {
    const ticketId = req.body.ticketId as string | undefined;
    if (!ticketId) {
      return { status: 400, body: { error: 'Missing ticketId' } };
    }

    const existed = this.queueStorage.delete(ticketId);
    return {
      status: 200,
      body: { success: true, removed: existed },
    };
  }

  /**
   * POST /api/matchmaking/ping (Spec 08 § 9.1 Heartbeat / Zombie prevention)
   */
  public handleHeartbeat(req: IHttpRequest, nowMs: number = Date.now()): IHttpResponse {
    const ticketId = req.body.ticketId as string | undefined;
    if (!ticketId) {
      return { status: 400, body: { error: 'Missing ticketId' } };
    }

    const ticket = this.queueStorage.get(ticketId);
    if (!ticket) {
      return { status: 404, body: { error: 'Ticket expired or not found' } };
    }

    const updated: IMatchTicket = {
      ...ticket,
      lastHeartbeatTimestamp: nowMs,
    };
    this.queueStorage.set(ticketId, updated);

    return {
      status: 200,
      body: { success: true, refreshedAt: nowMs },
    };
  }

  /**
   * GET /api/lobbies (Spec 08 § 4, § 14.1 US08-P04)
   */
  public handleGetLobbies(): IHttpResponse {
    const lobbies = this.lobbyManager.listPublicLobbies();
    return {
      status: 200,
      body: { lobbies },
    };
  }

  /**
   * POST /api/lobbies/create (Spec 08 § 14.1 US08-P05, US08-P10)
   */
  public handleCreateLobby(req: IHttpRequest, nowMs: number = Date.now()): IHttpResponse {
    const payload = req.body as unknown as ICreateLobbyRequest;
    if (!payload.hostId || !payload.title || !payload.variantId) {
      return {
        status: 400,
        body: { error: 'Missing required lobby configuration fields.' },
      };
    }

    const lobby = this.lobbyManager.createLobby(payload, nowMs);
    return {
      status: 201,
      body: { success: true, lobby },
    };
  }

  /**
   * POST /api/lobbies/join
   */
  public handleJoinLobby(req: IHttpRequest): IHttpResponse {
    const lobbyId = req.body.lobbyId as string | undefined;
    const userId = req.body.userId as string | undefined;
    const displayName = req.body.displayName as string | undefined;
    const passcode = req.body.passcode as string | undefined;
    if (!lobbyId || !userId) {
      return { status: 400, body: { error: 'Missing lobbyId or userId' } };
    }

    const result = this.lobbyManager.joinLobby(
      lobbyId,
      { userId, displayName: displayName || userId },
      passcode
    );
    if (!result.success) {
      return { status: 403, body: { error: result.error } };
    }

    return {
      status: 200,
      body: { success: true, lobby: result.lobby },
    };
  }
}

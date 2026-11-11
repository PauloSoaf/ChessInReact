import jwt from 'jsonwebtoken';
import { 
  IMatchTicket, 
  IMatchFoundPayload, 
  IJoinQueueRequest 
} from '../interfaces/IMatchmakingContracts';

export interface IMatchmakingConfig {
  readonly initialTolerance: number;
  readonly expansionStep: number;
  readonly expansionIntervalMs: number;
  readonly maxTolerance: number;
  readonly heartbeatTimeoutMs: number;
  readonly tokenTtlSeconds: number;
  readonly serverUrl: string;
}

export const DEFAULT_MATCHMAKING_CONFIG: IMatchmakingConfig = {
  initialTolerance: 50,
  expansionStep: 50,
  expansionIntervalMs: 15_000,
  maxTolerance: 350,
  heartbeatTimeoutMs: 15_000,
  tokenTtlSeconds: 30,
  serverUrl: 'wss://chess-game-server.onrender.com',
};

export class MatchmakingQueueEngine {
  private readonly config: IMatchmakingConfig;
  private readonly tickets = new Map<string, IMatchTicket>();
  private readonly userActiveTicket = new Map<string, string>(); // userId -> ticketId
  private readonly jwtSecret: string;

  public constructor(
    jwtSecret = 'test-isolated-jwt-secret-do-not-use-in-prod-min-32-chars-long',
    config: Partial<IMatchmakingConfig> = {}
  ) {
    this.jwtSecret = jwtSecret;
    this.config = { ...DEFAULT_MATCHMAKING_CONFIG, ...config };
  }

  /**
   * Generates a unique Ticket ID
   */
  private generateTicketId(): string {
    return `tkt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generates a unique Room ID
   */
  private generateRoomId(variantId: string): string {
    return `room_${variantId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Enqueues a player with anti-duplication enforcement (RF-01, RF-12).
   * If user already has an active ticket, cancels the previous one first.
   */
  public joinQueue(request: IJoinQueueRequest, now: number = Date.now()): IMatchTicket {
    // Prevent duplicate queue entries for the same user
    const existingTicketId = this.userActiveTicket.get(request.userId);
    if (existingTicketId) {
      this.leaveQueue(existingTicketId);
    }

    const ticketId = this.generateTicketId();
    const ticket: IMatchTicket = {
      ticketId,
      userId: request.userId,
      displayName: request.displayName,
      eloRating: request.eloRating,
      ratingDeviation: 50,
      variantId: request.variantId,
      topology: request.topology ?? 'SQUARE',
      playerCount: request.playerCount ?? 2,
      createdAtTimestamp: now,
      lastHeartbeatTimestamp: now,
      ttlSeconds: this.config.tokenTtlSeconds,
    };

    this.tickets.set(ticketId, ticket);
    this.userActiveTicket.set(request.userId, ticketId);

    return ticket;
  }

  /**
   * Cancels and removes a ticket from the queue (US08-P02).
   */
  public leaveQueue(ticketId: string): boolean {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return false;
    }

    this.tickets.delete(ticketId);
    this.userActiveTicket.delete(ticket.userId);
    return true;
  }

  /**
   * Receives heartbeat ping to prevent zombie timeouts (RF-05, US08-D03).
   */
  public heartbeat(ticketId: string, now: number = Date.now()): boolean {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) {
      return false;
    }

    const updatedTicket: IMatchTicket = {
      ...ticket,
      lastHeartbeatTimestamp: now,
    };
    this.tickets.set(ticketId, updatedTicket);
    return true;
  }

  /**
   * Purges zombie tickets whose heartbeat timed out (> 15 seconds) (RF-05, § 9.1).
   */
  public purgeExpiredTickets(now: number = Date.now()): number {
    let purgedCount = 0;
    for (const [ticketId, ticket] of Array.from(this.tickets.entries())) {
      if (now - ticket.lastHeartbeatTimestamp > this.config.heartbeatTimeoutMs) {
        this.tickets.delete(ticketId);
        this.userActiveTicket.delete(ticket.userId);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  /**
   * Calculates dynamic Elo tolerance based on wait time in queue (RF-03).
   * Tolerances expand every 15 seconds (e.g., 50 -> 100 -> 150... up to maxTolerance).
   */
  public calculateTolerance(waitMs: number): number {
    const intervals = Math.floor(waitMs / this.config.expansionIntervalMs);
    const tolerance = this.config.initialTolerance + intervals * this.config.expansionStep;
    return Math.min(this.config.maxTolerance, tolerance);
  }

  /**
   * Returns current active ticket count.
   */
  public getQueueSize(): number {
    return this.tickets.size;
  }

  /**
   * Returns a ticket by its ID.
   */
  public getTicket(ticketId: string): IMatchTicket | undefined {
    return this.tickets.get(ticketId);
  }

  /**
   * Evaluates queues and forms matches (RF-02, RF-04, RF-08, RNF-12).
   * Guarantees 0% double-matching through atomic ticket consumption.
   */
  public processQueue(now: number = Date.now()): IMatchFoundPayload[] {
    const matches: IMatchFoundPayload[] = [];

    // Group tickets by (variantId + playerCount)
    const queuesByVariant = new Map<string, IMatchTicket[]>();
    for (const ticket of this.tickets.values()) {
      const key = `${ticket.variantId}_${ticket.playerCount}`;
      const list = queuesByVariant.get(key) ?? [];
      list.push(ticket);
      queuesByVariant.set(key, list);
    }

    for (const queueTickets of queuesByVariant.values()) {
      // Sort tickets by waiting time (FIFO) then rating
      queueTickets.sort((a, b) => a.createdAtTimestamp - b.createdAtTimestamp);

      const matchedInCurrentQueue = new Set<string>();

      for (let i = 0; i < queueTickets.length; i++) {
        const primary = queueTickets[i];
        if (matchedInCurrentQueue.has(primary.ticketId)) {
          continue;
        }

        const waitTime = now - primary.createdAtTimestamp;
        const tolerance = this.calculateTolerance(waitTime);
        const group: IMatchTicket[] = [primary];

        // Search compatible opponents within tolerance
        for (let j = 0; j < queueTickets.length && group.length < primary.playerCount; j++) {
          if (i === j) continue;
          const candidate = queueTickets[j];
          if (matchedInCurrentQueue.has(candidate.ticketId)) {
            continue;
          }

          const candidateWait = now - candidate.createdAtTimestamp;
          const candidateTolerance = this.calculateTolerance(candidateWait);
          const effectiveTolerance = Math.max(tolerance, candidateTolerance);

          const eloDiff = Math.abs(primary.eloRating - candidate.eloRating);
          if (eloDiff <= effectiveTolerance) {
            group.push(candidate);
          }
        }

        // If a full tuple is formed
        if (group.length === primary.playerCount) {
          const matchId = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const roomId = this.generateRoomId(primary.variantId);
          const expiresAt = now + this.config.tokenTtlSeconds * 1000;

          // Consume tickets atomically
          for (let factionIdx = 0; factionIdx < group.length; factionIdx++) {
            const playerTicket = group[factionIdx];
            matchedInCurrentQueue.add(playerTicket.ticketId);
            this.tickets.delete(playerTicket.ticketId);
            this.userActiveTicket.delete(playerTicket.userId);

            // Generate signed JWT token (Spec 08 § 7.1, § 13.1 #6)
            const tokenPayload = {
              matchId,
              roomId,
              userId: playerTicket.userId,
              factionIndex: factionIdx,
              elo: playerTicket.eloRating,
            };

            const matchTicketToken = jwt.sign(tokenPayload, this.jwtSecret, {
              expiresIn: this.config.tokenTtlSeconds,
              issuer: 'chessinreact-matchmaker',
              audience: 'chessinreact-game-server',
            });

            matches.push({
              matchId,
              roomId,
              serverUrl: this.config.serverUrl,
              assignedPlayerId: playerTicket.userId,
              factionIndex: factionIdx,
              matchTicketToken,
              expiresAt,
            });
          }
        }
      }
    }

    return matches;
  }
}

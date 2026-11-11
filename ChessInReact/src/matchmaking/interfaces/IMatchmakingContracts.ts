/**
 * ChessInReact - Matchmaking & Lobbies Type Contracts (Spec 08 § 19)
 */

export interface IMatchTicket {
  readonly ticketId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly eloRating: number;
  readonly ratingDeviation: number;
  readonly variantId: string;
  readonly topology: string;
  readonly playerCount: number; // 2, 3, 4, 6, 8
  readonly createdAtTimestamp: number;
  readonly lastHeartbeatTimestamp: number;
  readonly ttlSeconds: number;
}

export interface IMatchFoundPayload {
  readonly matchId: string;
  readonly roomId: string;
  readonly serverUrl: string; // Ex: wss://chess-game-server.onrender.com
  readonly assignedPlayerId: string;
  readonly factionIndex: number;
  readonly matchTicketToken: string; // JWT assinado válido por 30s
  readonly expiresAt: number;
}

export interface ILobbySummary {
  readonly lobbyId: string;
  readonly joinCode: string; // Ex: HEX-8841 ou 6-char alfanumérico
  readonly title: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly variantId: string;
  readonly currentPlayers: number;
  readonly maxPlayers: number;
  readonly isPrivate: boolean;
  readonly passcode?: string;
  readonly timeControlSeconds: number;
  readonly createdAt: number;
  readonly lastActivityAt: number;
}

export interface IJoinQueueRequest {
  readonly userId: string;
  readonly displayName: string;
  readonly eloRating: number;
  readonly variantId: string;
  readonly topology?: string;
  readonly playerCount?: number;
  readonly timeControlSeconds?: number;
  readonly isRanked?: boolean;
}

export interface ICreateLobbyRequest {
  readonly hostId: string;
  readonly hostName: string;
  readonly title: string;
  readonly variantId: string;
  readonly maxPlayers: number;
  readonly isPrivate?: boolean;
  readonly passcode?: string;
  readonly timeControlSeconds?: number;
}


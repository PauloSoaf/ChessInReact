import { ILobbySummary, ICreateLobbyRequest } from '../interfaces/IMatchmakingContracts';

export class LobbyManager {
  private readonly lobbies = new Map<string, ILobbySummary>();
  private readonly codeIndex = new Map<string, string>(); // joinCode -> lobbyId
  private readonly lobbyMembers = new Map<string, Set<string>>(); // lobbyId -> Set of userIds

  /**
   * Generates a 6-character alphanumeric join code (e.g. "HEX-8841" or "F9A2B4")
   */
  private generateJoinCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Creates a public or private lobby (RF-06, US08-P05).
   */
  public createLobby(request: ICreateLobbyRequest, now: number = Date.now()): ILobbySummary {
    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const joinCode = this.generateJoinCode();

    const lobby: ILobbySummary = {
      lobbyId,
      joinCode,
      title: request.title,
      hostId: request.hostId,
      hostName: request.hostName,
      variantId: request.variantId,
      currentPlayers: 1,
      maxPlayers: request.maxPlayers,
      isPrivate: !!request.isPrivate,
      passcode: request.passcode,
      timeControlSeconds: request.timeControlSeconds ?? 300,
      createdAt: now,
      lastActivityAt: now,
    };

    this.lobbies.set(lobbyId, lobby);
    this.codeIndex.set(joinCode.toUpperCase(), lobbyId);

    const members = new Set<string>();
    members.add(request.hostId);
    this.lobbyMembers.set(lobbyId, members);

    return lobby;
  }

  /**
   * Finds a lobby by ID or Join Code.
   */
  public getLobby(lobbyIdOrCode: string): ILobbySummary | undefined {
    const id = this.codeIndex.get(lobbyIdOrCode.toUpperCase()) ?? lobbyIdOrCode;
    return this.lobbies.get(id);
  }

  /**
   * Joins an existing lobby (RF-06, RF-07).
   */
  public joinLobby(
    lobbyIdOrCode: string,
    user: { userId: string; displayName: string },
    passcode?: string,
    now: number = Date.now()
  ): { success: boolean; lobby?: ILobbySummary; error?: string } {
    const lobby = this.getLobby(lobbyIdOrCode);
    if (!lobby) {
      return { success: false, error: 'Sala não encontrada.' };
    }

    if (lobby.currentPlayers >= lobby.maxPlayers) {
      return { success: false, error: 'A sala está cheia.' };
    }

    if (lobby.isPrivate && lobby.passcode && lobby.passcode !== passcode) {
      return { success: false, error: 'Senha de acesso incorreta.' };
    }

    const members = this.lobbyMembers.get(lobby.lobbyId) ?? new Set<string>();
    if (members.has(user.userId)) {
      return { success: true, lobby }; // Already in lobby
    }

    members.add(user.userId);
    this.lobbyMembers.set(lobby.lobbyId, members);

    const updatedLobby: ILobbySummary = {
      ...lobby,
      currentPlayers: members.size,
      lastActivityAt: now,
    };
    this.lobbies.set(lobby.lobbyId, updatedLobby);

    return { success: true, lobby: updatedLobby };
  }

  /**
   * Leaves a lobby. If empty, the lobby is automatically deleted.
   */
  public leaveLobby(lobbyId: string, userId: string): { success: boolean; closed: boolean } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return { success: false, closed: false };
    }

    const members = this.lobbyMembers.get(lobbyId);
    if (!members || !members.has(userId)) {
      return { success: false, closed: false };
    }

    members.delete(userId);

    if (members.size === 0) {
      this.lobbies.delete(lobbyId);
      this.codeIndex.delete(lobby.joinCode.toUpperCase());
      this.lobbyMembers.delete(lobbyId);
      return { success: true, closed: true };
    }

    const updatedLobby: ILobbySummary = {
      ...lobby,
      currentPlayers: members.size,
      lastActivityAt: Date.now(),
    };
    this.lobbies.set(lobbyId, updatedLobby);

    return { success: true, closed: false };
  }

  /**
   * Returns list of public lobbies available for joining (RF-07).
   */
  public listPublicLobbies(filters?: { variantId?: string }): ILobbySummary[] {
    const result: ILobbySummary[] = [];
    for (const lobby of this.lobbies.values()) {
      if (!lobby.isPrivate && lobby.currentPlayers < lobby.maxPlayers) {
        if (!filters?.variantId || lobby.variantId === filters.variantId) {
          result.push(lobby);
        }
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Purges inactive lobbies that have been idle for longer than maxIdleMs (RF-15).
   * Default: 10 minutes (600_000 ms).
   */
  public purgeInactiveLobbies(now: number = Date.now(), maxIdleMs: number = 600_000): number {
    let purgedCount = 0;
    for (const [lobbyId, lobby] of Array.from(this.lobbies.entries())) {
      if (now - lobby.lastActivityAt > maxIdleMs) {
        this.lobbies.delete(lobbyId);
        this.codeIndex.delete(lobby.joinCode.toUpperCase());
        this.lobbyMembers.delete(lobbyId);
        purgedCount++;
      }
    }
    return purgedCount;
  }
}


import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { MatchmakingQueueEngine } from '../engine/MatchmakingQueueEngine';
import { LobbyManager } from '../engine/LobbyManager';

const TEST_SECRET = 'test-isolated-jwt-secret-do-not-use-in-prod-min-32-chars-long';

describe('Spec 08 - MatchmakingQueueEngine (RF-01, RF-02, RF-03, RF-04, RF-05, RF-08, RF-12)', () => {
  it('enforces mandatory JWT secret configuration and rejects insecure secrets (P1 Security)', () => {
    // Missing secret
    expect(() => new MatchmakingQueueEngine(undefined)).toThrowError(/Missing required JWT secret/);

    // Short secret (< 32 chars)
    expect(() => new MatchmakingQueueEngine('short-secret-123')).toThrowError(/Insecure JWT secret: minimum length is 32 characters/);

    // Valid secret succeeds
    expect(() => new MatchmakingQueueEngine(TEST_SECRET)).not.toThrow();
  });

  it('creates tickets with unique ticketId and initial Elo configuration (RF-01)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    const ticket = engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1550,
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    expect(ticket.ticketId).toBeDefined();
    expect(ticket.userId).toBe('user_alice');
    expect(ticket.eloRating).toBe(1550);
    expect(ticket.playerCount).toBe(2);
    expect(ticket.createdAtTimestamp).toBe(now);
    expect(engine.getQueueSize()).toBe(1);
  });

  it('enforces anti-duplication: replaces previous ticket if user joins again (RF-12)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    const ticket1 = engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1550,
      variantId: 'CLASSIC',
    }, now);

    const ticket2 = engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1600,
      variantId: 'HEX',
    }, now + 1000);

    expect(engine.getQueueSize()).toBe(1);
    expect(engine.getTicket(ticket1.ticketId)).toBeUndefined();
    expect(engine.getTicket(ticket2.ticketId)?.eloRating).toBe(1600);
  });

  it('allows players to leave queue cleanly (US08-P02)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const ticket = engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1500,
      variantId: 'CLASSIC',
    });

    expect(engine.getQueueSize()).toBe(1);
    const left = engine.leaveQueue(ticket.ticketId);
    expect(left).toBe(true);
    expect(engine.getQueueSize()).toBe(0);
  });

  it('purges zombie tickets when heartbeat times out (> 15s) (RF-05, § 9.1)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    const tktAlice = engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1500,
      variantId: 'CLASSIC',
    }, now);

    const tktBob = engine.joinQueue({
      userId: 'user_bob',
      displayName: 'Bob',
      eloRating: 1520,
      variantId: 'CLASSIC',
    }, now);

    // Bob sends heartbeat at now + 10s
    engine.heartbeat(tktBob.ticketId, now + 10000);

    // At now + 16s: Alice hasn't pinged in 16s (> 15s timeout), Bob pinged 6s ago
    const purged = engine.purgeExpiredTickets(now + 16000);
    expect(purged).toBe(1);
    expect(engine.getTicket(tktAlice.ticketId)).toBeUndefined();
    expect(engine.getTicket(tktBob.ticketId)).toBeDefined();
    expect(engine.getQueueSize()).toBe(1);
  });

  it('expands dynamic Elo tolerance over wait time (RF-03)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);

    // Wait = 0s -> initial tolerance 50
    expect(engine.calculateTolerance(0)).toBe(50);
    // Wait = 14s -> still initial 50
    expect(engine.calculateTolerance(14000)).toBe(50);
    // Wait = 15s -> 50 + 50 = 100
    expect(engine.calculateTolerance(15000)).toBe(100);
    // Wait = 30s -> 50 + 100 = 150
    expect(engine.calculateTolerance(30000)).toBe(150);
    // Wait = 120s -> capped at maxTolerance (350)
    expect(engine.calculateTolerance(120000)).toBe(350);
  });

  it('matches 2 players with close Elo ratings and issues valid signed JWT tokens (RF-02, RF-08)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1500,
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    engine.joinQueue({
      userId: 'user_bob',
      displayName: 'Bob',
      eloRating: 1530, // Diff 30 <= tolerance 50
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    const matches = engine.processQueue(now);
    expect(matches).toHaveLength(2); // 2 players matched into 1 room

    expect(matches[0].matchId).toBe(matches[1].matchId);
    expect(matches[0].roomId).toBe(matches[1].roomId);
    expect(matches[0].assignedPlayerId).toBe('user_alice');
    expect(matches[0].factionIndex).toBe(0);
    expect(matches[1].assignedPlayerId).toBe('user_bob');
    expect(matches[1].factionIndex).toBe(1);

    // Verify cryptographic JWT token signature
    const decoded0 = jwt.verify(matches[0].matchTicketToken, TEST_SECRET) as jwt.JwtPayload & {
      userId: string;
      roomId: string;
      factionIndex: number;
    };
    expect(decoded0.userId).toBe('user_alice');
    expect(decoded0.roomId).toBe(matches[0].roomId);
    expect(decoded0.factionIndex).toBe(0);

    // Queue is consumed atomically
    expect(engine.getQueueSize()).toBe(0);
  });

  it('delays match until dynamic Elo window expands enough to bridge rating difference (RF-03)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    engine.joinQueue({
      userId: 'user_alice',
      displayName: 'Alice',
      eloRating: 1500,
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    engine.joinQueue({
      userId: 'user_charlie',
      displayName: 'Charlie',
      eloRating: 1620, // Diff = 120 > initial 50
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    // At now: tolerance is 50 -> diff 120 -> no match
    const matchesAtT0 = engine.processQueue(now);
    expect(matchesAtT0).toHaveLength(0);
    expect(engine.getQueueSize()).toBe(2);

    // At now + 30s: tolerance expands to 150 >= 120 -> match forms!
    const matchesAtT30 = engine.processQueue(now + 30000);
    expect(matchesAtT30).toHaveLength(2);
    expect(engine.getQueueSize()).toBe(0);
  });

  it('matches 4-player multiplayer variants (Hex 4-Player FFA) (RF-04)', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    for (let i = 1; i <= 4; i++) {
      engine.joinQueue({
        userId: `user_${i}`,
        displayName: `Player ${i}`,
        eloRating: 1500 + i * 5,
        variantId: 'HEX_4P',
        playerCount: 4,
      }, now);
    }

    const matches = engine.processQueue(now);
    expect(matches).toHaveLength(4);
    const factionIndexes = matches.map(m => m.factionIndex).sort();
    expect(factionIndexes).toEqual([0, 1, 2, 3]);
    expect(engine.getQueueSize()).toBe(0);
  });

  it('keeps queues of distinct variants isolated from each other', () => {
    const engine = new MatchmakingQueueEngine(TEST_SECRET);
    const now = 1000000;

    engine.joinQueue({
      userId: 'user_1',
      displayName: 'Player 1',
      eloRating: 1500,
      variantId: 'CLASSIC',
      playerCount: 2,
    }, now);

    engine.joinQueue({
      userId: 'user_2',
      displayName: 'Player 2',
      eloRating: 1500,
      variantId: 'HEX',
      playerCount: 2,
    }, now);

    const matches = engine.processQueue(now);
    expect(matches).toHaveLength(0);
    expect(engine.getQueueSize()).toBe(2);
  });
});

describe('Spec 08 - LobbyManager (RF-06, RF-07, RF-15)', () => {
  it('creates public lobbies with 6-character join codes and lists them (RF-06, RF-07)', () => {
    const manager = new LobbyManager();
    const lobby = manager.createLobby({
      hostId: 'host_1',
      hostName: 'GrandMaster',
      title: 'Arena Amistosa',
      variantId: 'CLASSIC',
      maxPlayers: 2,
      isPrivate: false,
    });

    expect(lobby.lobbyId).toBeDefined();
    expect(lobby.joinCode).toHaveLength(6);
    expect(lobby.currentPlayers).toBe(1);

    const publicLobbies = manager.listPublicLobbies();
    expect(publicLobbies).toHaveLength(1);
    expect(publicLobbies[0].title).toBe('Arena Amistosa');
  });

  it('allows players to join via code and enforces maxPlayers capacity', () => {
    const manager = new LobbyManager();
    const lobby = manager.createLobby({
      hostId: 'host_1',
      hostName: 'HostPlayer',
      title: 'Duelo Rápido',
      variantId: 'CLASSIC',
      maxPlayers: 2,
    });

    const joinRes = manager.joinLobby(lobby.joinCode, {
      userId: 'user_guest',
      displayName: 'GuestPlayer',
    });
    expect(joinRes.success).toBe(true);
    expect(joinRes.lobby?.currentPlayers).toBe(2);

    // Third player cannot join full lobby
    const fullRes = manager.joinLobby(lobby.joinCode, {
      userId: 'user_extra',
      displayName: 'ExtraPlayer',
    });
    expect(fullRes.success).toBe(false);
    expect(fullRes.error).toBe('A sala está cheia.');
  });

  it('enforces passcode verification for private lobbies', () => {
    const manager = new LobbyManager();
    const lobby = manager.createLobby({
      hostId: 'host_1',
      hostName: 'HostPlayer',
      title: 'Sala Secreta',
      variantId: 'CLASSIC',
      maxPlayers: 2,
      isPrivate: true,
      passcode: 'topsecret',
    });

    // Private lobbies do not appear in public listing
    expect(manager.listPublicLobbies()).toHaveLength(0);

    // Wrong passcode rejected
    const wrongRes = manager.joinLobby(lobby.joinCode, { userId: 'u2', displayName: 'P2' }, 'wrong');
    expect(wrongRes.success).toBe(false);
    expect(wrongRes.error).toBe('Senha de acesso incorreta.');

    // Correct passcode admitted
    const correctRes = manager.joinLobby(lobby.joinCode, { userId: 'u2', displayName: 'P2' }, 'topsecret');
    expect(correctRes.success).toBe(true);
  });

  it('deletes lobby when all players leave', () => {
    const manager = new LobbyManager();
    const lobby = manager.createLobby({
      hostId: 'host_1',
      hostName: 'HostPlayer',
      title: 'Sala Temporária',
      variantId: 'CLASSIC',
      maxPlayers: 2,
    });

    const leaveRes = manager.leaveLobby(lobby.lobbyId, 'host_1');
    expect(leaveRes.success).toBe(true);
    expect(leaveRes.closed).toBe(true);
    expect(manager.getLobby(lobby.lobbyId)).toBeUndefined();
  });

  it('purges idle lobbies older than 10 minutes (RF-15)', () => {
    const manager = new LobbyManager();
    const now = 1000000;

    manager.createLobby({
      hostId: 'host_1',
      hostName: 'HostPlayer',
      title: 'Sala Inativa',
      variantId: 'CLASSIC',
      maxPlayers: 2,
    }, now);

    // 5 minutes later: not purged
    expect(manager.purgeInactiveLobbies(now + 300000)).toBe(0);

    // 11 minutes later (> 10m): purged
    expect(manager.purgeInactiveLobbies(now + 660000)).toBe(1);
    expect(manager.listPublicLobbies()).toHaveLength(0);
  });
});

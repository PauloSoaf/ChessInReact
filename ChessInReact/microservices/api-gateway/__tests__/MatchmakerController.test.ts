import { describe, it, expect, beforeEach } from 'vitest';
import { MatchmakerController } from '../src/controllers/MatchmakerController';
import { createMatchmakerRouter } from '../src/routes/matchmaker';

describe('Spec 08 - API Gateway Matchmaker Controller (Spec 08 § 2, § 5, § 6, US08-D01)', () => {
  let controller: MatchmakerController;
  let router: ReturnType<typeof createMatchmakerRouter>;

  beforeEach(() => {
    controller = new MatchmakerController();
    router = createMatchmakerRouter(controller);
  });

  it('handles valid queue join request and returns match ticket', () => {
    const res = router.dispatch('POST', '/api/matchmaking/join', {
      ip: '127.0.0.1',
      userId: 'user-alice',
      body: {
        userId: 'user-alice',
        displayName: 'Alice',
        eloRating: 1650,
        variantId: 'STANDARD_CHESS',
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ticket.userId).toBe('user-alice');
    expect(res.body.ticket.eloRating).toBe(1650);
    expect(res.body.ticket.ttlSeconds).toBe(30);
  });

  it('enforces HTTP 429 when rate limit (2 req/s) is exceeded', () => {
    const req = {
      ip: '10.0.0.1',
      userId: 'user-spammer',
      body: { userId: 'user-spammer', variantId: 'STANDARD_CHESS' },
    };

    const r1 = router.dispatch('POST', '/api/matchmaking/join', req);
    expect(r1.status).toBe(200);

    const r2 = router.dispatch('POST', '/api/matchmaking/join', req);
    expect(r2.status).toBe(200);

    const r3 = router.dispatch('POST', '/api/matchmaking/join', req);
    expect(r3.status).toBe(429);
    expect(r3.body.error).toContain('Rate limit exceeded');
    expect(r3.headers?.['Retry-After']).toBeDefined();
  });

  it('rejects malformed join queue request with HTTP 400', () => {
    const res = router.dispatch('POST', '/api/matchmaking/join', {
      ip: '127.0.0.1',
      body: {}, // Missing userId & variantId
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing required fields');
  });

  it('handles heartbeat ping to prevent zombie queue lock', () => {
    const joinRes = router.dispatch('POST', '/api/matchmaking/join', {
      ip: '127.0.0.1',
      userId: 'user-heartbeat',
      body: { userId: 'user-heartbeat', variantId: 'HEXAGONAL_4P' },
    });
    const ticketId = joinRes.body.ticket.ticketId;

    const pingRes = router.dispatch('POST', '/api/matchmaking/ping', {
      ip: '127.0.0.1',
      body: { ticketId },
    });

    expect(pingRes.status).toBe(200);
    expect(pingRes.body.success).toBe(true);
  });

  it('handles lobby lifecycle: create, list, and join', () => {
    const createRes = router.dispatch('POST', '/api/lobbies/create', {
      ip: '127.0.0.1',
      body: {
        hostId: 'host-1',
        hostName: 'GrandMaster',
        title: 'Batalha dos Mestres',
        variantId: 'HEXAGONAL_4P',
        maxPlayers: 4,
      },
    });

    expect(createRes.status).toBe(201);
    const lobby = createRes.body.lobby;
    expect(lobby.title).toBe('Batalha dos Mestres');
    expect(lobby.joinCode).toHaveLength(6);

    const listRes = router.dispatch('GET', '/api/lobbies', { ip: '127.0.0.1', body: {} });
    expect(listRes.status).toBe(200);
    expect(listRes.body.lobbies.length).toBeGreaterThanOrEqual(1);

    const joinRes = router.dispatch('POST', '/api/lobbies/join', {
      ip: '127.0.0.1',
      body: { lobbyId: lobby.lobbyId, userId: 'challenger-2' },
    });
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.lobby.currentPlayers).toBe(2);
  });
});


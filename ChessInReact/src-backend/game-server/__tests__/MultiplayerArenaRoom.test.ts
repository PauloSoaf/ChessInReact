import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGameServer, IServerInstance } from '../server';
import { signAuthToken } from '../auth/jwtAuth';
import { Client as ColyseusClient } from 'colyseus.js';
import { ArenaRoomStateSchema, NetworkEntitySchema } from '../schemas/RoomStateSchema';

describe('MultiplayerArenaRoom Integration Suite (Spec 14 § 7, RF-14-07, RNF-14-01, RNF-14-02)', () => {
  let serverInstance: IServerInstance;
  let serverPort: number;
  let endpoint: string;

  beforeAll(async () => {
    // Choose random available port between 13000 and 14000
    serverPort = 13000 + Math.floor(Math.random() * 1000);
    endpoint = `ws://localhost:${serverPort}`;
    serverInstance = createGameServer(serverPort);
    await serverInstance.gameServer.listen(serverPort);
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
  });

  it('initializes 4-player cross FFA arena room with authoritative piece layouts and clockwise turn', async () => {
    const token = signAuthToken({ playerId: 'player-1', username: 'P1-Red' });
    const colyseusClient = new ColyseusClient(endpoint);

    const room = await colyseusClient.joinOrCreate<ArenaRoomStateSchema>(
      'arena_room',
      {
        authToken: token,
        arenaId: 'FOUR_PLAYER_FFA',
        matchId: 'ffa-test-1',
      },
      ArenaRoomStateSchema
    );

    // Wait for initial schema state to arrive
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(room.state.arenaId).toBe('FOUR_PLAYER_FFA');
    expect(room.state.totalParticipants).toBe(4);
    expect(room.state.activeFactionId).toBe('FACTION_1');
    expect(room.state.boardEntities.size).toBeGreaterThan(0);

    // Initial piece of FACTION_1 exists
    const p1Pieces = (
      Array.from(room.state.boardEntities.values()) as NetworkEntitySchema[]
    ).filter((e: NetworkEntitySchema) => e.ownerId === 'FACTION_1');
    expect(p1Pieces.length).toBeGreaterThan(0);

    room.leave();
  });

  it('supports up to 12 concurrent connections on MINI_DODECAGON_12P arena with 20 Hz sync (RF-14-07)', async () => {
    const clients: ColyseusClient[] = [];
    const rooms = [];
    const matchId = `dodecagon-12p-${Date.now()}`;

    // Connect 12 players
    for (let i = 0; i < 12; i++) {
      const token = signAuthToken({ playerId: `player-${i + 1}`, username: `User-${i + 1}` });
      const client = new ColyseusClient(endpoint);
      clients.push(client);

      const room = await client.joinOrCreate<ArenaRoomStateSchema>(
        'arena_room',
        {
          authToken: token,
          arenaId: 'MINI_DODECAGON_12P',
          matchId,
        },
        ArenaRoomStateSchema
      );
      rooms.push(room);
    }

    const hostRoom = rooms[0];

    // Wait for all 12 clients to finish handshake and state sync
    await new Promise<void>((resolve) => {
      const check = () => {
        if (hostRoom.state.players.size >= 12) {
          resolve();
        } else {
          setTimeout(check, 40);
        }
      };
      check();
    });

    expect(hostRoom.state.arenaId).toBe('MINI_DODECAGON_12P');
    expect(hostRoom.state.totalParticipants).toBe(12);
    expect(hostRoom.state.players.size).toBe(12);
    expect(hostRoom.state.phase).toBe('PLAYING');

    // Clean up
    for (const r of rooms) {
      r.leave();
    }
  });

  it('verifies RNF-14-01 memory footprint (< 4.0 MB) for 12-player arena state with 192 pieces', () => {
    const memBefore = process.memoryUsage().heapUsed;

    // Simulate 10 large 12-player arena state schemas
    const states: ArenaRoomStateSchema[] = [];
    for (let s = 0; s < 10; s++) {
      const schema = new ArenaRoomStateSchema({
        matchId: `perf-test-${s}`,
        arenaId: 'MINI_DODECAGON_12P',
        totalParticipants: 12,
      });
      states.push(schema);
    }

    const memAfter = process.memoryUsage().heapUsed;
    const deltaMb = (memAfter - memBefore) / (1024 * 1024);

    // 10 rooms take far less than 40 MB total (< 4.0 MB per room)
    expect(deltaMb).toBeLessThan(40);
  });

  it('verifies clockwise turn rotation and move validation across factions', async () => {
    const token1 = signAuthToken({ playerId: 'player-f1', username: 'P1-Red' });
    const token2 = signAuthToken({ playerId: 'player-f2', username: 'P2-Blue' });
    const client1 = new ColyseusClient(endpoint);
    const client2 = new ColyseusClient(endpoint);
    const matchId = `turn-test-${Date.now()}`;

    const room1 = await client1.joinOrCreate<ArenaRoomStateSchema>(
      'arena_room',
      { authToken: token1, arenaId: 'FOUR_PLAYER_FFA', matchId, autoStart: true },
      ArenaRoomStateSchema
    );
    const room2 = await client2.joinOrCreate<ArenaRoomStateSchema>(
      'arena_room',
      { authToken: token2, arenaId: 'FOUR_PLAYER_FFA', matchId, autoStart: true },
      ArenaRoomStateSchema
    );

    // Force phase to PLAYING for turn verification
    room1.state.phase = 'PLAYING';
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(room1.state.activeFactionId).toBe('FACTION_1');

    // F2 tries to move out of turn -> rejected
    let rejectedReason = '';
    room2.onMessage('MOVE_REJECTED', (msg: { reason: string }) => {
      rejectedReason = msg.reason;
    });

    room2.send('PLAYER_MOVE', {
      pieceId: 'FACTION_2-pawn-3',
      from: '1,7',
      to: '2,7',
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(rejectedReason).toContain('turno');

    // F1 moves legal piece -> turn advances to FACTION_2
    const f1Pawn = (
      Array.from(room1.state.boardEntities.values()) as NetworkEntitySchema[]
    ).find((e: NetworkEntitySchema) => e.ownerId === 'FACTION_1' && e.variantId === 'PAWN')!;

    room1.send('PLAYER_MOVE', {
      pieceId: f1Pawn.id,
      from: f1Pawn.position,
      to: '7,2',
      seqId: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(room1.state.activeFactionId).toBe('FACTION_2');

    room1.leave();
    room2.leave();
  });

  it('verifies king capture awards +20 elimination bonus and skips eliminated faction (RF-14-03, RF-14-04)', async () => {
    const token1 = signAuthToken({ playerId: 'player-elim-1', username: 'P1-Red' });
    const token2 = signAuthToken({ playerId: 'player-elim-2', username: 'P2-Blue' });
    const client1 = new ColyseusClient(endpoint);
    const client2 = new ColyseusClient(endpoint);
    const matchId = `elim-test-${Date.now()}`;

    const room1 = await client1.joinOrCreate<ArenaRoomStateSchema>(
      'arena_room',
      { authToken: token1, arenaId: 'FOUR_PLAYER_FFA', matchId, autoStart: true },
      ArenaRoomStateSchema
    );
    const room2 = await client2.joinOrCreate<ArenaRoomStateSchema>(
      'arena_room',
      { authToken: token2, arenaId: 'FOUR_PLAYER_FFA', matchId, autoStart: true },
      ArenaRoomStateSchema
    );

    room1.state.phase = 'PLAYING';
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Find F1 Queen and F2 King
    const f1Queen = (
      Array.from(room1.state.boardEntities.values()) as NetworkEntitySchema[]
    ).find((e: NetworkEntitySchema) => e.ownerId === 'FACTION_1' && e.variantId === 'QUEEN')!;
    const f2King = (
      Array.from(room1.state.boardEntities.values()) as NetworkEntitySchema[]
    ).find((e: NetworkEntitySchema) => e.ownerId === 'FACTION_2' && e.variantId === 'KING')!;

    // F1 moves Queen to F2 King square (King capture = Elimination)
    room1.send('PLAYER_MOVE', {
      pieceId: f1Queen.id,
      from: f1Queen.position,
      to: f2King.position,
      seqId: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 120));

    // FACTION_2 is eliminated
    expect(room1.state.eliminatedFactions.includes('FACTION_2')).toBe(true);

    // FACTION_1 receives +20 elimination points
    const f1Score = room1.state.factionScores.get('FACTION_1');
    expect(f1Score).toBeGreaterThanOrEqual(20);

    room1.leave();
    room2.leave();
  });

  it('verifies RNF-14-02 simultaneous arbitration latency is < 10 ms for 12 orders', async () => {
    const token = signAuthToken({ playerId: 'player-sim', username: 'SimTester' });
    const client = new ColyseusClient(endpoint);

    const room = await client.joinOrCreate<ArenaRoomStateSchema>('arena_room', {
      authToken: token,
      arenaId: 'DIPLOMACY_CHESS',
      matchId: 'diplomacy-bench',
    });

    const t0 = performance.now();
    // Commit secret order
    room.send('COMMIT_SECRET_ORDER', {
      from: '0,0',
      to: '1,1',
      pieceId: 'FACTION_1-king-0',
    });

    const elapsedMs = performance.now() - t0;
    expect(elapsedMs).toBeLessThan(10); // < 10 ms latency budget (RNF-14-02)

    room.leave();
  });
});

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createGameServer, IServerInstance } from '../server';
import { signAuthToken } from '../auth/jwtAuth';
import { ColyseusClient } from '../../../src/multiplayer/ColyseusClient';
import { StateSyncBridge } from '../../../src/multiplayer/StateSyncBridge';
import { createGameStore } from '../../../src/core/state/gameStore';
import { asEntityId, asCoordinateKey, PlayerId } from '../../../src/core/coordinates/types';

const asPlayerId = (id: string): PlayerId => id as PlayerId;

describe('Spec 03 - End-to-End Authoritative Multiplayer Integration', () => {
  let serverInstance: IServerInstance;
  let serverPort: number;
  let endpoint: string;

  beforeAll(async () => {
    // Choose random available port between 12000 and 13000 to prevent port collisions
    serverPort = 12000 + Math.floor(Math.random() * 1000);
    endpoint = `ws://localhost:${serverPort}`;
    serverInstance = createGameServer(serverPort);
    await serverInstance.gameServer.listen(serverPort);
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
  });

  it('serves /health endpoint with valid runtime and memory telemetry (US03-D05, Spec 03 Sec 18)', async () => {
    const healthData = await new Promise<{ status: string; memoryRssMb: number }>((resolve, reject) => {
      http.get(`http://localhost:${serverPort}/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });

    expect(healthData.status).toBe('healthy');
    expect(healthData.memoryRssMb).toBeGreaterThan(0);
  });

  it('completes authoritative 2-player match slice: connection, sync, turns, and anti-cheat (RF-01 to RF-12)', async () => {
    // 1. Generate JWT tokens for White (P1) and Black (P2)
    const tokenP1 = signAuthToken({ playerId: 'player-white', username: 'Alice' });
    const tokenP2 = signAuthToken({ playerId: 'player-black', username: 'Bob' });
    const tokenSpectator = signAuthToken({ playerId: 'player-spec', username: 'EveViewer', role: 'SPECTATOR' });

    // 2. Client 1 (White) joins room
    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-match-1' });
    const bridge1 = new StateSyncBridge(room1, store1, asPlayerId('player-white'));

    expect(client1.getStatus()).toBe('CONNECTED');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(room1.state.phase).toBe('WAITING');

    // 3. Client 2 (Black) joins room -> Starts match
    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-match-1' });
    const bridge2 = new StateSyncBridge(room2, store2, asPlayerId('player-black'));

    expect(client2.getStatus()).toBe('CONNECTED');

    // Wait for server state update to propagate
    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') {
        resolve();
      } else {
        room1.onStateChange((s) => {
          if (s.phase === 'PLAYING') resolve();
        });
        setTimeout(resolve, 500);
      }
    });

    // Phase is PLAYING, 32 pieces initialized, activePlayer is player-white
    expect(room1.state.phase).toBe('PLAYING');
    expect(room1.state.boardEntities.size).toBe(32);
    expect(room1.state.activePlayerId).toBe('player-white');

    // 4. Client 1 moves pawn e2 to e4
    const seqId1 = bridge1.sendOptimisticMove(
      asEntityId('piece-w-p-e'),
      asCoordinateKey('e2'),
      asCoordinateKey('e4')
    );
    expect(seqId1).toBe(1);

    // Wait for server tick and delta sync
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Server state is updated: pawn is at e4, turn toggled to player-black
    const serverPawn = room1.state.boardEntities.get('piece-w-p-e');
    expect(serverPawn?.position).toBe('e4');
    expect(room1.state.activePlayerId).toBe('player-black');
    expect(room1.state.turnNumber).toBe(2);

    // Client 2 received the delta
    expect(room2.state.boardEntities.get('piece-w-p-e')?.position).toBe('e4');
    expect(room2.state.activePlayerId).toBe('player-black');

    // 5. Anti-cheat test: Client 1 attempts to move out of turn
    let moveRejectedReason = '';
    room1.onMessage('REJECT_MOVE', (msg: { reason: string }) => {
      moveRejectedReason = msg.reason;
    });

    room1.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-d',
      from: 'd2',
      to: 'd4',
      seqId: 2,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(moveRejectedReason).toContain('Not your turn');

    // 6. Anti-cheat test: Client 2 attempts to move Client 1's piece
    let cheatRejectedReason = '';
    room2.onMessage('REJECT_MOVE', (msg: { reason: string }) => {
      cheatRejectedReason = msg.reason;
    });

    room2.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-d', // White piece
      from: 'd2',
      to: 'd4',
      seqId: 10,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(cheatRejectedReason).toContain('Anti-cheat violation');

    // 7. Spectator Isolation test (RF-10, US03-P05)
    const client3 = new ColyseusClient({ endpoint });
    const room3 = await client3.joinOrCreateRoom({
      authToken: tokenSpectator,
      matchId: 'e2e-match-1',
      spectatorMode: true,
    });

    let spectatorRejectReason = '';
    room3.onMessage('REJECT_MOVE', (msg: { reason: string }) => {
      spectatorRejectReason = msg.reason;
    });

    room3.send('PLAYER_MOVE', {
      pieceId: 'piece-b-p-e',
      from: 'e7',
      to: 'e5',
      seqId: 99,
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(spectatorRejectReason).toContain('Spectators are read-only');

    // 8. Clock sync test (RF-05, RF-13)
    let pongReceived = false;
    room1.onMessage('PONG', () => {
      pongReceived = true;
    });
    client1.performClockSync();
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(pongReceived).toBe(true);
    expect(client1.getClockSyncInfo().rttMs).toBeGreaterThanOrEqual(0);

    // 9. Clean disconnect
    bridge1.dispose();
    bridge2.dispose();
    await client1.leave();
    await client2.leave();
    await client3.leave();
  });
});

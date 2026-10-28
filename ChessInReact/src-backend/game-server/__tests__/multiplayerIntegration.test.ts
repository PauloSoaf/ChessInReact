import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createGameServer, IServerInstance } from '../server';
import { signAuthToken } from '../auth/jwtAuth';
import { ColyseusClient } from '../../../src/multiplayer/ColyseusClient';
import { StateSyncBridge } from '../../../src/multiplayer/StateSyncBridge';
import { createGameStore } from '../../../src/core/state/gameStore';
import { asEntityId, asCoordinateKey, PlayerId } from '../../../src/core/coordinates/types';
import { PlayerSchema } from '../schemas/RoomStateSchema';

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

  it('prevents identical authenticated playerId from taking both White and Black sides (S03-03)', async () => {
    const tokenPlayer = signAuthToken({ playerId: 'player-clone', username: 'CloneGuy' });
    const tokenOther = signAuthToken({ playerId: 'player-opponent', username: 'RealOpponent' });

    const clientA = new ColyseusClient({ endpoint });
    const roomA = await clientA.joinOrCreateRoom({ authToken: tokenPlayer, matchId: 'clone-test-match' });

    // Client A is WHITE
    await new Promise((r) => setTimeout(r, 60));
    const playersA = Array.from(roomA.state.players.values()) as PlayerSchema[];
    const whitePlayerA = playersA.find((p) => p.role === 'WHITE');
    const blackPlayerA = playersA.find((p) => p.role === 'BLACK');
    expect(whitePlayerA?.playerId).toBe('player-clone');
    expect(blackPlayerA).toBeUndefined();

    // Client B connects using SAME playerId 'player-clone'
    const clientB = new ColyseusClient({ endpoint });
    const roomB = await clientB.joinOrCreateRoom({ authToken: tokenPlayer, matchId: 'clone-test-match' });
    await new Promise((r) => setTimeout(r, 120));

    // Client B must NOT become BLACK! Must be assigned SPECTATOR
    const playersB = Array.from(roomB.state.players.values()) as PlayerSchema[];
    const blackPlayerB = playersB.find((p) => p.role === 'BLACK');
    expect(blackPlayerB).toBeUndefined();
    const clientBSession = playersB.find((p) => p.sessionId === roomB.sessionId);
    expect(clientBSession?.role).toBe('SPECTATOR');
    // And room is still in WAITING phase
    expect(roomB.state.phase).toBe('WAITING');

    // A distinct user connects with player-opponent
    const clientC = new ColyseusClient({ endpoint });
    const roomC = await clientC.joinOrCreateRoom({ authToken: tokenOther, matchId: 'clone-test-match' });
    await new Promise((r) => setTimeout(r, 150));

    // Now BLACK is player-opponent and game begins!
    const playersC = Array.from(roomA.state.players.values()) as PlayerSchema[];
    const blackPlayerC = playersC.find((p) => p.role === 'BLACK');
    expect(blackPlayerC?.playerId).toBe('player-opponent');
    expect(roomA.state.phase).toBe('PLAYING');

    await roomB.leave();
    await roomC.leave();
    await clientA.leave();
    await clientB.leave();
    await clientC.leave();
  });

  it('enforces command buffering, anti-replay, and tick simulation order (S03-05)', async () => {
    const tokenW = signAuthToken({ playerId: 'buffer-white', username: 'BufferWhite' });
    const tokenB = signAuthToken({ playerId: 'buffer-black', username: 'BufferBlack' });

    const clientW = new ColyseusClient({ endpoint });
    const clientB = new ColyseusClient({ endpoint });

    const roomW = await clientW.joinOrCreateRoom({ authToken: tokenW, matchId: 'buffer-test-match' });
    const roomB = await clientB.joinOrCreateRoom({ authToken: tokenB, matchId: 'buffer-test-match' });

    await new Promise((r) => setTimeout(r, 100));
    expect(roomW.state.phase).toBe('PLAYING');

    let replayRejected = false;
    roomW.onMessage('REJECT_MOVE', (payload: { reason: string }) => {
      const r = (payload.reason || '').toLowerCase();
      if (r.includes('replay') || r.includes('duplicate') || r.includes('already executed')) {
        replayRejected = true;
      }
    });

    // Send move with seqId 1
    roomW.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-e',
      from: 'e2',
      to: 'e4',
      seqId: 1,
    });

    // Send identical command with same seqId (replay attempt)
    roomW.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-e',
      from: 'e2',
      to: 'e4',
      seqId: 1,
    });

    await new Promise((r) => setTimeout(r, 150));
    // Verify first command succeeded
    expect(roomW.state.boardEntities.get('piece-w-p-e')?.position).toBe('e4');
    // Verify replay was caught
    expect(replayRejected).toBe(true);

    await roomB.leave();
    await clientW.leave();
    await clientB.leave();
  });

  it('proves dual Zustand stores remain 100% in sync with server authority across legal moves and illegal rollbacks (S03-06)', async () => {
    const tokenW = signAuthToken({ playerId: 'sync-white', username: 'SyncW' });
    const tokenB = signAuthToken({ playerId: 'sync-black', username: 'SyncB' });

    const clientW = new ColyseusClient({ endpoint });
    const clientB = new ColyseusClient({ endpoint });

    const storeW = createGameStore();
    const storeB = createGameStore();

    const roomW = await clientW.joinOrCreateRoom({ authToken: tokenW, matchId: 'sync-e2e-match' });
    const bridgeW = new StateSyncBridge(roomW, storeW, asPlayerId('sync-white'));

    const roomB = await clientB.joinOrCreateRoom({ authToken: tokenB, matchId: 'sync-e2e-match' });
    const bridgeB = new StateSyncBridge(roomB, storeB, asPlayerId('sync-black'));

    // Wait for room to start
    await new Promise((r) => setTimeout(r, 150));
    expect(roomW.state.phase).toBe('PLAYING');

    // Initial domain state comparison
    const stateW0 = storeW.getState().domain;
    const stateB0 = storeB.getState().domain;
    expect(stateW0.activePlayer).toBe('P1');
    expect(stateB0.activePlayer).toBe('P1');
    expect(stateW0.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e2');
    expect(stateB0.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e2');

    // White moves e2 -> e4
    bridgeW.sendOptimisticMove(
      asEntityId('piece-w-p-e'),
      asCoordinateKey('e2'),
      asCoordinateKey('e4')
    );

    // Wait for server tick and delta sync
    await new Promise((r) => setTimeout(r, 150));

    // Verify Server State
    expect(roomW.state.boardEntities.get('piece-w-p-e')?.position).toBe('e4');
    expect(roomW.state.activePlayerId).toBe('sync-black');
    expect(roomW.state.turnNumber).toBe(2);

    // Verify Store W
    const stateW1 = storeW.getState().domain;
    expect(stateW1.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e4');
    expect(stateW1.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(stateW1.occupancy[asCoordinateKey('e2')]).toBeUndefined();
    expect(stateW1.activePlayer).toBe('P2');
    expect(stateW1.turnNumber).toBe(2);

    // Verify Store B
    const stateB1 = storeB.getState().domain;
    expect(stateB1.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e4');
    expect(stateB1.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(stateB1.occupancy[asCoordinateKey('e2')]).toBeUndefined();
    expect(stateB1.activePlayer).toBe('P2');
    expect(stateB1.turnNumber).toBe(2);

    // Black moves e7 -> e5
    bridgeB.sendOptimisticMove(
      asEntityId('piece-b-p-e'),
      asCoordinateKey('e7'),
      asCoordinateKey('e5')
    );

    await new Promise((r) => setTimeout(r, 150));

    // Verify both stores updated with black move
    const stateW2 = storeW.getState().domain;
    const stateB2 = storeB.getState().domain;
    expect(stateW2.boardEntities[asEntityId('piece-b-p-e')]?.position).toBe('e5');
    expect(stateB2.boardEntities[asEntityId('piece-b-p-e')]?.position).toBe('e5');
    expect(stateW2.occupancy[asCoordinateKey('e5')]).toBe('piece-b-p-e');
    expect(stateB2.occupancy[asCoordinateKey('e5')]).toBe('piece-b-p-e');
    expect(stateW2.activePlayer).toBe('P1');
    expect(stateB2.activePlayer).toBe('P1');
    expect(stateW2.turnNumber).toBe(3);
    expect(stateB2.turnNumber).toBe(3);

    // Rollback test: White attempts illegal move (teleport e4 -> e8 onto enemy piece)
    let rollbackReceived = false;
    roomW.onMessage('REJECT_MOVE', () => {
      rollbackReceived = true;
    });

    // Send illegal network move
    roomW.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-e',
      from: 'e4',
      to: 'e8',
      seqId: 99,
    });

    await new Promise((r) => setTimeout(r, 150));
    expect(rollbackReceived).toBe(true);

    // Both stores and server must be identical and pawn remains at e4
    expect(roomW.state.boardEntities.get('piece-w-p-e')?.position).toBe('e4');
    expect(storeW.getState().domain.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e4');
    expect(storeB.getState().domain.boardEntities[asEntityId('piece-w-p-e')]?.position).toBe('e4');

    bridgeW.dispose();
    bridgeB.dispose();
    await clientW.leave();
    await clientB.leave();
  });
});

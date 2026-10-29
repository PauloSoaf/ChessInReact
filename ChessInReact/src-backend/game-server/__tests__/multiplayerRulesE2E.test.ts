import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ColyseusClient } from '../../../src/multiplayer/ColyseusClient';
import { StateSyncBridge } from '../../../src/multiplayer/StateSyncBridge';
import { createGameStore } from '../../../src/core/state/gameStore';
import { asEntityId, asCoordinateKey } from '../../../src/core/coordinates/types';
import { IPieceEntity } from '../../../src/core/entities/types';
import { ChessRoom } from '../rooms/ChessRoom';
import { signAuthToken } from '../auth/jwtAuth';

describe('Spec 04 & Spec 03 - End-to-End Authoritative Rules & Dual Zustand Store Sync (P0, P1)', () => {
  let server: Server;
  let httpServer: http.Server;
  let endpoint: string;

  beforeAll(async () => {
    httpServer = http.createServer();
    server = new Server({
      transport: new WebSocketTransport({
        server: httpServer,
      }),
    });

    server.define('chess_room', ChessRoom).filterBy(['matchId']);
    server.define('chess_match', ChessRoom).filterBy(['matchId']);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const address = httpServer.address() as AddressInfo;
        endpoint = `ws://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  async function waitForCondition(predicate: () => boolean, timeoutMs = 3000, stepMs = 25): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, stepMs));
    }
    if (!predicate()) {
      throw new Error(`waitForCondition timed out after ${timeoutMs}ms`);
    }
  }

  it('authoritatively executes En Passant and synchronizes authoritative state to dual Zustand stores', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white', username: 'WhiteHero' });
    const tokenP2 = signAuthToken({ playerId: 'player-black', username: 'BlackHero' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-enpassant-room' });
    const bridge1 = new StateSyncBridge(room1, store1, 'P1');

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-enpassant-room' });
    const bridge2 = new StateSyncBridge(room2, store2, 'P2');

    // Wait for room to reach PLAYING phase
    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') return resolve();
      room1.onStateChange((s) => {
        if (s.phase === 'PLAYING') resolve();
      });
      setTimeout(resolve, 500);
    });

    expect(room1.state.phase).toBe('PLAYING');
    expect(room1.state.activePlayerId).toBe('player-white');

    interface ICaptureEvent {
      capturedPieceId: string;
      atCoord: string;
    }
    const captureEvents: { client1?: ICaptureEvent; client2?: ICaptureEvent } = {};
    room1.onMessage<ICaptureEvent>('PIECE_CAPTURED_EVENT', (msg) => { captureEvents.client1 = msg; });
    room2.onMessage<ICaptureEvent>('PIECE_CAPTURED_EVENT', (msg) => { captureEvents.client2 = msg; });

    // Step 1: White plays e2 -> e4
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e2'), asCoordinateKey('e4'));
    await waitForCondition(() => room1.state.enPassantTarget === 'e3' && room1.state.activePlayerId === 'player-black');

    // Verify Colyseus Server Schema
    expect(room1.state.enPassantTarget).toBe('e3');
    expect(room2.state.enPassantTarget).toBe('e3');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Verify Dual Zustand Stores sync (P1, White Store & Black Store)
    const dom1_s1 = store1.getState().domain;
    const dom2_s1 = store2.getState().domain;
    expect(dom1_s1.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(dom2_s1.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(dom1_s1.turnState.enPassantTarget).toBe('e3');
    expect(dom2_s1.turnState.enPassantTarget).toBe('e3');
    expect(dom1_s1.activePlayer).toBe('P2');
    expect(dom2_s1.activePlayer).toBe('P2');

    // Step 2: Black plays a7 -> a6 (quiet move, clears enPassantTarget)
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-a'), asCoordinateKey('a7'), asCoordinateKey('a6'));
    await waitForCondition(() => room1.state.enPassantTarget === '' && room1.state.activePlayerId === 'player-white');
    expect(room1.state.enPassantTarget).toBe('');
    expect(room2.state.enPassantTarget).toBe('');
    expect(room1.state.activePlayerId).toBe('player-white');

    const dom1_s2 = store1.getState().domain;
    const dom2_s2 = store2.getState().domain;
    expect(dom1_s2.turnState.enPassantTarget).toBeNull();
    expect(dom2_s2.turnState.enPassantTarget).toBeNull();
    expect(dom1_s2.activePlayer).toBe('P1');
    expect(dom2_s2.activePlayer).toBe('P1');

    // Step 3: White advances e4 -> e5
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e4'), asCoordinateKey('e5'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-e')?.position === 'e5' && room1.state.activePlayerId === 'player-black');
    expect(room1.state.boardEntities.get('piece-w-p-e')?.position).toBe('e5');
    expect(room1.state.enPassantTarget).toBe('');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Step 4: Black plays 2-square pawn push d7 -> d5! (creates enPassantTarget 'd6')
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-d'), asCoordinateKey('d7'), asCoordinateKey('d5'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-b-p-d')?.position === 'd5' && room1.state.enPassantTarget === 'd6');
    expect(room1.state.boardEntities.get('piece-b-p-d')?.position).toBe('d5');
    expect(room1.state.enPassantTarget).toBe('d6');
    expect(room2.state.enPassantTarget).toBe('d6');
    expect(room1.state.activePlayerId).toBe('player-white');

    // Verify enPassantTarget in dual Zustand stores
    expect(store1.getState().domain.turnState.enPassantTarget).toBe('d6');
    expect(store2.getState().domain.turnState.enPassantTarget).toBe('d6');
    expect(store1.getState().domain.activePlayer).toBe('P1');
    expect(store2.getState().domain.activePlayer).toBe('P1');

    // Step 5: White plays En Passant capture e5 -> d6!
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e5'), asCoordinateKey('d6'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-e')?.position === 'd6');

    // Verify White pawn is at d6 in Server and Dual Zustand Stores
    expect(room1.state.boardEntities.get('piece-w-p-e')?.position).toBe('d6');
    expect(room2.state.boardEntities.get('piece-w-p-e')?.position).toBe('d6');
    expect(store1.getState().domain.occupancy[asCoordinateKey('d6')]).toBe('piece-w-p-e');
    expect(store2.getState().domain.occupancy[asCoordinateKey('d6')]).toBe('piece-w-p-e');

    // Verify victim pawn piece-b-p-d is captured in Server and Dual Zustand Stores
    const victim1 = room1.state.boardEntities.get('piece-b-p-d');
    const victim2 = room2.state.boardEntities.get('piece-b-p-d');
    expect(victim1?.isCaptured).toBe(true);
    expect(victim1?.position).toBe('');
    expect(victim2?.isCaptured).toBe(true);
    expect(victim2?.position).toBe('');

    const storeVictim1 = store1.getState().domain.boardEntities[asEntityId('piece-b-p-d')];
    const storeVictim2 = store2.getState().domain.boardEntities[asEntityId('piece-b-p-d')];
    expect((storeVictim1 as IPieceEntity | undefined)?.isCaptured).toBe(true);
    expect((storeVictim2 as IPieceEntity | undefined)?.isCaptured).toBe(true);

    // Verify enPassantTarget was reset after capture
    expect(room1.state.enPassantTarget).toBe('');
    expect(room2.state.enPassantTarget).toBe('');
    expect(store1.getState().domain.turnState.enPassantTarget).toBeNull();
    expect(store2.getState().domain.turnState.enPassantTarget).toBeNull();

    // Verify PIECE_CAPTURED_EVENT was received by both clients
    expect(captureEvents.client1).toBeDefined();
    expect(captureEvents.client1?.capturedPieceId).toBe('piece-b-p-d');
    expect(captureEvents.client2).toBeDefined();
    expect(captureEvents.client2?.capturedPieceId).toBe('piece-b-p-d');

    bridge1.dispose();
    bridge2.dispose();
  });

  it('authoritatively ends match on Fool\'s Mate checkmate and locks moves with full Zustand sync (P0, RF-05)', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white', username: 'WhiteMate' });
    const tokenP2 = signAuthToken({ playerId: 'player-black', username: 'BlackMate' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-checkmate-room' });
    const bridge1 = new StateSyncBridge(room1, store1, 'P1');

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-checkmate-room' });
    const bridge2 = new StateSyncBridge(room2, store2, 'P2');

    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') return resolve();
      room1.onStateChange((s) => {
        if (s.phase === 'PLAYING') resolve();
      });
      setTimeout(resolve, 500);
    });

    interface IGameOverEvent {
      reason: string;
      winnerId: string;
    }
    const gameOverEvents: { client1?: IGameOverEvent; client2?: IGameOverEvent } = {};
    room1.onMessage<IGameOverEvent>('GAME_OVER', (msg) => { gameOverEvents.client1 = msg; });
    room2.onMessage<IGameOverEvent>('GAME_OVER', (msg) => { gameOverEvents.client2 = msg; });

    // Move 1: White plays f2 -> f3
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-f'), asCoordinateKey('f2'), asCoordinateKey('f3'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-f')?.position === 'f3');
    expect(room1.state.boardEntities.get('piece-w-p-f')?.position).toBe('f3');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Move 2: Black plays e7 -> e5
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-e'), asCoordinateKey('e7'), asCoordinateKey('e5'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-b-p-e')?.position === 'e5');
    expect(room1.state.boardEntities.get('piece-b-p-e')?.position).toBe('e5');
    expect(room1.state.activePlayerId).toBe('player-white');

    // Move 3: White plays g2 -> g4
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-g'), asCoordinateKey('g2'), asCoordinateKey('g4'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-g')?.position === 'g4');
    expect(room1.state.boardEntities.get('piece-w-p-g')?.position).toBe('g4');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Move 4: Black plays Queen d8 -> h4 CHECKMATE!
    bridge2.sendOptimisticMove(asEntityId('piece-b-Q-d8'), asCoordinateKey('d8'), asCoordinateKey('h4'));
    await waitForCondition(() => room1.state.phase === 'GAME_OVER' && room1.state.winnerId === 'player-black');

    // Server state must be GAME_OVER with winner player-black
    expect(room1.state.phase).toBe('GAME_OVER');
    expect(room1.state.winnerId).toBe('player-black');
    expect(room2.state.phase).toBe('GAME_OVER');
    expect(room2.state.winnerId).toBe('player-black');

    // Dual Zustand stores must reflect GAME_OVER and canonical winner P2 (player-black)
    expect(store1.getState().domain.isGameOver).toBe(true);
    expect(store2.getState().domain.isGameOver).toBe(true);
    expect(store1.getState().domain.winnerId).toBe('P2');
    expect(store2.getState().domain.winnerId).toBe('P2');

    // Broadcast message received by both clients
    expect(gameOverEvents.client1).toBeDefined();
    expect(gameOverEvents.client1?.reason.toUpperCase()).toContain('CHECKMATE');
    expect(gameOverEvents.client1?.winnerId).toBe('player-black');

    expect(gameOverEvents.client2).toBeDefined();
    expect(gameOverEvents.client2?.reason.toUpperCase()).toContain('CHECKMATE');
    expect(gameOverEvents.client2?.winnerId).toBe('player-black');

    // Move lock test: White attempts a move after game over
    interface IRejectEvent {
      reason: string;
    }
    const rejectEvents: { client1?: IRejectEvent } = {};
    room1.onMessage<IRejectEvent>('REJECT_MOVE', (msg) => { rejectEvents.client1 = msg; });

    room1.send('PLAYER_MOVE', {
      pieceId: 'piece-w-p-a',
      from: 'a2',
      to: 'a3',
      seqId: 50,
    });
    await new Promise((r) => setTimeout(r, 150));

    expect(rejectEvents.client1).toBeDefined();
    expect(rejectEvents.client1?.reason).toContain('GAME_OVER');

    bridge1.dispose();
    bridge2.dispose();
  });

  it('reconciles optimistic prediction on illegal move rejection (Rollback) with total Zustand parity', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white-rb', username: 'WhiteRollback' });
    const tokenP2 = signAuthToken({ playerId: 'player-black-rb', username: 'BlackRollback' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-rollback-room' });
    const bridge1 = new StateSyncBridge(room1, store1, 'P1');

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-rollback-room' });
    const bridge2 = new StateSyncBridge(room2, store2, 'P2');

    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') return resolve();
      room1.onStateChange((s) => {
        if (s.phase === 'PLAYING') resolve();
      });
      setTimeout(resolve, 500);
    });

    // White attempts an illegal move: Pawn jumping 4 squares e2 -> e6
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e2'), asCoordinateKey('e6'));

    // Optimistic prediction immediately applied in store1
    expect(store1.getState().domain.occupancy[asCoordinateKey('e6')]).toBe('piece-w-p-e');

    // Wait for server to validate, reject, and trigger rollback
    await waitForCondition(() => {
      const occ = store1.getState().domain.occupancy;
      return occ[asCoordinateKey('e2')] === 'piece-w-p-e' && !occ[asCoordinateKey('e6')];
    });

    // Server must remain in valid state (pawn at e2)
    expect(room1.state.boardEntities.get('piece-w-p-e')?.position).toBe('e2');

    // store1 must have rolled back the optimistic move and restored pawn to e2
    expect(store1.getState().domain.occupancy[asCoordinateKey('e2')]).toBe('piece-w-p-e');
    expect(store1.getState().domain.occupancy[asCoordinateKey('e6')]).toBeUndefined();

    // store2 (Black) never saw the illegal move
    expect(store2.getState().domain.occupancy[asCoordinateKey('e2')]).toBe('piece-w-p-e');
    expect(store2.getState().domain.occupancy[asCoordinateKey('e6')]).toBeUndefined();

    bridge1.dispose();
    bridge2.dispose();
  });

  it('hydrates Zustand store with total parity on mid-match late join / spectator entry', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white-reconnect', username: 'WhiteRec' });
    const tokenP2 = signAuthToken({ playerId: 'player-black-reconnect', username: 'BlackRec' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-reconnect-room' });
    const bridge1 = new StateSyncBridge(room1, store1, 'P1');

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-reconnect-room' });
    const bridge2 = new StateSyncBridge(room2, store2, 'P2');

    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') return resolve();
      room1.onStateChange((s) => {
        if (s.phase === 'PLAYING') resolve();
      });
      setTimeout(resolve, 500);
    });

    // White plays e2 -> e4
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e2'), asCoordinateKey('e4'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-e')?.position === 'e4');

    // A 3rd client (spectator / late join) joins the room in-progress
    const tokenP3 = signAuthToken({ playerId: 'player-reconnected', username: 'SpectatorRec' });
    const client3 = new ColyseusClient({ endpoint });
    const store3 = createGameStore();
    const room3 = await client3.joinOrCreateRoom({ authToken: tokenP3, matchId: 'e2e-reconnect-room' });
    const bridge3 = new StateSyncBridge(room3, store3, 'NONE');

    await waitForCondition(() => store3.getState().domain.occupancy[asCoordinateKey('e4')] === 'piece-w-p-e');

    // Verify client 3 hydrated store matches client 1 and server exactly
    const dom3 = store3.getState().domain;
    expect(dom3.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(dom3.turnState.enPassantTarget).toBe('e3');
    expect(dom3.activePlayer).toBe('P2');
    expect(dom3.turnNumber).toBe(2);

    bridge1.dispose();
    bridge2.dispose();
    bridge3.dispose();
  });

  it('handles unexpected disconnection and reconnects authenticated player restoring session, turn, history, and move rights without duplicate players', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white-real-rec', username: 'RealRecWhite' });
    const tokenP2 = signAuthToken({ playerId: 'player-black-real-rec', username: 'RealRecBlack' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-real-reconnection-room' });
    const bridge1 = new StateSyncBridge(room1, store1, 'P1');

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-real-reconnection-room' });
    const bridge2 = new StateSyncBridge(room2, store2, 'P2');

    await new Promise<void>((resolve) => {
      if (room1.state.phase === 'PLAYING') return resolve();
      room1.onStateChange((s) => {
        if (s.phase === 'PLAYING') resolve();
      });
      setTimeout(resolve, 500);
    });

    expect(room1.state.phase).toBe('PLAYING');
    expect(room1.state.players.size).toBe(2);

    // Initial position history should already be seeded on server and synced to Zustand stores
    expect(room1.state.positionHistory.length).toBeGreaterThanOrEqual(1);
    expect(store1.getState().domain.turnState.positionHistory?.length).toBeGreaterThanOrEqual(1);

    // White executes a move: e2 -> e4
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e2'), asCoordinateKey('e4'));
    await waitForCondition(() => room1.state.boardEntities.get('piece-w-p-e')?.position === 'e4');

    expect(room1.state.activePlayerId).toBe('player-black-real-rec');
    expect(room1.state.turnNumber).toBe(2);
    expect(room1.state.fiftyMoveCounter).toBe(0);
    expect(room1.state.positionHistory.length).toBe(2);
    expect(store1.getState().domain.turnState.positionHistory?.length).toBe(2);
    expect(store2.getState().domain.turnState.positionHistory?.length).toBe(2);

    // Capture reconnection token from room1 before disconnecting
    const reconnectionToken = room1.reconnectionToken;
    expect(reconnectionToken).toBeDefined();

    // Trigger unexpected disconnection (consented = false)
    room1.connection.close();

    // Wait for server to register disconnection (connected = false)
    await waitForCondition(() => {
      const p = room2.state.players.get(room1.sessionId);
      return p ? !p.connected : false;
    });

    // Reconnect client1 with reconnection token
    const reconnectedRoom = await client1.reconnectRoom(reconnectionToken);
    expect(reconnectedRoom).toBeDefined();

    // Verify player is reconnected
    await waitForCondition(() => {
      let isConnected = false;
      reconnectedRoom.state.players.forEach((p) => {
        if (p.playerId === 'player-white-real-rec' && p.connected) {
          isConnected = true;
        }
      });
      return isConnected;
    });

    // Verify NO DUPLICATE PLAYERS: exactly 2 players in room
    expect(reconnectedRoom.state.players.size).toBe(2);

    // Verify restored state: piece position, turnNumber, active player, fiftyMoveCounter, positionHistory
    expect(reconnectedRoom.state.boardEntities.get('piece-w-p-e')?.position).toBe('e4');
    expect(reconnectedRoom.state.turnNumber).toBe(2);
    expect(reconnectedRoom.state.activePlayerId).toBe('player-black-real-rec');
    expect(reconnectedRoom.state.fiftyMoveCounter).toBe(0);
    expect(reconnectedRoom.state.positionHistory.length).toBe(2);

    // Wire new bridge to reconnected room and verify Zustand store hydration
    const storeReconnected = createGameStore();
    const bridgeReconnected = new StateSyncBridge(reconnectedRoom, storeReconnected, 'P1');
    const domRec = storeReconnected.getState().domain;
    expect(domRec.occupancy[asCoordinateKey('e4')]).toBe('piece-w-p-e');
    expect(domRec.activePlayer).toBe('P2');
    expect(domRec.turnNumber).toBe(2);
    expect(domRec.turnState.positionHistory?.length).toBe(2);

    // Verify continuing gameplay: Black moves e7 -> e5
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-e'), asCoordinateKey('e7'), asCoordinateKey('e5'));
    await waitForCondition(() => reconnectedRoom.state.boardEntities.get('piece-b-p-e')?.position === 'e5');

    // Active player is now back to White!
    await waitForCondition(() => reconnectedRoom.state.activePlayerId === 'player-white-real-rec');
    expect(reconnectedRoom.state.turnNumber).toBe(3);

    // White (reconnected player) can now move! Move Knight g1 -> f3
    bridgeReconnected.sendOptimisticMove(asEntityId('piece-w-N-g1'), asCoordinateKey('g1'), asCoordinateKey('f3'));
    await waitForCondition(() => reconnectedRoom.state.boardEntities.get('piece-w-N-g1')?.position === 'f3');

    // Both stores and server reflect new state
    expect(reconnectedRoom.state.boardEntities.get('piece-w-N-g1')?.position).toBe('f3');
    expect(storeReconnected.getState().domain.occupancy[asCoordinateKey('f3')]).toBe('piece-w-N-g1');
    expect(store2.getState().domain.occupancy[asCoordinateKey('f3')]).toBe('piece-w-N-g1');

    bridge1.dispose();
    bridge2.dispose();
    bridgeReconnected.dispose();
  });
});

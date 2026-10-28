import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createGameServer, IServerInstance } from '../server';
import { signAuthToken } from '../auth/jwtAuth';
import { ColyseusClient } from '../../../src/multiplayer/ColyseusClient';
import { StateSyncBridge } from '../../../src/multiplayer/StateSyncBridge';
import { createGameStore } from '../../../src/core/state/gameStore';
import { asEntityId, asCoordinateKey, PlayerId } from '../../../src/core/coordinates/types';

const asPlayerId = (id: string): PlayerId => id as PlayerId;

describe('Spec 04 & Spec 03 - End-to-End Authoritative Rules Engine in Multiplayer', () => {
  let serverInstance: IServerInstance;
  let serverPort: number;
  let endpoint: string;

  beforeAll(async () => {
    serverPort = 13100 + Math.floor(Math.random() * 800);
    endpoint = `ws://localhost:${serverPort}`;
    serverInstance = createGameServer(serverPort);
    await serverInstance.gameServer.listen(serverPort);
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
  });

  it('authoritatively handles En Passant capture across two real Colyseus clients (P0, RF-07)', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white', username: 'WhiteEP' });
    const tokenP2 = signAuthToken({ playerId: 'player-black', username: 'BlackEP' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-enpassant-room' });
    const bridge1 = new StateSyncBridge(room1, store1, asPlayerId('player-white'));

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-enpassant-room' });
    const bridge2 = new StateSyncBridge(room2, store2, asPlayerId('player-black'));

    // Wait for match to enter PLAYING
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
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.enPassantTarget).toBe('e3');
    expect(room2.state.enPassantTarget).toBe('e3');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Step 2: Black plays a7 -> a6 (quiet move, clears enPassantTarget)
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-a'), asCoordinateKey('a7'), asCoordinateKey('a6'));
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.enPassantTarget).toBe('');
    expect(room2.state.enPassantTarget).toBe('');
    expect(room1.state.activePlayerId).toBe('player-white');

    // Step 3: White advances e4 -> e5
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e4'), asCoordinateKey('e5'));
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.boardEntities.get('piece-w-p-e')?.position).toBe('e5');
    expect(room1.state.enPassantTarget).toBe('');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Step 4: Black plays 2-square pawn push d7 -> d5! (creates enPassantTarget 'd6')
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-d'), asCoordinateKey('d7'), asCoordinateKey('d5'));
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.boardEntities.get('piece-b-p-d')?.position).toBe('d5');
    expect(room1.state.enPassantTarget).toBe('d6');
    expect(room2.state.enPassantTarget).toBe('d6');
    expect(room1.state.activePlayerId).toBe('player-white');

    // Step 5: White plays En Passant capture e5 -> d6!
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-e'), asCoordinateKey('e5'), asCoordinateKey('d6'));
    await new Promise((r) => setTimeout(r, 180));

    // Verify White pawn is at d6
    expect(room1.state.boardEntities.get('piece-w-p-e')?.position).toBe('d6');
    expect(room2.state.boardEntities.get('piece-w-p-e')?.position).toBe('d6');

    // Verify victim pawn piece-b-p-d is captured
    const victim1 = room1.state.boardEntities.get('piece-b-p-d');
    const victim2 = room2.state.boardEntities.get('piece-b-p-d');
    expect(victim1?.isCaptured).toBe(true);
    expect(victim1?.position).toBe('');
    expect(victim2?.isCaptured).toBe(true);
    expect(victim2?.position).toBe('');

    // Verify enPassantTarget was reset after capture
    expect(room1.state.enPassantTarget).toBe('');
    expect(room2.state.enPassantTarget).toBe('');

    // Verify PIECE_CAPTURED_EVENT was received by both clients
    expect(captureEvents.client1).toBeDefined();
    expect(captureEvents.client1?.capturedPieceId).toBe('piece-b-p-d');
    expect(captureEvents.client2).toBeDefined();
    expect(captureEvents.client2?.capturedPieceId).toBe('piece-b-p-d');

    bridge1.dispose();
    bridge2.dispose();
  });

  it('authoritatively ends match on Fool\'s Mate checkmate and locks further moves (P0, RF-05)', async () => {
    const tokenP1 = signAuthToken({ playerId: 'player-white', username: 'WhiteMate' });
    const tokenP2 = signAuthToken({ playerId: 'player-black', username: 'BlackMate' });

    const client1 = new ColyseusClient({ endpoint });
    const store1 = createGameStore();
    const room1 = await client1.joinOrCreateRoom({ authToken: tokenP1, matchId: 'e2e-checkmate-room' });
    const bridge1 = new StateSyncBridge(room1, store1, asPlayerId('player-white'));

    const client2 = new ColyseusClient({ endpoint });
    const store2 = createGameStore();
    const room2 = await client2.joinOrCreateRoom({ authToken: tokenP2, matchId: 'e2e-checkmate-room' });
    const bridge2 = new StateSyncBridge(room2, store2, asPlayerId('player-black'));

    // Wait for match to enter PLAYING
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
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.boardEntities.get('piece-w-p-f')?.position).toBe('f3');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Move 2: Black plays e7 -> e5
    bridge2.sendOptimisticMove(asEntityId('piece-b-p-e'), asCoordinateKey('e7'), asCoordinateKey('e5'));
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.boardEntities.get('piece-b-p-e')?.position).toBe('e5');
    expect(room1.state.activePlayerId).toBe('player-white');

    // Move 3: White plays g2 -> g4
    bridge1.sendOptimisticMove(asEntityId('piece-w-p-g'), asCoordinateKey('g2'), asCoordinateKey('g4'));
    await new Promise((r) => setTimeout(r, 150));
    expect(room1.state.boardEntities.get('piece-w-p-g')?.position).toBe('g4');
    expect(room1.state.activePlayerId).toBe('player-black');

    // Move 4: Black plays Queen d8 -> h4 CHECKMATE!
    bridge2.sendOptimisticMove(asEntityId('piece-b-Q-d8'), asCoordinateKey('d8'), asCoordinateKey('h4'));
    await new Promise((r) => setTimeout(r, 200));

    // Server state must be GAME_OVER with winner player-black
    expect(room1.state.phase).toBe('GAME_OVER');
    expect(room1.state.winnerId).toBe('player-black');
    expect(room2.state.phase).toBe('GAME_OVER');
    expect(room2.state.winnerId).toBe('player-black');

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
});

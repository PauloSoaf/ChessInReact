import { describe, it, expect, beforeEach } from 'vitest';
import { ChessRoom, IClientConnection } from '../src/rooms/ChessRoom';
import { RoomAllocator } from '../../matchmaker-worker/src/RoomAllocator';

describe('Spec 08 - Game Stateful: ChessRoom onAuth Handshake (Spec 08 § 7.1, Acceptance Criteria 3)', () => {
  const SECRET = 'test_colyseus_secret';
  let room: ChessRoom;
  let allocator: RoomAllocator;

  beforeEach(() => {
    room = new ChessRoom('room_alpha_100', SECRET);
    allocator = new RoomAllocator(SECRET);
  });

  it('accepts connection when valid, unexpired match ticket token is presented', async () => {
    const token = allocator.generateTicketJwt({
      userId: 'player-valid',
      matchId: 'room_alpha_100',
      elo: 1750,
      factionIndex: 0,
      exp: Math.floor(Date.now() / 1000) + 30,
    });

    const client: IClientConnection = { id: 'client-conn-1' };
    const authResult = await room.onAuth(client, { matchTicket: token });

    expect(authResult).not.toBe(false);
    if (authResult) {
      expect(authResult.userId).toBe('player-valid');
      expect(authResult.elo).toBe(1750);
      expect(authResult.factionIndex).toBe(0);
    }
  });

  it('rejects connection when ticket token is missing', async () => {
    const client: IClientConnection = { id: 'client-conn-2' };
    const authResult = await room.onAuth(client, {});
    expect(authResult).toBe(false);
  });

  it('rejects connection when ticket signature is forged or counterfeit', async () => {
    const otherAllocator = new RoomAllocator('attacker_evil_secret');
    const forgedToken = otherAllocator.generateTicketJwt({
      userId: 'hacker',
      matchId: 'room_alpha_100',
      elo: 2900,
      factionIndex: 0,
      exp: Math.floor(Date.now() / 1000) + 30,
    });

    const client: IClientConnection = { id: 'client-conn-3' };
    const authResult = await room.onAuth(client, { matchTicket: forgedToken });
    expect(authResult).toBe(false);
  });

  it('rejects connection when token is issued for a different room (Wrong Room Ticket)', async () => {
    const wrongRoomToken = allocator.generateTicketJwt({
      userId: 'player-lost',
      matchId: 'room_other_999',
      elo: 1500,
      factionIndex: 0,
      exp: Math.floor(Date.now() / 1000) + 30,
    });

    const client: IClientConnection = { id: 'client-conn-4' };
    const authResult = await room.onAuth(client, { matchTicket: wrongRoomToken });
    expect(authResult).toBe(false);
  });

  it('rejects duplicate connections for the same user (anti-tab hijack)', async () => {
    const token = allocator.generateTicketJwt({
      userId: 'alice',
      matchId: 'room_alpha_100',
      elo: 1600,
      factionIndex: 1,
      exp: Math.floor(Date.now() / 1000) + 30,
    });

    const client1: IClientConnection = { id: 'client-alice-tab1' };
    const client2: IClientConnection = { id: 'client-alice-tab2' };

    const first = await room.onAuth(client1, { matchTicket: token });
    expect(first).not.toBe(false);

    // Second connection attempt from Alice
    const duplicate = await room.onAuth(client2, { matchTicket: token });
    expect(duplicate).toBe(false);

    // Once Alice leaves, she can reconnect
    room.onLeave('alice');
    const reconnected = await room.onAuth(client2, { matchTicket: token });
    expect(reconnected).not.toBe(false);
  });
});


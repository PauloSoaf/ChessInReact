/**
 * Stateful Game Server Entrypoint (Spec 08 § 7.1)
 */
import http from 'http';
import { ChessRoom } from './rooms/ChessRoom';

const PORT = parseInt(process.env.PORT || '2567', 10);
const activeRooms = new Map<string, ChessRoom>();

export function getOrCreateRoom(roomId: string): ChessRoom {
  let room = activeRooms.get(roomId);
  if (!room) {
    room = new ChessRoom(roomId);
    activeRooms.set(roomId, room);
  }
  return room;
}

export const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'game-server', rooms: activeRooms.size }));
    return;
  }

  // Auth validation endpoint for proxy / load-balancer checks
  if (req.method === 'POST' && path === '/api/rooms/auth') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      try {
        const { roomId, token } = JSON.parse(body || '{}');
        if (!roomId || !token) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing roomId or token' }));
          return;
        }
        const room = getOrCreateRoom(roomId);
        const client = { id: `client_${Date.now()}` };
        const authorized = room.onAuth(client, { matchTicket: token });
        res.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authorized, clientData: client }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid payload' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[GAME-SERVER] Colyseus Game Server listening on port ${PORT}`);
  });
}


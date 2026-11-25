/**
 * Edge Relay Service Entrypoint (Spec 08 § 8.1, § 11 #4)
 */
import http from 'http';
import { SpectatorRelay } from './SpectatorRelay';

const PORT = parseInt(process.env.PORT || '4000', 10);
const relay = new SpectatorRelay();

export const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'edge-relay', timestamp: Date.now() }));
    return;
  }

  const match = path.match(/^\/api\/spectate\/([^/]+)$/);
  if (req.method === 'GET' && match) {
    const roomId = match[1];
    relay.handleSpectateRequest(
      {
        params: { roomId },
        on: (event: string, cb: () => void) => {
          if (event === 'close') {
            req.on('close', cb);
          }
        },
      },
      res
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Not found: ${path}` }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[EDGE-RELAY] SSE Spectator Relay listening on port ${PORT}`);
  });
}


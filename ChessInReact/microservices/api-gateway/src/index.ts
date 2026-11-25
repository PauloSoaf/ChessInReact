/**
 * API Gateway Service Entrypoint (Spec 08 § 5.1, § 7)
 */
import http from 'http';
import { createMatchmakerRouter } from './routes/matchmaker';
import { MatchmakerController } from './controllers/MatchmakerController';

const PORT = parseInt(process.env.PORT || '3000', 10);
const controller = new MatchmakerController();
const router = createMatchmakerRouter(controller);

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
    res.end(JSON.stringify({ status: 'ok', service: 'api-gateway', timestamp: Date.now() }));
    return;
  }

  let bodyStr = '';
  req.on('data', (chunk) => {
    bodyStr += chunk;
  });

  req.on('end', () => {
    let parsedBody: Record<string, unknown> = {};
    try {
      if (bodyStr.trim()) {
        parsedBody = JSON.parse(bodyStr);
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
      return;
    }

    const response = router.dispatch(req.method || 'GET', path, {
      body: parsedBody,
      headers: (req.headers as Record<string, string>) || {},
      query: Object.fromEntries(url.searchParams.entries()),
    });

    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response.body));
  });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[API-GATEWAY] Listening on port ${PORT}`);
  });
}


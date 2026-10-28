import http from 'http';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ChessRoom } from './rooms/ChessRoom';
import { validateJwtBootstrap } from './auth/jwtAuth';

export interface IServerInstance {
  httpServer: http.Server;
  gameServer: Server;
  port: number;
  close: () => Promise<void>;
}

/**
 * Creates and configures the Colyseus Authoritative Game Server instance.
 * Conforms to Spec 03 Section 18 (Render.com free tier, /health endpoint, graceful shutdown).
 */
export function createGameServer(requestedPort?: number): IServerInstance {
  validateJwtBootstrap();
  const port = requestedPort ?? Number(process.env.PORT || 2567);

  const httpServer = http.createServer((req, res) => {
    // Health check endpoint for Render.com free-tier warm-up (US03-D05, Spec 03 Sec 18)
    if (req.url === '/health' || req.url === '/') {
      const memory = process.memoryUsage();
      const payload = {
        status: 'healthy',
        service: 'chessinreact-authoritative-server',
        timestamp: Date.now(),
        uptimeSeconds: Math.floor(process.uptime()),
        memoryRssMb: Number((memory.rss / (1024 * 1024)).toFixed(2)),
        memoryHeapUsedMb: Number((memory.heapUsed / (1024 * 1024)).toFixed(2)),
      };

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify(payload));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const gameServer = new Server({
    transport: new WebSocketTransport({
      server: httpServer,
      pingInterval: 5000,
      pingMaxRetries: 3,
    }),
  });

  // Define the authoritative chess room with matchId filtering
  gameServer.define('chess_room', ChessRoom).filterBy(['matchId']);

  const close = async (): Promise<void> => {
    await gameServer.gracefullyShutdown(false);
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return {
    httpServer,
    gameServer,
    port,
    close,
  };
}

/**
 * Standalone server launcher when executed as a main entrypoint.
 */
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  const server = createGameServer();
  server.gameServer.listen(server.port).then(() => {
    console.log(`[GameServer] Authoritative Colyseus Server running on port ${server.port}`);
  });

  const handleShutdown = async (signal: string) => {
    console.log(`[GameServer] Received ${signal}. Gracefully shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

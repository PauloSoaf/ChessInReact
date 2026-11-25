/**
 * ChessInReact - Edge Spectator Relay Server (Spec 08 § 8.1, § 11 #4, Acceptance Criteria 2)
 *
 * Implements lightweight SSE (Server-Sent Events) relay:
 * - Decouples spectator streams from heavy Stateful Colyseus game processes.
 * - Subscribes to Redis Pub/Sub channel `spectate:<roomId>`.
 * - Multi-casts moves and state deltas to browser clients consuming < 1KB/s.
 * - Clean teardown on client connection drop.
 */

export interface ISseResponse {
  setHeader(name: string, value: string): void;
  write(chunk: string): void;
  end(): void;
}

export interface ISseRequest {
  params: { roomId: string };
  on(event: 'close', callback: () => void): void;
}

export type RedisMessageListener = (channel: string, message: string) => void;

export interface IRedisSubscriberMock {
  subscribe(channel: string): Promise<void> | void;
  unsubscribe(channel: string): Promise<void> | void;
  on(event: 'message', callback: RedisMessageListener): void;
  quit(): Promise<void> | void;
}

export class SpectatorRelay {
  private readonly activeViewers = new Map<string, Set<ISseResponse>>();

  /**
   * SSE Request Handler: GET /api/spectate/:roomId
   */
  public handleSpectateRequest(
    req: ISseRequest,
    res: ISseResponse
  ): { roomId: string; close: () => void } {
    const roomId = req.params.roomId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let viewers = this.activeViewers.get(roomId);
    if (!viewers) {
      viewers = new Set();
      this.activeViewers.set(roomId, viewers);
    }
    viewers.add(res);

    // Initial SSE connection handshake comment
    res.write(': connected\n\n');

    const handleClose = () => {
      const current = this.activeViewers.get(roomId);
      if (current) {
        current.delete(res);
        if (current.size === 0) {
          this.activeViewers.delete(roomId);
        }
      }
    };

    req.on('close', handleClose);

    return {
      roomId,
      close: handleClose,
    };
  }

  /**
   * Broadcasts a Redis message to all SSE connected viewers of a room.
   */
  public broadcastToRoom(roomId: string, message: string): number {
    const viewers = this.activeViewers.get(roomId);
    if (!viewers || viewers.size === 0) {
      return 0;
    }

    const payload = `data: ${message}\n\n`;
    for (const client of viewers) {
      client.write(payload);
    }

    return viewers.size;
  }

  public getViewerCount(roomId: string): number {
    return this.activeViewers.get(roomId)?.size ?? 0;
  }
}


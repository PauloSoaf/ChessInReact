import { Client, Room } from 'colyseus.js';
import { ChessRoomStateSchema } from '../../src-backend/game-server/schemas/RoomStateSchema';
import {
  MultiplayerConnectionStatus,
  IClockSyncInfo,
  IPongPayload,
} from './types';

export interface IColyseusClientConfig {
  endpoint: string;
  autoPingIntervalMs?: number;
}

export interface IJoinOptions {
  authToken: string;
  matchId?: string;
  spectatorMode?: boolean;
}

/**
 * ColyseusClient manages the WebSocket connection lifecycle, JWT authentication handshake,
 * Cristian's algorithm clock synchronization (RF-05, RF-13), and 60-second seamless reconnection.
 */
export class ColyseusClient {
  private client: Client;
  private currentRoom: Room<ChessRoomStateSchema> | null = null;
  private connectionStatus: MultiplayerConnectionStatus = 'DISCONNECTED';
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private clockSyncInfo: IClockSyncInfo = {
    rttMs: 0,
    clockOffsetMs: 0,
    lastSyncTimestamp: 0,
  };

  private statusListeners: Array<(status: MultiplayerConnectionStatus) => void> = [];
  private clockListeners: Array<(sync: IClockSyncInfo) => void> = [];

  constructor(public readonly config: IColyseusClientConfig) {
    this.client = new Client(config.endpoint);
  }

  public getStatus(): MultiplayerConnectionStatus {
    return this.connectionStatus;
  }

  public getRoom(): Room<ChessRoomStateSchema> | null {
    return this.currentRoom;
  }

  public getClockSyncInfo(): IClockSyncInfo {
    return { ...this.clockSyncInfo };
  }

  public onStatusChange(callback: (status: MultiplayerConnectionStatus) => void): () => void {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  public onClockSync(callback: (sync: IClockSyncInfo) => void): () => void {
    this.clockListeners.push(callback);
    return () => {
      this.clockListeners = this.clockListeners.filter((cb) => cb !== callback);
    };
  }

  private setStatus(status: MultiplayerConnectionStatus): void {
    this.connectionStatus = status;
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('[ColyseusClient] Error in status listener:', err);
      }
    }
  }

  /**
   * Connects to a chess room with JWT authentication and options.
   */
  public async joinOrCreateRoom(options: IJoinOptions): Promise<Room<ChessRoomStateSchema>> {
    this.setStatus('CONNECTING');

    try {
      const room = await this.client.joinOrCreate<ChessRoomStateSchema>(
        'chess_room',
        {
          authToken: options.authToken,
          matchId: options.matchId,
          spectatorMode: options.spectatorMode,
        },
        ChessRoomStateSchema
      );

      this.currentRoom = room;
      this.setStatus('CONNECTED');
      this.setupRoomHandlers(room);
      this.startPingTelemetry();

      // Await initial authoritative state snapshot synchronization
      await new Promise<void>((resolve) => {
        if (room.state && room.state.phase) {
          resolve();
        } else {
          room.onStateChange.once(() => resolve());
          setTimeout(resolve, 300);
        }
      });

      return room;
    } catch (err: unknown) {
      this.setStatus('ERROR');
      const message = err instanceof Error ? err.message : 'Failed to join room';
      throw new Error(`[ColyseusClient] Connection rejected: ${message}`);
    }
  }

  /**
   * Reconnects to an existing room session using cached token and identifiers (RF-08, RNF-10).
   */
  public async reconnectRoom(
    reconnectionToken: string
  ): Promise<Room<ChessRoomStateSchema>> {
    this.setStatus('RECONNECTING');

    try {
      const room = await this.client.reconnect<ChessRoomStateSchema>(
        reconnectionToken,
        ChessRoomStateSchema
      );
      this.currentRoom = room;
      this.setStatus('CONNECTED');
      this.setupRoomHandlers(room);
      this.startPingTelemetry();

      return room;
    } catch (err: unknown) {
      this.setStatus('ERROR');
      const message = err instanceof Error ? err.message : 'Reconnection failed';
      throw new Error(`[ColyseusClient] Reconnection failed: ${message}`);
    }
  }

  /**
   * Sends an authoritative message payload to the server.
   */
  public send(type: string, message: unknown): void {
    if (!this.currentRoom) {
      throw new Error('[ColyseusClient] Cannot send message: Not connected to any room.');
    }
    this.currentRoom.send(type, message);
  }

  /**
   * Disconnects and releases resources cleanly.
   */
  public async leave(consented: boolean = true): Promise<void> {
    this.stopPingTelemetry();
    if (this.currentRoom) {
      await this.currentRoom.leave(consented);
      this.currentRoom = null;
    }
    this.setStatus('DISCONNECTED');
  }

  /**
   * Measure Round-Trip Time and Clock Offset via Cristian's Algorithm (RF-05, RF-13).
   */
  public performClockSync(): void {
    if (!this.currentRoom) return;
    const clientSendTime = Date.now();
    this.currentRoom.send('PING', { clientSendTime });
  }

  private setupRoomHandlers(room: Room<ChessRoomStateSchema>): void {
    room.onMessage('PONG', (message: IPongPayload) => {
      const clientReceiveTime = Date.now();
      const rtt = Math.max(0, clientReceiveTime - message.clientSendTime);
      const serverTimeEstimate = message.serverReceiveTime + rtt / 2;
      const clockOffset = serverTimeEstimate - clientReceiveTime;

      this.clockSyncInfo = {
        rttMs: rtt,
        clockOffsetMs: clockOffset,
        lastSyncTimestamp: clientReceiveTime,
      };

      for (const listener of this.clockListeners) {
        try {
          listener(this.clockSyncInfo);
        } catch (err) {
          console.error('[ColyseusClient] Error in clock listener:', err);
        }
      }
    });

    room.onLeave((code) => {
      this.stopPingTelemetry();
      this.currentRoom = null;
      if (code > 1000) {
        this.setStatus('ERROR');
      } else {
        this.setStatus('DISCONNECTED');
      }
    });

    room.onError((code, message) => {
      console.warn(`[ColyseusClient] Room error ${code}: ${message}`);
      this.setStatus('ERROR');
    });
  }

  private startPingTelemetry(): void {
    this.stopPingTelemetry();
    const interval = this.config.autoPingIntervalMs ?? 5000;
    this.performClockSync();
    this.pingIntervalId = setInterval(() => {
      this.performClockSync();
    }, interval);
  }

  private stopPingTelemetry(): void {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }
}

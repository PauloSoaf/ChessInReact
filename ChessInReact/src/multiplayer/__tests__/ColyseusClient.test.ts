import { describe, it, expect, vi } from 'vitest';
import { ColyseusClient } from '../ColyseusClient';

interface IClientInternals {
  setStatus(status: string): void;
  currentRoom: unknown;
  setupRoomHandlers(room: unknown): void;
}

describe('Spec 03 - ColyseusClient (RF-05, RF-12, RF-13)', () => {
  it('initializes with DISCONNECTED status and zero clock offset', () => {
    const client = new ColyseusClient({ endpoint: 'ws://localhost:2567' });

    expect(client.getStatus()).toBe('DISCONNECTED');
    expect(client.getRoom()).toBeNull();

    const clock = client.getClockSyncInfo();
    expect(clock.rttMs).toBe(0);
    expect(clock.clockOffsetMs).toBe(0);
  });

  it('notifies status listeners on status change and allows unsubscribing', () => {
    const client = new ColyseusClient({ endpoint: 'ws://localhost:2567' });
    const listener = vi.fn();

    const unsubscribe = client.onStatusChange(listener);
    // Access private setStatus for verification
    (client as unknown as IClientInternals).setStatus('CONNECTING');
    expect(listener).toHaveBeenCalledWith('CONNECTING');

    unsubscribe();
    (client as unknown as IClientInternals).setStatus('CONNECTED');
    expect(listener).toHaveBeenCalledTimes(1); // Not called after unsubscribe
  });

  it('calculates Round-Trip Time and Clock Offset correctly via Cristian algorithm (RF-05, RF-13)', () => {
    const client = new ColyseusClient({ endpoint: 'ws://localhost:2567' });
    const clockListener = vi.fn();
    client.onClockSync(clockListener);

    // Simulate mock room with onMessage handler
    const messageHandlers = new Map<string, (payload: { clientSendTime: number; serverReceiveTime: number }) => void>();
    const mockRoom = {
      send: vi.fn(),
      onMessage: vi.fn((type: string, handler: (payload: { clientSendTime: number; serverReceiveTime: number }) => void) => {
        messageHandlers.set(type, handler);
      }),
      onLeave: vi.fn(),
      onError: vi.fn(),
    };

    (client as unknown as IClientInternals).currentRoom = mockRoom;
    (client as unknown as IClientInternals).setupRoomHandlers(mockRoom);

    // Simulate PONG reception
    // Client sent at t=1000, server received at t=1040, client receives at t=1080
    const pongHandler = messageHandlers.get('PONG');
    expect(pongHandler).toBeDefined();

    vi.spyOn(Date, 'now').mockReturnValue(1080);

    pongHandler!({
      clientSendTime: 1000,
      serverReceiveTime: 1040,
    });

    const clockInfo = client.getClockSyncInfo();
    // RTT = 1080 - 1000 = 80ms
    expect(clockInfo.rttMs).toBe(80);
    // ServerEstimate = 1040 + (80 / 2) = 1080ms
    // ClockOffset = 1080 - 1080 = 0ms
    expect(clockInfo.clockOffsetMs).toBe(0);
    expect(clockListener).toHaveBeenCalledWith(clockInfo);
  });

  it('throws descriptive error if attempting to send when not connected', () => {
    const client = new ColyseusClient({ endpoint: 'ws://localhost:2567' });
    expect(() => client.send('PLAYER_MOVE', {})).toThrow(
      'Cannot send message: Not connected to any room.'
    );
  });
});

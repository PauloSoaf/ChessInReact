import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpectatorRelay, ISseRequest, ISseResponse } from '../src/SpectatorRelay';

describe('Spec 08 - Edge Relay: Spectator SSE Stream (Spec 08 § 8.1, Acceptance Criteria 2)', () => {
  let relay: SpectatorRelay;

  beforeEach(() => {
    relay = new SpectatorRelay();
  });

  it('sets correct SSE headers and initial keep-alive comment', () => {
    const headers: Record<string, string> = {};
    const writtenChunks: string[] = [];

    const mockRes: ISseResponse = {
      setHeader: vi.fn((k, v) => {
        headers[k] = v;
      }),
      write: vi.fn((c) => writtenChunks.push(c)),
      end: vi.fn(),
    };

    const mockReq: ISseRequest = {
      params: { roomId: 'room-stream-1' },
      on: vi.fn(),
    };

    relay.handleSpectateRequest(mockReq, mockRes);

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache');
    expect(headers['Connection']).toBe('keep-alive');
    expect(writtenChunks).toContain(': connected\n\n');
    expect(relay.getViewerCount('room-stream-1')).toBe(1);
  });

  it('broadcasts Redis published moves to all connected SSE spectators', () => {
    const chunksA: string[] = [];
    const chunksB: string[] = [];

    const resA: ISseResponse = {
      setHeader: vi.fn(),
      write: vi.fn((c) => chunksA.push(c)),
      end: vi.fn(),
    };
    const resB: ISseResponse = {
      setHeader: vi.fn(),
      write: vi.fn((c) => chunksB.push(c)),
      end: vi.fn(),
    };

    const reqA: ISseRequest = { params: { roomId: 'room-grand-final' }, on: vi.fn() };
    const reqB: ISseRequest = { params: { roomId: 'room-grand-final' }, on: vi.fn() };

    relay.handleSpectateRequest(reqA, resA);
    relay.handleSpectateRequest(reqB, resB);

    expect(relay.getViewerCount('room-grand-final')).toBe(2);

    const movePayload = JSON.stringify({ ply: 15, move: 'Nf3', fen: 'fen_state_after_nf3' });
    const count = relay.broadcastToRoom('room-grand-final', movePayload);

    expect(count).toBe(2);
    expect(chunksA).toContain(`data: ${movePayload}\n\n`);
    expect(chunksB).toContain(`data: ${movePayload}\n\n`);
  });

  it('unsubscribes client and cleans up viewer count when client disconnects', () => {
    let closeCallback: (() => void) | null = null;
    const mockReq: ISseRequest = {
      params: { roomId: 'room-closing' },
      on: vi.fn((event, cb) => {
        if (event === 'close') closeCallback = cb;
      }),
    };
    const mockRes: ISseResponse = {
      setHeader: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };

    relay.handleSpectateRequest(mockReq, mockRes);
    expect(relay.getViewerCount('room-closing')).toBe(1);

    expect(closeCallback).not.toBeNull();
    closeCallback!();

    expect(relay.getViewerCount('room-closing')).toBe(0);
  });
});


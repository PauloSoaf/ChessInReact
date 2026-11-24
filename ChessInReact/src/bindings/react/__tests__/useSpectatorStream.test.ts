// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpectatorStream } from '../useSpectatorStream';
import { SpectatorRelayPubSub, ISpectatorEvent } from '../../../matchmaking/engine/SpectatorRelayPubSub';

describe('Spec 08 - useSpectatorStream React Hook (RF-11, US08-P06)', () => {
  let relay: SpectatorRelayPubSub;

  beforeEach(() => {
    relay = new SpectatorRelayPubSub();
  });

  it('initializes in idle state when matchId is null', () => {
    const { result } = renderHook(() => useSpectatorStream(null, relay));
    expect(result.current.isConnected).toBe(false);
    expect(result.current.currentFen).toBeNull();
    expect(result.current.currentPly).toBe(0);
    expect(result.current.spectatorCount).toBe(0);
    expect(result.current.recentEvents).toEqual([]);
  });

  it('subscribes and receives live spectator moves on the fly', () => {
    const { result } = renderHook(() => useSpectatorStream('match-123', relay));

    expect(result.current.isConnected).toBe(true);
    expect(result.current.spectatorCount).toBe(1);

    const event1: ISpectatorEvent = {
      matchId: 'match-123',
      ply: 1,
      moveNotation: 'e4',
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      timestampMs: 1000,
    };

    act(() => {
      relay.publish(event1);
    });

    expect(result.current.currentPly).toBe(1);
    expect(result.current.currentFen).toBe(event1.fen);
    expect(result.current.recentEvents.length).toBe(1);
    expect(result.current.recentEvents[0]?.moveNotation).toBe('e4');
  });

  it('delivers catchup history to newly joining spectators', () => {
    // Publish 2 moves before spectator connects
    relay.publish({
      matchId: 'match-historic',
      ply: 1,
      moveNotation: 'e4',
      fen: 'fen-1',
      timestampMs: 100,
    });
    relay.publish({
      matchId: 'match-historic',
      ply: 2,
      moveNotation: 'e5',
      fen: 'fen-2',
      timestampMs: 200,
    });

    const { result } = renderHook(() => useSpectatorStream('match-historic', relay));

    expect(result.current.isConnected).toBe(true);
    expect(result.current.currentPly).toBe(2);
    expect(result.current.currentFen).toBe('fen-2');
    expect(result.current.recentEvents.length).toBe(2);
  });

  it('unsubscribes and updates spectator count on unmount', () => {
    const { unmount } = renderHook(() => useSpectatorStream('match-unmount', relay));
    expect(relay.getSpectatorCount('match-unmount')).toBe(1);

    unmount();
    expect(relay.getSpectatorCount('match-unmount')).toBe(0);
  });
});


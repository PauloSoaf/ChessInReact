// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMatchmakingQueue } from '../useMatchmakingQueue';
import { MatchmakingQueueEngine } from '../../../matchmaking/engine/MatchmakingQueueEngine';
import { AntiDodgePenaltyManager } from '../../../matchmaking/engine/AntiDodgePenaltyManager';
import { IMatchFoundPayload } from '../../../matchmaking/interfaces/IMatchmakingContracts';

describe('Spec 08 - useMatchmakingQueue Hook (RF-01, RF-03, RF-05, RF-09, RF-10)', () => {
  let queueEngine: MatchmakingQueueEngine;
  let penaltyManager: AntiDodgePenaltyManager;

  beforeEach(() => {
    vi.useFakeTimers();
    queueEngine = new MatchmakingQueueEngine('test-jwt-secret-min-32-characters-spec08');
    penaltyManager = new AntiDodgePenaltyManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with idle state', () => {
    const { result } = renderHook(() =>
      useMatchmakingQueue({ queueClient: queueEngine, penaltyManager })
    );

    expect(result.current.state).toBe('idle');
    expect(result.current.ticket).toBeNull();
    expect(result.current.elapsedSeconds).toBe(0);
    expect(result.current.isHeartbeatActive).toBe(false);
  });

  it('enters searching state and emits heartbeats when joinQueue is called', () => {
    const heartbeatSpy = vi.spyOn(queueEngine, 'heartbeat');
    const { result } = renderHook(() =>
      useMatchmakingQueue({ queueClient: queueEngine, penaltyManager, heartbeatIntervalMs: 5000 })
    );

    act(() => {
      const ok = result.current.joinQueue({
        userId: 'player_test_1',
        displayName: 'Alice',
        eloRating: 1550,
        variantId: 'standard',
        playerCount: 2,
      });
      expect(ok).toBe(true);
    });

    expect(result.current.state).toBe('searching');
    expect(result.current.ticket).not.toBeNull();
    expect(result.current.ticket?.userId).toBe('player_test_1');
    expect(result.current.isHeartbeatActive).toBe(true);

    // Fast-forward 5s
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(heartbeatSpy).toHaveBeenCalledWith(result.current.ticket!.ticketId);
    expect(result.current.elapsedSeconds).toBe(5);
  });

  it('cancels queue cleanly on user request (US08-P02)', () => {
    const leaveSpy = vi.spyOn(queueEngine, 'leaveQueue');
    const { result } = renderHook(() =>
      useMatchmakingQueue({ queueClient: queueEngine, penaltyManager })
    );

    act(() => {
      result.current.joinQueue({
        userId: 'player_cancel',
        displayName: 'Bob',
        eloRating: 1500,
        variantId: 'standard',
      });
    });

    const ticketId = result.current.ticket!.ticketId;

    act(() => {
      result.current.cancelQueue();
    });

    expect(leaveSpy).toHaveBeenCalledWith(ticketId);
    expect(result.current.state).toBe('idle');
    expect(result.current.ticket).toBeNull();
    expect(result.current.isHeartbeatActive).toBe(false);
  });

  it('handles match found and acceptance flow (RF-09, US08-P09)', () => {
    const onAccepted = vi.fn();
    const { result } = renderHook(() =>
      useMatchmakingQueue({ queueClient: queueEngine, penaltyManager, onMatchAccepted: onAccepted })
    );

    act(() => {
      result.current.joinQueue({
        userId: 'player_accepted',
        displayName: 'Charlie',
        eloRating: 1600,
        variantId: 'standard',
      });
    });

    const matchPayload: IMatchFoundPayload = {
      matchId: 'match_123',
      roomId: 'room_123',
      serverUrl: 'wss://chess.example.com',
      assignedPlayerId: 'player_accepted',
      factionIndex: 0,
      matchTicketToken: 'jwt.token.here',
      expiresAt: Date.now() + 30000,
    };

    act(() => {
      result.current.notifyMatchFound(matchPayload);
    });

    expect(result.current.state).toBe('match_found');
    expect(result.current.foundMatch).toEqual(matchPayload);
    expect(result.current.acceptCountdown).toBe(10);

    act(() => {
      result.current.acceptMatch();
    });

    expect(result.current.state).toBe('in_match');
    expect(onAccepted).toHaveBeenCalledWith(matchPayload);
  });

  it('imposes anti-dodge penalty if user declines match (RF-10, US08-P12)', () => {
    const onDeclined = vi.fn();
    const { result } = renderHook(() =>
      useMatchmakingQueue({ queueClient: queueEngine, penaltyManager, onMatchDeclined: onDeclined })
    );

    act(() => {
      result.current.joinQueue({
        userId: 'player_dodger',
        displayName: 'Dave',
        eloRating: 1400,
        variantId: 'standard',
      });
    });

    act(() => {
      result.current.notifyMatchFound({
        matchId: 'm_dodge',
        roomId: 'r_dodge',
        serverUrl: 'wss://chess.example.com',
        assignedPlayerId: 'player_dodger',
        factionIndex: 1,
        matchTicketToken: 'token',
        expiresAt: Date.now() + 30000,
      });
    });

    act(() => {
      result.current.declineMatch('manual');
    });

    expect(result.current.state).toBe('cooldown');
    expect(result.current.penaltyRemainingSeconds).toBeGreaterThan(0);
    expect(onDeclined).toHaveBeenCalledWith('manual');

    // Attempting to join during cooldown must fail
    act(() => {
      const ok = result.current.joinQueue({
        userId: 'player_dodger',
        displayName: 'Dave',
        eloRating: 1400,
        variantId: 'standard',
      });
      expect(ok).toBe(false);
    });
  });

  it('automatically triggers decline on 10s countdown timeout', () => {
    const onDeclined = vi.fn();
    const { result } = renderHook(() =>
      useMatchmakingQueue({
        queueClient: queueEngine,
        penaltyManager,
        acceptTimeoutSeconds: 3,
        onMatchDeclined: onDeclined,
      })
    );

    act(() => {
      result.current.joinQueue({
        userId: 'player_timeout',
        displayName: 'Eve',
        eloRating: 1500,
        variantId: 'standard',
      });
    });

    act(() => {
      result.current.notifyMatchFound({
        matchId: 'm_timeout',
        roomId: 'r_timeout',
        serverUrl: 'wss://chess.example.com',
        assignedPlayerId: 'player_timeout',
        factionIndex: 0,
        matchTicketToken: 'token',
        expiresAt: Date.now() + 30000,
      });
    });

    expect(result.current.state).toBe('match_found');

    // Advance 4s to exceed 3s timeout
    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(result.current.state).toBe('cooldown');
    expect(onDeclined).toHaveBeenCalledWith('timeout');
  });
});

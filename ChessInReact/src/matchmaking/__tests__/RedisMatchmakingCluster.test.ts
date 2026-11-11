import { describe, it, expect, vi } from 'vitest';
import {
  AntiDodgePenaltyManager,
  SpectatorRelayPubSub,
  PresenceTracker,
  ISpectatorEvent,
} from '../index';

describe('Spec 08 - Redis Matchmaking Cluster: Anti-Dodge, Spectator PubSub & Presence (S08-RF10, S08-RF11, S08-RF14)', () => {
  describe('AntiDodgePenaltyManager (RF-10 Anti-Dodge Cooldown)', () => {
    it('allows clean players to join queue without restriction', () => {
      const manager = new AntiDodgePenaltyManager();
      const status = manager.canJoinQueue('player_clean_1');
      expect(status.allowed).toBe(true);
      expect(status.remainingLockSeconds).toBeUndefined();
    });

    it('imposes 60-second cooldown on first dodge and escalates on consecutive dodges', () => {
      const manager = new AntiDodgePenaltyManager();
      const now = 1000000;

      // 1st dodge: 60s
      const record1 = manager.registerDodge('player_dodge_1', now);
      expect(record1.dodgeCount).toBe(1);
      expect(record1.lockedUntilMs).toBe(now + 60000);

      const check1 = manager.canJoinQueue('player_dodge_1', now + 10000);
      expect(check1.allowed).toBe(false);
      expect(check1.remainingLockSeconds).toBe(50);

      // Lock expires after 60s
      const checkExpired = manager.canJoinQueue('player_dodge_1', now + 60001);
      expect(checkExpired.allowed).toBe(true);

      // 2nd consecutive dodge within 24h: escalates to 300s (5 min)
      const record2 = manager.registerDodge('player_dodge_1', now + 70000);
      expect(record2.dodgeCount).toBe(2);
      expect(record2.lockedUntilMs).toBe(now + 70000 + 300000);

      // 3rd consecutive dodge: escalates to 900s (15 min)
      const record3 = manager.registerDodge('player_dodge_1', now + 80000);
      expect(record3.dodgeCount).toBe(3);
      expect(record3.lockedUntilMs).toBe(now + 80000 + 900000);
    });

    it('resets dodge count to 1 if consecutive dodge happens after 24h clean window', () => {
      const manager = new AntiDodgePenaltyManager();
      const now = 1000000;
      manager.registerDodge('player_reset', now);

      const twentyFiveHoursLater = now + 25 * 60 * 60 * 1000;
      const newRecord = manager.registerDodge('player_reset', twentyFiveHoursLater);
      expect(newRecord.dodgeCount).toBe(1);
      expect(newRecord.lockedUntilMs).toBe(twentyFiveHoursLater + 60000);
    });

    it('allows clearing penalty directly via clearPenalty', () => {
      const manager = new AntiDodgePenaltyManager();
      manager.registerDodge('player_clear', 1000000);

      expect(manager.canJoinQueue('player_clear', 1000010).allowed).toBe(false);
      manager.clearPenalty('player_clear');
      expect(manager.canJoinQueue('player_clear', 1000010).allowed).toBe(true);
    });
  });

  describe('SpectatorRelayPubSub (RF-11 Spectator Broadcast)', () => {
    it('broadcasts events to subscribed spectators and maintains subscriber count', () => {
      const relay = new SpectatorRelayPubSub();
      const receivedEventsA: ISpectatorEvent[] = [];
      const receivedEventsB: ISpectatorEvent[] = [];

      const subA = relay.subscribe('match_live_1', (e) => receivedEventsA.push(e));
      const subB = relay.subscribe('match_live_1', (e) => receivedEventsB.push(e));

      expect(relay.getSpectatorCount('match_live_1')).toBe(2);

      const event1: ISpectatorEvent = {
        matchId: 'match_live_1',
        ply: 1,
        moveNotation: 'e4',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        timestampMs: 1200,
      };

      relay.publish(event1);

      expect(receivedEventsA).toHaveLength(1);
      expect(receivedEventsA[0]?.moveNotation).toBe('e4');
      expect(receivedEventsB).toHaveLength(1);

      // Unsubscribe one viewer
      subA.unsubscribe();
      expect(relay.getSpectatorCount('match_live_1')).toBe(1);

      const event2: ISpectatorEvent = {
        matchId: 'match_live_1',
        ply: 2,
        moveNotation: 'e5',
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
        timestampMs: 2500,
      };

      relay.publish(event2);

      expect(receivedEventsA).toHaveLength(1); // subA unsubscribed
      expect(receivedEventsB).toHaveLength(2); // subB still active

      subB.unsubscribe();
      expect(relay.getSpectatorCount('match_live_1')).toBe(0);
    });

    it('delivers catchup buffer to late-joining spectators', () => {
      const relay = new SpectatorRelayPubSub();

      // Publish events before spectator joins
      relay.publish({ matchId: 'match_buf', ply: 1, moveNotation: 'd4', fen: '', timestampMs: 1000 });
      relay.publish({ matchId: 'match_buf', ply: 2, moveNotation: 'd5', fen: '', timestampMs: 2000 });

      // Late viewer joins
      const sub = relay.subscribe('match_buf', vi.fn());
      expect(sub.initialCatchup).toHaveLength(2);
      expect(sub.initialCatchup[0]?.moveNotation).toBe('d4');
      expect(sub.initialCatchup[1]?.moveNotation).toBe('d5');

      sub.unsubscribe();
      relay.closeChannel('match_buf');
      expect(relay.getSpectatorCount('match_buf')).toBe(0);
    });
  });

  describe('PresenceTracker (RF-14 Online Presence Synchronization)', () => {
    it('records heartbeats and reports active online concurrency', () => {
      const tracker = new PresenceTracker();
      const now = 2000000;

      tracker.recordHeartbeat('user_1', 'standard', now);
      tracker.recordHeartbeat('user_2', 'duck', now);
      tracker.recordHeartbeat('user_3', 'standard', now);

      expect(tracker.getOnlineCount(now)).toBe(3);

      const breakdown = tracker.getPresenceBreakdown(now);
      expect(breakdown['standard']).toBe(2);
      expect(breakdown['duck']).toBe(1);
    });

    it('purges stale users older than 30s TTL automatically', () => {
      const tracker = new PresenceTracker();
      const now = 2000000;

      tracker.recordHeartbeat('user_fresh', 'lobby', now);
      tracker.recordHeartbeat('user_stale', 'lobby', now - 35000); // 35s old

      expect(tracker.getOnlineCount(now)).toBe(1); // user_stale evicted
      expect(tracker.getPresenceBreakdown(now)['lobby']).toBe(1);
    });

    it('supports immediate explicit user removal on logout', () => {
      const tracker = new PresenceTracker();
      const now = 2000000;

      tracker.recordHeartbeat('user_logout', 'lobby', now);
      expect(tracker.getOnlineCount(now)).toBe(1);

      tracker.removeUser('user_logout');
      expect(tracker.getOnlineCount(now)).toBe(0);
    });
  });
});

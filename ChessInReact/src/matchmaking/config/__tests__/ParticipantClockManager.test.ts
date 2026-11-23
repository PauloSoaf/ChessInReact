import { describe, it, expect } from 'vitest';
import { ParticipantClockManager } from '../ParticipantClockManager';
import { IMatchConfiguration } from '../IMatchConfiguration';

describe('ParticipantClockManager (Spec 16 § 4, Spec 06 RF-09, RNF-16-02)', () => {
  const createMockConfig = (
    playerCount: number,
    initialSeconds = 300,
    incrementSeconds = 0
  ): IMatchConfiguration => {
    const slots = Array.from({ length: playerCount }, (_, i) => ({
      slotIndex: i,
      role: 'HUMAN_LOCAL' as const,
      displayName: `Player ${i + 1}`,
      colorName: `Color ${i + 1}`,
      hexColor: '#ffffff',
      clock: { initialSeconds, incrementSeconds },
    }));

    return {
      schemaVersion: '1.0.0',
      matchId: `test-match-${playerCount}p`,
      variantId: 'classic_square',
      modeType: playerCount === 2 ? '1V1' : 'FFA',
      totalParticipants: playerCount,
      slots,
      eliminationPolicy: 'EVAPORATION',
      autoStandinOnDisconnect: true,
    };
  };

  it('initializes clocks correctly for standard 2-player match', () => {
    const config = createMockConfig(2, 180, 2);
    const manager = new ParticipantClockManager(config);

    expect(manager.getTimeLeftMs('P1')).toBe(180000);
    expect(manager.getTimeLeftMs('P2')).toBe(180000);
    const clocks = manager.getClocksMap();
    expect(Object.keys(clocks)).toEqual(['P1', 'P2']);
  });

  it('supports up to 12 participants in massive multiplayer arenas', () => {
    const config = createMockConfig(12, 60, 1);
    const manager = new ParticipantClockManager(config);

    const clocks = manager.getClocksMap();
    expect(Object.keys(clocks)).toHaveLength(12);
    expect(clocks['P1']).toBe(60000);
    expect(clocks['P12']).toBe(60000);
  });

  it('monotonically decrements active player clock based on real timestamp deltas', () => {
    const config = createMockConfig(2, 300, 0);
    const manager = new ParticipantClockManager(config);

    manager.start('P1', 1000);
    const tickResult = manager.tick(2500); // 1500ms elapsed

    expect(tickResult.timedOutPlayer).toBeNull();
    expect(tickResult.updatedClocks['P1']).toBe(298500);
    expect(tickResult.updatedClocks['P2']).toBe(300000); // Inactive player untouched
  });

  it('detects timeout authoritative event when clock reaches 0', () => {
    const config = createMockConfig(2, 5, 0); // 5 seconds
    const manager = new ParticipantClockManager(config);

    manager.start('P1', 1000);
    const tickResult = manager.tick(7000); // 6000ms elapsed, exceeds 5000ms

    expect(tickResult.timedOutPlayer).toBe('P1');
    expect(tickResult.updatedClocks['P1']).toBe(0);
    expect(manager.getTimedOutPlayer()).toBe('P1');
  });

  it('applies Fischer increment to player upon completed turn', () => {
    const config = createMockConfig(2, 180, 5); // 5s increment
    const manager = new ParticipantClockManager(config);

    manager.start('P1', 1000);
    manager.tick(2000); // 1000ms elapsed -> 179000ms
    expect(manager.getTimeLeftMs('P1')).toBe(179000);

    manager.applyIncrement('P1'); // +5000ms
    expect(manager.getTimeLeftMs('P1')).toBe(184000);
  });

  it('captures and restores snapshots losslessly for Undo/Redo cycles', () => {
    const config = createMockConfig(2, 300, 0);
    const manager = new ParticipantClockManager(config);

    manager.start('P1', 1000);
    manager.tick(3000); // P1 at 298000ms

    const snapshot = manager.captureSnapshot();
    expect(snapshot['P1']).toBe(298000);

    // Simulate more gameplay
    manager.setActivePlayer('P2', 3000);
    manager.tick(8000); // P2 at 295000ms
    expect(manager.getTimeLeftMs('P2')).toBe(295000);

    // Revert via Undo
    manager.restoreSnapshot(snapshot, 8000);
    expect(manager.getTimeLeftMs('P1')).toBe(298000);
    expect(manager.getTimeLeftMs('P2')).toBe(300000);
  });
});


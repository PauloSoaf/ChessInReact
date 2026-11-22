import { describe, it, expect } from 'vitest';
import { TimeControlManager } from '../TimeControlManager';
import { MatchConfigurationManager } from '../MatchConfigurationManager';

describe('TimeControlManager (Spec 16 § 4, Spec 06 RF-09, Spec 18)', () => {
  it('exposes comprehensive official canonical presets for competitive chess', () => {
    const presets = TimeControlManager.PRESETS;
    expect(presets.length).toBeGreaterThanOrEqual(10);

    const bullet10 = presets.find((p) => p.id === 'bullet_1_0');
    expect(bullet10).toBeDefined();
    expect(bullet10?.category).toBe('BULLET');
    expect(bullet10?.initialSeconds).toBe(60);
    expect(bullet10?.incrementSeconds).toBe(0);

    const blitz50 = presets.find((p) => p.id === 'blitz_5_0');
    expect(blitz50).toBeDefined();
    expect(blitz50?.category).toBe('BLITZ');
    expect(blitz50?.initialSeconds).toBe(300);
    expect(blitz50?.incrementSeconds).toBe(0);
    expect(blitz50?.isDefault).toBe(true);

    const rapid100 = presets.find((p) => p.id === 'rapid_10_0');
    expect(rapid100).toBeDefined();
    expect(rapid100?.category).toBe('RAPID');
    expect(rapid100?.initialSeconds).toBe(600);

    const classical300 = presets.find((p) => p.id === 'classical_30_0');
    expect(classical300).toBeDefined();
    expect(classical300?.category).toBe('CLASSICAL');
    expect(classical300?.initialSeconds).toBe(1800);

    const unlimited = presets.find((p) => p.id === 'unlimited');
    expect(unlimited).toBeDefined();
    expect(unlimited?.category).toBe('UNLIMITED');
    expect(unlimited?.initialSeconds).toBe(0);
  });

  it('retrieves preset by ID with safe default fallback', () => {
    const p = TimeControlManager.getPresetById('rapid_15_10');
    expect(p.initialSeconds).toBe(900);
    expect(p.incrementSeconds).toBe(10);

    const fallback = TimeControlManager.getPresetById('non_existent');
    expect(fallback.id).toBe('blitz_5_0');
  });

  it('applies time control configuration to all participant slots in a match', () => {
    const baseConfig = MatchConfigurationManager.createDefaultMatch('STANDARD', 2);
    expect(baseConfig.slots.length).toBe(2);

    const withBlitz = TimeControlManager.applyTimeControl(baseConfig, 180, 2);
    for (const slot of withBlitz.slots) {
      expect(slot.clock).toBeDefined();
      expect(slot.clock?.initialSeconds).toBe(180);
      expect(slot.clock?.incrementSeconds).toBe(2);
    }

    const withUnlimited = TimeControlManager.applyTimeControl(withBlitz, 0, 0);
    for (const slot of withUnlimited.slots) {
      expect(slot.clock).toBeUndefined();
    }
  });

  it('accurately categorizes custom time controls based on estimated game length', () => {
    expect(TimeControlManager.categorizeTimeControl(0, 0)).toBe('UNLIMITED');
    expect(TimeControlManager.categorizeTimeControl(60, 0)).toBe('BULLET'); // 60s < 180s
    expect(TimeControlManager.categorizeTimeControl(120, 1)).toBe('BULLET'); // 120 + 40 = 160s < 180s
    expect(TimeControlManager.categorizeTimeControl(180, 0)).toBe('BLITZ'); // 180s < 600s
    expect(TimeControlManager.categorizeTimeControl(300, 2)).toBe('BLITZ'); // 300 + 80 = 380s < 600s
    expect(TimeControlManager.categorizeTimeControl(600, 0)).toBe('RAPID'); // 600s < 1800s
    expect(TimeControlManager.categorizeTimeControl(900, 10)).toBe('RAPID'); // 900 + 400 = 1300s < 1800s
    expect(TimeControlManager.categorizeTimeControl(1800, 0)).toBe('CLASSICAL');
    expect(TimeControlManager.categorizeTimeControl(3600, 0)).toBe('CLASSICAL');
  });

  it('identifies Zeitnot and critical Zeitnot accurately', () => {
    expect(TimeControlManager.isZeitnot(45000)).toBe(false);
    expect(TimeControlManager.isZeitnot(30000)).toBe(true);
    expect(TimeControlManager.isZeitnot(15000)).toBe(true);
    expect(TimeControlManager.isZeitnot(0)).toBe(false);

    expect(TimeControlManager.isCriticalZeitnot(15000)).toBe(false);
    expect(TimeControlManager.isCriticalZeitnot(9999)).toBe(true);
    expect(TimeControlManager.isCriticalZeitnot(3000)).toBe(true);
    expect(TimeControlManager.isCriticalZeitnot(0)).toBe(false);
  });

  it('formats clock display into standard mm:ss and tenths for critical time', () => {
    expect(TimeControlManager.formatClockDisplay(0)).toBe('0:00.0');
    expect(TimeControlManager.formatClockDisplay(300000)).toBe('05:00');
    expect(TimeControlManager.formatClockDisplay(65000)).toBe('01:05');
    expect(TimeControlManager.formatClockDisplay(9500)).toBe('0:09.5');
    expect(TimeControlManager.formatClockDisplay(1200)).toBe('0:01.2');
  });

  it('generates badge labels for all time control categories', () => {
    expect(TimeControlManager.getBadgeLabel(0, 0)).toBe('Casual (∞)');
    expect(TimeControlManager.getBadgeLabel(undefined, undefined)).toBe('Casual (∞)');
    expect(TimeControlManager.getBadgeLabel(60, 0)).toBe('1+0 • Bullet');
    expect(TimeControlManager.getBadgeLabel(60, 1)).toBe('1+1 • Bullet');
    expect(TimeControlManager.getBadgeLabel(300, 0)).toBe('5+0 • Blitz');
    expect(TimeControlManager.getBadgeLabel(180, 2)).toBe('3+2 • Blitz');
    expect(TimeControlManager.getBadgeLabel(600, 0)).toBe('10+0 • Rápido');
    expect(TimeControlManager.getBadgeLabel(900, 10)).toBe('15+10 • Rápido');
    expect(TimeControlManager.getBadgeLabel(1200, 0)).toBe('20+0 • Rápido');
    expect(TimeControlManager.getBadgeLabel(1800, 0)).toBe('30+0 • Clássico');
  });
});

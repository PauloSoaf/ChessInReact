/**
 * ChessInReact - Universal Time Control & Clock Presets Engine
 * Spec 16 § 4, Spec 06 RF-09, Spec 18
 *
 * Implements comprehensive time control presets (Bullet, Blitz, Rapid, Classical, Custom, Unlimited),
 * increment calculation (Fischer), Zeitnot detection, and rating classification.
 */

import { IMatchConfiguration } from './IMatchConfiguration';

export type TimeControlCategory =
  | 'BULLET'
  | 'BLITZ'
  | 'RAPID'
  | 'CLASSICAL'
  | 'CUSTOM'
  | 'UNLIMITED';

export interface ITimeControlPreset {
  readonly id: string;
  readonly label: string;
  readonly category: TimeControlCategory;
  readonly initialSeconds: number;
  readonly incrementSeconds: number;
  readonly description: string;
  readonly isDefault?: boolean;
}

export class TimeControlManager {
  /**
   * Official canonical time control presets for competitive chess.
   */
  public static readonly PRESETS: readonly ITimeControlPreset[] = [
    // Bullet Presets (< 3 min)
    {
      id: 'bullet_1_0',
      label: '1 min',
      category: 'BULLET',
      initialSeconds: 60,
      incrementSeconds: 0,
      description: 'Bullet ultrarrápido sem acréscimo (1+0)'
    },
    {
      id: 'bullet_1_1',
      label: '1 | 1',
      category: 'BULLET',
      initialSeconds: 60,
      incrementSeconds: 1,
      description: 'Bullet com 1 segundo de acréscimo por lance (1+1)'
    },
    {
      id: 'bullet_2_1',
      label: '2 | 1',
      category: 'BULLET',
      initialSeconds: 120,
      incrementSeconds: 1,
      description: 'Bullet estendido com 1s de acréscimo (2+1)'
    },

    // Blitz Presets (3 to 5 min)
    {
      id: 'blitz_3_0',
      label: '3 min',
      category: 'BLITZ',
      initialSeconds: 180,
      incrementSeconds: 0,
      description: 'Blitz tradicional de 3 minutos sem acréscimo (3+0)'
    },
    {
      id: 'blitz_3_2',
      label: '3 | 2',
      category: 'BLITZ',
      initialSeconds: 180,
      incrementSeconds: 2,
      description: 'Blitz competitivo FIDE com 2s de acréscimo (3+2)'
    },
    {
      id: 'blitz_5_0',
      label: '5 min',
      category: 'BLITZ',
      initialSeconds: 300,
      incrementSeconds: 0,
      description: 'Blitz clássico de 5 minutos (5+0)',
      isDefault: true
    },
    {
      id: 'blitz_5_3',
      label: '5 | 3',
      category: 'BLITZ',
      initialSeconds: 300,
      incrementSeconds: 3,
      description: 'Blitz com 3s de acréscimo por lance (5+3)'
    },

    // Rapid Presets (10 to 20 min)
    {
      id: 'rapid_10_0',
      label: '10 min',
      category: 'RAPID',
      initialSeconds: 600,
      incrementSeconds: 0,
      description: 'Partida Rápida mais popular do mundo (10+0)'
    },
    {
      id: 'rapid_15_10',
      label: '15 | 10',
      category: 'RAPID',
      initialSeconds: 900,
      incrementSeconds: 10,
      description: 'Rápido oficial FIDE com 10s de acréscimo (15+10)'
    },
    {
      id: 'rapid_20_0',
      label: '20 min',
      category: 'RAPID',
      initialSeconds: 1200,
      incrementSeconds: 0,
      description: 'Rápido longo sem acréscimo (20+0)'
    },

    // Classical Presets (>= 30 min)
    {
      id: 'classical_30_0',
      label: '30 min',
      category: 'CLASSICAL',
      initialSeconds: 1800,
      incrementSeconds: 0,
      description: 'Clássico / Padrão de 30 minutos (30+0)'
    },
    {
      id: 'classical_60_0',
      label: '60 min',
      category: 'CLASSICAL',
      initialSeconds: 3600,
      incrementSeconds: 0,
      description: 'Partida Clássica profunda de 1 hora (60+0)'
    },

    // Unlimited / Casual Mode
    {
      id: 'unlimited',
      label: 'Sem Relógio (∞)',
      category: 'UNLIMITED',
      initialSeconds: 0,
      incrementSeconds: 0,
      description: 'Modo casual livre para estudo sem contagem regressiva'
    }
  ];

  /**
   * Finds preset by ID or returns the 5 min Blitz default.
   */
  public static getPresetById(id: string): ITimeControlPreset {
    return this.PRESETS.find(p => p.id === id) ?? this.PRESETS[5]; // Default 5 min
  }

  /**
   * Applies selected time control to all participant slots in a match configuration.
   */
  public static applyTimeControl(
    config: IMatchConfiguration,
    initialSeconds: number,
    incrementSeconds: number
  ): IMatchConfiguration {
    const isUnlimited = initialSeconds <= 0;

    const nextSlots = config.slots.map(slot => ({
      ...slot,
      clock: isUnlimited
        ? undefined
        : {
            initialSeconds,
            incrementSeconds
          }
    }));

    return {
      ...config,
      slots: nextSlots
    };
  }

  /**
   * Categorizes a custom time control into standard chess time speed.
   */
  public static categorizeTimeControl(initialSeconds: number, incrementSeconds: number): TimeControlCategory {
    if (initialSeconds <= 0) return 'UNLIMITED';

    // Total estimated duration = initial + 40 * increment
    const estimatedTime = initialSeconds + 40 * incrementSeconds;

    if (estimatedTime < 180) return 'BULLET';
    if (estimatedTime < 600) return 'BLITZ';
    if (estimatedTime < 1800) return 'RAPID';
    return 'CLASSICAL';
  }

  /**
   * Determines if a clock is in Zeitnot (time pressure).
   */
  public static isZeitnot(timeLeftMs: number): boolean {
    return timeLeftMs > 0 && timeLeftMs <= 30000;
  }

  /**
   * Determines if a clock is in critical time scramble (< 10 seconds).
   */
  public static isCriticalZeitnot(timeLeftMs: number): boolean {
    return timeLeftMs > 0 && timeLeftMs < 10000;
  }

  /**
   * Formats milliseconds into digital chess clock format (mm:ss or mm:ss.d for critical time).
   */
  public static formatClockDisplay(ms: number): string {
    if (ms <= 0) return '0:00.0';

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (ms < 10000) {
      const tenths = Math.floor((ms % 1000) / 100);
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    }

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Generates a concise human-readable badge label for the active time control.
   * e.g., '⚡ 1+0 • Bullet', '🔥 5+0 • Blitz', '⏱️ 10+0 • Rápido', '⏱️ 20+0 • Rápido', '⏳ 30+0 • Clássico', '☕ Casual (∞)'.
   */
  public static getBadgeLabel(initialSeconds?: number, incrementSeconds?: number): string {
    if (!initialSeconds || initialSeconds <= 0) {
      return '☕ Casual (∞)';
    }

    const category = this.categorizeTimeControl(initialSeconds, incrementSeconds ?? 0);
    const mins = Math.floor(initialSeconds / 60);
    const inc = incrementSeconds ?? 0;
    const incStr = inc > 0 ? `+${inc}` : '+0';

    const categoryNameMap: Record<TimeControlCategory, string> = {
      BULLET: 'Bullet',
      BLITZ: 'Blitz',
      RAPID: 'Rápido',
      CLASSICAL: 'Clássico',
      CUSTOM: 'Custom',
      UNLIMITED: 'Casual',
    };

    const catName = categoryNameMap[category] ?? 'Xadrez';

    if (category === 'UNLIMITED') {
      return 'Casual (∞)';
    }

    return `${mins}${incStr} • ${catName}`;
  }
}

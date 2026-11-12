/**
 * ChessInReact - Match Configuration Manager (Spec 16 § 4, § 7 RF-16-01 to RF-16-04, RF-16-07)
 */

import {
  IMatchConfiguration,
  IParticipantSlot,
  ParticipantRole,
  IBotSlotConfig,
} from './IMatchConfiguration';

const DEFAULT_SLOT_COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#1E293B' },
  { name: 'Red', hex: '#EF4444' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Yellow', hex: '#EAB308' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Purple', hex: '#A855F7' },
  { name: 'Orange', hex: '#F97316' },
  { name: 'Cyan', hex: '#06B6D4' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Teal', hex: '#14B8A6' },
  { name: 'Amber', hex: '#F59E0B' },
];

export class MatchConfigurationManager {
  public static createDefaultMatch(
    variantId: string,
    participantCount: number = 2
  ): IMatchConfiguration {
    const clampedCount = Math.max(2, Math.min(12, participantCount));
    const slots: IParticipantSlot[] = [];

    for (let i = 0; i < clampedCount; i++) {
      const color = DEFAULT_SLOT_COLORS[i % DEFAULT_SLOT_COLORS.length];
      const isFirstHuman = i === 0;

      const botConfig: IBotSlotConfig | undefined = !isFirstHuman
        ? {
            difficultyLevel: 3,
            archetype: 'TACTICAL',
            thinkTimeMs: 1000,
          }
        : undefined;

      slots.push({
        slotIndex: i,
        role: isFirstHuman ? 'HUMAN_LOCAL' : 'AI_BOT',
        displayName: isFirstHuman ? 'Você (Jogador 1)' : `Bot ${color.name} (N3)`,
        colorName: color.name,
        hexColor: color.hex,
        teamId: clampedCount === 4 ? (i % 2 === 0 ? 'TEAM_A' : 'TEAM_B') : `TEAM_${i + 1}`,
        botConfig,
        clock: { initialSeconds: 300, incrementSeconds: 5 },
        isConnected: true,
      });
    }

    return {
      schemaVersion: '1.0.0',
      matchId: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      variantId,
      modeType: clampedCount === 2 ? '1V1' : 'FFA',
      totalParticipants: clampedCount,
      slots,
      eliminationPolicy: 'EVAPORATION',
      autoStandinOnDisconnect: true,
    };
  }

  /**
   * Updates the role of a specific slot (RF-16-02).
   */
  public static updateSlotRole(
    config: IMatchConfiguration,
    slotIndex: number,
    newRole: ParticipantRole,
    customBotConfig?: IBotSlotConfig
  ): IMatchConfiguration {
    const nextSlots = config.slots.map((slot) => {
      if (slot.slotIndex !== slotIndex) return slot;

      const isBot = newRole === 'AI_BOT' || newRole === 'BOT_STANDIN';
      const botConfig = isBot
        ? customBotConfig ??
          slot.botConfig ?? {
            difficultyLevel: 3 as const,
            archetype: 'TACTICAL' as const,
            thinkTimeMs: 1000,
          }
        : undefined;

      return {
        ...slot,
        role: newRole,
        botConfig,
      };
    });

    return {
      ...config,
      slots: nextSlots,
    };
  }

  /**
   * Handles player disconnection with automatic Stand-in Bot takeover (RF-16-04).
   */
  public static handleDisconnectTakeover(
    config: IMatchConfiguration,
    slotIndex: number
  ): IMatchConfiguration {
    if (!config.autoStandinOnDisconnect) {
      return config;
    }

    return this.updateSlotRole(config, slotIndex, 'BOT_STANDIN', {
      difficultyLevel: 3,
      archetype: 'POSITIONAL',
      thinkTimeMs: 800,
    });
  }

  /**
   * Exports configuration to a formatted JSON string (RF-16-07).
   */
  public static exportToJson(config: IMatchConfiguration): string {
    return JSON.stringify(config, null, 2);
  }

  /**
   * Imports and validates configuration from JSON string (RF-16-07).
   */
  public static importFromJson(jsonString: string): IMatchConfiguration {
    try {
      const parsed = JSON.parse(jsonString) as IMatchConfiguration;
      if (parsed.schemaVersion !== '1.0.0') {
        throw new Error('Versão de schema incompatível. Esperado: 1.0.0.');
      }
      if (!parsed.variantId || !Array.isArray(parsed.slots)) {
        throw new Error('Configuração JSON inválida: campos obrigatórios ausentes.');
      }
      if (parsed.slots.length < 2 || parsed.slots.length > 12) {
        throw new Error('Quantidade de participantes deve estar entre 2 e 12.');
      }
      return parsed;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao importar configuração JSON: ${msg}`);
    }
  }
}


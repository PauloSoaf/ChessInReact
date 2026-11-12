/**
 * ChessInReact - Universal Match Configuration Contracts (Spec 16 § 4, RF-16-01, RF-16-02)
 */

export type ParticipantRole =
  | 'HUMAN_LOCAL'
  | 'AI_BOT'
  | 'HUMAN_REMOTE'
  | 'BOT_STANDIN';

export interface IBotSlotConfig {
  readonly difficultyLevel: 1 | 2 | 3 | 4 | 5;
  readonly archetype: 'TACTICAL' | 'AGGRESSIVE' | 'POSITIONAL' | 'MASTER' | 'SACRIFICE';
  readonly thinkTimeMs: number;
}

export interface IParticipantSlot {
  readonly slotIndex: number;
  readonly role: ParticipantRole;
  readonly displayName: string;
  readonly colorName: string;
  readonly hexColor: string;
  readonly teamId?: string;
  readonly botConfig?: IBotSlotConfig;
  readonly clock?: {
    readonly initialSeconds: number;
    readonly incrementSeconds: number;
  };
  readonly isConnected?: boolean;
}

export interface IMatchConfiguration {
  readonly schemaVersion: '1.0.0';
  readonly matchId: string;
  readonly variantId: string;
  readonly modeType: '1V1' | 'FFA' | 'TEAMS';
  readonly totalParticipants: number;
  readonly slots: readonly IParticipantSlot[];
  readonly eliminationPolicy: 'EVAPORATION' | 'GREY_OBSTACLES' | 'CONQUEST' | 'ZOMBIE_BOT';
  readonly autoStandinOnDisconnect: boolean;
}


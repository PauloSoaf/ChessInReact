import { describe, it, expect } from 'vitest';
import { MatchConfigurationManager } from '../MatchConfigurationManager';

describe('Spec 16: Universal Match Configurator & Participant Slots', () => {
  describe('RF-16-01 & RF-16-02: Universal Participant Contract (2 to 12 Slots)', () => {
    it('creates default match configurations with correct slot counts and roles', () => {
      const match2p = MatchConfigurationManager.createDefaultMatch('CHESS_STANDARD', 2);
      expect(match2p.totalParticipants).toBe(2);
      expect(match2p.slots.length).toBe(2);
      expect(match2p.slots[0].role).toBe('HUMAN_LOCAL');
      expect(match2p.slots[1].role).toBe('AI_BOT');

      const match6p = MatchConfigurationManager.createDefaultMatch('HEXAGON_SIX_PLAYER', 6);
      expect(match6p.totalParticipants).toBe(6);
      expect(match6p.slots.length).toBe(6);

      const match12p = MatchConfigurationManager.createDefaultMatch('MINI_DODECAGON_12P', 12);
      expect(match12p.totalParticipants).toBe(12);
      expect(match12p.slots.length).toBe(12);
    });

    it('RF-16-02 & RF-16-03: allows dynamic role switching and bot calibration per slot', () => {
      let config = MatchConfigurationManager.createDefaultMatch('FOUR_PLAYER_FFA', 4);
      expect(config.slots[1].role).toBe('AI_BOT');

      // Switch slot 1 to HUMAN_REMOTE
      config = MatchConfigurationManager.updateSlotRole(config, 1, 'HUMAN_REMOTE');
      expect(config.slots[1].role).toBe('HUMAN_REMOTE');
      expect(config.slots[1].botConfig).toBeUndefined();

      // Switch slot 2 to master bot
      config = MatchConfigurationManager.updateSlotRole(config, 2, 'AI_BOT', {
        difficultyLevel: 5,
        archetype: 'MASTER',
        thinkTimeMs: 2500,
      });
      expect(config.slots[2].role).toBe('AI_BOT');
      expect(config.slots[2].botConfig?.difficultyLevel).toBe(5);
      expect(config.slots[2].botConfig?.archetype).toBe('MASTER');
    });

    it('preserves every selected bot difficulty in the authoritative slot config', () => {
      for (const level of [1, 2, 3, 4, 5] as const) {
        const base = MatchConfigurationManager.createDefaultMatch('standard', 2);
        const configured = MatchConfigurationManager.updateBotDifficulty(base, 1, level);

        expect(configured.slots[1].botConfig?.difficultyLevel).toBe(level);
        expect(configured.slots[1].displayName).toContain(`N${level}`);
      }
    });
  });

  describe('RF-16-04: Auto Stand-in Bot Takeover on Disconnect', () => {
    it('automatically replaces disconnected remote player with a stand-in bot', () => {
      let config = MatchConfigurationManager.createDefaultMatch('FOUR_PLAYER_FFA', 4);
      config = MatchConfigurationManager.updateSlotRole(config, 2, 'HUMAN_REMOTE');

      // Player in slot 2 disconnects
      const rescued = MatchConfigurationManager.handleDisconnectTakeover(config, 2);
      expect(rescued.slots[2].role).toBe('BOT_STANDIN');
      expect(rescued.slots[2].botConfig).toBeDefined();
    });
  });

  describe('RF-16-07: JSON Configuration Export & Import', () => {
    it('exports configuration to valid JSON schema string and imports back losslessly', () => {
      const original = MatchConfigurationManager.createDefaultMatch('HEXAGON_SIX_PLAYER', 6);
      const jsonStr = MatchConfigurationManager.exportToJson(original);

      expect(typeof jsonStr).toBe('string');
      expect(jsonStr).toContain('"schemaVersion": "1.0.0"');
      expect(jsonStr).toContain('"HEXAGON_SIX_PLAYER"');

      const imported = MatchConfigurationManager.importFromJson(jsonStr);
      expect(imported.matchId).toBe(original.matchId);
      expect(imported.totalParticipants).toBe(6);
      expect(imported.slots.length).toBe(6);
      expect(imported.slots[0].role).toBe('HUMAN_LOCAL');
    });

    it('rejects invalid or corrupted JSON strings', () => {
      expect(() => {
        MatchConfigurationManager.importFromJson('{"invalid": true}');
      }).toThrow(/Versão de schema incompatível/);

      expect(() => {
        MatchConfigurationManager.importFromJson('{ bad json');
      }).toThrow(/Falha ao importar/);
    });
  });
});


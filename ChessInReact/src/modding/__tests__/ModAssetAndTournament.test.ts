import { describe, it, expect } from 'vitest';
import {
  GLTFAssetValidator,
  TournamentBracketEngine,
  ModQuarantineEngine,
} from '../index';

describe('Spec 10 - Mod Workshop Assets, Tournament Engine & Quarantine (S10-RF03, S10-RF06, S10-RF10, S10-RF14)', () => {
  describe('GLTFAssetValidator (RF-03 Asset Upload & RF-14 Fallback)', () => {
    it('rejects empty or truncated binary buffers', () => {
      const empty = GLTFAssetValidator.validateBinaryGlb(new Uint8Array(0));
      expect(empty.isValid).toBe(false);
      expect(empty.reason).toContain('vazio');

      const truncated = GLTFAssetValidator.validateBinaryGlb(new Uint8Array([0x01, 0x02, 0x03]));
      expect(truncated.isValid).toBe(false);
      expect(truncated.reason).toContain('menor que o mínimo');
    });

    it('rejects files with invalid magic header', () => {
      const invalidHeader = new Uint8Array(16);
      const res = GLTFAssetValidator.validateBinaryGlb(invalidHeader);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('Assinatura de cabeçalho inválida');
    });

    it('rejects files exceeding the strict 2 Megabyte ceiling', () => {
      const largeBuffer = new Uint8Array(2 * 1024 * 1024 + 100);
      const res = GLTFAssetValidator.validateBinaryGlb(largeBuffer);
      expect(res.isValid).toBe(false);
      expect(res.reason).toContain('excede o limite estrito de 2 MB');
    });

    it('successfully validates genuine GLTF v2 binary buffer and calculates SHA-256 fingerprint', () => {
      // Construct minimal valid GLB v2 header (12 bytes)
      const validHeader = new Uint8Array(20);
      const view = new DataView(validHeader.buffer);
      view.setUint32(0, 0x46546c67, true); // 'glTF'
      view.setUint32(4, 2, true); // Version 2
      view.setUint32(8, 20, true); // Total length

      const res = GLTFAssetValidator.validateBinaryGlb(validHeader);
      expect(res.isValid).toBe(true);
      expect(res.gltfVersion).toBe(2);
      expect(res.sha256Hash).toBeDefined();
      expect(res.sha256Hash?.length).toBe(64); // SHA-256 hex length
    });

    it('resolves canonical Staunton geometry IDs as fallback for failed models', () => {
      expect(GLTFAssetValidator.resolveFallbackGeometryId('k')).toBe('staunton_king_standard');
      expect(GLTFAssetValidator.resolveFallbackGeometryId('queen')).toBe('staunton_queen_standard');
      expect(GLTFAssetValidator.resolveFallbackGeometryId('n')).toBe('staunton_knight_standard');
      expect(GLTFAssetValidator.resolveFallbackGeometryId('bishop')).toBe('staunton_bishop_standard');
      expect(GLTFAssetValidator.resolveFallbackGeometryId('r')).toBe('staunton_rook_standard');
      expect(GLTFAssetValidator.resolveFallbackGeometryId('p')).toBe('staunton_pawn_standard');
    });
  });

  describe('TournamentBracketEngine (RF-06 Automated Single Elimination Brackets)', () => {
    it('creates 4-player bracket, advances winners and declares tournament champion', () => {
      const tournament = TournamentBracketEngine.createTournament(
        'tourney_01',
        'Copa Blitz de Mestres',
        'standard',
        ['alice', 'bob', 'charlie', 'diana']
      );

      expect(tournament.totalParticipants).toBe(4);
      expect(tournament.totalRounds).toBe(2);
      expect(tournament.matches).toHaveLength(3); // 2 semifinal + 1 final
      expect(tournament.isFinished).toBe(false);

      // Round 1 Match 1: Alice vs Bob -> Alice wins
      let state = TournamentBracketEngine.recordMatchResult(tournament, 'tourney_01_r1_m1', 'alice');
      // Round 1 Match 2: Charlie vs Diana -> Diana wins
      state = TournamentBracketEngine.recordMatchResult(state, 'tourney_01_r1_m2', 'diana');

      // Check Final matchup: Alice vs Diana
      const finalMatch = state.matches.find((m) => m.round === 2);
      expect(finalMatch?.player1Id).toBe('alice');
      expect(finalMatch?.player2Id).toBe('diana');
      expect(finalMatch?.isCompleted).toBe(false);

      // Final Match: Diana wins
      state = TournamentBracketEngine.recordMatchResult(state, 'tourney_01_r2_m1', 'diana');
      expect(state.isFinished).toBe(true);
      expect(state.championId).toBe('diana');
    });

    it('handles non-power-of-two participant count by allocating Byes', () => {
      // 3 participants -> bracket size 4 (1 bye)
      const tournament = TournamentBracketEngine.createTournament(
        'tourney_bye',
        'Triangular Open',
        'standard',
        ['alice', 'bob', 'charlie']
      );

      expect(tournament.totalRounds).toBe(2);
      // Match 1: Alice vs Bob
      // Match 2: Charlie vs null (Bye) -> Charlie advances immediately to Final
      const match2 = tournament.matches.find((m) => m.matchId === 'tourney_bye_r1_m2');
      expect(match2?.isCompleted).toBe(true);
      expect(match2?.winnerId).toBe('charlie');

      // Final match should already have Charlie in Player 2 slot
      const finalMatch = tournament.matches.find((m) => m.round === 2);
      expect(finalMatch?.player2Id).toBe('charlie');
    });
  });

  describe('ModQuarantineEngine (RF-10 Health Watchdog & Quarantine)', () => {
    it('maintains mod in healthy status while error rate is <= 5%', () => {
      const watchdog = new ModQuarantineEngine();

      for (let i = 0; i < 20; i++) {
        watchdog.recordMatchSuccess('mod_clean');
      }

      expect(watchdog.isModHealthy('mod_clean')).toBe(true);
    });

    it('automatically triggers quarantine when error rate exceeds 5% over >= 10 matches', () => {
      const watchdog = new ModQuarantineEngine();

      // 9 matches with 1 error (11%) -> under minimum sample size (10), healthy
      for (let i = 0; i < 8; i++) watchdog.recordMatchSuccess('mod_flaky');
      watchdog.recordMatchError('mod_flaky');
      expect(watchdog.isModHealthy('mod_flaky')).toBe(true);

      // 10th match with error -> 2 errors in 10 matches = 20% > 5% -> quarantine!
      const status = watchdog.recordMatchError('mod_flaky');
      expect(status.isQuarantined).toBe(true);
      expect(watchdog.isModHealthy('mod_flaky')).toBe(false);

      // Lifting quarantine clears status
      watchdog.liftQuarantine('mod_flaky');
      expect(watchdog.isModHealthy('mod_flaky')).toBe(true);
    });
  });
});

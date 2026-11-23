import { describe, it, expect } from 'vitest';
import {
  isPremiumPieceAvailable,
  resolveStandardPieceType,
  PREMIUM_STAUNTON_SCALE,
  POLYHAVEN_CHESS_SET_PATH,
} from '../mesh/PremiumChessAssetRegistry';

describe('PremiumChessAssetRegistry (Spec 07 § 5, § 7)', () => {
  it('exports canonical asset path pointing to local Poly Haven package', () => {
    expect(POLYHAVEN_CHESS_SET_PATH).toBe('/models/chess/polyhaven/chess_set_1k.gltf');
  });

  it('exports positive tournament scale factor calibrated to 1.0 unit squares', () => {
    expect(PREMIUM_STAUNTON_SCALE).toBeGreaterThan(15);
    expect(PREMIUM_STAUNTON_SCALE).toBeLessThan(20);
  });

  describe('isPremiumPieceAvailable', () => {
    it('returns true for all canonical Staunton piece types', () => {
      expect(isPremiumPieceAvailable('PAWN')).toBe(true);
      expect(isPremiumPieceAvailable('ROOK')).toBe(true);
      expect(isPremiumPieceAvailable('KNIGHT')).toBe(true);
      expect(isPremiumPieceAvailable('BISHOP')).toBe(true);
      expect(isPremiumPieceAvailable('QUEEN')).toBe(true);
      expect(isPremiumPieceAvailable('KING')).toBe(true);
    });

    it('returns true for regional variant equivalents (Shogi/Xiangqi)', () => {
      expect(isPremiumPieceAvailable('SOLDIER')).toBe(true);
      expect(isPremiumPieceAvailable('CHARIOT')).toBe(true);
      expect(isPremiumPieceAvailable('HORSE')).toBe(true);
      expect(isPremiumPieceAvailable('ELEPHANT')).toBe(true);
      expect(isPremiumPieceAvailable('GENERAL')).toBe(true);
      expect(isPremiumPieceAvailable('LANCE')).toBe(true);
    });

    it('returns false for fairy / minigame pieces that require procedural models', () => {
      expect(isPremiumPieceAvailable('DUCK')).toBe(false);
      expect(isPremiumPieceAvailable('ARCHBISHOP')).toBe(false);
      expect(isPremiumPieceAvailable('CHANCELLOR')).toBe(false);
      expect(isPremiumPieceAvailable('AMAZON')).toBe(false);
      expect(isPremiumPieceAvailable('CANNON')).toBe(false);
      expect(isPremiumPieceAvailable(null)).toBe(false);
      expect(isPremiumPieceAvailable(undefined)).toBe(false);
    });
  });

  describe('resolveStandardPieceType', () => {
    it('correctly maps standard piece identifiers', () => {
      expect(resolveStandardPieceType('KING')).toBe('KING');
      expect(resolveStandardPieceType('QUEEN')).toBe('QUEEN');
      expect(resolveStandardPieceType('ROOK')).toBe('ROOK');
      expect(resolveStandardPieceType('BISHOP')).toBe('BISHOP');
      expect(resolveStandardPieceType('KNIGHT')).toBe('KNIGHT');
      expect(resolveStandardPieceType('PAWN')).toBe('PAWN');
    });

    it('maps variant pieces to nearest Staunton visual counterpart', () => {
      expect(resolveStandardPieceType('CHARIOT')).toBe('ROOK');
      expect(resolveStandardPieceType('SOLDIER')).toBe('PAWN');
      expect(resolveStandardPieceType('HORSE')).toBe('KNIGHT');
      expect(resolveStandardPieceType('ELEPHANT')).toBe('BISHOP');
      expect(resolveStandardPieceType('GENERAL')).toBe('KING');
    });
  });
});


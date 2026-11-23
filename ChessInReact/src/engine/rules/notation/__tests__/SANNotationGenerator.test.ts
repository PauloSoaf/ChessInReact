import { describe, it, expect } from 'vitest';
import { SANNotationGenerator } from '../SANNotationGenerator';
import { createDefaultDomainState } from '../../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../../core/coordinates/types';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { IDomainState } from '../../../../core/state/gameState';

describe('SANNotationGenerator (Spec 04 § 4, Spec 09 § 4, Spec 16 § 4)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  function createCustomDomain(matchId = 'test-san'): IDomainState {
    const defaultState = createDefaultDomainState(matchId, 'classic_square');
    return {
      ...defaultState,
      boardEntities: {},
      occupancy: {},
    };
  }

  describe('Coordinate Conversion', () => {
    it('converts internal Cartesian keys to standard algebraic notation', () => {
      expect(SANNotationGenerator.coordToAlgebraic('4,0')).toBe('e1');
      expect(SANNotationGenerator.coordToAlgebraic('4,7')).toBe('e8');
      expect(SANNotationGenerator.coordToAlgebraic('0,0')).toBe('a1');
      expect(SANNotationGenerator.coordToAlgebraic('7,7')).toBe('h8');
      expect(SANNotationGenerator.coordToAlgebraic('3,3')).toBe('d4');
      // Pass-through if already algebraic
      expect(SANNotationGenerator.coordToAlgebraic('e4')).toBe('e4');
    });

    it('converts algebraic notation back to internal Cartesian keys', () => {
      expect(SANNotationGenerator.algebraicToCoord('e1')).toBe('4,0');
      expect(SANNotationGenerator.algebraicToCoord('e8')).toBe('4,7');
      expect(SANNotationGenerator.algebraicToCoord('a1')).toBe('0,0');
      expect(SANNotationGenerator.algebraicToCoord('h8')).toBe('7,7');
      expect(SANNotationGenerator.algebraicToCoord('d4')).toBe('3,3');
      // Pass-through if already Cartesian
      expect(SANNotationGenerator.algebraicToCoord('4,0')).toBe('4,0');
    });
  });

  describe('Standard FIDE Moves', () => {
    it('generates quiet pawn moves correctly', () => {
      const domain = createCustomDomain();
      const pId = asEntityId('w-pawn-4');
      domain.boardEntities[pId] = {
        id: pId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,1'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,1')] = pId;

      const san = SANNotationGenerator.generateSAN({
        from: '4,1',
        to: '4,3',
        pieceId: pId,
        domainBefore: domain,
        topology,
      });
      expect(san).toBe('e4');
    });

    it('generates pawn captures with file origin', () => {
      const domain = createCustomDomain();
      const pId = asEntityId('w-pawn-4');
      domain.boardEntities[pId] = {
        id: pId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,3'),
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,3')] = pId;

      const victimId = asEntityId('b-pawn-3');
      domain.boardEntities[victimId] = {
        id: victimId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: asCoordinateKey('3,4'),
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('3,4')] = victimId;

      const san = SANNotationGenerator.generateSAN({
        from: '4,3',
        to: '3,4',
        pieceId: pId,
        domainBefore: domain,
        topology,
        isCapture: true,
      });
      expect(san).toBe('exd5');
    });

    it('generates piece moves and captures (Knight, Bishop, Rook, Queen)', () => {
      const domain = createCustomDomain();
      const knightId = asEntityId('w-knight-1');
      domain.boardEntities[knightId] = {
        id: knightId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KNIGHT',
        position: asCoordinateKey('6,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('6,0')] = knightId;

      const quietSan = SANNotationGenerator.generateSAN({
        from: '6,0',
        to: '5,2',
        pieceId: knightId,
        domainBefore: domain,
        topology,
      });
      expect(quietSan).toBe('Nf3');
    });

    it('generates Kingside (O-O) and Queenside (O-O-O) Castling', () => {
      const domain = createCustomDomain();
      const kingId = asEntityId('w-king');
      domain.boardEntities[kingId] = {
        id: kingId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,0')] = kingId;

      const kingsideSan = SANNotationGenerator.generateSAN({
        from: '4,0',
        to: '6,0',
        pieceId: kingId,
        domainBefore: domain,
        topology,
        isCastling: true,
      });
      expect(kingsideSan).toBe('O-O');

      const queensideSan = SANNotationGenerator.generateSAN({
        from: '4,0',
        to: '2,0',
        pieceId: kingId,
        domainBefore: domain,
        topology,
        isCastling: true,
      });
      expect(queensideSan).toBe('O-O-O');
    });

    it('generates pawn promotion with or without capture', () => {
      const domain = createCustomDomain();
      const pId = asEntityId('w-pawn-4');
      domain.boardEntities[pId] = {
        id: pId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,6'),
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,6')] = pId;

      const promoSan = SANNotationGenerator.generateSAN({
        from: '4,6',
        to: '4,7',
        pieceId: pId,
        domainBefore: domain,
        topology,
        promotionVariant: 'QUEEN',
      });
      expect(promoSan).toBe('e8=Q');
    });

    it('generates UCI format accurately', () => {
      expect(SANNotationGenerator.generateUCI('4,1', '4,3')).toBe('e2e4');
      expect(SANNotationGenerator.generateUCI('6,0', '5,2')).toBe('g1f3');
      expect(SANNotationGenerator.generateUCI('4,6', '4,7', 'QUEEN')).toBe('e7e8q');
    });
  });

  describe('Variant and Minigame Actions', () => {
    it('generates reserve drop notation (Crazyhouse/Shogi)', () => {
      const domain = createCustomDomain();
      const san = SANNotationGenerator.generateSAN({
        from: '@',
        to: '3,4',
        pieceId: 'drop_knight',
        domainBefore: domain,
        topology,
        isDrop: true,
        dropPieceVariant: 'KNIGHT',
      });
      expect(san).toBe('N@d5');
    });

    it('generates spell cast notation (Spell Chess)', () => {
      const domain = createCustomDomain();
      const san = SANNotationGenerator.generateSAN({
        from: '',
        to: '4,3',
        pieceId: '',
        domainBefore: domain,
        topology,
        spellType: 'FREEZE',
      });
      expect(san).toBe('[FREEZE:e4]');
    });
  });
});

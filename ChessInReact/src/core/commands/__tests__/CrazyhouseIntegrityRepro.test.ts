import { describe, it, expect } from 'vitest';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { MovePieceCommand } from '../MovePieceCommand';
import { CrazyhouseModifier } from '../../../engine/rules/pipelines/modifiers/CrazyhouseModifier';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates/types';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';

describe('SPEC04-PATCH-02: Crazyhouse Drop Integrity & Immutability Repro Suite', () => {
  const sqTopology = new SquareTopology({ width: 8, height: 8 });

  describe('CrazyhouseModifier.getLegalDropMoves Purity & Immutability (P1)', () => {
    it('does not mutate state or throw when state is deeply frozen (Object.freeze)', () => {
      const state = createDefaultDomainState('frozen-test', 'CRAZYHOUSE');
      (state.capturedInventory as Record<string, string[]>).P1 = ['KNIGHT', 'PAWN'];

      // Add King for P1 at 4,0
      const king: IPieceEntity = {
        id: asEntityId('w-king'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[king.id] = king;
      state.occupancy[king.position] = king.id;

      // Deeply freeze state
      Object.freeze(state);
      Object.freeze(state.occupancy);
      Object.freeze(state.boardEntities);
      Object.freeze(state.capturedInventory);
      Object.freeze(state.capturedInventory.P1);

      // Must not throw TypeError: Cannot add property on frozen object!
      expect(() => {
        const moves = CrazyhouseModifier.getLegalDropMoves(state, sqTopology, 'P1', 'KNIGHT');
        expect(moves.length).toBeGreaterThan(0);
      }).not.toThrow();

      // State occupancy must not have any leaked drop IDs
      expect(Object.keys(state.occupancy).length).toBe(1);
      expect(state.occupancy[asCoordinateKey('4,0')]).toBe(king.id);
    });
  });

  describe('MovePieceCommand Crazyhouse Drop Validations (P0)', () => {
    it('rejects drop if Crazyhouse variant is not enabled', () => {
      const state = createDefaultDomainState('no-ch-test', 'classic_square');
      (state.capturedInventory as Record<string, string[]>).P1 = ['KNIGHT'];

      const cmd = new MovePieceCommand(
        asEntityId('new-drop-1'),
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1',
        undefined, // id
        true, // advanceTurn
        true, // enforceRules
        undefined, // promotionVariant
        sqTopology, // topology
        undefined, // variantConfig
        true, // isDropMove
        'KNIGHT' // dropPieceVariant
      );

      const stateBefore = JSON.stringify(state);
      expect(() => cmd.execute(state)).toThrow(/Crazyhouse/i);
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects drop if it is not the acting player turn', () => {
      const state = createDefaultDomainState('turn-test', 'CRAZYHOUSE');
      (state as { activePlayer: string }).activePlayer = 'P2'; // P2 turn
      (state.capturedInventory as Record<string, string[]>).P1 = ['KNIGHT'];

      const cmd = new MovePieceCommand(
        asEntityId('new-drop-2'),
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1', // P1 trying to drop on P2's turn
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'KNIGHT'
      );

      const stateBefore = JSON.stringify(state);
      expect(() => cmd.execute(state)).toThrow(/turn/i);
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects drop if game is already over (P1)', () => {
      const state = createDefaultDomainState('gameover-test', 'CRAZYHOUSE');
      (state as { isGameOver: boolean }).isGameOver = true;
      (state.capturedInventory as Record<string, string[]>).P1 = ['KNIGHT'];

      const cmd = new MovePieceCommand(
        asEntityId('new-drop-3'),
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'KNIGHT'
      );

      const stateBefore = JSON.stringify(state);
      expect(() => cmd.execute(state)).toThrow(/game is already over/i);
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects drop if pieceId already exists on the board (prevents ID collision / overwrite)', () => {
      const state = createDefaultDomainState('collision-test', 'CRAZYHOUSE');
      (state.capturedInventory as Record<string, string[]>).P1 = ['KNIGHT'];

      // Existing entity on board
      const existingId = asEntityId('existing-pawn-1');
      const existingPiece: IPieceEntity = {
        id: existingId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('1,1'),
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[existingId] = existingPiece;
      state.occupancy[existingPiece.position] = existingId;

      // Malicious or buggy command using the same pieceId as existing piece
      const cmd = new MovePieceCommand(
        existingId, // Same ID!
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'KNIGHT'
      );

      const stateBefore = JSON.stringify(state);
      expect(() => cmd.execute(state)).toThrow(/already exists/i);
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects pawn drop on first or last rank (rank 1 and rank 8)', () => {
      const state = createDefaultDomainState('pawn-rank-test', 'CRAZYHOUSE');
      (state.capturedInventory as Record<string, string[]>).P1 = ['PAWN'];

      // Drop on rank 1 (y = 0)
      const cmdRank1 = new MovePieceCommand(
        asEntityId('drop-pawn-r1'),
        asCoordinateKey(''),
        asCoordinateKey('4,0'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'PAWN'
      );
      const stateBefore = JSON.stringify(state);
      expect(() => cmdRank1.execute(state)).toThrow(/first or last rank/i);
      expect(JSON.stringify(state)).toBe(stateBefore);

      // Drop on rank 8 (y = 7)
      const cmdRank8 = new MovePieceCommand(
        asEntityId('drop-pawn-r8'),
        asCoordinateKey(''),
        asCoordinateKey('4,7'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'PAWN'
      );
      expect(() => cmdRank8.execute(state)).toThrow(/first or last rank/i);
      expect(JSON.stringify(state)).toBe(stateBefore);
    });

    it('rejects drop if it leaves player king in check', () => {
      const state = createDefaultDomainState('check-test', 'CRAZYHOUSE');
      (state.capturedInventory as Record<string, string[]>).P1 = ['ROOK'];

      // White King at 4,0
      const king: IPieceEntity = {
        id: asEntityId('w-king'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('4,0'),
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[king.id] = king;
      state.occupancy[king.position] = king.id;

      // Black Rook at 4,7 checking White King along file 4
      const enemyRook: IPieceEntity = {
        id: asEntityId('b-rook'),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'ROOK',
        position: asCoordinateKey('4,7'),
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[enemyRook.id] = enemyRook;
      state.occupancy[enemyRook.position] = enemyRook.id;

      // P1 tries to drop a Rook on 0,0 instead of blocking the check
      const cmdIrrelevantDrop = new MovePieceCommand(
        asEntityId('drop-rook-irrelevant'),
        asCoordinateKey(''),
        asCoordinateKey('0,0'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'ROOK'
      );

      const stateBefore = JSON.stringify(state);
      expect(() => cmdIrrelevantDrop.execute(state)).toThrow(/check/i);
      expect(JSON.stringify(state)).toBe(stateBefore);

      // But dropping on 4,3 (blocking the check) must succeed!
      const cmdInterposeDrop = new MovePieceCommand(
        asEntityId('drop-rook-interpose'),
        asCoordinateKey(''),
        asCoordinateKey('4,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        sqTopology,
        undefined,
        true,
        'ROOK'
      );
      expect(() => cmdInterposeDrop.execute(state)).not.toThrow();
    });
  });

  describe('RulesEngine.validateMove Move-locking on Game Over (P1)', () => {
    it('returns valid: false with code GAME_OVER when state.isGameOver is true', () => {
      const state = createDefaultDomainState('gameover-rules-test');
      (state as { isGameOver: boolean }).isGameOver = true;

      const pawn: IPieceEntity = {
        id: asEntityId('w-pawn'),
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'PAWN',
        position: asCoordinateKey('4,1'),
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[pawn.id] = pawn;
      state.occupancy[pawn.position] = pawn.id;

      const result = RulesEngine.validateMove(
        state,
        {
          pieceId: pawn.id,
          from: asCoordinateKey('4,1'),
          to: asCoordinateKey('4,3'),
          actingPlayer: 'P1',
        },
        sqTopology
      );

      expect(result.valid).toBe(false);
      expect(result.code).toBe('GAME_OVER');
    });
  });
});

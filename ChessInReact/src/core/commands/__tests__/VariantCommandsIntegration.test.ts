import { describe, it, expect } from 'vitest';
import { MovePieceCommand } from '../MovePieceCommand';
import { createDefaultDomainState } from '../../state/initialState';
import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../../coordinates/types';
import { IPieceEntity } from '../../entities/types';
import { SquareTopology } from '../../topology/SquareTopology';
import { VariantRegistry } from '../../../engine/rules/VariantRegistry';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { NPlayerModifier } from '../../../engine/rules/pipelines/modifiers/NPlayerModifier';

describe('Variant Modifiers & MovePieceCommand Integration (P1, RF-08 to RF-13)', () => {
  const topology = new SquareTopology({ width: 8, height: 8 });

  describe('Atomic Chess (RF-08)', () => {
    it('executes radius-1 explosion upon capture, destroying non-pawns and preserving pawns, fully reversible with undo()', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'ATOMIC';

      // Clear board
      (state as { boardEntities: Record<EntityId, IPieceEntity> }).boardEntities = {};
      (state as { occupancy: Record<CoordinateKey, EntityId> }).occupancy = {};

      // White Knight at c3 ('2,2')
      const wKnightId = asEntityId('w-knight');
      state.boardEntities[wKnightId] = {
        id: wKnightId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KNIGHT',
        position: asCoordinateKey('2,2'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('2,2')] = wKnightId;

      // Black Rook at d5 ('3,4') - target to be captured
      const bRookId = asEntityId('b-rook');
      state.boardEntities[bRookId] = {
        id: bRookId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'ROOK',
        position: asCoordinateKey('3,4'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,4')] = bRookId;

      // Adjacent non-pawn: Black Bishop at e5 ('4,4') - within radius 1 of d5
      const bBishopId = asEntityId('b-bishop');
      state.boardEntities[bBishopId] = {
        id: bBishopId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'BISHOP',
        position: asCoordinateKey('4,4'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('4,4')] = bBishopId;

      // Adjacent pawn: Black Pawn at c5 ('2,4') - pawns are immune outside epicenter!
      const bPawnId = asEntityId('b-pawn');
      state.boardEntities[bPawnId] = {
        id: bPawnId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: asCoordinateKey('2,4'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('2,4')] = bPawnId;

      // Kings safe far away
      const wKingId = asEntityId('w-king');
      state.boardEntities[wKingId] = {
        id: wKingId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('0,1'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('0,1')] = wKingId;

      const bKingId = asEntityId('b-king');
      state.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KING',
        position: asCoordinateKey('7,7'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('7,7')] = bKingId;

      // Execute Atomic capture: Knight captures Rook at d5 ('2,2' -> '3,4')
      const atomicCmd = new MovePieceCommand(
        wKnightId,
        asCoordinateKey('2,2'),
        asCoordinateKey('3,4'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        topology
      );

      atomicCmd.execute(state);

      // Verify Atomic explosion effects:
      // 1. Capturing Knight destroyed
      expect((state.boardEntities[wKnightId] as IPieceEntity).isCaptured).toBe(true);
      expect(state.occupancy[asCoordinateKey('3,4')]).toBeUndefined();

      // 2. Captured Rook destroyed
      expect((state.boardEntities[bRookId] as IPieceEntity).isCaptured).toBe(true);

      // 3. Adjacent Bishop destroyed
      expect((state.boardEntities[bBishopId] as IPieceEntity).isCaptured).toBe(true);
      expect(state.occupancy[asCoordinateKey('4,4')]).toBeUndefined();

      // 4. Adjacent Pawn survived! (immune to blast outside epicenter)
      expect((state.boardEntities[bPawnId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.occupancy[asCoordinateKey('2,4')]).toBe(bPawnId);

      // Game is not over because both kings survived
      expect(state.isGameOver).toBe(false);

      // Now test complete reversibility with undo()
      atomicCmd.undo(state);

      // All pieces restored to exact original coordinates and occupancy
      expect((state.boardEntities[wKnightId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.occupancy[asCoordinateKey('2,2')]).toBe(wKnightId);

      expect((state.boardEntities[bRookId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.occupancy[asCoordinateKey('3,4')]).toBe(bRookId);

      expect((state.boardEntities[bBishopId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.occupancy[asCoordinateKey('4,4')]).toBe(bBishopId);

      expect((state.boardEntities[bPawnId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.occupancy[asCoordinateKey('2,4')]).toBe(bPawnId);
    });

    it('triggers immediate victory when King is caught in blast radius', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'ATOMIC';
      (state as { boardEntities: Record<EntityId, IPieceEntity> }).boardEntities = {};
      (state as { occupancy: Record<CoordinateKey, EntityId> }).occupancy = {};

      const wQueenId = asEntityId('w-queen');
      state.boardEntities[wQueenId] = {
        id: wQueenId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'QUEEN',
        position: asCoordinateKey('3,0'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,0')] = wQueenId;

      const bPawnId = asEntityId('b-pawn');
      state.boardEntities[bPawnId] = {
        id: bPawnId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: asCoordinateKey('3,6'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,6')] = bPawnId;

      // Black King adjacent to bPawn at e7 ('4,6')
      const bKingId = asEntityId('b-king');
      state.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KING',
        position: asCoordinateKey('4,6'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('4,6')] = bKingId;

      // White King safe at a1 ('0,0')
      const wKingId = asEntityId('w-king');
      state.boardEntities[wKingId] = {
        id: wKingId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('0,0'),
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('0,0')] = wKingId;

      // Queen captures pawn at d7 ('3,6') -> explosion destroys adjacent Black King at e7!
      const blastCmd = new MovePieceCommand(
        wQueenId,
        asCoordinateKey('3,0'),
        asCoordinateKey('3,6'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        topology
      );

      blastCmd.execute(state);

      expect((state.boardEntities[bKingId] as IPieceEntity).isCaptured).toBe(true);
      expect(state.isGameOver).toBe(true);
      expect(state.winnerId).toBe('P1');

      // Undo restores match to active state
      blastCmd.undo(state);
      expect((state.boardEntities[bKingId] as IPieceEntity).isCaptured).toBe(false);
      expect(state.isGameOver).toBe(false);
      expect(state.winnerId).toBeNull();
    });
  });

  describe('Crazyhouse Variant (RF-09)', () => {
    it('adds captured piece to player pocket inventory and allows reversible drop moves', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'CRAZYHOUSE';
      (state as { capturedInventory: Record<string, string[]> }).capturedInventory = { P1: ['KNIGHT'], P2: [] };

      // Destination coordinate for drop: d4 ('3,3') is empty
      expect(state.occupancy[asCoordinateKey('3,3')]).toBeUndefined();

      const droppedKnightId = asEntityId('dropped-knight-1');
      const dropCmd = new MovePieceCommand(
        droppedKnightId,
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        topology,
        VariantRegistry.getVariant('CRAZYHOUSE')?.config,
        true, // isDropMove
        'KNIGHT' // dropPieceVariant
      );

      // Execute drop
      dropCmd.execute(state);

      // Piece placed on board
      expect(state.occupancy[asCoordinateKey('3,3')]).toBe(droppedKnightId);
      expect((state.boardEntities[droppedKnightId] as IPieceEntity)?.variantId).toBe('KNIGHT');
      expect((state.boardEntities[droppedKnightId] as IPieceEntity)?.ownerId).toBe('P1');
      // Pocket inventory decremented
      expect(state.capturedInventory['P1']).not.toContain('KNIGHT');

      // Undo drop
      dropCmd.undo(state);

      // Piece removed from board and returned to pocket
      expect(state.occupancy[asCoordinateKey('3,3')]).toBeUndefined();
      expect(state.boardEntities[droppedKnightId]).toBeUndefined();
      expect(state.capturedInventory['P1']).toContain('KNIGHT');
    });

    it('rejects dropping a piece not present in player pocket', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'CRAZYHOUSE';
      (state as { capturedInventory: Record<string, string[]> }).capturedInventory = { P1: [], P2: [] };

      const dropCmd = new MovePieceCommand(
        asEntityId('drop-queen-invalid'),
        asCoordinateKey(''),
        asCoordinateKey('3,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        topology,
        VariantRegistry.getVariant('CRAZYHOUSE')?.config,
        true,
        'QUEEN'
      );

      expect(() => dropCmd.execute(state)).toThrow('not available in player "P1" inventory');
    });
  });

  describe('King of the Hill Variant (RF-12)', () => {
    it('declares victory immediately when King steps onto center hill squares', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'KING_OF_THE_HILL';
      (state as { boardEntities: Record<EntityId, IPieceEntity> }).boardEntities = {};
      (state as { occupancy: Record<CoordinateKey, EntityId> }).occupancy = {};

      const wKingId = asEntityId('w-king');
      state.boardEntities[wKingId] = {
        id: wKingId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'KING',
        position: asCoordinateKey('3,2'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,2')] = wKingId;

      const bKingId = asEntityId('b-king');
      state.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KING',
        position: asCoordinateKey('7,7'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('7,7')] = bKingId;

      // King moves from d3 ('3,2') to d4 ('3,3') - one of the 4 hill squares!
      const kothCmd = new MovePieceCommand(
        wKingId,
        asCoordinateKey('3,2'),
        asCoordinateKey('3,3'),
        'P1',
        undefined,
        true,
        true,
        undefined,
        topology
      );

      kothCmd.execute(state);

      expect(state.isGameOver).toBe(true);
      expect(state.winnerId).toBe('P1');

      // Undo reverts victory
      kothCmd.undo(state);
      expect(state.isGameOver).toBe(false);
      expect(state.winnerId).toBeNull();
      expect(state.occupancy[asCoordinateKey('3,2')]).toBe(wKingId);
    });
  });

  describe('Antichess Variant (RF-10)', () => {
    it('enforces mandatory capture rule: quiet moves are filtered out when capture exists', () => {
      const state = createDefaultDomainState('variant-test');
      (state as { variantId: string }).variantId = 'ANTICHESS';
      (state as { boardEntities: Record<EntityId, IPieceEntity> }).boardEntities = {};
      (state as { occupancy: Record<CoordinateKey, EntityId> }).occupancy = {};

      const wRookId = asEntityId('w-rook');
      state.boardEntities[wRookId] = {
        id: wRookId,
        type: 'PIECE',
        ownerId: 'P1',
        variantId: 'ROOK',
        position: asCoordinateKey('0,0'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('0,0')] = wRookId;

      const bPawnId = asEntityId('b-pawn');
      state.boardEntities[bPawnId] = {
        id: bPawnId,
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'PAWN',
        position: asCoordinateKey('0,5'),
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('0,5')] = bPawnId;

      const legalMoves = RulesEngine.getLegalMoves(state, topology, { variantId: 'ANTICHESS', enforceCheck: false });

      // Because Rook can capture Pawn at (0,5), ALL quiet moves along rank/file must be filtered out!
      expect(legalMoves.length).toBe(1);
      expect(legalMoves[0].isCapture).toBe(true);
      expect(legalMoves[0].to).toBe(asCoordinateKey('0,5'));
    });
  });

  describe('N-Player Modifier (RF-13)', () => {
    it('supports player elimination with REMOVE, NEUTRALIZE, and TRANSFER policies', () => {
      const state = createDefaultDomainState('variant-test');
      const p2Piece: IPieceEntity = {
        id: asEntityId('p2-knight'),
        type: 'PIECE',
        ownerId: 'P2',
        variantId: 'KNIGHT',
        position: asCoordinateKey('1,7'),
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[p2Piece.id] = p2Piece;
      state.occupancy[p2Piece.position] = p2Piece.id;

      // 1. NEUTRALIZE policy: pieces become neutral obstacles (ownerId: 'NONE')
      const neutralizedState = NPlayerModifier.eliminatePlayer(state, 'P2', 'NEUTRALIZE');
      expect((neutralizedState.boardEntities[p2Piece.id] as IPieceEntity)?.ownerId).toBe('NONE');
      expect(neutralizedState.occupancy[p2Piece.position]).toBe(p2Piece.id);

      // 2. REMOVE policy: pieces are captured and removed from occupancy
      const removedState = NPlayerModifier.eliminatePlayer(state, 'P2', 'REMOVE');
      expect((removedState.boardEntities[p2Piece.id] as IPieceEntity).isCaptured).toBe(true);
      expect(removedState.occupancy[p2Piece.position]).toBeUndefined();

      // 3. TRANSFER policy: pieces transferred to victor
      const transferredState = NPlayerModifier.eliminatePlayer(state, 'P2', 'TRANSFER', 'P1');
      expect((transferredState.boardEntities[p2Piece.id] as IPieceEntity)?.ownerId).toBe('P1');
    });
  });
});

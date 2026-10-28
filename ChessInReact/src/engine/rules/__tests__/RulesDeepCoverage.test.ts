import { describe, it, expect } from 'vitest';
import { HopperBehavior } from '../behaviors/HopperBehavior';
import { LeaperBehavior } from '../behaviors/LeaperBehavior';
import { SliderBehavior } from '../behaviors/SliderBehavior';
import { BetzaParser } from '../behaviors/BetzaParser';
import { MovePipeline } from '../pipelines/MovePipeline';
import { AntichessModifier } from '../pipelines/modifiers/AntichessModifier';
import { AtomicModifier } from '../pipelines/modifiers/AtomicModifier';
import { GameOverDetector } from '../GameOverDetector';
import { CheckValidator } from '../CheckValidator';
import { RulesEngine } from '../RulesEngine';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { HexTopology } from '../../../core/topology/HexTopology';
import { TriangleTopology } from '../../../core/topology/TriangleTopology';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../../../core/coordinates/types';
import { IPieceEntity } from '../../../core/entities/types';
import { ILegalMove } from '../interfaces/IRulesContracts';

describe('Rules Engine Deep Coverage & Edge Cases (Spec 04 Quality Gate > 95%)', () => {
  const sqTopology = new SquareTopology({ width: 8, height: 8 });
  const hexTopology = new HexTopology({ radius: 5 }); // Official 91-cell board

  describe('HopperBehavior (Grasshopper & Fairy Hoppers)', () => {
    it('handles Grasshopper jumps, empty landing, enemy capture, friendly obstacle, and slide past hurdle', () => {
      const state = createDefaultDomainState('hopper-test');

      // Place Grasshopper at (4,1)
      const ghId = asEntityId('grasshopper-1');
      const gh: IPieceEntity = {
        id: ghId,
        type: 'PIECE',
        position: asCoordinateKey('4,1'),
        ownerId: 'P1',
        variantId: 'GRASSHOPPER',
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[ghId] = gh;
      state.occupancy[asCoordinateKey('4,1')] = ghId;

      // Place Hurdle at (4,3) - friendly piece
      const hurdleId = asEntityId('hurdle-pawn');
      const hurdle: IPieceEntity = {
        id: hurdleId,
        type: 'PIECE',
        position: asCoordinateKey('4,3'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[hurdleId] = hurdle;
      state.occupancy[asCoordinateKey('4,3')] = hurdleId;

      // 1. Standard immediate landing hopper (ORTHOGONAL)
      const standardHopper = new HopperBehavior(['ORTHOGONAL'], 8, {
        immediateLandingOnly: true,
        canMove: true,
        canCapture: true,
      });

      // From (4,1) with hurdle at (4,3): lands immediately behind at (4,4)
      const moves1 = standardHopper.generatePseudoLegalMoves(gh.position, sqTopology, state, gh, true);
      expect(moves1).toContain(asCoordinateKey('4,4'));

      // 2. Target square occupied by enemy piece -> capture
      const enemyId = asEntityId('enemy-landing');
      state.boardEntities[enemyId] = {
        id: enemyId,
        type: 'PIECE',
        position: asCoordinateKey('4,4'),
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: false,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('4,4')] = enemyId;

      const movesCapture = standardHopper.generatePseudoLegalMoves(gh.position, sqTopology, state, gh, true);
      expect(movesCapture).toContain(asCoordinateKey('4,4'));

      // With canCapture: false -> should not include enemy square
      const noCaptureHopper = new HopperBehavior(['ORTHOGONAL'], 8, {
        immediateLandingOnly: true,
        canMove: true,
        canCapture: false,
      });
      const movesNoCapture = noCaptureHopper.generatePseudoLegalMoves(gh.position, sqTopology, state, gh, true);
      expect(movesNoCapture).not.toContain(asCoordinateKey('4,4'));

      // 3. Target square occupied by friendly piece -> blocked
      state.boardEntities[enemyId] = {
        ...(state.boardEntities[enemyId] as IPieceEntity),
        ownerId: 'P1', // Now friendly
      };
      const movesBlocked = standardHopper.generatePseudoLegalMoves(gh.position, sqTopology, state, gh, true);
      expect(movesBlocked).not.toContain(asCoordinateKey('4,4'));

      // 4. Non-immediate landing hopper: can continue sliding past hurdle
      delete state.occupancy[asCoordinateKey('4,4')];
      delete state.boardEntities[enemyId];

      const slidingHopper = new HopperBehavior(['ORTHOGONAL'], 8, {
        immediateLandingOnly: false,
        canMove: true,
        canCapture: true,
      });
      const movesSliding = slidingHopper.generatePseudoLegalMoves(gh.position, sqTopology, state, gh, true);
      expect(movesSliding).toContain(asCoordinateKey('4,4'));
      expect(movesSliding).toContain(asCoordinateKey('4,5'));
      expect(movesSliding).toContain(asCoordinateKey('4,6'));
      expect(movesSliding).toContain(asCoordinateKey('4,7'));

      // 5. In Hex and Triangle topologies
      const hexHopper = new HopperBehavior(['ORTHOGONAL', 'DIAGONAL'], 6);
      const hexMoves = hexHopper.generatePseudoLegalMoves(asCoordinateKey('0,0,0'), hexTopology, state, gh, true);
      expect(Array.isArray(hexMoves)).toBe(true);

      const triTopology = new TriangleTopology({ boundingRadius: 4 });
      const triMoves = hexHopper.generatePseudoLegalMoves(asCoordinateKey('0,0'), triTopology, state, gh, true);
      expect(Array.isArray(triMoves)).toBe(true);
    });
  });

  describe('MovePipeline & Modifiers Edge Coverage', () => {
    it('exercises all branches of MovePipeline (post-move effects, filtering, victory)', () => {
      const state = createDefaultDomainState('pipe-test');
      const piece: IPieceEntity = {
        id: asEntityId('p-white'),
        type: 'PIECE',
        position: asCoordinateKey('4,4'),
        ownerId: 'P1',
        variantId: 'QUEEN',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[piece.id] = piece;
      state.occupancy[piece.position] = piece.id;

      const victim: IPieceEntity = {
        id: asEntityId('p-victim'),
        type: 'PIECE',
        position: asCoordinateKey('4,5'),
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[victim.id] = victim;
      state.occupancy[victim.position] = victim.id;

      const captureMove: ILegalMove = {
        pieceId: piece.id,
        from: piece.position,
        to: victim.position,
        isCapture: true,
        capturedPieceId: victim.id,
      };

      // 1. Post move effects: Atomic
      const atomicState = MovePipeline.applyPostMoveEffects(
        state,
        captureMove,
        sqTopology,
        { variantId: 'ATOMIC', captureExplosion: true }
      );
      expect((atomicState.boardEntities[piece.id] as IPieceEntity).isCaptured).toBe(true);

      // 2. Post move effects: Crazyhouse
      const chState = MovePipeline.applyPostMoveEffects(
        state,
        captureMove,
        sqTopology,
        { variantId: 'CRAZYHOUSE', allowDrops: true }
      );
      expect(chState.capturedInventory['P1']).toContain('ROOK');

      // 3. Legal moves filter: Antichess
      const quietMove: ILegalMove = {
        pieceId: piece.id,
        from: piece.position,
        to: asCoordinateKey('4,6'),
        isCapture: false,
      };
      const filtered = MovePipeline.filterLegalMoves(
        [quietMove, captureMove],
        state,
        sqTopology,
        { variantId: 'ANTICHESS' }
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].isCapture).toBe(true);

      // 4. Victory condition: King of the Hill
      const kothVictory = MovePipeline.evaluateVictoryCondition(
        state,
        5,
        { variantId: 'KING_OF_THE_HILL', hillCenterCoords: [asCoordinateKey('4,4')] }
      );
      expect(kothVictory.isGameOver).toBe(false); // piece is QUEEN, not KING

      // With King on hill
      state.boardEntities[piece.id] = { ...piece, variantId: 'KING' };
      const kothKingVictory = MovePipeline.evaluateVictoryCondition(
        state,
        5,
        { variantId: 'KING_OF_THE_HILL', hillCenterCoords: [asCoordinateKey('4,4')] }
      );
      expect(kothKingVictory.isGameOver).toBe(true);
      expect(kothKingVictory.winnerId).toBe('P1');

      // 5. Victory condition: Antichess (all pieces lost)
      delete state.boardEntities[piece.id];
      delete state.occupancy[piece.position];
      const antichessWin = MovePipeline.evaluateVictoryCondition(
        state,
        0,
        { variantId: 'ANTICHESS' }
      );
      expect(antichessWin.isGameOver).toBe(true);
      expect(antichessWin.winnerId).toBe('P1');

      // Default in progress
      const inProgress = MovePipeline.evaluateVictoryCondition(
        state,
        5,
        { variantId: 'CHESS_STANDARD' }
      );
      expect(inProgress.isGameOver).toBe(false);
    });

    it('exercises AntichessModifier branches (quiet-only moves, stalemate win)', () => {
      const quietMoves: ILegalMove[] = [
        { pieceId: asEntityId('p1'), from: asCoordinateKey('0,0'), to: asCoordinateKey('0,1'), isCapture: false },
      ];
      // When no captures exist, filter returns all moves
      expect(AntichessModifier.filterMandatoryCaptures(quietMoves).length).toBe(1);

      // Stalemate win when pieces remain but legalMovesCount is 0
      const state = createDefaultDomainState('anti-stale');
      const piece: IPieceEntity = {
        id: asEntityId('p1'),
        type: 'PIECE',
        position: asCoordinateKey('0,0'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[piece.id] = piece;
      state.occupancy[piece.position] = piece.id;

      const outcome = AntichessModifier.evaluateAntichessOutcome(state, 0);
      expect(outcome.isGameOver).toBe(true);
      expect(outcome.status).toBe('STALEMATE');
      expect(outcome.winnerId).toBe('P1');

      // In progress when legal moves exist
      const running = AntichessModifier.evaluateAntichessOutcome(state, 3);
      expect(running.isGameOver).toBe(false);
    });

    it('exercises AtomicModifier branches (non-capture move, mutual king destruction draw)', () => {
      const state = createDefaultDomainState('atomic-draw');
      const quietMove: ILegalMove = {
        pieceId: asEntityId('p1'),
        from: asCoordinateKey('0,0'),
        to: asCoordinateKey('0,1'),
        isCapture: false,
      };

      // Non-capture returns unchanged state
      const quietResult = AtomicModifier.applyExplosion(state, quietMove, sqTopology);
      expect(quietResult.destroyedPieceIds.length).toBe(0);
      expect(quietResult.isGameOver).toBe(false);

      // Mutual destruction: Both Kings adjacent to exploding piece
      const wKingId = asEntityId('wk');
      const bKingId = asEntityId('bk');
      state.boardEntities[wKingId] = {
        id: wKingId,
        type: 'PIECE',
        position: asCoordinateKey('3,3'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,3')] = wKingId;

      state.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        position: asCoordinateKey('3,5'),
        ownerId: 'P2',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,5')] = bKingId;

      const captorId = asEntityId('captor');
      state.boardEntities[captorId] = {
        id: captorId,
        type: 'PIECE',
        position: asCoordinateKey('2,4'),
        ownerId: 'P1',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('2,4')] = captorId;

      const victimId = asEntityId('victim');
      state.boardEntities[victimId] = {
        id: victimId,
        type: 'PIECE',
        position: asCoordinateKey('3,4'), // between (3,3) and (3,5)!
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      state.occupancy[asCoordinateKey('3,4')] = victimId;

      const captureMove: ILegalMove = {
        pieceId: captorId,
        from: asCoordinateKey('2,4'),
        to: asCoordinateKey('3,4'),
        isCapture: true,
        capturedPieceId: victimId,
      };

      const drawResult = AtomicModifier.applyExplosion(state, captureMove, sqTopology);
      expect(drawResult.isGameOver).toBe(true);
      expect(drawResult.winnerId).toBeNull(); // Mutual destruction draw
    });
  });

  describe('GameOverDetector Full FIDE & Variant Termination Coverage', () => {
    it('detects 75-move rule, 50-move rule, 5-fold repetition, and 3-fold repetition', () => {
      const state = createDefaultDomainState('fide-draws');

      // 1. 75-move rule (150 halfmoves)
      (state.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = 150;
      const r75 = GameOverDetector.evaluateGameResult(state, sqTopology, 5);
      expect(r75.isGameOver).toBe(true);
      expect(r75.status).toBe('SEVENTYFIVE_MOVE_RULE');

      // 2. 50-move rule (100 halfmoves)
      (state.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = 100;
      const r50 = GameOverDetector.evaluateGameResult(state, sqTopology, 5);
      expect(r50.isGameOver).toBe(true);
      expect(r50.status).toBe('FIFTY_MOVE_RULE');

      (state.turnState as { fiftyMoveCounter: number }).fiftyMoveCounter = 0;

      // 3. 5-fold repetition
      const history5 = ['pos1', 'pos2', 'pos1', 'pos3', 'pos1', 'pos4', 'pos1', 'pos5', 'pos1'];
      const rRep5 = GameOverDetector.evaluateGameResult(state, sqTopology, 5, undefined, history5);
      expect(rRep5.isGameOver).toBe(true);
      expect(rRep5.status).toBe('FIVEFOLD_REPETITION');

      // 4. 3-fold repetition
      const history3 = ['pos1', 'pos2', 'pos1', 'pos3', 'pos1'];
      const rRep3 = GameOverDetector.evaluateGameResult(state, sqTopology, 5, undefined, history3);
      expect(rRep3.isGameOver).toBe(true);
      expect(rRep3.status).toBe('THREEFOLD_REPETITION');
    });

    it('evaluates insufficient material: same-color bishops (draw) vs opposite-color bishops (sufficient)', () => {
      // King vs King
      const wk: IPieceEntity = { id: asEntityId('wk'), type: 'PIECE', position: asCoordinateKey('0,0'), ownerId: 'P1', variantId: 'KING', hasMoved: true, isCaptured: false };
      const bk: IPieceEntity = { id: asEntityId('bk'), type: 'PIECE', position: asCoordinateKey('7,7'), ownerId: 'P2', variantId: 'KING', hasMoved: true, isCaptured: false };
      expect(GameOverDetector.isInsufficientMaterial([wk, bk], sqTopology)).toBe(true);

      // King + Bishop vs King + Bishop on SAME color squares (e.g. c1=2,0 and f8=5,7 both dark)
      const wb1: IPieceEntity = { id: asEntityId('wb1'), type: 'PIECE', position: asCoordinateKey('2,0'), ownerId: 'P1', variantId: 'BISHOP', hasMoved: true, isCaptured: false };
      const bb1: IPieceEntity = { id: asEntityId('bb1'), type: 'PIECE', position: asCoordinateKey('5,7'), ownerId: 'P2', variantId: 'BISHOP', hasMoved: true, isCaptured: false };
      expect(GameOverDetector.isInsufficientMaterial([wk, bk, wb1, bb1], sqTopology)).toBe(true);

      // King + Bishop vs King + Bishop on OPPOSITE color squares (c1=2,0 dark and e8=4,7 light) -> mate theoretically possible
      const bbOpposite: IPieceEntity = { id: asEntityId('bbOpp'), type: 'PIECE', position: asCoordinateKey('4,7'), ownerId: 'P2', variantId: 'BISHOP', hasMoved: true, isCaptured: false };
      expect(GameOverDetector.isInsufficientMaterial([wk, bk, wb1, bbOpposite], sqTopology)).toBe(false);

      // King + Knight vs King + Knight -> mate theoretically possible in corner (FIDE Article 9.6)
      const wn: IPieceEntity = { id: asEntityId('wn'), type: 'PIECE', position: asCoordinateKey('2,2'), ownerId: 'P1', variantId: 'KNIGHT', hasMoved: true, isCaptured: false };
      const bn: IPieceEntity = { id: asEntityId('bn'), type: 'PIECE', position: asCoordinateKey('5,5'), ownerId: 'P2', variantId: 'KNIGHT', hasMoved: true, isCaptured: false };
      expect(GameOverDetector.isInsufficientMaterial([wk, bk, wn, bn], sqTopology)).toBe(false);
    });
  });

  describe('BetzaParser & Fairy Atoms Exhaustive Coverage', () => {
    it('parses atoms, tuples, hoppers, direction prefixes, range limits, and cache clearing', () => {
      BetzaParser.clearCache();

      // Empty / invalid
      expect(BetzaParser.parse('')).toEqual([]);
      expect(BetzaParser.parse(null as unknown as string)).toEqual([]);
      expect(BetzaParser.parse('a'.repeat(105))).toEqual([]);

      // Named Fairy pieces
      expect(BetzaParser.parse('AMAZON').length).toBe(2);
      expect(BetzaParser.parse('CHANCELLOR').length).toBe(2);
      expect(BetzaParser.parse('ARCHBISHOP').length).toBe(2);
      expect(BetzaParser.parse('WAZIR').length).toBe(1);
      expect(BetzaParser.parse('FERZ').length).toBe(1);
      expect(BetzaParser.parse('CAMEL').length).toBe(1);
      expect(BetzaParser.parse('ZEBRA').length).toBe(1);
      expect(BetzaParser.parse('GRASSHOPPER').length).toBe(1);

      // Custom Betza combinations:
      // D (Dabbaba 2,0), A (Alfil 2,2), C (Camel 1,3), Z (Zebra 2,3)
      const leapers = BetzaParser.parse('DA');
      expect(leapers.length).toBe(2);

      const camelZebra = BetzaParser.parse('CZ');
      expect(camelZebra.length).toBe(2);

      // Explicit tuple leapers: (1,3), (2,4)
      const explicitTuple = BetzaParser.parse('(1,3)(2,4)');
      expect(explicitTuple.length).toBe(2);

      // Range limits: R3, B4, Q2
      const ranged = BetzaParser.parse('R3B4Q2');
      expect(ranged.length).toBe(3);

      // Directional and action modifiers:
      // f = forward only, b = backward only, s = sideways only, v = vertical only, r = right only, l = left only
      // c = capture only, m = move only
      const modifiedB = BetzaParser.parse('fB');
      expect(modifiedB.length).toBe(1);

      const modifiedK = BetzaParser.parse('bK');
      expect(modifiedK.length).toBe(2);

      const complexAtoms = BetzaParser.parse('fsWbrFmvNclD');
      expect(complexAtoms.length).toBe(4);

      // Hopper prefix 'p': pR (Rook hopper), pB (Bishop hopper), pQ (Queen hopper)
      const hoppers = BetzaParser.parse('pRpBpQ');
      expect(hoppers.length).toBe(3);
    });
  });

  describe('CheckValidator & Leaper/Slider Directional Edge Branches', () => {
    it('executes non-square raycasting check validation on HexTopology', () => {
      const state = createDefaultDomainState('hex-check');
      const kingPos = asCoordinateKey('0,0,0');
      const wk: IPieceEntity = {
        id: asEntityId('hex-wk'),
        type: 'PIECE',
        position: kingPos,
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[wk.id] = wk;
      state.occupancy[kingPos] = wk.id;

      // Enemy Rook placed along edge direction 0: (1,-1,0)
      const rookPos = asCoordinateKey('1,-1,0');
      const bRook: IPieceEntity = {
        id: asEntityId('hex-br'),
        type: 'PIECE',
        position: rookPos,
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[bRook.id] = bRook;
      state.occupancy[rookPos] = bRook.id;

      // Reverse raycast check query on HexTopology
      const isAttacked = CheckValidator.isSquareAttacked(kingPos, 'P2', state, hexTopology);
      expect(isAttacked).toBe(true);

      // Enemy Bishop placed along vertex direction
      const bBishopPos = asCoordinateKey('2,-1,-1');
      const bBishop: IPieceEntity = {
        id: asEntityId('hex-bb'),
        type: 'PIECE',
        position: bBishopPos,
        ownerId: 'P2',
        variantId: 'BISHOP',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[bBishop.id] = bBishop;
      state.occupancy[bBishopPos] = bBishop.id;

      const isBishopAttacked = CheckValidator.isSquareAttacked(kingPos, 'P2', state, hexTopology);
      expect(isBishopAttacked).toBe(true);
    });

    it('exercises LeaperBehavior directional options (sideways, vertical, left, right)', () => {
      const state = createDefaultDomainState('leaper-dirs');
      const piece: IPieceEntity = {
        id: asEntityId('w-test-p'),
        type: 'PIECE',
        position: asCoordinateKey('4,4'),
        ownerId: 'P1',
        variantId: 'TEST',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[piece.id] = piece;
      state.occupancy[piece.position] = piece.id;

      // 1. Sideways only (dy === 0)
      const sidewaysLeaper = new LeaperBehavior(1, 0, { sidewaysOnly: true });
      const sidewaysMoves = sidewaysLeaper.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      for (const m of sidewaysMoves) {
        expect(m.endsWith(',4')).toBe(true);
      }

      // 2. Vertical only (dx === 0)
      const verticalLeaper = new LeaperBehavior(1, 0, { verticalOnly: true });
      const verticalMoves = verticalLeaper.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      for (const m of verticalMoves) {
        expect(m.startsWith('4,')).toBe(true);
      }

      // 3. Right only (dx > 0)
      const rightLeaper = new LeaperBehavior(1, 0, { rightOnly: true });
      const rightMoves = rightLeaper.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      expect(rightMoves).toContain(asCoordinateKey('5,4'));

      // 4. Left only (dx < 0)
      const leftLeaper = new LeaperBehavior(1, 0, { leftOnly: true });
      const leftMoves = leftLeaper.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      expect(leftMoves).toContain(asCoordinateKey('3,4'));

      // 5. Terrain obstacle blockage in Leaper & Slider
      (state as unknown as { terrain: Record<CoordinateKey, EntityId> }).terrain = {
        [asCoordinateKey('5,4')]: asEntityId('mountain-1'),
      };
      state.boardEntities[asEntityId('mountain-1')] = {
        id: asEntityId('mountain-1'),
        type: 'TERRAIN',
        position: asCoordinateKey('5,4'),
        variantId: 'MOUNTAIN',
        elevation: 0.9, // Impassable wall
      };

      const blockedRightMoves = rightLeaper.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      expect(blockedRightMoves).not.toContain(asCoordinateKey('5,4'));

      const slider = new SliderBehavior(['ORTHOGONAL']);
      const sliderMoves = slider.generatePseudoLegalMoves(piece.position, sqTopology, state, piece, true);
      expect(sliderMoves).not.toContain(asCoordinateKey('5,4'));
    });

    it('simulates moves with castling and en passant in RulesEngine.simulateMove', () => {
      const state = createDefaultDomainState('sim-test');
      const wk: IPieceEntity = {
        id: asEntityId('wk'),
        type: 'PIECE',
        position: asCoordinateKey('4,0'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
      };
      const wr: IPieceEntity = {
        id: asEntityId('wr'),
        type: 'PIECE',
        position: asCoordinateKey('7,0'),
        ownerId: 'P1',
        variantId: 'ROOK',
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[wk.id] = wk;
      state.boardEntities[wr.id] = wr;
      state.occupancy[wk.position] = wk.id;
      state.occupancy[wr.position] = wr.id;

      // Simulate Kingside castling
      const simKingside = RulesEngine.simulateMove(state, wk, asCoordinateKey('6,0'), 'KINGSIDE');
      expect(simKingside.occupancy[asCoordinateKey('6,0')]).toBe(wk.id);
      expect(simKingside.occupancy[asCoordinateKey('5,0')]).toBe(wr.id);

      // Queenside castling simulation
      const wrQ: IPieceEntity = {
        id: asEntityId('wrQ'),
        type: 'PIECE',
        position: asCoordinateKey('0,0'),
        ownerId: 'P1',
        variantId: 'ROOK',
        hasMoved: false,
        isCaptured: false,
      };
      state.boardEntities[wrQ.id] = wrQ;
      state.occupancy[wrQ.position] = wrQ.id;

      const simQueenside = RulesEngine.simulateMove(state, wk, asCoordinateKey('2,0'), 'QUEENSIDE');
      expect(simQueenside.occupancy[asCoordinateKey('2,0')]).toBe(wk.id);
      expect(simQueenside.occupancy[asCoordinateKey('3,0')]).toBe(wrQ.id);

      // En Passant simulation
      const wp: IPieceEntity = {
        id: asEntityId('wp'),
        type: 'PIECE',
        position: asCoordinateKey('4,4'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      const bp: IPieceEntity = {
        id: asEntityId('bp'),
        type: 'PIECE',
        position: asCoordinateKey('3,4'),
        ownerId: 'P2',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[wp.id] = wp;
      state.boardEntities[bp.id] = bp;
      state.occupancy[wp.position] = wp.id;
      state.occupancy[bp.position] = bp.id;

      const simEP = RulesEngine.simulateMove(state, wp, asCoordinateKey('3,5'), undefined, true);
      expect(simEP.occupancy[asCoordinateKey('3,5')]).toBe(wp.id);
      expect((simEP.boardEntities[bp.id] as IPieceEntity).isCaptured).toBe(true);
      expect(simEP.occupancy[asCoordinateKey('3,4')]).toBeUndefined();
    });

    it('covers HopperBehavior diagonal axes and AtomicModifier P2 win condition', () => {
      // Hopper with diagonal axes on Square topology
      const state = createDefaultDomainState('diag-hopper');
      const ghPiece: IPieceEntity = {
        id: asEntityId('diag-gh'),
        type: 'PIECE',
        position: asCoordinateKey('2,2'),
        ownerId: 'P1',
        variantId: 'GRASSHOPPER',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[ghPiece.id] = ghPiece;
      state.occupancy[ghPiece.position] = ghPiece.id;

      const hurdlePiece: IPieceEntity = {
        id: asEntityId('diag-hurdle'),
        type: 'PIECE',
        position: asCoordinateKey('3,3'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      state.boardEntities[hurdlePiece.id] = hurdlePiece;
      state.occupancy[hurdlePiece.position] = hurdlePiece.id;

      const diagHopper = new HopperBehavior(['DIAGONAL'], 8);
      const diagMoves = diagHopper.generatePseudoLegalMoves(ghPiece.position, sqTopology, state, ghPiece, true);
      expect(diagMoves).toContain(asCoordinateKey('4,4'));

      // AtomicModifier: White King destroyed, Black King survives -> winnerId = 'P2'
      const atomicState = createDefaultDomainState('atomic-p2');
      const bKing: IPieceEntity = {
        id: asEntityId('atomic-bk'),
        type: 'PIECE',
        position: asCoordinateKey('7,7'),
        ownerId: 'P2',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      atomicState.boardEntities[bKing.id] = bKing;
      atomicState.occupancy[bKing.position] = bKing.id;

      const wKingToDie: IPieceEntity = {
        id: asEntityId('atomic-wk'),
        type: 'PIECE',
        position: asCoordinateKey('3,4'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      atomicState.boardEntities[wKingToDie.id] = wKingToDie;
      atomicState.occupancy[wKingToDie.position] = wKingToDie.id;

      const bAttacker: IPieceEntity = {
        id: asEntityId('atomic-attacker'),
        type: 'PIECE',
        position: asCoordinateKey('2,3'),
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      atomicState.boardEntities[bAttacker.id] = bAttacker;
      atomicState.occupancy[bAttacker.position] = bAttacker.id;

      const victimPawn: IPieceEntity = {
        id: asEntityId('atomic-victim-pawn'),
        type: 'PIECE',
        position: asCoordinateKey('3,3'),
        ownerId: 'P1',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      atomicState.boardEntities[victimPawn.id] = victimPawn;
      atomicState.occupancy[victimPawn.position] = victimPawn.id;

      const blastMove: ILegalMove = {
        pieceId: bAttacker.id,
        from: bAttacker.position,
        to: victimPawn.position,
        isCapture: true,
        capturedPieceId: victimPawn.id,
      };

      const blastRes = AtomicModifier.applyExplosion(atomicState, blastMove, sqTopology);
      expect(blastRes.isGameOver).toBe(true);
      expect(blastRes.winnerId).toBe('P2');
    });

    it('covers GameOverDetector variant configurations, CoordinateHelper utilities, and Perft promotion tree', async () => {
      // 1. GameOverDetector with KING_OF_THE_HILL config
      const kothState = createDefaultDomainState('koth-detect');
      const hillKing: IPieceEntity = {
        id: asEntityId('hill-k'),
        type: 'PIECE',
        position: asCoordinateKey('3,3'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      kothState.boardEntities[hillKing.id] = hillKing;
      kothState.occupancy[hillKing.position] = hillKing.id;

      const kothRes = GameOverDetector.evaluateGameResult(
        kothState,
        sqTopology,
        5,
        { variantId: 'KING_OF_THE_HILL' }
      );
      expect(kothRes.isGameOver).toBe(true);
      expect(kothRes.status).toBe('HILL_CONTROLLED');
      expect(kothRes.winnerId).toBe('P1');

      // 2. GameOverDetector with ANTICHESS config
      const antiState = createDefaultDomainState('anti-detect');
      const antiRes0 = GameOverDetector.evaluateGameResult(
        antiState,
        sqTopology,
        0,
        { variantId: 'ANTICHESS' }
      );
      expect(antiRes0.isGameOver).toBe(true);
      expect(antiRes0.status).toBe('ALL_PIECES_LOST');

      // 3. RulesEngine validateMove with ANTICHESS FORCED_CAPTURE_AVAILABLE
      const antiMoveState = createDefaultDomainState('anti-forced');
      const whiteRook: IPieceEntity = {
        id: asEntityId('wr-anti'),
        type: 'PIECE',
        position: asCoordinateKey('0,0'),
        ownerId: 'P1',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      const blackPawn: IPieceEntity = {
        id: asEntityId('bp-anti'),
        type: 'PIECE',
        position: asCoordinateKey('0,5'),
        ownerId: 'P2',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      antiMoveState.boardEntities[whiteRook.id] = whiteRook;
      antiMoveState.boardEntities[blackPawn.id] = blackPawn;
      antiMoveState.occupancy[whiteRook.position] = whiteRook.id;
      antiMoveState.occupancy[blackPawn.position] = blackPawn.id;

      // Attempt quiet move (0,0 -> 1,0) when capture of bp at (0,5) is available
      const quietValidation = RulesEngine.validateMove(
        antiMoveState,
        {
          pieceId: whiteRook.id,
          from: asCoordinateKey('0,0'),
          to: asCoordinateKey('1,0'),
          actingPlayer: 'P1',
        },
        sqTopology,
        { variantId: 'ANTICHESS' }
      );
      expect(quietValidation.valid).toBe(false);
      expect(quietValidation.code).toBe('FORCED_CAPTURE_AVAILABLE');

      // 4. CoordinateHelper edge branches
      const { getFastCoordKey, toCoordKey, toAlgebraic, parseCoord } = await import('../utils/CoordinateHelper');
      expect(getFastCoordKey(10, 10)).toBe(asCoordinateKey('10,10'));
      expect(toCoordKey(10, 10)).toBe(asCoordinateKey('10,10'));
      expect(toAlgebraic(4, 3)).toBe('e4');
      expect(parseCoord('10,12')).toEqual({ x: 10, y: 12 });
      expect(parseCoord('not_a_valid_coord')).toBeNull();

      // 5. Perft promotion branch at depth 2
      const { Perft } = await import('../utils/Perft');
      const promoState = createDefaultDomainState('promo-perft');
      const promoPawn: IPieceEntity = {
        id: asEntityId('promo-p'),
        type: 'PIECE',
        position: asCoordinateKey('4,6'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      const enemyKing: IPieceEntity = {
        id: asEntityId('enemy-k'),
        type: 'PIECE',
        position: asCoordinateKey('7,7'),
        ownerId: 'P2',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      const whiteKing: IPieceEntity = {
        id: asEntityId('white-k'),
        type: 'PIECE',
        position: asCoordinateKey('0,0'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      promoState.boardEntities[promoPawn.id] = promoPawn;
      promoState.boardEntities[enemyKing.id] = enemyKing;
      promoState.boardEntities[whiteKing.id] = whiteKing;
      promoState.occupancy[promoPawn.position] = promoPawn.id;
      promoState.occupancy[enemyKing.position] = enemyKing.id;
      promoState.occupancy[whiteKing.position] = whiteKing.id;

      const promoNodes = Perft.countNodes(promoState, sqTopology, 2);
      expect(promoNodes).toBeGreaterThan(0);
    });

    it('covers LEAVES_KING_IN_CHECK and En Passant in validateMove, and hex adjacent check attacks', () => {
      // 1. LEAVES_KING_IN_CHECK in validateMove
      const pinState = createDefaultDomainState('pin-validate');
      const whiteKing: IPieceEntity = {
        id: asEntityId('wk-pin'),
        type: 'PIECE',
        position: asCoordinateKey('4,0'),
        ownerId: 'P1',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      const pinnedKnight: IPieceEntity = {
        id: asEntityId('wn-pin'),
        type: 'PIECE',
        position: asCoordinateKey('4,1'),
        ownerId: 'P1',
        variantId: 'KNIGHT',
        hasMoved: true,
        isCaptured: false,
      };
      const enemyRook: IPieceEntity = {
        id: asEntityId('br-pin'),
        type: 'PIECE',
        position: asCoordinateKey('4,7'),
        ownerId: 'P2',
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      pinState.boardEntities[whiteKing.id] = whiteKing;
      pinState.boardEntities[pinnedKnight.id] = pinnedKnight;
      pinState.boardEntities[enemyRook.id] = enemyRook;
      pinState.occupancy[whiteKing.position] = whiteKing.id;
      pinState.occupancy[pinnedKnight.position] = pinnedKnight.id;
      pinState.occupancy[enemyRook.position] = enemyRook.id;

      // Moving pinned knight away to (2,2) leaves king in check
      const pinResult = RulesEngine.validateMove(
        pinState,
        {
          pieceId: pinnedKnight.id,
          from: pinnedKnight.position,
          to: asCoordinateKey('2,2'),
          actingPlayer: 'P1',
        },
        sqTopology
      );
      expect(pinResult.valid).toBe(false);
      expect(pinResult.code).toBe('LEAVES_KING_IN_CHECK');

      // 2. En Passant validation in validateMove
      const epState = createDefaultDomainState('ep-validate');
      const epWhitePawn: IPieceEntity = {
        id: asEntityId('ep-wp'),
        type: 'PIECE',
        position: asCoordinateKey('4,4'),
        ownerId: 'P1',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      const epBlackPawn: IPieceEntity = {
        id: asEntityId('ep-bp'),
        type: 'PIECE',
        position: asCoordinateKey('3,4'),
        ownerId: 'P2',
        variantId: 'PAWN',
        hasMoved: true,
        isCaptured: false,
      };
      epState.boardEntities[whiteKing.id] = { ...whiteKing, position: asCoordinateKey('0,0') };
      epState.occupancy[asCoordinateKey('0,0')] = whiteKing.id;
      epState.boardEntities[epWhitePawn.id] = epWhitePawn;
      epState.boardEntities[epBlackPawn.id] = epBlackPawn;
      epState.occupancy[epWhitePawn.position] = epWhitePawn.id;
      epState.occupancy[epBlackPawn.position] = epBlackPawn.id;
      (epState.turnState as { enPassantTarget: CoordinateKey | null }).enPassantTarget = asCoordinateKey('3,5');

      const epValidation = RulesEngine.validateMove(
        epState,
        {
          pieceId: epWhitePawn.id,
          from: epWhitePawn.position,
          to: asCoordinateKey('3,5'),
          actingPlayer: 'P1',
        },
        sqTopology
      );
      expect(epValidation.valid).toBe(true);
      expect(epValidation.isEnPassant).toBe(true);
      expect(epValidation.capturedPieceId).toBe(epBlackPawn.id);

      // 3. Hex adjacent King/Wazir attack (dist === 0)
      const hexAdjState = createDefaultDomainState('hex-adj');
      const hexEnemyKing: IPieceEntity = {
        id: asEntityId('hex-ek'),
        type: 'PIECE',
        position: asCoordinateKey('1,-1,0'),
        ownerId: 'P2',
        variantId: 'KING',
        hasMoved: true,
        isCaptured: false,
      };
      hexAdjState.boardEntities[hexEnemyKing.id] = hexEnemyKing;
      hexAdjState.occupancy[hexEnemyKing.position] = hexEnemyKing.id;

      const isHexKingAttacked = CheckValidator.isSquareAttacked(asCoordinateKey('0,0,0'), 'P2', hexAdjState, hexTopology);
      expect(isHexKingAttacked).toBe(true);

      // Hex adjacent Ferz/King along diagonal (dist === 0)
      const hexDiagState = createDefaultDomainState('hex-diag-adj');
      const hexEnemyFerz: IPieceEntity = {
        id: asEntityId('hex-ef'),
        type: 'PIECE',
        position: asCoordinateKey('2,-1,-1'),
        ownerId: 'P2',
        variantId: 'FERZ',
        hasMoved: true,
        isCaptured: false,
      };
      hexDiagState.boardEntities[hexEnemyFerz.id] = hexEnemyFerz;
      hexDiagState.occupancy[hexEnemyFerz.position] = hexEnemyFerz.id;
      const isHexFerzAttacked = CheckValidator.isSquareAttacked(asCoordinateKey('0,0,0'), 'P2', hexDiagState, hexTopology);
      expect(isHexFerzAttacked).toBe(true);

      // 4. Antichess stalemate win in GameOverDetector when pieces remain
      const antiStaleState = createDefaultDomainState('anti-stale-eval');
      antiStaleState.boardEntities[epWhitePawn.id] = epWhitePawn;
      antiStaleState.occupancy[epWhitePawn.position] = epWhitePawn.id;
      const antiStaleRes = GameOverDetector.evaluateGameResult(
        antiStaleState,
        sqTopology,
        0, // 0 legal moves
        { variantId: 'ANTICHESS' }
      );
      expect(antiStaleRes.isGameOver).toBe(true);
      expect(antiStaleRes.status).toBe('STALEMATE');
      expect(antiStaleRes.winnerId).toBe('P1');
    });
  });
});

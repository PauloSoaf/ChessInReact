import { describe, it, expect } from 'vitest';
import { SpellOptimizationStrategy } from '../SpellOptimizationStrategy';
import { DuckChessPlannerStrategy } from '../DuckChessPlannerStrategy';
import { VariantSpecializedStrategy } from '../VariantSpecializedStrategy';
import { createDefaultDomainState } from '../../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../../core/coordinates/types';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { IAIDecisionRequest } from '../../interfaces/IUniversalAIEngine';
import { IDomainState } from '../../../../core/state/gameState';

describe('Minigame Bot Intelligence: Spell Chess, Duck Chess, Atomic & Fairy Variants (Spec 12 & Spec 15)', () => {
  const spellStrategy = new SpellOptimizationStrategy();
  const duckStrategy = new DuckChessPlannerStrategy();
  const variantStrategy = new VariantSpecializedStrategy();
  const topology = new SquareTopology({ width: 8, height: 8 });

  function createCustomDomain(matchId: string, variantId = 'SPELL_CHESS', turnNumber = 4): IDomainState {
    const defaultState = createDefaultDomainState(matchId, variantId);
    return {
      ...defaultState,
      turnNumber,
      boardEntities: {},
      occupancy: {},
    };
  }

  describe('Spell Chess Bot Intelligence: Offensive Freeze-Mate & Freeze Trapping Defense', () => {
    it('executes Offensive King Freeze-Mate: attacks opponent King and casts Freeze on opponent King coordinate', () => {
      const domain = createCustomDomain('test-offensive-freeze-mate', 'SPELL_CHESS', 5);

      // Black King at e8 (4,7)
      const bKingId = asEntityId('black_king');
      domain.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,7'),
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,7')] = bKingId;

      // White King at e1 (4,0)
      const wKingId = asEntityId('white_king');
      domain.boardEntities[wKingId] = {
        id: wKingId,
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('4,0'),
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,0')] = wKingId;

      // White Rook at a7 (0,6) - can move to e7 (4,6) to attack Black King at e8 (4,7)
      const wRookId = asEntityId('white_rook');
      domain.boardEntities[wRookId] = {
        id: wRookId,
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('0,6'),
        variantId: 'ROOK',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('0,6')] = wRookId;

      const request: IAIDecisionRequest = {
        matchId: 'test-offensive-freeze-mate',
        variantId: 'SPELL_CHESS',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
          freezeCharges: 1,
          freezeCooldown: 0,
          opponentFreezeCharges: 1,
          opponentFreezeCooldown: 0,
          activeFrozenCoordinates: [],
        },
        legalMoves: [
          { from: '0,6', to: '0,5', pieceId: 'white_rook' },
          { from: '0,6', to: '4,6', pieceId: 'white_rook' }, // Rook steps to e7, attacking King at e8!
        ],
      };

      const decision = spellStrategy.decideMove(request);

      // Bot must choose the rook move that attacks the King:
      expect(decision.move.to).toBe('4,6');
      // AND cast Freeze on the opponent King's coordinate (4,7) to lock the King down for checkmate!
      expect(decision.secondaryAction).toBeDefined();
      expect(decision.secondaryAction?.type).toBe('CAST_SPELL');
      expect(decision.secondaryAction?.payload.spellType).toBe('FREEZE');
      expect(decision.secondaryAction?.payload.targetCoord).toBe('4,7');
    });

    it('defends against King Freeze Trap: when opponent threatens King and has Freeze, bot avoids passive moves and neutralizes threat', () => {
      const domain = createCustomDomain('test-defend-freeze-trap', 'SPELL_CHESS', 5);

      // Black King at e8 (4,7)
      const bKingId = asEntityId('black_king');
      domain.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,7'),
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,7')] = bKingId;

      // White Queen at e4 (4,3) threatening e8 with 1-pawn hurdle at e7
      const wQueenId = asEntityId('white_queen');
      domain.boardEntities[wQueenId] = {
        id: wQueenId,
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('4,3'),
        variantId: 'QUEEN',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,3')] = wQueenId;

      // Intermediate pawn at e7 (4,6)
      const bPawnId = asEntityId('black_pawn_e7');
      domain.boardEntities[bPawnId] = {
        id: bPawnId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,6'),
        variantId: 'PAWN',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,6')] = bPawnId;

      // Black Knight at f6 (5,5) that can jump to e4 (4,3) to capture the Queen!
      const bKnightId = asEntityId('black_knight_f6');
      domain.boardEntities[bKnightId] = {
        id: bKnightId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('5,5'),
        variantId: 'KNIGHT',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('5,5')] = bKnightId;

      // Passive Black pawn at a7 (0,6)
      const bPawnA7 = asEntityId('black_pawn_a7');
      domain.boardEntities[bPawnA7] = {
        id: bPawnA7,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('0,6'),
        variantId: 'PAWN',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('0,6')] = bPawnA7;

      const request: IAIDecisionRequest = {
        matchId: 'test-defend-freeze-trap',
        variantId: 'SPELL_CHESS',
        actingPlayer: 'P2',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,7',
          opponentKingCoord: '4,0',
          freezeCharges: 1,
          freezeCooldown: 0,
          opponentFreezeCharges: 1,
          opponentFreezeCooldown: 0,
          activeFrozenCoordinates: [],
        },
        legalMoves: [
          { from: '0,6', to: '0,5', pieceId: 'black_pawn_a7' }, // Passive move: suicide!
          { from: '5,5', to: '4,3', pieceId: 'black_knight_f6', isCapture: true }, // Captures threatening Queen!
        ],
      };

      const decision = spellStrategy.decideMove(request);

      // Bot MUST capture the threatening Queen instead of playing the passive pawn move!
      expect(decision.move.pieceId).toBe('black_knight_f6');
      expect(decision.move.to).toBe('4,3');
    });

    it('frozen King defense: when friendly King is frozen, King cannot move; bot captures attacking piece', () => {
      const domain = createCustomDomain('test-frozen-king-defense', 'SPELL_CHESS', 6);

      // Black King at e8 (4,7) is FROZEN
      const bKingId = asEntityId('black_king');
      domain.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,7'),
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
        metadata: { isFrozen: true },
      };
      domain.occupancy[asCoordinateKey('4,7')] = bKingId;

      // White Knight at d6 (3,5) directly attacking e8 (4,7)
      const wKnightId = asEntityId('white_knight');
      domain.boardEntities[wKnightId] = {
        id: wKnightId,
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('3,5'),
        variantId: 'KNIGHT',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('3,5')] = wKnightId;

      // Black Bishop at e7 (4,6) can capture Knight at d6 (3,5)
      const bBishopId = asEntityId('black_bishop');
      domain.boardEntities[bBishopId] = {
        id: bBishopId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,6'),
        variantId: 'BISHOP',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,6')] = bBishopId;

      const request: IAIDecisionRequest = {
        matchId: 'test-frozen-king-defense',
        variantId: 'SPELL_CHESS',
        actingPlayer: 'P2',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,7',
          opponentKingCoord: '4,0',
          freezeCharges: 1,
          freezeCooldown: 0,
          opponentFreezeCharges: 1,
          opponentFreezeCooldown: 0,
          activeFrozenCoordinates: ['4,7', '3,7', '5,7'],
        },
        legalMoves: [
          { from: '4,7', to: '3,7', pieceId: 'black_king' }, // King is frozen, should not be picked!
          { from: '4,6', to: '3,5', pieceId: 'black_bishop', isCapture: true }, // Bishop takes Knight!
        ],
      };

      const decision = spellStrategy.decideMove(request);

      expect(decision.move.pieceId).toBe('black_bishop');
      expect(decision.move.to).toBe('3,5');
    });

    it('freeze economy: bot preserves Freeze when opponent has Freeze available and no major threat exists', () => {
      const domain = createCustomDomain('test-freeze-economy', 'SPELL_CHESS', 2);

      // Standard-like board, no threats
      const request: IAIDecisionRequest = {
        matchId: 'test-freeze-economy',
        variantId: 'SPELL_CHESS',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
          freezeCharges: 2,
          freezeCooldown: 0,
          opponentFreezeCharges: 2,
          opponentFreezeCooldown: 0,
          activeFrozenCoordinates: [],
        },
        legalMoves: [
          { from: '1,0', to: '2,2', pieceId: 'white_knight' },
          { from: '6,0', to: '5,2', pieceId: 'white_knight_2' },
        ],
      };

      const decision = spellStrategy.decideMove(request);

      // With opponent holding 2 Freezes and no major enemy cluster, bot must NOT waste its Freeze!
      expect(decision.secondaryAction).toBeUndefined();
    });
  });

  describe('Duck Chess Bot Intelligence: Proactive Ray Shielding & Escape Trapping', () => {
    it('proactively places Duck directly on opponent Queen attack ray to shield friendly King', () => {
      const domain = createCustomDomain('test-duck-ray-shield', 'DUCK_CHESS', 5);

      // Black King at e8 (4,7)
      const bKingId = asEntityId('black_king');
      domain.boardEntities[bKingId] = {
        id: bKingId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('4,7'),
        variantId: 'KING',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,7')] = bKingId;

      // White Queen at e1 (4,0) with open line along e-file
      const wQueenId = asEntityId('white_queen');
      domain.boardEntities[wQueenId] = {
        id: wQueenId,
        type: 'PIECE',
        ownerId: 'P1',
        position: asCoordinateKey('4,0'),
        variantId: 'QUEEN',
        hasMoved: true,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('4,0')] = wQueenId;

      // Black Pawn at a7 (0,6)
      const bPawnId = asEntityId('black_pawn');
      domain.boardEntities[bPawnId] = {
        id: bPawnId,
        type: 'PIECE',
        ownerId: 'P2',
        position: asCoordinateKey('0,6'),
        variantId: 'PAWN',
        hasMoved: false,
        isCaptured: false,
      };
      domain.occupancy[asCoordinateKey('0,6')] = bPawnId;

      const request: IAIDecisionRequest = {
        matchId: 'test-duck-ray-shield',
        variantId: 'DUCK_CHESS',
        actingPlayer: 'P2',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,7',
          opponentKingCoord: '4,0',
          duckCoordinate: '0,0',
          emptySquares: ['4,4', '4,5', '0,5', '1,1', '2,2'],
        },
        legalMoves: [
          { from: '0,6', to: '0,5', pieceId: 'black_pawn' },
        ],
      };

      const decision = duckStrategy.decideMove(request);

      expect(decision.secondaryAction?.type).toBe('PLACE_DUCK');
      const placedDuck = (decision.secondaryAction?.payload as { targetCoordinate: string }).targetCoordinate;
      // The Duck MUST be placed on the e-file (4,4 or 4,5) to intercept the Queen's ray to the King!
      expect(['4,4', '4,5']).toContain(placedDuck);
    });

    it('offensive Duck trapping: places Duck adjacent to opponent King to seal escape squares', () => {
      const domain = createCustomDomain('test-duck-trap', 'DUCK_CHESS', 5);

      const request: IAIDecisionRequest = {
        matchId: 'test-duck-trap',
        variantId: 'DUCK_CHESS',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        domain,
        topology,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
          duckCoordinate: '0,0',
          emptySquares: ['4,6', '1,1', '2,2'],
        },
        legalMoves: [
          { from: '0,1', to: '0,2', pieceId: 'pawn' },
        ],
      };

      const decision = duckStrategy.decideMove(request);
      expect(decision.secondaryAction?.type).toBe('PLACE_DUCK');
      const placedDuck = (decision.secondaryAction?.payload as { targetCoordinate: string }).targetCoordinate;
      // Should place Duck at 4,6 to block the opponent King's forward escape square!
      expect(placedDuck).toBe('4,6');
    });
  });

  describe('Atomic Chess Bot Intelligence: Explosion Proximity & Ticking Bomb Defense', () => {
    it('captures enemy piece adjacent to enemy King for instant explosion victory', () => {
      const request: IAIDecisionRequest = {
        matchId: 'test-atomic-win',
        variantId: 'ATOMIC',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
        },
        legalMoves: [
          { from: '0,0', to: '1,1', pieceId: 'quiet_pawn' },
          { from: '3,0', to: '3,7', pieceId: 'queen', isCapture: true }, // Captures at d8 (3,7), adjacent to King at e8 (4,7)!
        ],
      };

      const decision = variantStrategy.decideMove(request);
      expect(decision.move.pieceId).toBe('queen');
      expect(decision.move.to).toBe('3,7');
      expect(decision.evaluationCentipawns).toBe(100000);
    });

    it('defensive safety: avoids self-detonation on own King', () => {
      const request: IAIDecisionRequest = {
        matchId: 'test-atomic-safe',
        variantId: 'ATOMIC',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
        },
        legalMoves: [
          { from: '0,0', to: '4,1', pieceId: 'suicide_capture', isCapture: true }, // Captures adjacent to own king at 4,0!
          { from: '2,0', to: '2,2', pieceId: 'safe_knight' },
        ],
      };

      const decision = variantStrategy.decideMove(request);
      expect(decision.move.pieceId).toBe('safe_knight');
    });
  });

  describe('Three-Check Bot Intelligence: 3rd Check Victory', () => {
    it('detects 3rd check opportunity and takes it for instant win', () => {
      const request: IAIDecisionRequest = {
        matchId: 'test-three-check-win',
        variantId: 'THREE_CHECK',
        actingPlayer: 'P1',
        difficultyLevel: 3,
        timeBudgetMs: 500,
        specializedContext: {
          friendlyKingCoord: '4,0',
          opponentKingCoord: '4,7',
          botChecks: 2, // 2 checks already given, 1 check remaining for win!
          opponentChecks: 0,
        },
        legalMoves: [
          { from: '0,0', to: '0,1', pieceId: 'quiet_pawn' },
          { from: '3,0', to: '4,6', pieceId: 'checking_queen' }, // Delivers check at 4,6 adjacent to 4,7!
        ],
      };

      const decision = variantStrategy.decideMove(request);
      expect(decision.move.pieceId).toBe('checking_queen');
      expect(decision.evaluationCentipawns).toBe(100000);
    });
  });
});

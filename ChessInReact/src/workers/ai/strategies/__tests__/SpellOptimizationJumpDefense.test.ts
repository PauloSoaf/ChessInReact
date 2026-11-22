import { describe, it, expect } from 'vitest';
import { SpellOptimizationStrategy } from '../SpellOptimizationStrategy';
import { createDefaultDomainState } from '../../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../../core/coordinates/types';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { IAIDecisionRequest } from '../../interfaces/IUniversalAIEngine';
import { IDomainState } from '../../../../core/state/gameState';

describe('SpellOptimizationStrategy: Proactive Jump Threat Defense (Spec 05 & Spec 12)', () => {
  const strategy = new SpellOptimizationStrategy();
  const topology = new SquareTopology({ width: 8, height: 8 });

  function createCustomDomain(matchId: string): IDomainState {
    const defaultState = createDefaultDomainState(matchId, 'SPELL_CHESS');
    return {
      ...defaultState,
      boardEntities: {},
      occupancy: {},
    };
  }

  it('detects 1-obstacle attack ray from opponent Queen towards friendly King as lethal threat', () => {
    const domain = createCustomDomain('test-jump-threat');

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

    // White Queen at e1 (4,0)
    const wQueenId = asEntityId('white_queen');
    domain.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'QUEEN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,0')] = wQueenId;

    // Exactly 1 intervening piece on e7 (4,6)
    const bPawnId = asEntityId('black_pawn');
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

    const threats = strategy.detectLethalJumpThreats(domain, '4,7', 'P2');
    expect(threats.length).toBe(1);
    expect(threats[0].threateningPieceId).toBe(wQueenId);
    expect(threats[0].threateningCoord).toBe('4,0');
    expect(threats[0].intermediateCoord).toBe('4,6');
  });

  it('proactively avoids moves that leave the King in a 1-obstacle Jump ray, choosing safe King evasion', () => {
    const domain = createCustomDomain('test-jump-evasion');

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

    // White Queen at e1 (4,0)
    const wQueenId = asEntityId('white_queen');
    domain.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'QUEEN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,0')] = wQueenId;

    // 1 intervening piece on e7 (4,6)
    const bPawnId = asEntityId('black_pawn');
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

    // Legal moves for Black:
    // 1. Black pawn moves a7-a6 (useless, leaves e8 King in fatal Jump line!)
    // 2. Black King moves to d8 (3,7) (steps off the e-file, safe!)
    const legalMoves = [
      { from: '0,6', to: '0,5', pieceId: 'dummy_pawn', isCapture: false },
      { from: '4,7', to: '3,7', pieceId: bKingId, isCapture: false },
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-jump-evasion',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 3,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '4,7',
        opponentKingCoord: '4,0',
        freezeCharges: 0,
        jumpCharges: 0,
        opponentJumpCharges: 2,
        opponentJumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // The bot MUST choose the safe King move to d8 (3,7) and reject dummy_pawn!
    expect(decision.move.pieceId).toBe(bKingId);
    expect(decision.move.to).toBe('3,7');
  });

  it('casts reactive FREEZE directly on the threatening Queen when in lethal Jump danger', () => {
    const domain = createCustomDomain('test-jump-freeze');

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

    // White Queen at e1 (4,0)
    const wQueenId = asEntityId('white_queen');
    domain.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'QUEEN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,0')] = wQueenId;

    // Intervening piece on e7 (4,6)
    const bPawnId = asEntityId('black_pawn');
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

    const legalMoves = [
      { from: '4,6', to: '4,5', pieceId: bPawnId, isCapture: false },
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-jump-freeze',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 3,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '4,7',
        opponentKingCoord: '4,0',
        freezeCharges: 5,
        freezeCooldown: 0,
        jumpCharges: 0,
        opponentJumpCharges: 2,
        opponentJumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    expect(decision.secondaryAction).toBeDefined();
    expect(decision.secondaryAction?.type).toBe('CAST_SPELL');
    expect(decision.secondaryAction?.payload.spellType).toBe('FREEZE');
    // Freeze must target the threatening White Queen at (4,0)!
    expect(decision.secondaryAction?.payload.targetCoord).toBe('4,0');
  });
});

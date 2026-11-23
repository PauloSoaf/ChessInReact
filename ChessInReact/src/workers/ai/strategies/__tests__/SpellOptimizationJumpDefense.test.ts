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

  function createCustomDomain(matchId: string, turnNumber = 1): IDomainState {
    const defaultState = createDefaultDomainState(matchId, 'SPELL_CHESS');
    return {
      ...defaultState,
      turnNumber,
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

  it('never casts FREEZE on move 1 or 2 when opponent pieces are undeveloped on back rank', () => {
    const domain = createCustomDomain('test-no-move1-freeze', 1);

    // Black King at e8 (4,7) and White King at e1 (4,0)
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

    // White pieces sleeping on home rank
    const wQueenId = asEntityId('white_queen');
    domain.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('3,0'),
      variantId: 'QUEEN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,0')] = wQueenId;

    const bKnightId = asEntityId('black_knight');
    domain.boardEntities[bKnightId] = {
      id: bKnightId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('6,7'),
      variantId: 'KNIGHT',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('6,7')] = bKnightId;

    const legalMoves = [
      { from: '6,7', to: '5,5', pieceId: bKnightId, isCapture: false },
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-no-move1-freeze',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 5,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '4,7',
        opponentKingCoord: '4,0',
        freezeCharges: 2,
        freezeCooldown: 0,
        jumpCharges: 2,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // Level 5 bot MUST NOT burn freeze on turn 1!
    expect(decision.secondaryAction).toBeUndefined();
  });

  it('rejects suicidal 1... d5/d6 when White Queen can reach h5 with Jump, choosing Nf6 to defend', () => {
    const domain = createCustomDomain('test-queen-jump-defense', 1);

    // Black King at e8 (4,7) and Black Pawn on f7 (5,6)
    const bKingId = asEntityId('b_king');
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

    const bPawnF7Id = asEntityId('b_pawn_f7');
    domain.boardEntities[bPawnF7Id] = {
      id: bPawnF7Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('5,6'),
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('5,6')] = bPawnF7Id;

    const bPawnD7Id = asEntityId('b_pawn_d7');
    domain.boardEntities[bPawnD7Id] = {
      id: bPawnD7Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,6'),
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,6')] = bPawnD7Id;

    const bKnightG8Id = asEntityId('b_knight_g8');
    domain.boardEntities[bKnightG8Id] = {
      id: bKnightG8Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('6,7'),
      variantId: 'KNIGHT',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('6,7')] = bKnightG8Id;

    // White Queen at d1 (3,0) with path to h5 (7,4) clear (e4 was played)
    const wQueenId = asEntityId('w_queen');
    domain.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('3,0'),
      variantId: 'QUEEN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,0')] = wQueenId;

    // Candidate moves for Black:
    // 1. Suicidal d7-d5 (3,6 -> 3,4): leaves h5 open, White Queen Qh5 + Jump x e8# wins!
    // 2. Safe defensive Ng8-f6 (6,7 -> 5,5): Knight guards h5 and prevents Qh5!
    const legalMoves = [
      { from: '3,6', to: '3,4', pieceId: bPawnD7Id, isCapture: false },
      { from: '6,7', to: '5,5', pieceId: bKnightG8Id, isCapture: false },
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-queen-jump-defense',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 5,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '4,7',
        opponentKingCoord: '4,0',
        freezeCharges: 2,
        freezeCooldown: 0,
        jumpCharges: 2,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // Level 5 bot MUST choose the Knight move to f6 (5,5) and reject suicidal d5!
    expect(decision.move.pieceId).toBe(bKnightG8Id);
    expect(decision.move.to).toBe('5,5');
  });
});

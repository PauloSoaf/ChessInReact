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

  it('reproduces user position: White Queen on e4 threatening Jump to e8 over e5 pawn, Black MUST NOT play g5', () => {
    const domain = createCustomDomain('test-user-e4-threat', 4);

    // Black pieces
    const bKingId = asEntityId('b_king_e8');
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

    const bKnightF6Id = asEntityId('b_knight_f6');
    domain.boardEntities[bKnightF6Id] = {
      id: bKnightF6Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('5,5'),
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('5,5')] = bKnightF6Id;

    const bPawnE5Id = asEntityId('b_pawn_e5');
    domain.boardEntities[bPawnE5Id] = {
      id: bPawnE5Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('4,4'),
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,4')] = bPawnE5Id;

    const bPawnG7Id = asEntityId('b_pawn_g7');
    domain.boardEntities[bPawnG7Id] = {
      id: bPawnG7Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('6,6'),
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('6,6')] = bPawnG7Id;

    const bBishopF8Id = asEntityId('b_bishop_f8');
    domain.boardEntities[bBishopF8Id] = {
      id: bBishopF8Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('5,7'),
      variantId: 'BISHOP',
      hasMoved: false,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('5,7')] = bBishopF8Id;

    // White pieces
    const wQueenE4Id = asEntityId('w_queen_e4');
    domain.boardEntities[wQueenE4Id] = {
      id: wQueenE4Id,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,3'),
      variantId: 'QUEEN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,3')] = wQueenE4Id;

    const wBishopB5Id = asEntityId('w_bishop_b5');
    domain.boardEntities[wBishopB5Id] = {
      id: wBishopB5Id,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('1,4'),
      variantId: 'BISHOP',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('1,4')] = wBishopB5Id;

    const legalMoves = [
      { from: '6,6', to: '6,4', pieceId: bPawnG7Id, isCapture: false }, // g7-g5 (suicidal blunder)
      { from: '5,5', to: '4,3', pieceId: bKnightF6Id, isCapture: true }, // Nf6xe4 (captures queen!)
      { from: '5,7', to: '4,6', pieceId: bBishopF8Id, isCapture: false }, // Bf8-e7 (blocks the ray!)
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-user-e4-threat',
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
        freezeCharges: 2,
        freezeCooldown: 0,
        jumpCharges: 2,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    console.log('User Position Decision:', decision.move);
    expect(decision.move.to).not.toBe('6,4'); // MUST NOT play g5!
    expect(decision.move.to).toBe('4,3'); // Prioritizes capturing the attacking Queen!
  });

  it('detects and defends against orthogonal horizontal (rank) Jump threats', () => {
    const domain = createCustomDomain('test-horizontal-threat', 5);

    // Black King at a8 (0,7)
    const bKingId = asEntityId('b_king_a8');
    domain.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('0,7'),
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('0,7')] = bKingId;

    // Black Pawn at c8 (2,7) - obstacle #1 on 8th rank
    const bPawnC8Id = asEntityId('b_pawn_c8');
    domain.boardEntities[bPawnC8Id] = {
      id: bPawnC8Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('2,7'),
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('2,7')] = bPawnC8Id;

    // White Rook at h8 (7,7) - threatening horizontal Jump capture over c8 to a8!
    const wRookH8Id = asEntityId('w_rook_h8');
    domain.boardEntities[wRookH8Id] = {
      id: wRookH8Id,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('7,7'),
      variantId: 'ROOK',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('7,7')] = wRookH8Id;

    // Black Knight at e5 (4,4) capable of moving to e8 (4,7) to insert obstacle #2!
    const bKnightE5Id = asEntityId('b_knight_e5');
    domain.boardEntities[bKnightE5Id] = {
      id: bKnightE5Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('4,4'),
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,4')] = bKnightE5Id;

    // Black Pawn at h7 (7,6) capable of capturing the Rook on h8!
    const bPawnH7Id = asEntityId('b_pawn_h7');
    domain.boardEntities[bPawnH7Id] = {
      id: bPawnH7Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('7,6'),
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('7,6')] = bPawnH7Id;

    const legalMoves = [
      { from: '4,4', to: '4,6', pieceId: bKnightE5Id, isCapture: false }, // Ne5-e6 (irrelevant move)
      { from: '4,4', to: '4,7', pieceId: bKnightE5Id, isCapture: false }, // Ne5-e8 (blocks the horizontal ray!)
      { from: '7,6', to: '7,7', pieceId: bPawnH7Id, isCapture: true }, // h7xh8 (captures the threatening rook!)
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-horizontal-threat',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 5,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '0,7',
        opponentKingCoord: '4,0',
        freezeCharges: 2,
        freezeCooldown: 0,
        jumpCharges: 2,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // Level 5 bot MUST eliminate the threat by capturing the Rook on h8!
    expect(decision.move.to).toBe('7,7');
  });

  it('casts reactive Freeze on a lethal threatening major piece if no capture is possible', () => {
    const domain = createCustomDomain('test-reactive-freeze', 4);

    // Black King at e8 (4,7)
    const bKingId = asEntityId('b_king_e8');
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

    // Pawn on e5 (4,4) - 1 obstacle
    const bPawnE5Id = asEntityId('b_pawn_e5');
    domain.boardEntities[bPawnE5Id] = {
      id: bPawnE5Id,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('4,4'),
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,4')] = bPawnE5Id;

    // White Queen on e4 (4,3) - cannot be captured this turn
    const wQueenE4Id = asEntityId('w_queen_e4');
    domain.boardEntities[wQueenE4Id] = {
      id: wQueenE4Id,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,3'),
      variantId: 'QUEEN',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,3')] = wQueenE4Id;

    // Black King can step to d8 (3,7)
    const legalMoves = [
      { from: '4,7', to: '3,7', pieceId: bKingId, isCapture: false }, // King evades to d8
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-reactive-freeze',
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
    // King evades to d8
    expect(decision.move.to).toBe('3,7');
    // AND Bot reacts by freezing the threatening Queen at 4,3!
    expect(decision.secondaryAction).toBeDefined();
    expect(decision.secondaryAction?.payload?.spellType).toBe('FREEZE');
    expect(decision.secondaryAction?.payload?.targetCoord).toBe('4,3');
  });

  it('flees King away from adjacent frozen enemy hurdle rather than stepping towards center', () => {
    const domain = createCustomDomain('test-hurdle-evasion', 5);

    // Black King at d5 (3,4)
    const bKingId = asEntityId('b_king_d5');
    domain.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,4'),
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,4')] = bKingId;

    // White Bishop frozen at c5 (2,4) - distance 1 hurdle!
    const wBishopId = asEntityId('w_bishop_c5');
    domain.boardEntities[wBishopId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('2,4'),
      variantId: 'BISHOP',
      hasMoved: true,
      isCaptured: false,
      metadata: { isFrozen: true },
    };
    domain.occupancy[asCoordinateKey('2,4')] = wBishopId;

    // Candidate moves for Black King:
    // Move A: Stepping down towards center d4 (3,3) - closer to center, remaining distance 1 from c5
    // Move B: Fleeing back to d7 (3,6) or e7 (4,6) - safe back ranks, increasing distance to 2+
    const legalMoves = [
      { from: '3,4', to: '3,3', pieceId: bKingId, isCapture: false }, // d4
      { from: '3,4', to: '3,5', pieceId: bKingId, isCapture: false }, // d6 (retreating)
      { from: '3,4', to: '4,5', pieceId: bKingId, isCapture: false }, // e6 (retreating)
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-hurdle-evasion',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 5,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '3,4',
        opponentKingCoord: '4,0',
        freezeCharges: 1,
        freezeCooldown: 0,
        jumpCharges: 1,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // King must NOT walk towards d4 (3,3); it must retreat to rank 5/6 (y >= 5)!
    const destY = Number(decision.move.to.split(',')[1]);
    expect(destY).toBeGreaterThanOrEqual(5);
  });

  it('reactively freezes checking Knight when under direct check in Spell Chess', () => {
    const domain = createCustomDomain('test-reactive-check-freeze', 8);

    // Black King at d4 (3,3)
    const bKingId = asEntityId('b_king_d4');
    domain.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,3'),
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('3,3')] = bKingId;

    // White Knight at e2 (4,1) - attacking d4 directly!
    const wKnightId = asEntityId('w_knight_e2');
    domain.boardEntities[wKnightId] = {
      id: wKnightId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,1'),
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
    };
    domain.occupancy[asCoordinateKey('4,1')] = wKnightId;

    // White King at e1 (4,0)
    const wKingId = asEntityId('w_king_e1');
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

    const legalMoves = [
      { from: '3,3', to: '3,4', pieceId: bKingId, isCapture: false }, // King steps to d5
      { from: '3,3', to: '4,4', pieceId: bKingId, isCapture: false }, // King steps to e5
    ];

    const request: IAIDecisionRequest = {
      matchId: 'test-reactive-check-freeze',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 5,
      timeBudgetMs: 500,
      legalMoves,
      domain,
      topology,
      specializedContext: {
        friendlyKingCoord: '3,3',
        opponentKingCoord: '4,0',
        freezeCharges: 1,
        freezeCooldown: 0,
        jumpCharges: 1,
        jumpCooldown: 0,
      },
    };

    const decision = strategy.decideMove(request);
    // Bot must cast FREEZE on checking knight at 4,1 (e2)!
    expect(decision.secondaryAction).toBeDefined();
    expect(decision.secondaryAction?.type).toBe('CAST_SPELL');
    expect(decision.secondaryAction?.payload?.spellType).toBe('FREEZE');
    expect(decision.secondaryAction?.payload?.targetCoord).toBe('4,1');
  });
});

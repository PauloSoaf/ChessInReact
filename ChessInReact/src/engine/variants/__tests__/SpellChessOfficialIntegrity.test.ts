import { describe, it, expect, beforeEach } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates/types';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { OfficialSpellEngine } from '../spells/OfficialSpellEngine';
import { RulesEngine } from '../../rules/RulesEngine';
import { GameOverDetector } from '../../rules/GameOverDetector';
import { IPieceEntity } from '../../../core/entities/types';
import { IDomainState } from '../../../core/state/gameState';

describe('Spell Chess Official Mechanics & King Capture Integrity', () => {
  let topology: SquareTopology;

  beforeEach(() => {
    topology = new SquareTopology({ width: 8, height: 8 });
  });

  it('1. Physical King Capture immediately terminates game with winner', () => {
    const state = createDefaultDomainState('test-king-cap', 'SPELL_CHESS');
    // White King at e1 (4,0)
    const wKingId = asEntityId('white_king');
    state.boardEntities[wKingId] = {
      id: wKingId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'KING',
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,0')] = wKingId;

    // Move White Queen to capture Black King directly (e.g. Queen on e7 capturing King on e8)
    const wQueenId = asEntityId('white_queen');
    const bKingId = asEntityId('black_king');

    state.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,6'), // e7
      variantId: 'QUEEN',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,6')] = wQueenId;

    state.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('4,7'), // e8
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,7')] = bKingId;

    const captureKingCmd = new MovePieceCommand(
      wQueenId,
      asCoordinateKey('4,6'),
      asCoordinateKey('4,7'),
      'P1',
      undefined,
      false, // bypass standard check restriction
      true,
      undefined,
      topology
    );

    captureKingCmd.execute(state);

    expect(state.isGameOver).toBe(true);
    expect(state.winnerId).toBe('P1');
    expect((state.boardEntities[bKingId] as IPieceEntity).isCaptured).toBe(true);

    // GameOverDetector also confirms game termination and royal capture reason
    const gameResult = GameOverDetector.evaluateGameResult(state, topology, 0);
    expect(gameResult.isGameOver).toBe(true);
    expect(gameResult.winnerId).toBe('P1');
    expect(gameResult.reason).toContain('Captura Real');
  });

  it('2. Official Starting Charges: 5 Freezes and 2 Jumps', () => {
    const spellState = OfficialSpellEngine.createInitialState();
    expect(spellState.whiteCharges.freezeCharges).toBe(5);
    expect(spellState.whiteCharges.jumpCharges).toBe(2);
    expect(spellState.blackCharges.freezeCharges).toBe(5);
    expect(spellState.blackCharges.jumpCharges).toBe(2);
    expect(spellState.whiteCharges.freezeCooldownTurns).toBe(0);
    expect(spellState.whiteCharges.jumpCooldownTurns).toBe(0);
  });

  it('3. Jump on any obstacle (friendly or opponent) allows sliding pieces to leap over it', () => {
    const state = createDefaultDomainState('test-jump-obs');
    (state as { boardEntities: Record<string, IPieceEntity> }).boardEntities = {};
    (state as { occupancy: Record<string, ReturnType<typeof asEntityId>> }).occupancy = {};

    // White Bishop on c1 (2,0)
    const wBishopId = asEntityId('w_bishop');
    state.boardEntities[wBishopId] = {
      id: wBishopId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('2,0'),
      variantId: 'BISHOP',
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('2,0')] = wBishopId;

    // Enemy Black Pawn on d2 (3,1) with Jump buff (acting as the obstacle to leap over)
    const bPawnId = asEntityId('b_pawn');
    state.boardEntities[bPawnId] = {
      id: bPawnId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,1'),
      variantId: 'PAWN',
      hasMoved: true,
      isCaptured: false,
      metadata: { canBeJumpedOver: true },
    };
    state.occupancy[asCoordinateKey('3,1')] = bPawnId;

    // Target empty square behind obstacle on e3 (4,2) and f4 (5,3)
    const bishopMoves = RulesEngine.getLegalMovesForPiece(
      state.boardEntities[wBishopId] as IPieceEntity,
      state,
      topology
    );

    // Bishop should be able to capture or move on d2, AND jump over d2 to reach e3 (4,2) and f4 (5,3)!
    const targets = bishopMoves.map((m) => m.to);
    expect(targets).toContain('3,1'); // Can capture the obstacle
    expect(targets).toContain('4,2'); // Can leap over the obstacle
    expect(targets).toContain('5,3'); // Can slide further after leaping
  });

  it('4. Jump cooldown decrements and expires after 1 full turn cycle', () => {
    let spellState = OfficialSpellEngine.createInitialState();
    const res = OfficialSpellEngine.castJump(spellState, 'WHITE', 'pawn_e2');
    expect(res.success).toBe(true);
    spellState = res.state;

    expect(spellState.whiteCharges.jumpCharges).toBe(1);
    expect(spellState.whiteCharges.jumpCooldownTurns).toBe(3);
    expect(spellState.activeJumpPieceIds['pawn_e2']).toBe(2);

    // White finishes turn -> jump piece persists (1 turn remaining)
    spellState = OfficialSpellEngine.advanceTurn(spellState, 'WHITE');
    expect(spellState.whiteCharges.jumpCooldownTurns).toBe(2);
    expect(spellState.activeJumpPieceIds['pawn_e2']).toBe(1);

    // Black finishes reply -> jump piece expires
    spellState = OfficialSpellEngine.advanceTurn(spellState, 'BLACK');
    expect(spellState.whiteCharges.jumpCooldownTurns).toBe(2); // White cooldown ticks on White turns
    expect(spellState.activeJumpPieceIds['pawn_e2']).toBeUndefined();
  });

  it('5. King and external pieces can legally move into frozen squares and capture frozen pieces', () => {
    const state = createDefaultDomainState('test-frozen-move', 'SPELL_CHESS');
    (state as { boardEntities: Record<string, IPieceEntity> }).boardEntities = {};
    (state as { occupancy: Record<string, ReturnType<typeof asEntityId>> }).occupancy = {};

    // White King on e1 (4,0)
    const wKingId = asEntityId('w_king');
    state.boardEntities[wKingId] = {
      id: wKingId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'KING',
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,0')] = wKingId;

    // Enemy Black Knight on d2 (3,1), inside a frozen 3x3 area
    const bKnightId = asEntityId('b_knight');
    state.boardEntities[bKnightId] = {
      id: bKnightId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,1'),
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
      metadata: { isFrozen: true },
    };
    state.occupancy[asCoordinateKey('3,1')] = bKnightId;

    // Square d1 (3,0) is an empty square inside the 3x3 frozen zone
    const kingMoves = RulesEngine.getLegalMovesForPiece(
      state.boardEntities[wKingId] as IPieceEntity,
      state,
      topology
    );
    const destCoords = kingMoves.map((m) => m.to);

    // King CAN move into empty frozen square d1 (3,0)
    expect(destCoords).toContain('3,0');

    // King CAN capture frozen enemy piece on d2 (3,1)
    expect(destCoords).toContain('3,1');

    // Executing the move to d1 succeeds without IMPASSABLE_TERRAIN or illegal move error
    const moveCmd = new MovePieceCommand(
      wKingId,
      asCoordinateKey('4,0'),
      asCoordinateKey('3,0'),
      'P1',
      undefined,
      false,
      true,
      undefined,
      topology
    );
    expect(() => moveCmd.execute(state)).not.toThrow();
    expect(state.boardEntities[wKingId]?.position).toBe('3,0');
  });

  it('6. AI Bot calculates and deploys tactical Freeze and Jump in Spell Chess', async () => {
    const { SpellOptimizationStrategy } = await import('../../../workers/ai/strategies/SpellOptimizationStrategy');
    const strategy = new SpellOptimizationStrategy();

    // Decision with Freeze ready and enemy high-value cluster (Queen + King)
    const decisionFreeze = strategy.decideMove({
      matchId: 'bot-spell-test',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 3,
      timeBudgetMs: 500,
      legalMoves: [
        { from: '4,6', to: '4,4', pieceId: 'b_pawn_e7' },
        { from: '1,7', to: '2,5', pieceId: 'b_knight_b8' },
      ],
      specializedContext: {
        freezeCharges: 5,
        jumpCharges: 0,
        freezeCooldown: 0,
        jumpCooldown: 2,
        opponentKingCoord: '4,0',
      },
    });

    expect(decisionFreeze.secondaryAction?.type).toBe('CAST_SPELL');
    expect(decisionFreeze.secondaryAction?.payload.spellType).toBe('FREEZE');

    // Decision with Jump ready for tactical capture
    const decisionJump = strategy.decideMove({
      matchId: 'bot-spell-test',
      variantId: 'SPELL_CHESS_OFFICIAL',
      actingPlayer: 'P2',
      difficultyLevel: 3,
      timeBudgetMs: 500,
      legalMoves: [
        { from: '4,6', to: '4,4', pieceId: 'b_pawn_e7', isCapture: true },
      ],
      specializedContext: {
        freezeCharges: 0,
        jumpCharges: 2,
        freezeCooldown: 2,
        jumpCooldown: 0,
        opponentKingCoord: '4,0',
      },
    });

    expect(decisionJump.secondaryAction?.type).toBe('CAST_SPELL');
    expect(decisionJump.secondaryAction?.payload.spellType).toBe('JUMP');
  });

  it('7. GameOverDetector does not declare checkmate when active player has an available Freeze spell', () => {
    const baseState = createDefaultDomainState('test-spell-checkmate-freeze', 'SPELL_CHESS');
    const state: IDomainState = {
      ...baseState,
      activePlayer: 'P2',
      metadata: {
        officialSpellState: {
          whiteCharges: { freezeCharges: 0, freezeCooldownTurns: 1, jumpCharges: 1, jumpCooldownTurns: 0 },
          blackCharges: { freezeCharges: 1, freezeCooldownTurns: 0, jumpCharges: 2, jumpCooldownTurns: 0 },
          activeFrozenCoordinates: { '3,3': 1 },
          activeJumpPieceIds: {},
        },
      },
    };

    // Black King at d4 (3,3) - frozen
    const bKingId = asEntityId('b_king_d4');
    state.boardEntities[bKingId] = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,3'),
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
      metadata: { isFrozen: true },
    };
    state.occupancy[asCoordinateKey('3,3')] = bKingId;

    // White Knight at e2 (4,1) - delivering check to d4!
    const wKnightId = asEntityId('w_knight_e2');
    state.boardEntities[wKnightId] = {
      id: wKnightId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,1'),
      variantId: 'KNIGHT',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,1')] = wKnightId;

    // White King at e1 (4,0)
    const wKingId = asEntityId('w_king_e1');
    state.boardEntities[wKingId] = {
      id: wKingId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'KING',
      hasMoved: false,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('4,0')] = wKingId;

    // White Queen at f3 (5,2) - ensures sufficient material
    const wQueenId = asEntityId('w_queen_f3');
    state.boardEntities[wQueenId] = {
      id: wQueenId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('5,2'),
      variantId: 'QUEEN',
      hasMoved: true,
      isCaptured: false,
    };
    state.occupancy[asCoordinateKey('5,2')] = wQueenId;

    const result = GameOverDetector.evaluateGameResult(state, topology, 0);
    // Because Black can freeze the checking Knight on e2, checkmate CANNOT be declared!
    expect(result.isGameOver).toBe(false);
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('8. SANNotationGenerator appends + instead of # when opponent has available Freeze defense', async () => {
    const { SANNotationGenerator } = await import('../../rules/notation/SANNotationGenerator');
    const domainBefore = createDefaultDomainState('test-san-freeze', 'SPELL_CHESS');
    const domainAfterBase = createDefaultDomainState('test-san-freeze-after', 'SPELL_CHESS');
    const domainAfter: IDomainState = {
      ...domainAfterBase,
      activePlayer: 'P2',
      metadata: {
        officialSpellState: {
          whiteCharges: { freezeCharges: 0, freezeCooldownTurns: 1, jumpCharges: 1, jumpCooldownTurns: 0 },
          blackCharges: { freezeCharges: 1, freezeCooldownTurns: 0, jumpCharges: 2, jumpCooldownTurns: 0 },
          activeFrozenCoordinates: { '3,3': 1 },
          activeJumpPieceIds: {},
        },
      },
    };

    // White Knight at g1 (6,0) before moving to e2 (4,1)
    const wKnightId = asEntityId('w_knight_g1');
    const knightPiece: IPieceEntity = {
      id: wKnightId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('6,0'),
      variantId: 'KNIGHT',
      hasMoved: false,
      isCaptured: false,
    };
    domainBefore.boardEntities[wKnightId] = knightPiece;
    domainBefore.occupancy[asCoordinateKey('6,0')] = wKnightId;

    // After move: Knight on e2 (4,1)
    domainAfter.boardEntities[wKnightId] = {
      ...knightPiece,
      position: asCoordinateKey('4,1'),
      hasMoved: true,
    };
    domainAfter.occupancy[asCoordinateKey('4,1')] = wKnightId;

    // White King at e1 (4,0)
    const wKingId = asEntityId('w_king_e1');
    const kingPiece: IPieceEntity = {
      id: wKingId,
      type: 'PIECE',
      ownerId: 'P1',
      position: asCoordinateKey('4,0'),
      variantId: 'KING',
      hasMoved: false,
      isCaptured: false,
    };
    domainBefore.boardEntities[wKingId] = kingPiece;
    domainBefore.occupancy[asCoordinateKey('4,0')] = wKingId;
    domainAfter.boardEntities[wKingId] = kingPiece;
    domainAfter.occupancy[asCoordinateKey('4,0')] = wKingId;

    // Black King at d4 (3,3) - frozen
    const bKingId = asEntityId('b_king_d4');
    const bKingPiece: IPieceEntity = {
      id: bKingId,
      type: 'PIECE',
      ownerId: 'P2',
      position: asCoordinateKey('3,3'),
      variantId: 'KING',
      hasMoved: true,
      isCaptured: false,
      metadata: { isFrozen: true },
    };
    domainBefore.boardEntities[bKingId] = bKingPiece;
    domainBefore.occupancy[asCoordinateKey('3,3')] = bKingId;
    domainAfter.boardEntities[bKingId] = bKingPiece;
    domainAfter.occupancy[asCoordinateKey('3,3')] = bKingId;

    const san = SANNotationGenerator.generateSAN({
      from: '6,0',
      to: '4,1',
      pieceId: wKnightId,
      domainBefore,
      domainAfter,
      topology,
      isCapture: false,
    });

    // Must be Ne2+ (Check) and NOT Ne2# (Checkmate)
    expect(san).toBe('Ne2+');
  });
});

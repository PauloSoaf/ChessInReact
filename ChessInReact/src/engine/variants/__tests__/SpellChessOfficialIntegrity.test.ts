import { describe, it, expect, beforeEach } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates/types';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { OfficialSpellEngine } from '../spells/OfficialSpellEngine';
import { RulesEngine } from '../../rules/RulesEngine';
import { GameOverDetector } from '../../rules/GameOverDetector';
import { IPieceEntity } from '../../../core/entities/types';

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
});

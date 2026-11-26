import { describe, expect, it } from 'vitest';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../core/coordinates';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { RulesEngine } from '../../rules/RulesEngine';
import { CheckValidator } from '../../rules/CheckValidator';
import { SANNotationGenerator } from '../../rules/notation/SANNotationGenerator';
import { SpellChessSearch } from '../../../workers/ai/strategies/spell/SpellChessSearch';
import { SpellChessMoveGenerator } from '../../../workers/ai/strategies/spell/SpellChessMoveGenerator';
import { OfficialSpellEngine } from '../spells/OfficialSpellEngine';

const topology = new SquareTopology({ width: 8, height: 8 });
const variant = 'SPELL_CHESS_KING_CAPTURE_ONLY';
function add(state: IDomainState, id: string, owner: PlayerId, type: string, coord: string, frozen = false) {
  const piece: IPieceEntity = {
    id: asEntityId(id), type: 'PIECE', ownerId: owner, variantId: type,
    position: asCoordinateKey(coord), isCaptured: false, hasMoved: true,
    metadata: { isFrozen: frozen },
  };
  state.boardEntities[piece.id] = piece;
  state.occupancy[piece.position] = piece.id;
  return piece;
}

describe('PATCH-10: capture must be executed', () => {
  it('search finds Jump + Bxe8 without changing the live game; execution, undo and redo control victory', () => {
    const state = createDefaultDomainState('jump-capture', variant);
    add(state, 'wk', 'P1', 'KING', '0,0');
    add(state, 'bk', 'P2', 'KING', '4,7');
    add(state, 'bishop', 'P1', 'BISHOP', '2,5');
    add(state, 'blocker', 'P2', 'PAWN', '3,6');
    const before = structuredClone(state);
    const result = new SpellChessSearch().searchBestTurnAction(state, 'P1', topology,
      { freezeRemaining: 0, jumpRemaining: 1, freezeCooldown: 0, jumpCooldown: 0 },
      { freezeRemaining: 0, jumpRemaining: 0, freezeCooldown: 0, jumpCooldown: 0 }, 500, 2);
    expect(result.bestAction.spell).toEqual({ type: 'JUMP', targetSquare: '3,6' });
    expect(result.bestAction.move.to).toBe('4,7');
    expect(state).toEqual(before);
    expect(RulesEngine.getGameResult(state, topology).isGameOver).toBe(false);

    const withJump = SpellChessMoveGenerator.cloneAndApplySpell(state, result.bestAction.spell, 'P1');
    expect(RulesEngine.getGameResult(withJump, topology).isGameOver).toBe(false);
    const cmd = new MovePieceCommand(asEntityId('bishop'), asCoordinateKey('2,5'),
      asCoordinateKey('4,7'), 'P1', undefined, true, true, undefined, topology);
    cmd.execute(withJump);
    expect(withJump.isGameOver).toBe(true);
    expect(withJump.winnerId).toBe('P1');
    expect(RulesEngine.getGameResult(withJump, topology).winnerId).toBe('P1');
    expect(RulesEngine.getGameResult(withJump, topology).status).toBe('KING_CAPTURE');
    cmd.undo(withJump);
    expect(withJump.isGameOver).toBe(false);
    expect(withJump.winnerId).toBeNull();
    expect((withJump.boardEntities[asEntityId('bk')] as IPieceEntity).isCaptured).toBe(false);
    cmd.execute(withJump);
    expect(withJump.winnerId).toBe('P1');
  });

  it('allows missing a winning capture and ignores conventional checkmate in capture-only mode', () => {
    const state = createDefaultDomainState('mate', variant);
    add(state, 'wk', 'P1', 'KING', '5,5');
    add(state, 'wq', 'P1', 'QUEEN', '6,5');
    add(state, 'bk', 'P2', 'KING', '7,7');
    const before = structuredClone(state);
    new MovePieceCommand(asEntityId('wq'), asCoordinateKey('6,5'), asCoordinateKey('6,6'),
      'P1', undefined, true, true, undefined, topology).execute(state);
    expect(CheckValidator.isRoyalInCheck('P2', state, topology)).toBe(true);
    expect(state.isGameOver).toBe(false);
    expect(SANNotationGenerator.generateSAN({ from: '6,5', to: '6,6', pieceId: 'wq',
      domainBefore: before, domainAfter: state, topology })).toBe('Qg7+');
    expect(RulesEngine.getLegalMoves(state, topology).length).toBeGreaterThan(0);
    const official = { ...state, variantId: 'SPELL_CHESS_OFFICIAL', metadata: {
      officialSpellState: { ...OfficialSpellEngine.createInitialState(), blackCharges: {
        freezeCharges: 0, jumpCharges: 0, freezeCooldownTurns: 0, jumpCooldownTurns: 0,
      } },
    } };
    expect(RulesEngine.getGameResult(official, topology).status).toBe('CHECKMATE');
    // White has an available king capture but chooses a different legal move.
    const missed = { ...state, activePlayer: 'P1' as const };
    new MovePieceCommand(asEntityId('wq'), asCoordinateKey('6,6'), asCoordinateKey('6,5'),
      'P1', undefined, true, true, undefined, topology).execute(missed);
    expect(missed.isGameOver).toBe(false);
    expect(missed.winnerId).toBeNull();
  });

  it.each(['ROOK', 'BISHOP', 'QUEEN'])('frozen blockers still obstruct %s attacks', (type) => {
    const state = createDefaultDomainState('frozen', variant);
    add(state, 'wk', 'P1', 'KING', '0,0');
    add(state, 'bk', 'P2', 'KING', '4,7');
    const diagonal = type === 'BISHOP';
    add(state, 'attacker', 'P1', type, diagonal ? '2,5' : '4,5');
    const blocker = add(state, 'blocker', 'P2', 'PAWN', diagonal ? '3,6' : '4,6', true);
    expect(CheckValidator.isRoyalInCheck('P2', state, topology)).toBe(false);
    state.boardEntities[blocker.id] = { ...blocker, metadata: { isFrozen: true, canBeJumpedOver: true } };
    expect(CheckValidator.isRoyalInCheck('P2', state, topology)).toBe(true);
  });

  it('does not declare insufficient mating material when kings can still be captured', () => {
    const state = createDefaultDomainState('material', variant);
    add(state, 'wk', 'P1', 'KING', '0,0');
    add(state, 'bk', 'P2', 'KING', '4,7');
    expect(RulesEngine.getGameResult(state, topology).isGameOver).toBe(false);
  });

  it('requires a captured king record rather than interpreting a missing setup piece as victory', () => {
    const state = createDefaultDomainState('incomplete', variant);
    add(state, 'wk', 'P1', 'KING', '0,0');
    expect(RulesEngine.getGameResult(state, topology).winnerId).toBeNull();
    expect(RulesEngine.getGameResult(state, topology).isGameOver).toBe(false);
  });

  it('draws when no action can be executed, even if the king is attacked', () => {
    const state = createDefaultDomainState('no-action', variant);
    add(state, 'wk', 'P1', 'KING', '0,0', true);
    add(state, 'bk', 'P2', 'KING', '4,7');
    add(state, 'br', 'P2', 'ROOK', '0,7');
    expect(CheckValidator.isRoyalInCheck('P1', state, topology)).toBe(true);
    expect(RulesEngine.getGameResult(state, topology)).toMatchObject({
      isGameOver: true, status: 'STALEMATE', winnerId: null,
    });
  });
});

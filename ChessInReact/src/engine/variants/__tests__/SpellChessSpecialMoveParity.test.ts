import { describe, expect, it } from 'vitest';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { createDefaultDomainState } from '../../../core/state/initialState';
import { asCoordinateKey, asEntityId } from '../../../core/coordinates';
import { OfficialSpellRules } from '../spells/OfficialSpellRules';
import { OfficialSpellEngine } from '../spells/OfficialSpellEngine';
import { SpellChessTranspositionTable } from '../../../workers/ai/strategies/spell/SpellChessTranspositionTable';
import { SpellChessSearch } from '../../../workers/ai/strategies/spell/SpellChessSearch';
import { addPiece } from '../../../workers/ai/strategies/spell/testing/KingSafetyFixtures';
import { queenTrap } from '../../../workers/ai/strategies/spell/testing/KingSafetyFixtures';
import { IPieceEntity } from '../../../core/entities/types';
import { computePositionKey } from '../../rules/utils/PositionHasher';

const topology = new SquareTopology({ width: 8, height: 8 });
function position() {
  const domain = createDefaultDomainState('special', 'SPELL_CHESS_KING_CAPTURE_ONLY');
  addPiece(domain, 'wk', 'P1', 'KING', '4,0'); addPiece(domain, 'bk', 'P2', 'KING', '4,7');
  return OfficialSpellRules.sync(domain, OfficialSpellEngine.createInitialState());
}

describe('PATCH-12: special moves and transposition state', () => {
  it.each([['5,0', '6,0', '7,0'], ['3,0', '2,0', '0,0']])(
    'does not castle on an ordinary king move from %s to %s', (from, to, rookSquare) => {
      const domain = position();
      delete domain.occupancy[asCoordinateKey('4,0')];
      const king = domain.boardEntities[asEntityId('wk')] as IPieceEntity;
      domain.boardEntities[king.id] = { ...king, position: asCoordinateKey(from), hasMoved: true };
      domain.occupancy[asCoordinateKey(from)] = king.id;
      addPiece(domain, 'enemy-rook', 'P2', 'ROOK', rookSquare);
      const next = OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: {
        pieceId: 'wk', from, to,
      } }, topology);
      expect(next.occupancy[asCoordinateKey(rookSquare)]).toBe('enemy-rook');
      expect(next.occupancy[asCoordinateKey(to)]).toBe('wk');
    });

  it('validates a non-starting pawn Jump over its designated blocker', () => {
    const domain = position();
    addPiece(domain, 'wp', 'P1', 'PAWN', '0,3'); addPiece(domain, 'block', 'P2', 'KNIGHT', '0,4');
    const next = OfficialSpellRules.simulate(domain, { spell: { type: 'JUMP', targetSquare: '0,4' }, move: {
      pieceId: 'wp', from: '0,3', to: '0,5',
    } }, topology);
    expect(next.occupancy[asCoordinateKey('0,5')]).toBe('wp');
    expect(next.occupancy[asCoordinateKey('0,4')]).toBe('block');
  });
  it('moves both king and rook when simulating castling', () => {
    const domain = position();
    const king = domain.boardEntities[asEntityId('wk')] as IPieceEntity;
    domain.boardEntities[king.id] = { ...king, hasMoved: false };
    const rook = addPiece(domain, 'wr', 'P1', 'ROOK', '7,0');
    domain.boardEntities[rook.id] = { ...rook, hasMoved: false };
    const next = OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: {
      pieceId: 'wk', from: '4,0', to: '6,0',
    } }, topology);
    expect(next.occupancy[asCoordinateKey('6,0')]).toBe('wk');
    expect(next.occupancy[asCoordinateKey('5,0')]).toBe('wr');
    expect(domain.occupancy[asCoordinateKey('7,0')]).toBe('wr');
  });

  it('cannot castle with a frozen rook', () => {
    const domain = position();
    const king = domain.boardEntities[asEntityId('wk')] as IPieceEntity;
    domain.boardEntities[king.id] = { ...king, hasMoved: false };
    const rook = addPiece(domain, 'wr', 'P1', 'ROOK', '7,0');
    domain.boardEntities[rook.id] = { ...rook, hasMoved: false };
    const frozen = OfficialSpellRules.cast(domain, { type: 'FREEZE', targetSquare: '7,0' }, 'P1');
    expect(() => OfficialSpellRules.simulate(frozen, { spell: { type: 'NONE' }, move: {
      pieceId: 'wk', from: '4,0', to: '6,0',
    } }, topology)).toThrow();
  });

  it('removes the en passant victim and clears the target', () => {
    const domain = position();
    addPiece(domain, 'wp', 'P1', 'PAWN', '4,4'); addPiece(domain, 'bp', 'P2', 'PAWN', '3,4');
    const ready = { ...domain, turnState: { ...domain.turnState, enPassantTarget: asCoordinateKey('3,5') } };
    const next = OfficialSpellRules.simulate(ready, { spell: { type: 'NONE' }, move: {
      pieceId: 'wp', from: '4,4', to: '3,5',
    } }, topology);
    expect(next.occupancy[asCoordinateKey('3,4')]).toBeUndefined();
    expect((next.boardEntities[asEntityId('bp')] as IPieceEntity).isCaptured).toBe(true);
    expect(next.turnState.enPassantTarget).toBeNull();
  });

  it('executes the requested underpromotion', () => {
    const domain = position(); addPiece(domain, 'wp', 'P1', 'PAWN', '0,6');
    const next = OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: {
      pieceId: 'wp', from: '0,6', to: '0,7', promotion: 'KNIGHT',
    } }, topology);
    expect((next.boardEntities[asEntityId('wp')] as IPieceEntity).variantId).toBe('KNIGHT');
  });

  it('does not reuse a key across spell durations, cooldowns, castling rights or en passant', () => {
    const domain = position(); const tt = new SpellChessTranspositionTable();
    const key = (d: typeof domain) => tt.computeKey(d, 'P1', SpellChessSearch.resources(d, 'P1'), SpellChessSearch.resources(d, 'P2'), [], []);
    const initial = key(domain);
    const spells = OfficialSpellRules.getState(domain);
    expect(key(OfficialSpellRules.sync(domain, { ...spells, activeFrozenPieceIds: { wk: 1 } }))).not.toBe(initial);
    expect(key(OfficialSpellRules.sync(domain, { ...spells, whiteCharges: { ...spells.whiteCharges, jumpCooldownTurns: 1 } }))).not.toBe(initial);
    expect(key({ ...domain, turnState: { ...domain.turnState, enPassantTarget: asCoordinateKey('3,5') } })).not.toBe(initial);
    expect(key({ ...domain, turnState: { ...domain.turnState, lastActionTimestamp: 123 } })).toBe(initial);
    const legacy = OfficialSpellRules.sync(domain, { ...spells, activeFrozenCoordinates: { '3,3': 2 } });
    const pieceBound = OfficialSpellRules.sync(legacy, { ...OfficialSpellRules.getState(legacy), activeFrozenPieceIds: {} });
    expect(key(legacy)).not.toBe(key(pieceBound));
  });

  it('distinguishes repeated boards with different legal spell resources', () => {
    const domain = position(); const spells = OfficialSpellRules.getState(domain);
    const withoutJump = OfficialSpellRules.sync(domain, { ...spells, whiteCharges: { ...spells.whiteCharges, jumpCharges: 0 } });
    expect(computePositionKey(withoutJump)).not.toBe(computePositionKey(domain));
    const frozen = OfficialSpellRules.sync(domain, { ...spells, activeFrozenPieceIds: { wk: 1 } });
    expect(computePositionKey(frozen)).not.toBe(computePositionKey(domain));
  });

  it('records repetition after spell expiration, using the same next-turn state as live play', () => {
    const domain = queenTrap({ beforeCapture: true, bishopFrozen: 1 });
    const next = OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: { pieceId: 'bk', from: '4,7', to: '3,7' } }, topology);
    const history = next.turnState.positionHistory!;
    expect(history[history.length - 1]).toBe(computePositionKey(next));
    expect(next.boardEntities[asEntityId('wb')].metadata?.isFrozen).toBe(false);
  });

  it('hashes repetition counts independently of chronology and keeps adjudication context separate', () => {
    const domain = position(), tt = new SpellChessTranspositionTable();
    const key = (history: string[], counter = 0) => tt.computeKey({ ...domain,
      turnState: { ...domain.turnState, fiftyMoveCounter: counter, positionHistory: history } },
      'P1', SpellChessSearch.resources(domain, 'P1'), SpellChessSearch.resources(domain, 'P2'), [], []);
    expect(key(['first', 'second', 'first'])).toBe(key(['second', 'first', 'first']));
    expect(key(['first', 'second'])).not.toBe(key(['first', 'second', 'first']));
    expect(key(['first'], 2)).not.toBe(key(['first'], 1));
    expect(key(['first']).length).toBeLessThan(50);
  });

  it('agrees with transpositions disabled at a completed fixed depth', () => {
    const domain = queenTrap({ beforeCapture: true, jump: 0 });
    const resources = SpellChessSearch.resources(domain, 'P2');
    const opponent = SpellChessSearch.resources(domain, 'P1');
    const enabled = new SpellChessSearch().searchBestTurnAction(domain, 'P2', topology, resources, opponent, 2000, 2);
    const disabled = new SpellChessSearch(0).searchBestTurnAction(domain, 'P2', topology, resources, opponent, 2000, 2);
    expect(enabled.depthReached).toBe(2); expect(disabled.depthReached).toBe(2);
    expect(enabled.evaluationCentipawns).toBe(disabled.evaluationCentipawns);
    expect(() => OfficialSpellRules.simulate(domain, enabled.bestAction, topology)).not.toThrow();
    expect(() => OfficialSpellRules.simulate(domain, disabled.bestAction, topology)).not.toThrow();
  });
});

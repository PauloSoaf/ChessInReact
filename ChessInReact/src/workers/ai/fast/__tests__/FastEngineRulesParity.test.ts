import { describe, expect, it } from 'vitest';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { IDomainState } from '../../../../core/state/gameState';
import { createDefaultDomainState } from '../../../../core/state/initialState';
import { createStandardChessPieces } from '../../../../core/bootstrap/GameInitializer';
import { MovePieceCommand } from '../../../../core/commands/MovePieceCommand';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../../core/coordinates';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { ClassicBoardFactory } from '../../../../engine/rules/utils/ClassicBoardFactory';
import { OfficialSpellEngine } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellAction, OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessMoveGenerator } from '../../strategies/spell/SpellChessMoveGenerator';
import { FastPosition, SPELL_FREEZE, SPELL_JUMP, SPELL_NONE, encodeSpell } from '../FastPosition';
import { coordOf, fromDomain, squareOf, toDomainMove } from '../domainBridge';

const topology = new SquareTopology({ width: 8, height: 8 });

function perft(position: FastPosition, depth: number): number {
  const buffer = new Int32Array(512);
  const count = position.generate(buffer, 0);
  let nodes = 0;
  for (let i = 0; i < count; i++) {
    if (!position.make(buffer[i])) continue;
    nodes += depth === 1 ? 1 : perft(position, depth - 1);
    position.unmake();
  }
  return nodes;
}

describe('fast engine: published perft counts (standard chess)', () => {
  it.each([
    ['initial', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
    ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
    ['en passant and pins', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
    ['promotions', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
    ['promotion with check', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 62379],
  ] as const)('%s', (_name, fen, depth, expected) => {
    const domain = ClassicBoardFactory.createFromFEN(fen);
    const { position } = fromDomain(domain, { spellMode: false, enforceCheck: true });
    const before = `${position.keyLo}:${position.keyHi}:${position.mg}:${position.eg}`;
    expect(perft(position, depth)).toBe(expected);
    expect(`${position.keyLo}:${position.keyHi}:${position.mg}:${position.eg}`).toBe(before);
  }, 30000);
});

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function startingDomain(variantId: string): IDomainState {
  const domain = createDefaultDomainState(`parity-${variantId}`, variantId);
  for (const piece of createStandardChessPieces()) {
    domain.boardEntities[piece.id] = piece;
    domain.occupancy[piece.position] = piece.id;
  }
  return variantId.startsWith('SPELL') ? OfficialSpellRules.sync(domain, OfficialSpellEngine.createInitialState()) : domain;
}

const moveKeys = (moves: ReadonlyArray<{ from: string; to: string }>): string[] =>
  [...new Set(moves.map((m) => `${m.from}>${m.to}`))].sort();

const fastMoveKeys = (position: FastPosition): string[] =>
  moveKeys(position.legalMoves().map((m) => toDomainMove(m, '')));

const describeState = (p: FastPosition) => ({
  board: Array.from(p.board), frozen: Array.from(p.frozen), jump: Array.from(p.jump),
  resources: Array.from(p.resources), castling: p.castling, side: p.side, halfmove: p.halfmove, effects: p.effects,
});

describe('fast engine: differential parity with the production rules', () => {
  it('matches legal moves and resulting positions over random standard games', () => {
    let compared = 0;
    for (let game = 0; game < 6; game++) {
      const next = random(1000 + game);
      let domain = startingDomain('CHESS_STANDARD');
      for (let ply = 0; ply < 90 && !domain.isGameOver; ply++) {
        const options = { spellMode: false, enforceCheck: true } as const;
        const { position, idAt } = fromDomain(domain, options);
        const legal = RulesEngine.getLegalMoves(domain, topology);
        expect(fastMoveKeys(position), `game ${game} ply ${ply}`).toEqual(moveKeys(legal));
        if (!legal.length) break;
        const candidates = position.legalMoves();
        const chosen = candidates[Math.floor(next() * candidates.length)];
        const move = toDomainMove(chosen, idAt[chosen & 63]!);
        const draft = JSON.parse(JSON.stringify(domain)) as IDomainState;
        new MovePieceCommand(asEntityId(move.pieceId), asCoordinateKey(move.from), asCoordinateKey(move.to),
          domain.activePlayer, undefined, true, true, move.promotion, topology).execute(draft);
        expect(position.make(chosen)).toBe(true);
        const rebuilt = fromDomain(draft, options).position;
        expect(describeState(position), `game ${game} ply ${ply} after ${move.from}>${move.to}`).toEqual(describeState(rebuilt));
        expect([position.keyLo, position.keyHi]).toEqual([rebuilt.keyLo, rebuilt.keyHi]);
        domain = draft;
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(200);
  }, 60000);

  it.each(['SPELL_CHESS_KING_CAPTURE_ONLY', 'SPELL_CHESS_OFFICIAL'])(
    'matches spell casting, legal moves, expiry and king captures in random %s games', (variantId) => {
      const options = { spellMode: true, enforceCheck: variantId === 'SPELL_CHESS_OFFICIAL' } as const;
      let compared = 0, casts = 0, royalChecks = 0, royalFound = 0;
      for (let game = 0; game < 14; game++) {
        const next = random(77 + game * 13);
        let domain = startingDomain(variantId);
        for (let ply = 0; ply < 70 && !domain.isGameOver; ply++) {
          const player = domain.activePlayer as PlayerId;
          const { position, idAt } = fromDomain(domain, options);
          const label = `${variantId} game ${game} ply ${ply}`;

          const expectedRoyal = Boolean(SpellChessMoveGenerator.findKingCapture(domain, player, topology));
          expect(Boolean(position.findKingCapture()), `${label} king capture`).toBe(expectedRoyal);
          royalChecks++;
          if (expectedRoyal) royalFound++;

          let spell: OfficialSpellAction = { type: 'NONE' };
          let encoded = SPELL_NONE;
          if (next() < 0.45) {
            const type = next() < 0.65 ? SPELL_FREEZE : SPELL_JUMP;
            if (position.canCast(type)) {
              const occupied = Array.from({ length: 64 }, (_, sq) => sq).filter((sq) => position.board[sq]);
              const square = type === SPELL_JUMP
                ? occupied[Math.floor(next() * occupied.length)]
                : Math.floor(next() * 64);
              spell = { type: type === SPELL_FREEZE ? 'FREEZE' : 'JUMP', targetSquare: coordOf(square) };
              encoded = encodeSpell(type, square);
            }
          }
          const afterCast = OfficialSpellRules.cast(domain, spell, player);
          if (encoded !== SPELL_NONE) { position.cast(encoded); casts++; }
          const legal = RulesEngine.getLegalMoves(afterCast, topology);
          expect(fastMoveKeys(position), `${label} spell ${JSON.stringify(spell)}`).toEqual(moveKeys(legal));
          const candidates = position.legalMoves();
          if (!candidates.length) break;
          const captures = candidates.filter((m) => position.board[(m >> 6) & 63]);
          const pool = captures.length && next() < 0.4 ? captures : candidates;
          const chosen = pool[Math.floor(next() * pool.length)];
          const move = toDomainMove(chosen, idAt[chosen & 63]!);
          const result = OfficialSpellRules.simulate(domain, { spell, move }, topology);
          expect(position.make(chosen)).toBe(true);
          if (!result.isGameOver) {
            const rebuilt = fromDomain(result, options).position;
            expect(describeState(position), `${label} after ${move.from}>${move.to}`).toEqual(describeState(rebuilt));
            expect([position.keyLo, position.keyHi], `${label} key`).toEqual([rebuilt.keyLo, rebuilt.keyHi]);
          }
          domain = result;
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(200);
      expect(casts).toBeGreaterThan(40);
      expect(royalChecks).toBeGreaterThan(200);
      expect(royalFound).toBeGreaterThan(0);
    }, 120000);

  it('restores every field after cast + make + unmake + uncast', () => {
    const domain = startingDomain('SPELL_CHESS_KING_CAPTURE_ONLY');
    const { position } = fromDomain(domain, { spellMode: true, enforceCheck: false });
    const snapshot = () => ({ ...describeState(position), key: [position.keyLo, position.keyHi], history: position.historyLo.length });
    const before = snapshot();
    for (const spell of [encodeSpell(SPELL_FREEZE, squareOf('3,6')), encodeSpell(SPELL_JUMP, squareOf('3,1'))]) {
      position.cast(spell);
      for (const move of position.legalMoves()) {
        expect(position.make(move)).toBe(true);
        for (const reply of position.legalMoves()) { position.make(reply); position.unmake(); }
        position.unmake();
      }
      position.uncast();
      expect(snapshot()).toEqual(before);
    }
  });
});

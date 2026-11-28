import { describe, expect, it, vi } from 'vitest';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { createDefaultDomainState } from '../../../../core/state/initialState';
import { IDomainState } from '../../../../core/state/gameState';
import { asCoordinateKey, asEntityId } from '../../../../core/coordinates';
import { ClassicBoardFactory } from '../../../../engine/rules/utils/ClassicBoardFactory';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellEngine } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellAction, OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { AIEngine } from '../../AIEngine';
import { AIWorkerPool } from '../../AIWorkerPool';
import { SpellChessSearch } from '../../strategies/spell/SpellChessSearch';
import { SpellChessMaterialSafety } from '../../strategies/spell/SpellChessMaterialSafety';
import { addPiece } from '../../strategies/spell/testing/KingSafetyFixtures';
import { freezeEconomyImage } from '../../strategies/spell/testing/FreezeEconomyFixtures';
import { openingTrap } from '../../strategies/spell/testing/MaterialSafetyFixtures';
import { searchSpellChess } from '../spellEngine';
import { MATE } from '../FastSearch';

const topology = new SquareTopology({ width: 8, height: 8 });
/** "e2" -> "4,1" */
const square = (name: string): string => `${'abcdefgh'.indexOf(name[0])},${Number(name[1]) - 1}`;
const standard = (fen: string): IDomainState => ({ ...ClassicBoardFactory.createFromFEN(fen), variantId: 'standard' });
const bestMove = (fen: string, timeBudgetMs = 1500) =>
  new AIEngine().calculateBestMove(standard(fen), topology, { difficulty: 5, timeBudgetMs, variantId: 'standard' });

describe('level 5 standard chess', () => {
  it.each([
    ['mate in one', '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 'd1', 'd8'],
    ['queen sacrifice into mate (WAC 001)', '2rr3k/pp3pp1/1nnqbN1p/3pN3/2pP4/2P3Q1/PPB4P/R4RK1 w - - 0 1', 'g3', 'g6'],
    ['attack on h7 (WAC 004)', 'r1bq2rk/pp3pbp/2p1p1pQ/7P/3P4/2PB1N2/PP3PPR/2KR4 w - - 0 1', 'h6', 'h7'],
    ['mate in three', 'r1b1kb1r/pppp1ppp/5q2/4n3/3KP3/2N3PN/PPP4P/R1BQ1B1R b kq - 0 1', 'f8', 'c5'],
    ['takes the hanging queen', 'rnb1kbnr/pppp1ppp/8/4p1q1/3PP3/8/PPP2PPP/RNBQKBNR w KQkq - 0 3', 'c1', 'g5'],
    ['only king move that catches a distant passed pawn', '7k/8/5K2/p7/8/8/8/8 w - - 0 1', 'f6', 'e5'],
  ])('%s', (_name, fen, from, to) => {
    // A found mate ends the search at once, so a generous budget keeps mating puzzles
    // independent of machine load without slowing them down.
    const result = bestMove(fen, /mate|WAC/.test(_name) ? 8000 : 1500);
    expect([result.bestMove?.fromCoord, result.bestMove?.toCoord]).toEqual([square(from), square(to)]);
  }, 15000);

  it('searches several moves ahead in a quiet middlegame', () => {
    const result = bestMove('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 6');
    // The previous engine completed depth 2 here with a longer budget. Wall-clock depth depends
    // on the machine (coverage instrumentation on CI is much slower), so the floor is modest.
    expect(result.depthReached).toBeGreaterThanOrEqual(4);
  }, 15000);

  it('parries a threatened mate instead of ignoring it', () => {
    const domain = standard('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3');
    const result = new AIEngine().calculateBestMove(domain, topology, { difficulty: 5, timeBudgetMs: 800, variantId: 'standard' });
    const piece = domain.boardEntities[result.bestMove!.pieceId];
    if (piece.type !== 'PIECE') throw new Error('Expected a piece');
    const after = { ...RulesEngine.simulateMove(domain, piece, asCoordinateKey(result.bestMove!.toCoord)), activePlayer: 'P1' as const };
    const mateInOne = RulesEngine.getLegalMoves(after, topology).some((move) => {
      const mover = after.boardEntities[move.pieceId];
      if (mover.type !== 'PIECE') return false;
      const reply = { ...RulesEngine.simulateMove(after, mover, move.to), activePlayer: 'P2' as const };
      return RulesEngine.getLegalMoves(reply, topology).length === 0 &&
        RulesEngine.getGameResult(reply, topology).status === 'CHECKMATE';
    });
    expect(mateInOne).toBe(false);
  }, 20000);

  it('runs in a dedicated Worker and never sends the AbortSignal across', async () => {
    let posted: { request?: { signal?: AbortSignal } } = {};
    const controller = new AbortController();
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {
      onmessage = null;
      onerror = null;
      terminate = terminate;
      postMessage(value: { request?: { signal?: AbortSignal } }) { posted = value; }
    });
    try {
      const domain = standard('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      const pending = AIWorkerPool.dispatchDecision({
        matchId: domain.matchId, variantId: 'standard', actingPlayer: 'P1', difficultyLevel: 5, timeBudgetMs: 2500,
        domain, topology, legalMoves: RulesEngine.getLegalMoves(domain, topology), signal: controller.signal,
      });
      await Promise.resolve();
      expect(posted.request).toBeDefined();
      expect(posted.request?.signal).toBeUndefined();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(terminate).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('rules fixes found while building the engine', () => {
  it('a black pawn does not attack backwards on the 8x8 board', () => {
    const domain = ClassicBoardFactory.createFromFEN('4k3/8/8/8/8/3p1K2/8/8 w - - 0 1');
    expect(RulesEngine.isSquareAttacked(asCoordinateKey(square('e4')), 'P2', domain, topology)).toBe(false);
    expect(RulesEngine.isSquareAttacked(asCoordinateKey(square('e2')), 'P2', domain, topology)).toBe(true);
    expect(RulesEngine.getLegalMoves(domain, topology).some((m) => m.to === square('e4'))).toBe(true);
  });

  it('a straight Jump step onto the en passant square does not make the pawn capture itself', () => {
    let domain = createDefaultDomainState('en-passant-jump', 'SPELL_CHESS_KING_CAPTURE_ONLY');
    addPiece(domain, 'wk', 'P1', 'KING', square('a1'));
    addPiece(domain, 'bk', 'P2', 'KING', square('h8'));
    addPiece(domain, 'wp', 'P1', 'PAWN', square('e4'));
    addPiece(domain, 'bp', 'P2', 'PAWN', square('e5'));
    domain = OfficialSpellRules.sync(
      { ...domain, turnState: { ...domain.turnState, enPassantTarget: asCoordinateKey(square('e6')) } },
      OfficialSpellEngine.createInitialState());
    const after = OfficialSpellRules.simulate(domain, {
      spell: { type: 'JUMP', targetSquare: square('e5') }, move: { pieceId: 'wp', from: square('e4'), to: square('e6') },
    }, topology);
    expect(after.boardEntities[asEntityId('wp')]).toMatchObject({ isCaptured: false, position: square('e6') });
    expect(after.boardEntities[asEntityId('bp')]).toMatchObject({ isCaptured: false });
  });
});

/** Plays "g8f6" with an optional spell such as ['FREEZE', 'a4'] through the production rules. */
function play(domain: IDomainState, move: string, spell?: readonly ['FREEZE' | 'JUMP', string]): IDomainState {
  const from = square(move.slice(0, 2)), to = square(move.slice(2, 4));
  const action: OfficialSpellAction = spell ? { type: spell[0], targetSquare: square(spell[1]) } : { type: 'NONE' };
  return OfficialSpellRules.simulate(domain,
    { spell: action, move: { pieceId: domain.occupancy[asCoordinateKey(from)], from, to } }, topology);
}
const searchAs = (domain: IDomainState, budget: number, depth?: number) => {
  const player = domain.activePlayer as 'P1' | 'P2';
  return searchSpellChess(domain, player, topology, SpellChessSearch.resources(domain, player),
    SpellChessSearch.resources(domain, player === 'P1' ? 'P2' : 'P1'), budget, depth);
};

describe('level 5 Spell Chess: the Bb5 position from the reported game', () => {
  const position = (): IDomainState => freezeEconomyImage(); // 1.e3 Nc6 2.Bb5, Black to move

  it('the threats are real under the production rules', () => {
    // Freeze(c7) + Bxc6 leaves Black without any recapture.
    const frozen = play(play(position(), 'a7a6'), 'b5c6', ['FREEZE', 'c7']);
    expect(RulesEngine.getLegalMoves(frozen, topology).some((m) => m.to === square('c6'))).toBe(false);
    // If the c6 knight leaves, Jump(d7) opens the diagonal to the king.
    expect(play(play(position(), 'c6d4'), 'b5e8', ['JUMP', 'd7']).winnerId).toBe('P1');
  });

  it('the early Freeze(a4)+Nf6 loses by force: it spends the defence needed two turns later', () => {
    let domain = play(position(), 'g8f6', ['FREEZE', 'a4']);
    expect(searchAs(domain, 60000, 5).evaluationCentipawns).toBeGreaterThan(MATE - 1000);
    // Main line, replayed with the production rules down to the king capture.
    domain = play(domain, 'd1h5');
    domain = play(domain, 'h8h5', ['JUMP', 'h7']);
    domain = play(domain, 'b5c6', ['FREEZE', 'c7']);
    domain = play(domain, 'h5h2');
    expect(play(domain, 'c6e8', ['JUMP', 'd7']).winnerId).toBe('P1');
  }, 30000);

  it('level 5 does not walk into a forced loss from that position', () => {
    const domain = position();
    const decision = searchAs(domain, 2500);
    // Guaranteed on any machine: the mandatory minimum includes the full-breadth reply.
    expect(decision.depthReached).toBeGreaterThanOrEqual(3);
    expect(decision.trace.strategicAudit?.completedOpponentReply).toBe(true);
    const after = OfficialSpellRules.simulate(domain, decision.bestAction, topology);
    expect(searchAs(after, 60000, 5).evaluationCentipawns).toBeLessThan(MATE - 1000);
  }, 40000);

  it('even at depth two, the first reply includes the opponent\'s Jump captures', () => {
    const domain = openingTrap('d3');
    const decision = searchAs(domain, 60000, 2);
    const after = OfficialSpellRules.simulate(domain, decision.bestAction, topology);
    const proof = SpellChessMaterialSafety.inspect(after, domain.activePlayer, topology);
    expect(proof.score).toBeGreaterThanOrEqual(SpellChessMaterialSafety.balance(domain, domain.activePlayer) - 200);
  }, 30000);
});

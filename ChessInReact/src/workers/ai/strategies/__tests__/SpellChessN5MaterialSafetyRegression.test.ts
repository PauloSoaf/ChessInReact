import { describe, expect, it, vi } from 'vitest';
import { asEntityId } from '../../../../core/coordinates';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellRules as Rules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessMaterialSafety as Safety } from '../spell/SpellChessMaterialSafety';
import { SpellChessSearch } from '../spell/SpellChessSearch';
import { SpellChessMoveGenerator as Generator } from '../spell/SpellChessMoveGenerator';
import { SpellOptimizationStrategy } from '../SpellOptimizationStrategy';
import { materialTopology as topology, materialTrap, openingTrap } from '../spell/testing/MaterialSafetyFixtures';
import { addPiece, queenTrap, mirrorColors } from '../spell/testing/KingSafetyFixtures';
import { SpellChessTurnAction } from '../spell/SpellChessTurnAction';
import { AIWorkerPool } from '../../AIWorkerPool';

const decide = (domain: ReturnType<typeof openingTrap>, budget = 150, level: 4 | 5 = 5) => new SpellOptimizationStrategy().decideMove({
  matchId: domain.matchId, variantId: domain.variantId, actingPlayer: domain.activePlayer,
  domain, topology, difficultyLevel: level, timeBudgetMs: budget, legalMoves: RulesEngine.getLegalMoves(domain, topology),
});
const actionOf = (d: ReturnType<typeof decide>): SpellChessTurnAction => ({ move: d.move, spell: d.secondaryAction ?
  { type: d.secondaryAction.payload.spellType as 'JUMP' | 'FREEZE', targetSquare: String(d.secondaryAction.payload.targetCoord) } : { type: 'NONE' } });
const inspectAction = (domain: ReturnType<typeof openingTrap>, action: SpellChessTurnAction) => Safety.inspect(Rules.simulate(domain, action, topology), domain.activePlayer, topology);

describe('PATCH-13: material replies, exchanges and bounded search', () => {
  for (const mirror of [false, true]) {
    it.each(['BISHOP', 'KNIGHT', 'PAWN', 'QUEEN'] as const)(`rejects queen-for-pawn followed by %s, mirror=${mirror}`, (captor) => {
      const { domain, poisonedCapture } = materialTrap(captor, mirror);
      const before = JSON.stringify(domain), baseline = Safety.balance(domain, domain.activePlayer);
      const trap = inspectAction(domain, poisonedCapture);
      expect(trap.score - baseline).toBe(-800);
      expect(trap.reply?.move.pieceId).toBe('captor');
      const d = decide(domain);
      expect(inspectAction(domain, actionOf(d)).score).toBeGreaterThanOrEqual(baseline - 200);
      const selected = d.spellTrace?.candidates?.find(c => JSON.stringify(c.action) === JSON.stringify(d.spellTrace?.chosenAction));
      expect(selected?.materialSafetyChecked).toBe(true);
      expect(JSON.stringify(domain)).toBe(before);
    });
    it.each(['d3', 'e3'] as const)(`archived opening %s, mirror=${mirror}`, (opening) => {
      const domain = openingTrap(opening, mirror), before = JSON.stringify(domain);
      const transform = (x: number, y: number) => mirror ? `${7-x},${7-y}` : `${x},${y}`;
      const queen = Rules.pieces(domain).find(p => p.ownerId === domain.activePlayer && p.variantId === 'QUEEN')!;
      const archivedBlunder: SpellChessTurnAction = { spell: { type: 'JUMP', targetSquare: transform(3, opening === 'd3' ? 2 : 6) },
        move: { pieceId: queen.id, from: queen.position, to: transform(3, opening === 'd3' ? 6 : 1), isCapture: true } };
      expect(inspectAction(domain, archivedBlunder).score - Safety.balance(domain, domain.activePlayer)).toBeLessThanOrEqual(-700);
      const d = decide(domain, 250);
      expect(d.fallbackUsed).toBe(false);
      expect(d.spellTrace?.materialInspectionCompleted).toBe(true);
      expect(inspectAction(domain, actionOf(d)).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
      expect(JSON.stringify(domain)).toBe(before);
    });
    it(`permits a safe queen capture and a fully recaptured queen exchange, mirror=${mirror}`, () => {
      const safe = materialTrap('NONE', mirror);
      expect(inspectAction(safe.domain, safe.poisonedCapture).score).toBe(Safety.balance(safe.domain, safe.domain.activePlayer) + 100);
      const trade = materialTrap('QUEEN', mirror);
      addPiece(trade.domain, 'recapturing-rook', trade.domain.activePlayer, 'ROOK', trade.transform('4,6'));
      expect(inspectAction(trade.domain, trade.poisonedCapture).score).toBeGreaterThanOrEqual(Safety.balance(trade.domain, trade.domain.activePlayer));
    });
    it(`sees freeze expiration and two independent blockers, mirror=${mirror}`, () => {
      const fixture = materialTrap('BISHOP', mirror), spells = Rules.getState(fixture.domain);
      const frozen = Rules.sync(fixture.domain, { ...spells, activeFrozenPieceIds: { captor: 1 } });
      expect(inspectAction(frozen, fixture.poisonedCapture).score).toBe(Safety.balance(frozen, frozen.activePlayer) - 800);
      const stillFrozen = Rules.sync(fixture.domain, { ...spells, activeFrozenPieceIds: { captor: 2 } });
      expect(inspectAction(stillFrozen, fixture.poisonedCapture).score).toBe(Safety.balance(stillFrozen, stillFrozen.activePlayer) + 100);
      addPiece(fixture.domain, 'second-blocker', fixture.domain.activePlayer, 'PAWN', fixture.transform('3,4'));
      expect(() => Rules.simulate(fixture.domain, fixture.poisonedCapture, topology)).toThrow();
    });
    it(`rejects unavailable Jump and honors cooldown, mirror=${mirror}`, () => {
      const { domain, poisonedCapture } = materialTrap('BISHOP', mirror), spells = Rules.getState(domain);
      const key = domain.activePlayer === 'P1' ? 'whiteCharges' : 'blackCharges';
      const blocked = Rules.sync(domain, { ...spells, [key]: { ...spells[key], jumpCooldownTurns: 1 } });
      expect(() => Rules.simulate(blocked, poisonedCapture, topology)).toThrow();
      expect(Generator.generateTurnActions(blocked, blocked.activePlayer, topology, SpellChessSearch.resources(blocked, blocked.activePlayer))
        .some(a => a.spell.type === 'JUMP')).toBe(false);
    });
    it(`accepts material compensation and a Freeze which removes recapture, mirror=${mirror}`, () => {
      const f = materialTrap('BISHOP', mirror);
      const bait = f.domain.boardEntities[asEntityId('bait')];
      if (bait.type !== 'PIECE') throw Error('Fixture bait must be a piece');
      f.domain.boardEntities[bait.id] = { ...bait, variantId: 'QUEEN' };
      expect(inspectAction(f.domain, f.poisonedCapture).score).toBe(Safety.balance(f.domain, f.domain.activePlayer));
      const g = materialTrap('BISHOP', mirror);
      const blocker = g.domain.boardEntities[asEntityId('obstacle')];
      delete g.domain.boardEntities[blocker.id]; delete g.domain.occupancy[blocker.position];
      const spells = Rules.getState(g.domain), key = g.domain.activePlayer === 'P1' ? 'whiteCharges' : 'blackCharges';
      const domain = Rules.sync(g.domain, { ...spells, [key]: { ...spells[key], freezeCharges: 1 } });
      const withFreeze: SpellChessTurnAction = { spell: { type: 'FREEZE', targetSquare: g.transform('1,7') }, move: g.poisonedCapture.move };
      expect(inspectAction(domain, { ...withFreeze, spell: { type: 'NONE' } }).score).toBe(Safety.balance(domain, domain.activePlayer) - 800);
      expect(inspectAction(domain, withFreeze).score).toBe(Safety.balance(domain, domain.activePlayer) + 100);
    });
    it(`finds a legal Jump escape which captures the queen attacker, mirror=${mirror}`, () => {
      const f = materialTrap('NONE', mirror);
      const blocker = f.domain.boardEntities[asEntityId('obstacle')];
      delete f.domain.boardEntities[blocker.id]; delete f.domain.occupancy[blocker.position];
      addPiece(f.domain, 'line-blocker', f.domain.activePlayer, 'PAWN', f.transform('5,0'));
      addPiece(f.domain, 'rook-attacker', f.domain.activePlayer === 'P1' ? 'P2' : 'P1', 'ROOK', f.transform('7,0'));
      const rescue: SpellChessTurnAction = { spell: { type: 'JUMP', targetSquare: f.transform('5,0') }, move: {
        pieceId: 'own-queen', from: f.transform('3,0'), to: f.transform('7,0'), isCapture: true } };
      expect(inspectAction(f.domain, rescue).score).toBeGreaterThanOrEqual(Safety.balance(f.domain, f.domain.activePlayer) + 500);
    });
    it(`keeps royal victory above material and permits demonstrated sacrifice, mirror=${mirror}`, () => {
      let domain = queenTrap({ beforeCapture: true }); if (mirror) domain = mirrorColors(domain);
      const action: SpellChessTurnAction = { spell: { type: 'NONE' }, move: {
        pieceId: 'bk', from: domain.boardEntities[asEntityId('bk')].position,
        to: domain.boardEntities[asEntityId('wq')].position } };
      const proof = inspectAction(domain, action);
      expect(proof.score).toBeLessThan(-90000);
      expect(proof.reply?.spell.type).toBe('JUMP');
    });
    it(`rescues an already hanging queen before unrelated moves under a 1 ms budget, mirror=${mirror}`, () => {
      const f = materialTrap('NONE', mirror), queen = f.domain.boardEntities[asEntityId('own-queen')];
      delete f.domain.occupancy[queen.position];
      addPiece(f.domain, 'own-queen', f.domain.activePlayer, 'QUEEN', f.transform('7,4'));
      addPiece(f.domain, 'pawn-attacker', f.domain.activePlayer === 'P1' ? 'P2' : 'P1', 'PAWN', f.transform('6,5'));
      const d = decide(f.domain, 1);
      expect(inspectAction(f.domain, actionOf(d)).score).toBeGreaterThanOrEqual(Safety.balance(f.domain, f.domain.activePlayer) - 200);
    });
    it(`uses Jump for a demonstrated major-piece gain rather than suppressing the spell, mirror=${mirror}`, () => {
      const f = materialTrap('NONE', mirror), bait = f.domain.boardEntities[asEntityId('bait')];
      if (bait.type !== 'PIECE') throw Error('Invalid fixture');
      f.domain.boardEntities[bait.id] = { ...bait, variantId: 'QUEEN' };
      const d = decide(f.domain, 500), proof = inspectAction(f.domain, actionOf(d));
      expect(proof.outcome === 'WIN' || proof.score >= Safety.balance(f.domain, f.domain.activePlayer) + 800).toBe(true);
      if (proof.outcome !== 'WIN') expect(d.secondaryAction?.payload.spellType).toBe('JUMP');
    });
    it(`finds one Freeze defending a thawing queen from pawn and Jump rook together, mirror=${mirror}`, () => {
      const f = materialTrap('NONE', mirror), queen = f.domain.boardEntities[asEntityId('own-queen')], king = f.domain.boardEntities[asEntityId('enemy-king')];
      delete f.domain.occupancy[queen.position]; delete f.domain.occupancy[king.position];
      addPiece(f.domain, 'own-queen', f.domain.activePlayer, 'QUEEN', f.transform('7,4'));
      const enemy = f.domain.activePlayer === 'P1' ? 'P2' : 'P1';
      addPiece(f.domain, 'enemy-king', enemy, 'KING', f.transform('0,7'));
      addPiece(f.domain, 'pawn-attacker', enemy, 'PAWN', f.transform('6,5'));
      addPiece(f.domain, 'rook-attacker', enemy, 'ROOK', f.transform('7,7'));
      addPiece(f.domain, 'rook-blocker', enemy, 'PAWN', f.transform('7,6'));
      const spells = Rules.getState(f.domain), key = f.domain.activePlayer === 'P1' ? 'whiteCharges' : 'blackCharges';
      const enemyKey = key === 'whiteCharges' ? 'blackCharges' : 'whiteCharges';
      const domain = Rules.sync(f.domain, { ...spells, [key]: { ...spells[key], freezeCharges: 1 },
        [enemyKey]: { ...spells[enemyKey], jumpCharges: 1 }, activeFrozenPieceIds: { 'own-queen': 1 } });
      const d = decide(domain, 1), next = Rules.simulate(domain, actionOf(d), topology);
      expect(d.secondaryAction?.payload.spellType).toBe('FREEZE');
      expect(next.boardEntities[asEntityId('pawn-attacker')].metadata?.isFrozen).toBe(true);
      expect(next.boardEntities[asEntityId('rook-attacker')].metadata?.isFrozen).toBe(true);
      expect(Safety.inspect(next, domain.activePlayer, topology).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
    });
    it(`short budget still completes selected opponent-reply inspection, mirror=${mirror}`, () => {
      const { domain } = materialTrap('KNIGHT', mirror);
      const d = decide(domain, 1);
      expect(d.spellTrace?.materialInspectionCompleted).toBe(true);
      expect(inspectAction(domain, actionOf(d)).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
    });
    it(`compares N5 with N4 without requiring an arbitrary unique move, mirror=${mirror}`, () => {
      const { domain } = materialTrap('BISHOP', mirror);
      const n5 = decide(domain, 200, 5), n4 = decide(domain, 200, 4);
      expect(inspectAction(domain, actionOf(n5)).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
      expect(() => Rules.simulate(domain, actionOf(n4), topology)).not.toThrow();
      expect(inspectAction(domain, actionOf(n5)).score).toBeGreaterThanOrEqual(inspectAction(domain, actionOf(n4)).score);
    });
  }
  it.each([false, true])('identifies a mandatory Freeze defense for a frozen queen, mirror=%s', (mirror) => {
    const f = materialTrap('NONE', mirror);
    // Rook attacks the immobile queen; a separate pawn supplies the mandatory move.
    addPiece(f.domain, 'attacker', f.domain.activePlayer === 'P1' ? 'P2' : 'P1', 'ROOK', f.transform('6,0'));
    const s = Rules.getState(f.domain);
    const chargeKey = f.domain.activePlayer === 'P1' ? 'whiteCharges' : 'blackCharges';
    const domain = Rules.sync(f.domain, { ...s, [chargeKey]: { ...s[chargeKey], freezeCharges: 1 },
      activeFrozenPieceIds: { 'own-queen': 2, 'own-king': 2 }, activeJumpPieceIds: {} });
    const d = decide(domain, 250);
    expect(d.secondaryAction?.payload.spellType).toBe('FREEZE');
    expect(inspectAction(domain, actionOf(d)).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
  });
  it('keeps an actual draw separate from material loss or royal victory', () => {
    const { domain } = materialTrap('NONE');
    const draw = { ...domain, isGameOver: true, winnerId: null };
    const proof = Safety.inspect(draw, domain.activePlayer, topology);
    expect(proof).toMatchObject({ outcome: 'DRAW', score: 0, line: [] });
  });
  it('cancels a running Worker without invoking emergency fallback or serializing AbortSignal', async () => {
    const { domain } = materialTrap('BISHOP');
    const controller = new AbortController();
    let posted: unknown;
    const terminate = vi.fn();
    class PendingWorker {
      terminate = terminate;
      onmessage = null;
      onerror = null;
      postMessage(value: unknown) { posted = value; }
    }
    vi.stubGlobal('Worker', PendingWorker);
    const fallback = vi.spyOn(AIWorkerPool, 'executeEmergencyFallback');
    try {
      const pending = AIWorkerPool.dispatchDecision({ matchId: domain.matchId, variantId: domain.variantId,
        actingPlayer: domain.activePlayer, domain, topology, difficultyLevel: 5, timeBudgetMs: 100,
        signal: controller.signal, legalMoves: RulesEngine.getLegalMoves(domain, topology) });
      await Promise.resolve();
      expect((posted as { request: { signal?: AbortSignal } }).request.signal).toBeUndefined();
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(terminate).toHaveBeenCalledOnce(); expect(fallback).not.toHaveBeenCalled();
    } finally { fallback.mockRestore(); vi.unstubAllGlobals(); }
  });
  it('fallback after exception carries a completed material inspection', async () => {
    const { domain } = materialTrap('KNIGHT');
    await AIWorkerPool.dispatchDecision({ matchId: 'init', variantId: 'standard', actingPlayer: 'P1', difficultyLevel: 1,
      timeBudgetMs: 1, legalMoves: [{ pieceId: 'x', from: '0,1', to: '0,2' }] });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    AIWorkerPool.registerStrategy({ strategyId: 'SPELL_OPTIMIZER', decideMove: () => { throw new Error('material fault'); } });
    try {
      const d = await AIWorkerPool.dispatchDecision({ matchId: domain.matchId, variantId: domain.variantId, actingPlayer: domain.activePlayer,
        difficultyLevel: 5, timeBudgetMs: 1, domain, topology, legalMoves: RulesEngine.getLegalMoves(domain, topology) });
      expect(d.fallbackUsed).toBe(true); expect(d.depthReached).toBe(0);
      expect(d.spellTrace?.materialInspectionCompleted).toBe(true);
      expect(inspectAction(domain, actionOf(d)).score).toBeGreaterThanOrEqual(Safety.balance(domain, domain.activePlayer) - 200);
    } finally { AIWorkerPool.registerStrategy(new SpellOptimizationStrategy()); log.mockRestore(); }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { asEntityId, PlayerId } from '../../../../core/coordinates';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellOptimizationStrategy } from '../SpellOptimizationStrategy';
import { SpellChessMoveGenerator } from '../spell/SpellChessMoveGenerator';
import { SpellChessSearch } from '../spell/SpellChessSearch';
import { AIWorkerPool } from '../../AIWorkerPool';
import { addPiece, mirrorColors, queenTrap } from '../spell/testing/KingSafetyFixtures';
import { SpellChessTurnAction } from '../spell/SpellChessTurnAction';

const topology = new SquareTopology({ width: 8, height: 8 });
const captureQueen: SpellChessTurnAction = { spell: { type: 'NONE' }, move: { pieceId: 'bk', from: '4,7', to: '5,6', isCapture: true } };
const decide = (domain: ReturnType<typeof queenTrap>, budget = 500) => new SpellOptimizationStrategy().decideMove({
  matchId: domain.matchId, variantId: domain.variantId, domain, topology, actingPlayer: domain.activePlayer,
  difficultyLevel: 5, timeBudgetMs: budget, legalMoves: RulesEngine.getLegalMoves(domain, topology),
});
const actionOf = (d: ReturnType<typeof decide>): SpellChessTurnAction => ({ move: d.move,
  spell: d.secondaryAction ? { type: d.secondaryAction.payload.spellType as 'FREEZE' | 'JUMP',
    targetSquare: String(d.secondaryAction.payload.targetCoord) } : { type: 'NONE' } });

describe('PATCH-12: real N5 composite actions and king safety', () => {
  it('proves the reply to Kxf7: Jump(e6) + Bxf7', () => {
    const domain = queenTrap({ beforeCapture: true });
    const next = OfficialSpellRules.simulate(domain, captureQueen, topology);
    expect(next.isGameOver).toBe(false);
    const reply = SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)!;
    expect(reply.spell).toEqual({ type: 'JUMP', targetSquare: '4,5' });
    expect(reply.move.from).toBe('2,3'); expect(reply.move.to).toBe('5,6');
    expect(OfficialSpellRules.simulate(next, reply, topology).winnerId).toBe('P1');
  });

  it.each([false, true])('N5 rejects the poisoned queen with colors mirrored=%s', (mirror) => {
    const domain = mirror ? mirrorColors(queenTrap({ beforeCapture: true })) : queenTrap({ beforeCapture: true });
    const before = JSON.stringify(domain);
    const result = decide(domain);
    expect(result.spellTrace?.engine).toBe('SPELL_COMPOSITE');
    expect(JSON.stringify(domain)).toBe(before);
    const d = result.spellTrace!.candidates!.find((c) => c.action.spell.type === 'NONE' && c.action.move.pieceId === 'bk' && c.action.move.isCapture);
    expect(d?.capturedMaterialCp).toBe(900);
    expect(d?.allowsImmediateKingCapture).toBe(true);
    expect(d?.score).toBeLessThan(-90000);
    expect(d?.opponentBestReply?.spell.type).toBe('JUMP');
    const next = OfficialSpellRules.simulate(domain, actionOf(result), topology);
    expect(SpellChessMoveGenerator.findKingCapture(next, next.activePlayer, topology)).toBeUndefined();
    expect(result.fallbackUsed).toBe(false);
  });

  it.each([
    ['Jump ready', {}, true], ['no charges', { jump: 0 }, false], ['cooldown', { cooldown: 1 }, false],
    ['bishop frozen', { bishopFrozen: 1 }, false], ['two blockers', { secondBlocker: true }, false],
  ] as const)('%s: detects only an executable winning action', (_label, options, wins) => {
    expect(Boolean(SpellChessMoveGenerator.findKingCapture(queenTrap(options), 'P1', topology))).toBe(wins);
  });

  it('validates the two-blocker ray even when one blocker has an active Jump', () => {
    const base = queenTrap({ secondBlocker: true });
    const spells = OfficialSpellRules.getState(base);
    const domain = OfficialSpellRules.sync(base, { ...spells, activeJumpPieceIds: { second: 1 } });
    expect(SpellChessMoveGenerator.findKingCapture(domain, 'P1', topology)).toBeUndefined();
  });

  it('allows a safe queen capture when Jump has no charges', () => {
    const domain = queenTrap({ beforeCapture: true, jump: 0 });
    const next = OfficialSpellRules.simulate(domain, captureQueen, topology);
    expect(SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)).toBeUndefined();
    const d = decide(domain).spellTrace!.candidates!.find((c) => c.action.spell.type === 'NONE' && c.action.move.to === '5,6');
    expect(d?.allowsImmediateKingCapture).toBe(false);
  });

  it('finds a concrete Freeze defense when the king cannot move', () => {
    const base = queenTrap({ blackFreeze: 1 });
    const domain = OfficialSpellRules.sync({ ...base, activePlayer: 'P2' as PlayerId }, {
      ...OfficialSpellRules.getState(base), activeFrozenPieceIds: { bk: 2, blocker: 2 },
    });
    const result = decide(domain);
    expect(result.secondaryAction?.payload.spellType).toBe('FREEZE');
    const next = OfficialSpellRules.simulate(domain, actionOf(result), topology);
    expect(SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)).toBeUndefined();
  });

  it('generates legal capture-of-attacker and king-evasion defenses', () => {
    const domain = { ...queenTrap(), activePlayer: 'P2' as const };
    addPiece(domain, 'bn', 'P2', 'KNIGHT', '1,5');
    const actions = SpellChessMoveGenerator.generateTurnActions(domain, 'P2', topology, SpellChessSearch.resources(domain, 'P2'));
    expect(actions.some((a) => a.move.to === '2,3' && a.move.pieceId === 'bn')).toBe(true);
    expect(actions.some((a) => a.move.pieceId === 'bk' && !SpellChessMoveGenerator.findKingCapture(
      OfficialSpellRules.simulate(domain, a, topology), 'P1', topology))).toBe(true);
    const next = OfficialSpellRules.simulate(domain, actionOf(decide(domain)), topology);
    expect(SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)).toBeUndefined();
  });

  it('expires Freeze before checking the opponent reply', () => {
    const domain = queenTrap({ beforeCapture: true, bishopFrozen: 1 });
    expect(domain.boardEntities[asEntityId('wb')].metadata?.isFrozen).toBe(true);
    const next = OfficialSpellRules.simulate(domain, captureQueen, topology);
    expect(next.boardEntities[asEntityId('wb')].metadata?.isFrozen).toBe(false);
    expect(SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)?.spell.type).toBe('JUMP');
  });

  it('decrements only the player who completed a turn and enables Jump when cooldown reaches zero', () => {
    const domain = queenTrap({ cooldown: 1 });
    const next = OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: { pieceId: 'wk', from: '4,0', to: '3,0' } }, topology);
    expect(OfficialSpellRules.getState(next).whiteCharges.jumpCooldownTurns).toBe(0);
    expect(SpellChessMoveGenerator.findKingCapture({ ...next, activePlayer: 'P1' }, 'P1', topology)).toBeDefined();
  });

  it('records fallback errors and still rejects the poisoned capture', async () => {
    const domain = queenTrap({ beforeCapture: true });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Initialize the router before replacing the strategy.
    await AIWorkerPool.dispatchDecision({ matchId: 'warm', variantId: 'standard', actingPlayer: 'P1',
      difficultyLevel: 1, timeBudgetMs: 1, legalMoves: [{ pieceId: 'p', from: '0,1', to: '0,2' }] });
    AIWorkerPool.registerStrategy({ strategyId: 'SPELL_OPTIMIZER', decideMove: () => { throw new Error('injected search failure'); } });
    try {
      const result = await AIWorkerPool.dispatchDecision({ matchId: domain.matchId, domain, topology,
        variantId: domain.variantId, actingPlayer: 'P2', difficultyLevel: 5, timeBudgetMs: 500,
        legalMoves: RulesEngine.getLegalMoves(domain, topology) });
      expect(result.fallbackUsed).toBe(true); expect(result.failureReason).toContain('injected search failure');
      expect(result.depthReached).toBe(0); expect(log).toHaveBeenCalled();
      const next = OfficialSpellRules.simulate(domain, actionOf(result), topology);
      expect(SpellChessMoveGenerator.findKingCapture(next, 'P1', topology)).toBeUndefined();
    } finally { AIWorkerPool.registerStrategy(new SpellOptimizationStrategy()); log.mockRestore(); }
  });

  it('does not manually displace pieces when simulation rejects an illegal action', () => {
    const domain = queenTrap({ beforeCapture: true }); const before = JSON.stringify(domain);
    expect(() => OfficialSpellRules.simulate(domain, { spell: { type: 'NONE' }, move: {
      pieceId: 'bk', from: '4,7', to: '2,3',
    } }, topology)).toThrow();
    expect(JSON.stringify(domain)).toBe(before);
  });
});

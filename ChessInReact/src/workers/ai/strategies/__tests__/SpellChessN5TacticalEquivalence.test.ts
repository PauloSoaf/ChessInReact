import { describe, expect, it } from 'vitest';
import { SquareTopology } from '../../../../core/topology/SquareTopology';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { CheckValidator } from '../../../../engine/rules/CheckValidator';
import { IDomainState } from '../../../../core/state/gameState';
import { SpellOptimizationStrategy } from '../SpellOptimizationStrategy';
import { SpellChessMoveGenerator } from '../spell/SpellChessMoveGenerator';
import { SpellChessSearch } from '../spell/SpellChessSearch';
import { SpellChessTurnAction } from '../spell/SpellChessTurnAction';
import { TACTICAL_GEOMETRIES, TACTICAL_CONDITIONS, tacticalEquivalenceFixture, mandatoryFreezeFixture } from '../spell/testing/TacticalEquivalenceFixtures';

const topology = new SquareTopology({ width: 8, height: 8 });
const cases = TACTICAL_GEOMETRIES.flatMap((geometry) => TACTICAL_CONDITIONS.flatMap((condition) =>
  [false, true].map((mirror) => ({ name: `${geometry.name}/${condition.name}/mirror=${mirror}`, geometry, condition, mirror }))));

// Independent of findKingCapture's selective ray scan: enumerate every generated
// composite reply and inspect the actual king destination.
function allKingCaptureReplies(domain: IDomainState): SpellChessTurnAction[] {
  if (domain.isGameOver) return [];
  const king = CheckValidator.findRoyalPiece(domain.activePlayer === 'P1' ? 'P2' : 'P1', domain);
  return SpellChessMoveGenerator.generateTurnActions(domain, domain.activePlayer, topology,
    SpellChessSearch.resources(domain, domain.activePlayer)).filter((a) => a.move.to === king?.position);
}

describe('PATCH-12: general tactical equivalence through the production N5 strategy', () => {
  it.each(TACTICAL_GEOMETRIES.flatMap((geometry) => [false, true].map((mirror) => ({ geometry, mirror,
    name: `${geometry.name}/mandatory-freeze/mirror=${mirror}` }))))('$name', ({ geometry, mirror }) => {
    const domain = mandatoryFreezeFixture(geometry, mirror);
    const resources = SpellChessSearch.resources(domain, domain.activePlayer);
    const withoutFreeze = SpellChessMoveGenerator.generateTurnActions(domain, domain.activePlayer, topology,
      { ...resources, freezeRemaining: 0 });
    expect(withoutFreeze.length).toBeGreaterThan(0);
    expect(withoutFreeze.every((action) => allKingCaptureReplies(OfficialSpellRules.simulate(domain, action, topology)).length > 0)).toBe(true);
    const result = new SpellOptimizationStrategy().decideMove({ matchId: domain.matchId, variantId: domain.variantId,
      actingPlayer: domain.activePlayer, difficultyLevel: 5, timeBudgetMs: 150,
      domain, topology, legalMoves: RulesEngine.getLegalMoves(domain, topology) });
    expect(result.secondaryAction?.payload.spellType).toBe('FREEZE');
    const action: SpellChessTurnAction = { move: result.move, spell: { type: 'FREEZE',
      targetSquare: String(result.secondaryAction?.payload.targetCoord) } };
    const next = OfficialSpellRules.simulate(domain, action, topology);
    expect(CheckValidator.findRoyalPiece(domain.activePlayer, next)).not.toBeNull();
    // Freezing every remaining enemy piece may produce the capture-only no-action draw.
    // That is a concrete legal defense; it must not be reported as a king-capture victory.
    if (next.isGameOver) {
      expect(next.winnerId).toBeNull();
      expect(RulesEngine.getGameResult(next, topology).status).toBe('STALEMATE');
    }
    expect(allKingCaptureReplies(next)).toHaveLength(0);
    expect(result.fallbackUsed).toBe(false);
  });

  it.each(cases)('$name', ({ geometry, condition, mirror }) => {
    const { domain, poisonedCapture, attackerSquare, blockerSquare, kingCaptureSquare } = tacticalEquivalenceFixture(geometry, condition, mirror);
    const before = JSON.stringify(domain);
    const afterCapture = OfficialSpellRules.simulate(domain, poisonedCapture, topology);
    expect(allKingCaptureReplies(afterCapture).length > 0).toBe(condition.losesKing);
    const winningReply = SpellChessMoveGenerator.findKingCapture(afterCapture, afterCapture.activePlayer, topology);
    expect(Boolean(winningReply)).toBe(condition.losesKing);
    if (winningReply) {
      expect(winningReply.move.from).toBe(attackerSquare);
      expect(winningReply.move.to).toBe(kingCaptureSquare);
      expect(winningReply.spell).toEqual(condition.activeJump === 2
        ? { type: 'NONE' } : { type: 'JUMP', targetSquare: blockerSquare });
      expect(OfficialSpellRules.simulate(afterCapture, winningReply, topology).winnerId).toBe(afterCapture.activePlayer);
    }

    const result = new SpellOptimizationStrategy().decideMove({ matchId: domain.matchId, variantId: domain.variantId,
      actingPlayer: domain.activePlayer, difficultyLevel: 5, timeBudgetMs: 120,
      domain, topology, legalMoves: RulesEngine.getLegalMoves(domain, topology) });
    expect(JSON.stringify(domain)).toBe(before);
    expect(result.spellTrace?.engine).toBe('SPELL_COMPOSITE');
    expect(result.fallbackUsed).toBe(false);
    const diagnostic = result.spellTrace?.candidates?.find((c) => c.action.spell.type === 'NONE' &&
      c.action.move.pieceId === poisonedCapture.move.pieceId && c.action.move.to === poisonedCapture.move.to);
    expect(diagnostic?.safetyChecked).toBe(true);
    expect(diagnostic?.capturedMaterialCp).toBe(900);
    expect(diagnostic?.allowsImmediateKingCapture).toBe(condition.losesKing);
    if (condition.losesKing) {
      expect(diagnostic!.score).toBeLessThan(-90000);
      expect(diagnostic!.opponentBestReply).toEqual(winningReply);
      // Establish a real alternative independently of the selected action's diagnostic.
      const alternatives = SpellChessMoveGenerator.generateTurnActions(domain, domain.activePlayer, topology,
        SpellChessSearch.resources(domain, domain.activePlayer));
      expect(alternatives.some((action) => {
        const next = OfficialSpellRules.simulate(domain, action, topology);
        return !next.isGameOver && allKingCaptureReplies(next).length === 0;
      })).toBe(true);
    }
    const chosen: SpellChessTurnAction = { move: result.move, spell: result.secondaryAction
      ? { type: result.secondaryAction.payload.spellType as 'FREEZE' | 'JUMP', targetSquare: String(result.secondaryAction.payload.targetCoord) }
      : { type: 'NONE' } };
    const next = OfficialSpellRules.simulate(domain, chosen, topology);
    expect(next.isGameOver && next.winnerId !== null && next.winnerId !== domain.activePlayer).toBe(false);
    expect(SpellChessMoveGenerator.findKingCapture(next, next.activePlayer, topology)).toBeUndefined();
    expect(allKingCaptureReplies(next)).toHaveLength(0);
  });
});

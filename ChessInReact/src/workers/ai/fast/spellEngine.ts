/**
 * Level 5 official Spell Chess on the compact search, reported through the existing trace and
 * strategic audit contracts. Every audit number comes from the search or from legal
 * transitions; anything the search did not measure is reported as null.
 */
import { IDomainState } from '../../../core/state/gameState';
import { PlayerId } from '../../../core/coordinates';
import { ITopology } from '../../../core/topology/types';
import { VariantRegistry } from '../../../engine/rules/VariantRegistry';
import {
  CandidateDiagnostic, FreezeImpactAnalysis, SpellAction, SpellChessTurnAction, SpellResources,
  SpellStrategicAlternative, SpellStrategicDecisionAudit,
} from '../strategies/spell/SpellChessTurnAction';
import type { ISpellChessSearchResult } from '../strategies/spell/SpellChessSearch';
import { FastSearch, IBaseline, IRootTurn, ITurn, MATE, SPELL_MARGIN } from './FastSearch';
import {
  FLAG_CAPTURE, FREEZE_CHARGES, FREEZE_COOLDOWN, FastPosition, KING, PAWN, SPELL_FREEZE, SPELL_JUMP, SPELL_NONE,
  moveFrom, moveTo, spellSquare, spellType,
} from './FastPosition';
import { PIECE_VALUE, spellReserve } from './FastEvaluation';
import { coordOf, fromDomain, toDomainMove } from './domainBridge';

const MATE_BOUND = MATE - 1000;
const REPORTED_SPELL_CANDIDATES = 20;
/** Material convention of the audit reports (pawn, knight, bishop, rook, queen). */
const REPORT_VALUE = [0, 100, 320, 330, 500, 900, 0];
let search: FastSearch | null = null;

function material(position: FastPosition, color: number): number {
  let total = 0;
  for (let sq = 0; sq < 64; sq++) {
    const p = position.board[sq];
    if (p && (p & 7) !== KING) total += (p >> 3 === color ? 1 : -1) * PIECE_VALUE[p & 7];
  }
  return total;
}

export function searchSpellChess(
  domain: IDomainState, player: PlayerId, topology: ITopology, resources: SpellResources,
  opponentResources: SpellResources, timeBudgetMs = 2500, maxDepth?: number,
): ISpellChessSearchResult {
  void topology; // support is checked by the caller with supportsSpellEngine()
  const config = VariantRegistry.resolveRulesConfig(domain.variantId);
  const enforceCheck = config?.winCondition !== 'KING_CAPTURE_ONLY' && (config?.enforceCheck ?? true);
  const { position, idAt } = fromDomain(domain, {
    spellMode: true, enforceCheck, sideToMove: player,
    resources: player === 'P1' ? [resources, opponentResources] : [opponentResources, resources],
  });
  const me = position.side;

  search ??= new FastSearch();
  // Depth three is mandatory, even on slow hardware: it is the first depth at which the
  // opponent's reply gets the same spell breadth as our own turns. At depth two, a spell
  // can still look good only because its refutation was never generated.
  const outcome = search.search(position, { timeMs: timeBudgetMs, maxDepth, minDepth: 3 });

  /** Replays a line from the root, translating each turn while the piece map is still valid. */
  const walk = <T>(line: ReadonlyArray<ITurn>, visit: (position: FastPosition) => T): { turns: SpellChessTurnAction[]; value: T } => {
    const ids = idAt.slice();
    const turns: SpellChessTurnAction[] = [];
    const applied: boolean[] = [];
    for (const step of line) {
      const spelled = step.spell !== SPELL_NONE;
      if (spelled) {
        if (!position.canCast(spellType(step.spell))) break;
        position.cast(step.spell);
      }
      const from = moveFrom(step.move), to = moveTo(step.move);
      const pieceId = ids[from];
      const capture = Boolean(step.move & FLAG_CAPTURE);
      if (!pieceId || !position.make(step.move)) {
        if (spelled) position.uncast();
        break;
      }
      applied.push(spelled);
      ids[to] = pieceId;
      ids[from] = undefined;
      if ((position.board[to] & 7) === KING && Math.abs(to - from) === 2) {
        const rookFrom = to > from ? from + 3 : from - 4;
        ids[to > from ? from + 1 : from - 1] = ids[rookFrom];
        ids[rookFrom] = undefined;
      }
      const spell: SpellAction = !spelled ? { type: 'NONE' }
        : { type: spellType(step.spell) === SPELL_FREEZE ? 'FREEZE' : 'JUMP', targetSquare: coordOf(spellSquare(step.spell)) };
      turns.push({ spell, move: { ...toDomainMove(step.move, pieceId), isCapture: capture } });
    }
    const value = visit(position);
    for (let i = applied.length - 1; i >= 0; i--) {
      position.unmake();
      if (applied[i]) position.uncast();
    }
    return { turns, value };
  };

  const translate = (line: ReadonlyArray<ITurn>): SpellChessTurnAction[] => walk(line, () => null).turns;

  const diagnose = (turn: IRootTurn): CandidateDiagnostic => {
    const [action] = translate([turn]);
    const to = moveTo(turn.move);
    const victim = position.board[to] & 7;
    let line: ReadonlyArray<ITurn> = turn.pv;
    let score = turn.score;
    if (turn.allowsKingCapture) {
      // Proven by legal move detection, independent of how deep the search went.
      const reply = walk([turn], (p) => p.findKingCapture()).value;
      if (reply) line = [turn, reply];
      score = -(MATE - 2);
    }
    const variation = translate(line);
    return {
      action, legal: true, score, completedDepth: turn.depth, opponentBestReply: variation[1],
      allowsImmediateKingCapture: turn.allowsKingCapture, safetyChecked: true, usedFallback: false,
      capturedMaterialCp: REPORT_VALUE[victim],
      materialSafetyChecked: true, tacticalVariation: variation.slice(1),
      replyCoverage: turn.exact ? 'NORMAL_AND_CAPTURES' : 'ALPHA_BETA_BOUND',
    };
  };

  const byStrength = (a: IRootTurn, b: IRootTurn): number =>
    b.depth - a.depth || Number(b.exact) - Number(a.exact) || b.score - a.score;
  const ofType = (type: number): IRootTurn[] =>
    outcome.rootTurns.filter((t) => t.depth > 0 && (t.spell ? spellType(t.spell) : SPELL_NONE) === type).sort(byStrength);

  const normals = outcome.rootTurns.filter((t) => t.spell === SPELL_NONE);
  const spellCandidates = outcome.rootTurns.filter((t) => t.spell !== SPELL_NONE && t.depth > 0)
    .sort(byStrength).slice(0, REPORTED_SPELL_CANDIDATES);
  const reported = [...new Set([outcome.best, ...normals, ...spellCandidates])];
  const diagnostics = reported.map(diagnose);
  const chosen = diagnostics[0];
  const principalVariation = translate(outcome.best.pv);

  const alternative = (turn: IRootTurn | undefined, baseline?: IBaseline | null): SpellStrategicAlternative | null => {
    if (!turn) return null;
    const line = translate(baseline ? baseline.pv : turn.pv);
    return {
      action: line[0], scoreCp: baseline ? baseline.score : turn.score,
      depthCompleted: baseline ? baseline.depth : turn.depth, opponentBestReply: line[1] ?? null,
      replyCoverage: baseline || turn.exact ? 'NORMAL_AND_CAPTURES' : 'ALPHA_BETA_BOUND',
    };
  };
  const baseline = outcome.baseline;
  const withoutSpell = outcome.best.spell === SPELL_NONE
    ? alternative(outcome.best) : alternative(baseline?.turn, baseline);

  const reserveBefore = spellReserve(position, me);
  const reserveAfter = walk([outcome.best], (p) => spellReserve(p, me)).value;
  // The reserve difference includes ordinary cooldown recovery; only a cast has a cost.
  const resourceCost = outcome.best.spell === SPELL_NONE ? 0 : Math.max(0, reserveBefore - reserveAfter);

  const isFreeze = outcome.best.spell !== SPELL_NONE && spellType(outcome.best.spell) === SPELL_FREEZE;
  const freezeImpact = isFreeze ? analyseFreeze() : null;

  function analyseFreeze(): FreezeImpactAnalysis {
    const turn = outcome.best;
    const hits = (p: FastPosition): number => p.royalThreats(me).length;
    const threatsBefore = hits(position);
    position.cast(turn.spell);
    const affected: string[] = [];
    for (let sq = 0; sq < 64; sq++) if (position.frozen[sq] === 2 && idAt[sq]) affected.push(idAt[sq] as string);
    position.uncast();
    const threatsAfter = walk([turn], hits).value;
    const start = material(position, me);
    // Material at the end of each principal variation, from the same search.
    const withFreeze = walk(turn.pv, (p) => material(p, me)).value - start;
    const without = baseline ? walk(baseline.pv, (p) => material(p, me)).value - start : null;
    const benefit = baseline ? turn.score - baseline.score : null;
    const proved = Boolean(turn.exact && (!baseline || (baseline.depth === turn.depth && turn.score > baseline.score)));
    const opponent = (me ^ 1) * 4;
    return {
      affectedPieces: affected,
      threatsRemoved: Math.max(0, threatsBefore - threatsAfter),
      threatsCreated: null,
      kingSafetyImprovement: threatsBefore - threatsAfter,
      materialSavedCp: without === null ? null : Math.max(0, Math.min(0, withFreeze) - Math.min(0, without)),
      materialWonCp: without === null ? null : Math.max(0, withFreeze - Math.max(0, without)),
      attacksNeutralized: Math.max(0, threatsBefore - threatsAfter),
      concreteFollowUp: principalVariation.slice(1),
      opponentBestResponse: principalVariation[1] ?? null,
      counterFreezeRisk: position.resources[opponent + FREEZE_CHARGES] > 0 &&
        position.resources[opponent + FREEZE_COOLDOWN] === 0 ? 1 : 0,
      resourceOpportunityCostCp: resourceCost,
      expectedNetBenefitCp: benefit,
      provedBySearch: proved,
    };
  }

  const strongestSpell = outcome.rootTurns
    .filter((t) => t.spell !== SPELL_NONE && t.exact && t.depth === outcome.best.depth).sort(byStrength)[0];
  let reason: SpellStrategicDecisionAudit['selectionReason'];
  if (outcome.best.score >= MATE - 2) reason = 'IMMEDIATE_VICTORY';
  else if (outcome.best.score <= -MATE_BOUND) reason = 'UNAVOIDABLE_INSPECTED_LOSS';
  else if (outcome.best.spell !== SPELL_NONE) {
    reason = !baseline || baseline.score <= -MATE_BOUND ? 'ONLY_INSPECTED_SAFE_ACTION'
      : (freezeImpact?.materialWonCp ?? 0) >= PIECE_VALUE[PAWN] ||
        (spellType(outcome.best.spell) === SPELL_JUMP && chosen.capturedMaterialCp > 0)
        ? 'TACTICAL_MATERIAL_GAIN' : 'MATCHED_SEARCH_ADVANTAGE';
  } else {
    reason = strongestSpell && strongestSpell.score > outcome.best.score &&
      strongestSpell.score <= outcome.best.score + SPELL_MARGIN
      ? 'CONSERVE_RESOURCE_UNPROVED_GAIN' : 'BEST_INSPECTED_NORMAL_ACTION';
  }

  const audit: SpellStrategicDecisionAudit = {
    depthCompleted: outcome.best.depth, rootCandidatesGenerated: outcome.rootTurns.length,
    rootCandidatesSearched: outcome.rootTurns.filter((t) => t.depth > 0).length,
    rootCandidatesDeepSearched: outcome.rootTurns.filter((t) => t.depth >= 2).length,
    rootReplyCoverage: 'SELECTIVE', nodesSearched: outcome.nodes, searchTimeMs: outcome.elapsedMs,
    bestWithoutSpell: withoutSpell,
    bestWithFreeze: alternative(isFreeze ? outcome.best : ofType(SPELL_FREEZE)[0]),
    bestWithJump: alternative(
      outcome.best.spell && !isFreeze ? outcome.best : ofType(SPELL_JUMP)[0]),
    chosenAction: chosen.action, principalVariation, opponentBestReply: principalVariation[1] ?? null,
    spellResourceCost: resourceCost, freezeImpact, tacticalSafetyChecked: true,
    completedOpponentReply: principalVariation.length > 1,
    replyCoverage: chosen.replyCoverage ?? 'ALPHA_BETA_BOUND',
    timeoutOccurred: outcome.timedOut, fallbackUsed: false, selectionReason: reason,
  };

  return {
    bestAction: chosen.action,
    evaluationCentipawns: outcome.best.score,
    depthReached: outcome.best.depth,
    nodesEvaluated: outcome.nodes,
    elapsedMs: outcome.elapsedMs,
    trace: {
      engine: 'SPELL_COMPOSITE', depthReached: outcome.best.depth, nodesSearched: outcome.nodes,
      elapsedMs: outcome.elapsedMs, legalTurnActionsConsidered: outcome.rootTurns.length,
      chosenAction: chosen.action, principalVariation, candidates: diagnostics, timedOut: outcome.timedOut,
      fallbackUsed: false, materialInspectionCompleted: true, strategicAudit: audit,
      topCandidates: [...diagnostics].sort((a, b) => b.score - a.score).slice(0, 5)
        .map((d) => ({ spell: d.action.spell, move: `${d.action.move.from}->${d.action.move.to}`, score: d.score })),
    },
  };
}

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, asCoordinateKey } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { OfficialSpellEngine, IPlayerSpellCharges } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessTurnAction, SpellResources, SpellChessDecisionTrace, CandidateDiagnostic } from './SpellChessTurnAction';
import { SpellChessMoveGenerator } from './SpellChessMoveGenerator';
import { SpellChessPositionEvaluator, SPELL_CHESS_MATE_SCORE as MATE } from './SpellChessPositionEvaluator';
import { SpellChessTranspositionTable } from './SpellChessTranspositionTable';

export interface ISpellChessSearchResult {
  readonly bestAction: SpellChessTurnAction;
  readonly evaluationCentipawns: number;
  readonly depthReached: number;
  readonly nodesEvaluated: number;
  readonly elapsedMs: number;
  readonly trace: SpellChessDecisionTrace;
}
const opposite = (p: PlayerId): PlayerId => p === 'P1' ? 'P2' : 'P1';
interface NodeResult { score: number; pv: SpellChessTurnAction[] }
class SearchTimeout extends Error {}

export class SpellChessSearch {
  private readonly tt: SpellChessTranspositionTable;
  private nodes = 0;
  private qnodes = 0;
  private deadline = 0;
  private timedOut = false;
  constructor(ttSize = 32768) { this.tt = new SpellChessTranspositionTable(ttSize); }

  public static resources(domain: IDomainState, player: PlayerId): SpellResources {
    const spells = OfficialSpellRules.getState(domain);
    const c = player === 'P1' ? spells.whiteCharges : spells.blackCharges;
    return { freezeRemaining: c.freezeCharges, jumpRemaining: c.jumpCharges,
      freezeCooldown: c.freezeCooldownTurns, jumpCooldown: c.jumpCooldownTurns };
  }

  public searchBestTurnAction(domain: IDomainState, player: PlayerId, topology: ITopology,
    resources: SpellResources, opponentResources: SpellResources, timeBudgetMs = 2500, maxDepth = 5,
    _activeFrozenCoords: readonly string[] = [], _activeJumpCoords: readonly string[] = [],
    _fallbackLegalMoves?: readonly { from: string; to: string; pieceId: string; isCapture?: boolean; promotion?: string }[]
  ): ISpellChessSearchResult {
    void _activeFrozenCoords; void _activeJumpCoords; void _fallbackLegalMoves;
    const start = performance.now();
    this.deadline = start + Math.max(1, timeBudgetMs);
    this.nodes = 0; this.qnodes = 0; this.timedOut = false; this.tt.clear();
    const charges = (r: SpellResources): IPlayerSpellCharges => ({ freezeCharges: r.freezeRemaining,
      jumpCharges: r.jumpRemaining, freezeCooldownTurns: r.freezeCooldown, jumpCooldownTurns: r.jumpCooldown });
    let root: IDomainState = { ...domain, activePlayer: player };
    if (!domain.metadata?.officialSpellState) {
      const initial = OfficialSpellEngine.createInitialState();
      root = { ...root, metadata: { ...root.metadata, officialSpellState: { ...initial,
        whiteCharges: charges(player === 'P1' ? resources : opponentResources),
        blackCharges: charges(player === 'P2' ? resources : opponentResources),
        activeFrozenPieceIds: Object.fromEntries(OfficialSpellRules.pieces(domain)
          .filter((p) => p.metadata?.isFrozen).map((p) => [p.id, 1])),
        activeJumpPieceIds: Object.fromEntries(OfficialSpellRules.pieces(domain)
          .filter((p) => p.metadata?.canBeJumpedOver).map((p) => [p.id, 1])),
      } } };
    }
    const immediate = SpellChessMoveGenerator.findKingCapture(root, player, topology);
    const actions = immediate ? [immediate] : SpellChessMoveGenerator.generateTurnActions(root, player, topology, SpellChessSearch.resources(root, player));
    if (!actions.length) throw new Error('No executable Spell Chess action.');
    const diagnostics: CandidateDiagnostic[] = [];
    const children: Array<{ action: SpellChessTurnAction; state: IDomainState; diagnostic: CandidateDiagnostic }> = [];
    for (const action of actions) {
      const targetId = root.occupancy[asCoordinateKey(action.move.to)];
      const target = targetId ? root.boardEntities[targetId] : undefined;
      const values: Record<string, number> = { QUEEN: 900, ROOK: 500, BISHOP: 330, KNIGHT: 320, PAWN: 100 };
      const d: CandidateDiagnostic = { action, legal: true, score: 0, completedDepth: 0,
        allowsImmediateKingCapture: false, safetyChecked: false, usedFallback: false,
        capturedMaterialCp: target?.type === 'PIECE' ? values[target.variantId] ?? 0 : 0 };
      diagnostics.push(d);
      if (performance.now() >= this.deadline && children.some((c) => !c.diagnostic.allowsImmediateKingCapture)) { this.timedOut = true; d.rejectionReason = 'Budget expired before safety inspection'; continue; }
      try {
        const next = OfficialSpellRules.simulate(root, action, topology);
        this.nodes++;
        const reply = SpellChessMoveGenerator.findKingCapture(next, opposite(player), topology);
        d.safetyChecked = true;
        d.allowsImmediateKingCapture = Boolean(reply);
        d.opponentBestReply = reply;
        d.score = next.isGameOver ? this.terminal(next, player, 1)! : reply ? -MATE + 2 :
          -this.evaluate(next, topology, 1);
        children.push({ action, state: next, diagnostic: d });
      } catch (error) {
        d.legal = false; d.rejectionReason = String(error);
        // A generated action rejected by the shared rules is a structural error, never a manual move.
        throw new Error(`Spell simulation rejected ${JSON.stringify(action)}: ${String(error)}`);
      }
    }
    if (!children.length) throw new Error('No validated Spell Chess candidate.');
    const safe = children.filter((c) => !c.diagnostic.allowsImmediateKingCapture);
    const candidates = (safe.length ? safe : children).sort((a, b) => b.diagnostic.score - a.diagnostic.score);
    let best = candidates[0];
    let score = best.diagnostic.score;
    let pv = [best.action, ...(best.diagnostic.opponentBestReply ? [best.diagnostic.opponentBestReply] : [])];
    let completedDepth = immediate || children.length === actions.length ? 1 : 0;
    if (completedDepth === 1) for (const child of children) child.diagnostic.completedDepth = 1;
    if (!immediate && !this.timedOut) for (let depth = 2; depth <= maxDepth; depth++) {
      let iterationBest = best;
      let iterationScore = -Infinity;
      let rootAlpha = -Infinity;
      let iterationPV: SpellChessTurnAction[] = [];
      const iterationDiagnostics: Array<{ d: CandidateDiagnostic; value: NodeResult }> = [];
      try {
        for (const child of candidates) {
          this.checkTime();
          const value = child.diagnostic.allowsImmediateKingCapture
            ? { score: MATE - 2, pv: [child.diagnostic.opponentBestReply!] }
            : this.negamax(child.state, topology, depth - 1, -Infinity, -rootAlpha, 1);
          iterationDiagnostics.push({ d: child.diagnostic, value });
          if (-value.score > iterationScore) { iterationScore = -value.score; iterationBest = child; iterationPV = [child.action, ...value.pv]; }
          rootAlpha = Math.max(rootAlpha, -value.score);
        }
        best = iterationBest; score = iterationScore; pv = iterationPV; completedDepth = depth;
        for (const { d, value } of iterationDiagnostics) { d.score = -value.score; d.completedDepth = depth; d.opponentBestReply = value.pv[0]; }
        candidates.sort((a, b) => b.diagnostic.score - a.diagnostic.score);
        if (Math.abs(score) >= MATE - 20) break;
      } catch (error) { if (!(error instanceof SearchTimeout)) throw error; this.timedOut = true; break; }
    }
    const elapsedMs = performance.now() - start;
    return { bestAction: best.action, evaluationCentipawns: score, depthReached: completedDepth,
      nodesEvaluated: this.nodes, elapsedMs, trace: { engine: 'SPELL_COMPOSITE', depthReached: completedDepth,
        nodesSearched: this.nodes, elapsedMs, legalTurnActionsConsidered: actions.length,
        chosenAction: best.action, principalVariation: pv, candidates: diagnostics, timedOut: this.timedOut,
        fallbackUsed: false, quiescenceNodes: this.qnodes,
        topCandidates: [...diagnostics].filter((d) => d.safetyChecked).sort((a, b) => b.score - a.score).slice(0, 5)
          .map((d) => ({ spell: d.action.spell, move: `${d.action.move.from}->${d.action.move.to}`, score: d.score })) } };
  }

  private terminal(domain: IDomainState, player: PlayerId, ply: number): number | undefined {
    if (!domain.isGameOver) return undefined;
    return domain.winnerId === null ? 0 : domain.winnerId === player ? MATE - ply : -MATE + ply;
  }
  private evaluate(domain: IDomainState, topology: ITopology, ply: number): number {
    return SpellChessPositionEvaluator.evaluate(domain, domain.activePlayer, topology,
      SpellChessSearch.resources(domain, domain.activePlayer), SpellChessSearch.resources(domain, opposite(domain.activePlayer)), [], [], ply);
  }
  private negamax(domain: IDomainState, topology: ITopology, depth: number, alpha: number, beta: number, ply: number): NodeResult {
    this.checkTime(); this.nodes++;
    const terminal = this.terminal(domain, domain.activePlayer, ply);
    if (terminal !== undefined) return { score: terminal, pv: [] };
    const immediate = SpellChessMoveGenerator.findKingCapture(domain, domain.activePlayer, topology);
    if (immediate) return { score: MATE - ply - 1, pv: [immediate] };
    if (depth <= 0) return this.quiescence(domain, topology, alpha, beta, ply, 2);
    const originalAlpha = alpha, originalBeta = beta;
    const key = this.tt.computeKey(domain, domain.activePlayer, SpellChessSearch.resources(domain, 'P1'), SpellChessSearch.resources(domain, 'P2'), [], []);
    const cached = this.tt.get(key);
    if (cached && cached.depth >= depth && (cached.flag === 'EXACT' ||
      (cached.flag === 'LOWERBOUND' && cached.score >= beta) || (cached.flag === 'UPPERBOUND' && cached.score <= alpha))) {
      return { score: cached.score, pv: cached.principalVariation ?? [] };
    }
    const actions = SpellChessMoveGenerator.generateTurnActions(domain, domain.activePlayer, topology, SpellChessSearch.resources(domain, domain.activePlayer));
    if (!actions.length) return { score: this.evaluate(domain, topology, ply), pv: [] };
    let best: NodeResult = { score: -Infinity, pv: [] };
    for (const action of actions) {
      this.checkTime();
      const next = OfficialSpellRules.simulate(domain, action, topology);
      const value = this.negamax(next, topology, depth - 1, -beta, -alpha, ply + 1);
      if (-value.score > best.score) best = { score: -value.score, pv: [action, ...value.pv] };
      alpha = Math.max(alpha, best.score);
      if (alpha >= beta) break;
    }
    this.tt.set(key, { key, depth, score: best.score, bestAction: best.pv[0], principalVariation: best.pv,
      flag: best.score <= originalAlpha ? 'UPPERBOUND' : best.score >= originalBeta ? 'LOWERBOUND' : 'EXACT' });
    return best;
  }
  private quiescence(domain: IDomainState, topology: ITopology, alpha: number, beta: number, ply: number, remaining: number): NodeResult {
    this.checkTime(); this.qnodes++;
    const terminal = this.terminal(domain, domain.activePlayer, ply);
    if (terminal !== undefined) return { score: terminal, pv: [] };
    const win = SpellChessMoveGenerator.findKingCapture(domain, domain.activePlayer, topology);
    if (win) return { score: MATE - ply - 1, pv: [win] };
    const threatened = Boolean(SpellChessMoveGenerator.findKingCapture({ ...domain, activePlayer: opposite(domain.activePlayer),
      metadata: { ...domain.metadata, hasCastSpellThisTurn: false } }, opposite(domain.activePlayer), topology));
    const standPat = this.evaluate(domain, topology, ply);
    if (remaining === 0) return { score: standPat, pv: [] };
    let best: NodeResult = { score: threatened ? -Infinity : standPat, pv: [] };
    if (!threatened) { if (standPat >= beta) return best; alpha = Math.max(alpha, standPat); }
    // In capture-only play Freeze cannot open a material capture geometrically.
    // Keep all defensive spells under threat; otherwise search captures and Jump captures.
    const resources = SpellChessSearch.resources(domain, domain.activePlayer);
    const actions = SpellChessMoveGenerator.generateTurnActions(domain, domain.activePlayer, topology,
      threatened ? resources : { ...resources, freezeRemaining: 0 })
      .filter((a) => threatened || a.move.isCapture || a.move.promotion);
    for (const action of actions) {
      this.checkTime(); this.nodes++;
      const next = OfficialSpellRules.simulate(domain, action, topology);
      const reply = this.quiescence(next, topology, -beta, -alpha, ply + 1, remaining - 1);
      if (-reply.score > best.score) best = { score: -reply.score, pv: [action, ...reply.pv] };
      alpha = Math.max(alpha, best.score);
      if (alpha >= beta) break;
    }
    return best.score === -Infinity ? { score: 0, pv: [] } : best;
  }
  private checkTime(): void { if (performance.now() >= this.deadline) throw new SearchTimeout(); }
}

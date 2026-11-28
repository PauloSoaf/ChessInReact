import { SpellChessSimulation } from './SpellChessSimulation';
import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, asCoordinateKey, asEntityId } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { OfficialSpellEngine, IPlayerSpellCharges } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessTurnAction, SpellResources, SpellChessDecisionTrace, CandidateDiagnostic } from './SpellChessTurnAction';
import { SpellChessMoveGenerator } from './SpellChessMoveGenerator';
import { SpellChessPositionEvaluator, SPELL_CHESS_MATE_SCORE as MATE } from './SpellChessPositionEvaluator';
import { SpellChessTranspositionTable } from './SpellChessTranspositionTable';
import { SpellChessMaterialSafety } from './SpellChessMaterialSafety';
import { SpellChessStrategicAudit } from './SpellChessStrategicAudit';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { SpellChessProfiler } from './SpellChessProfiler';
import { SpellChessResources } from './SpellChessResources';

export interface ISpellChessSearchResult {
  readonly bestAction: SpellChessTurnAction;
  readonly evaluationCentipawns: number;
  readonly depthReached: number;
  readonly nodesEvaluated: number;
  readonly elapsedMs: number;
  readonly trace: SpellChessDecisionTrace;
}
const opposite = (p: PlayerId): PlayerId => p === 'P1' ? 'P2' : 'P1';
interface NodeResult { score: number; pv: SpellChessTurnAction[]; fullWidth?: boolean; searchedReplies?: number; freezeReplies?: number }
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

  public searchBestTurnAction(...args: Parameters<SpellChessSearch['runSearch']>): ISpellChessSearchResult {
    try { return this.runSearch(...args); } finally { SpellChessProfiler.end(); SpellChessSimulation.end(); SpellChessMaterialSafety.endCache(); }
  }
  private runSearch(domain: IDomainState, player: PlayerId, topology: ITopology,
    resources: SpellResources, opponentResources: SpellResources, timeBudgetMs = 2500, maxDepth = 5,
    _activeFrozenCoords: readonly string[] = [], _activeJumpCoords: readonly string[] = [],
    _fallbackLegalMoves?: readonly { from: string; to: string; pieceId: string; isCapture?: boolean; promotion?: string }[]
  ): ISpellChessSearchResult {
    void _activeFrozenCoords; void _activeJumpCoords; void _fallbackLegalMoves;
    const start = performance.now();
    const profile = SpellChessProfiler.begin();
    SpellChessSimulation.begin(); SpellChessMaterialSafety.beginCache();
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
    const actions = immediate ? [immediate] : SpellChessMoveGenerator.iterateTurnActions(root, player, topology, SpellChessSearch.resources(root, player));
    const rootMaterial = SpellChessMaterialSafety.balance(root, player);
    const inspectionDeadline = start + Math.max(1, timeBudgetMs * 0.45);
    let rootExhausted = true;
    let rootGenerated = 0;
    const diagnostics: CandidateDiagnostic[] = [];
    const children: Array<{ action: SpellChessTurnAction; state: IDomainState; diagnostic: CandidateDiagnostic }> = [];
    for (const action of actions) {
      rootGenerated++;
      // Never select an action whose opponent captures have not been inspected.
      // Complete at least one executable inspection even under a tiny budget.
      if (performance.now() >= inspectionDeadline && children.some((c) => !c.diagnostic.allowsImmediateKingCapture &&
        (c.diagnostic.materialLossCp ?? Infinity) <= 200)) {
        rootExhausted = false; break;
      }
      const targetId = root.occupancy[asCoordinateKey(action.move.to)];
      const target = targetId ? root.boardEntities[targetId] : undefined;
      const values: Record<string, number> = { QUEEN: 900, ROOK: 500, BISHOP: 330, KNIGHT: 320, PAWN: 100 };
      const d: CandidateDiagnostic = { action, legal: true, score: 0, completedDepth: 0,
        allowsImmediateKingCapture: false, safetyChecked: false, usedFallback: false,
        capturedMaterialCp: target?.type === 'PIECE' ? values[target.variantId] ?? 0 : 0 };
      diagnostics.push(d);
      try {
        const next = SpellChessSimulation.run(root, action, topology);
        this.nodes++;
        const reply = SpellChessMoveGenerator.findKingCapture(next, opposite(player), topology);
        d.safetyChecked = true;
        d.allowsImmediateKingCapture = Boolean(reply);
        d.opponentBestReply = reply;
        const canInterrupt = children.some((c) => !c.diagnostic.allowsImmediateKingCapture && (c.diagnostic.materialLossCp ?? Infinity) <= 200);
        const material = SpellChessMaterialSafety.inspect(next, player, topology,
          canInterrupt ? () => { if(performance.now()>=inspectionDeadline)throw new SearchTimeout(); } : undefined,
          undefined,3,1,1,action.move.to);
        this.nodes += material.simulations;
        if(action.spell.type==='FREEZE'&&!next.isGameOver){
          d.followUpCaptureHintCp=Math.max(0,...SpellChessMoveGenerator.getLegalCaptures({...next,activePlayer:player},topology).map(m=>{
            const victim=next.boardEntities[next.occupancy[asCoordinateKey(m.to)]];
            const attacker=next.boardEntities[asEntityId(m.pieceId)];
            return victim?.type==='PIECE'&&victim.metadata?.isFrozen?
              victim.variantId==='KING'?1000:(SpellChessMaterialSafety.values[victim.variantId]??0)-(attacker?.type==='PIECE'?SpellChessMaterialSafety.values[attacker.variantId]??0:0):0;
          }));
        }
        d.materialSafetyChecked = true;
        d.replyCoverage = 'CAPTURES_ONLY';
        d.materialBalanceAfterRepliesCp = material.score;
        d.materialResourceBalanceCp = material.resourceScore;
        d.materialOutcome = material.outcome;
        d.materialLossCp = material.outcome === 'DRAW' ? 0 : Math.max(0, rootMaterial - material.score);
        d.tacticalReplyCount = material.repliesExamined;
        d.tacticalVariation = material.line;
        d.captureRefutations = material.refutedCaptures;
        d.counterFreezeRepliesSearched = material.spellRepliesExamined?.FREEZE ?? 0;
        d.opponentBestReply = reply ?? material.reply;
        d.score = next.isGameOver ? this.terminal(next, player, 1)! : reply ? -MATE + 2 :
          material.outcome ? material.score :
          -this.evaluate(next, topology, 1) + material.score - SpellChessMaterialSafety.balance(next, player) +
          (material.resourceScore ?? SpellChessResources.inventory(next, player)) - SpellChessResources.inventory(next, player);
        children.push({ action, state: next, diagnostic: d });
      } catch (error) {
        if (error instanceof SearchTimeout) {
          this.timedOut = performance.now()>=this.deadline; rootExhausted = false;
          d.rejectionReason = 'Budget expired during material inspection; candidate excluded'; break;
        }
        d.legal = false; d.rejectionReason = String(error);
        // A generated action rejected by the shared rules is a structural error, never a manual move.
        throw new Error(`Spell simulation rejected ${JSON.stringify(action)}: ${String(error)}`);
      }
    }
    if (!children.length) throw new Error('No validated Spell Chess candidate.');
    this.timedOut ||= performance.now() >= this.deadline;
    const safe = children.filter((c) => !c.diagnostic.allowsImmediateKingCapture);
    const candidates = (safe.length ? safe : children).sort((a, b) => b.diagnostic.score - a.diagnostic.score);
    // Legal move generation stays exhaustive. Only deep investigation uses a bounded root shortlist.
    const selected = candidates.length<=8?candidates:['NONE','FREEZE','JUMP'].flatMap(type=>
      candidates.filter(c=>c.action.spell.type===type).sort((a,b)=>
        type==='FREEZE'?(b.diagnostic.followUpCaptureHintCp??0)-(a.diagnostic.followUpCaptureHintCp??0)||b.diagnostic.score-a.diagnostic.score:b.diagnostic.score-a.diagnostic.score).slice(0,2));
    const deepCandidates = [...selected].sort((a,b)=>Number(b.action.spell.type==='NONE')-Number(a.action.spell.type==='NONE')||b.diagnostic.score-a.diagnostic.score);
    const deepVisited = new Set<(typeof children)[number]>();
    let best = candidates[0];
    let score = best.diagnostic.score;
    let pv = [best.action, ...(best.diagnostic.tacticalVariation ?? [])];
    let completedDepth = immediate || rootExhausted ? 1 : 0;
    if (completedDepth === 1) for (const child of children) child.diagnostic.completedDepth = 1;
    if (!immediate && !this.timedOut) for (let depth = 2; depth <= maxDepth; depth++) {
      let iterationBest = best;
      let iterationScore = -Infinity;
      let rootAlpha = -Infinity;
      let iterationPV: SpellChessTurnAction[] = [];
      const iterationDiagnostics: Array<{ d: CandidateDiagnostic; value: NodeResult }> = [];
      try {
        for (const child of deepCandidates) {
          this.checkTime(); deepVisited.add(child);
          const value = child.diagnostic.allowsImmediateKingCapture
            ? { score: MATE - 2, pv: [child.diagnostic.opponentBestReply!], fullWidth:true, searchedReplies:1, freezeReplies:0 }
            : this.negamax(child.state, topology, depth - 1, -Infinity, -rootAlpha, 1);
          iterationDiagnostics.push({ d: child.diagnostic, value });
          if (-value.score > iterationScore) { iterationScore = -value.score; iterationBest = child; iterationPV = [child.action, ...value.pv]; }
          rootAlpha = Math.max(rootAlpha, -value.score);
        }
        best = iterationBest; score = iterationScore; pv = iterationPV; completedDepth = depth;
        for (const { d, value } of iterationDiagnostics) { d.score = -value.score; d.completedDepth = depth; d.opponentBestReply = value.pv[0]; d.tacticalVariation=value.pv; d.replyCoverage=value.fullWidth?'FULL_TURN':'ALPHA_BETA_BOUND'; d.opponentRepliesSearched=value.searchedReplies??0; d.counterFreezeRepliesSearched=value.freezeReplies??0; }
        candidates.sort((a, b) => b.diagnostic.score - a.diagnostic.score);
        if (Math.abs(score) >= MATE - 20) break;
      } catch (error) { if (!(error instanceof SearchTimeout)) throw error; this.timedOut = true; break; }
    }
    const normals = children.filter(c=>c.action.spell.type==='NONE'&&!c.diagnostic.allowsImmediateKingCapture&&
      (c.diagnostic.materialLossCp??Infinity)<=200);
    const normal = [...normals].sort((a,b)=>b.diagnostic.completedDepth-a.diagnostic.completedDepth||b.diagnostic.score-a.diagnostic.score)[0];
    let reason: import('./SpellChessTurnAction').SpellStrategicDecisionAudit['selectionReason'] = best.state.isGameOver&&best.state.winnerId===player?
      'IMMEDIATE_VICTORY':best.action.spell.type==='NONE'?'BEST_INSPECTED_NORMAL_ACTION':normal?'MATCHED_SEARCH_ADVANTAGE':'ONLY_INSPECTED_SAFE_ACTION';
    if(best.action.spell.type!=='NONE'&&normal&&!best.state.isGameOver){
      const matched=best.diagnostic.completedDepth>=2&&best.diagnostic.completedDepth===normal.diagnostic.completedDepth&&
        best.diagnostic.replyCoverage==='FULL_TURN'&&normal.diagnostic.replyCoverage==='FULL_TURN'&&best.diagnostic.score>normal.diagnostic.score;
      const materialGain=(best.diagnostic.materialBalanceAfterRepliesCp??-Infinity)+(best.diagnostic.materialResourceBalanceCp??0)>
        (normal.diagnostic.materialBalanceAfterRepliesCp??Infinity)+(normal.diagnostic.materialResourceBalanceCp??0)&&best.diagnostic.capturedMaterialCp>0;
      if(!matched&&!materialGain){best=normal;score=normal.diagnostic.score;pv=[normal.action,...(normal.diagnostic.tacticalVariation??[])];reason='CONSERVE_RESOURCE_UNPROVED_GAIN';}
      else if(materialGain&&!matched)reason='TACTICAL_MATERIAL_GAIN';
    }
    if(!safe.length)reason='UNAVOIDABLE_INSPECTED_LOSS';
    // If only capture inspection fit, record an actual normal reply after expiry as a selective probe.
    // It does not masquerade as an exhaustive reply search or increase the reported depth.
    if(pv.length<2&&!best.state.isGameOver){
      let replyScore=Infinity,replyAction:SpellChessTurnAction|undefined;
      for(const move of RulesEngine.getLegalMoves(best.state,topology)){
        const action:SpellChessTurnAction={spell:{type:'NONE'},move};
        const next=SpellChessSimulation.run(best.state,action,topology);this.nodes++;
        const value=this.terminal(next,player,2)??SpellChessProfiler.measure('evaluation',()=>SpellChessPositionEvaluator.evaluate(next,player,topology,
          SpellChessSearch.resources(next,player),SpellChessSearch.resources(next,opposite(player))));
        if(value<replyScore){replyScore=value;replyAction=action;}
      }
      if(replyAction){pv=[best.action,replyAction];best.diagnostic.opponentBestReply=replyAction;best.diagnostic.replyCoverage='NORMAL_AND_CAPTURES';}
    }
    const group=(type:string)=>[...children].filter(c=>c.action.spell.type===type)
      .sort((a,b)=>b.diagnostic.completedDepth-a.diagnostic.completedDepth||b.diagnostic.score-a.diagnostic.score)[0]?.diagnostic;
    const without=group('NONE');
    const resourceCost=SpellChessStrategicAudit.resourceCost(root,best.state,best.action,player,topology);
    const freezeImpact=SpellChessStrategicAudit.freezeImpact(root,best.state,best.diagnostic,without,pv,player,topology);
    this.timedOut ||= performance.now() >= this.deadline;
    completedDepth=best.diagnostic.completedDepth;
    const elapsedMs = performance.now() - start;
    profile.unattributedMs=Math.max(0,elapsedMs-profile.simulationMs-profile.evaluationMs-profile.generationMs-profile.hashMs);
    SpellChessProfiler.end();
    return { bestAction: best.action, evaluationCentipawns: score, depthReached: completedDepth,
      nodesEvaluated: this.nodes, elapsedMs, trace: { engine: 'SPELL_COMPOSITE', depthReached: completedDepth,
        nodesSearched: this.nodes, elapsedMs, legalTurnActionsConsidered: diagnostics.length,
        chosenAction: best.action, principalVariation: pv, candidates: diagnostics, timedOut: this.timedOut,
        fallbackUsed: false, quiescenceNodes: this.qnodes,
        rootFullyEnumerated: rootExhausted, materialInspectionCompleted: true,
        exchangePlyLimit: 3, profile,
        strategicAudit:{depthCompleted:best.diagnostic.completedDepth,rootCandidatesGenerated:rootGenerated,
          rootCandidatesSearched:children.length,rootCandidatesDeepSearched:deepVisited.size,
          rootReplyCoverage:rootExhausted&&children.every(c=>c.diagnostic.replyCoverage==='FULL_TURN')?'EXHAUSTIVE':'SELECTIVE',
          nodesSearched:this.nodes,searchTimeMs:elapsedMs,bestWithoutSpell:SpellChessStrategicAudit.alternative(without),
          bestWithFreeze:SpellChessStrategicAudit.alternative(group('FREEZE')),bestWithJump:SpellChessStrategicAudit.alternative(group('JUMP')),
          chosenAction:best.action,principalVariation:pv,opponentBestReply:pv[1]??null,spellResourceCost:resourceCost,freezeImpact,
          tacticalSafetyChecked:true,completedOpponentReply:pv.length>1,replyCoverage:best.diagnostic.replyCoverage??'CAPTURES_ONLY',
          timeoutOccurred:this.timedOut,fallbackUsed:false,selectionReason:reason},
        topCandidates: [...diagnostics].filter((d) => d.materialSafetyChecked).sort((a, b) => b.score - a.score).slice(0, 5)
          .map((d) => ({ spell: d.action.spell, move: `${d.action.move.from}->${d.action.move.to}`, score: d.score })) } };
  }

  private terminal(domain: IDomainState, player: PlayerId, ply: number): number | undefined {
    if (!domain.isGameOver) return undefined;
    return domain.winnerId === null ? 0 : domain.winnerId === player ? MATE - ply : -MATE + ply;
  }
  private evaluate(domain: IDomainState, topology: ITopology, ply: number): number {
    return SpellChessProfiler.measure('evaluation',()=>SpellChessPositionEvaluator.evaluate(domain, domain.activePlayer, topology,
      SpellChessSearch.resources(domain, domain.activePlayer), SpellChessSearch.resources(domain, opposite(domain.activePlayer)), [], [], ply));
  }
  private negamax(domain: IDomainState, topology: ITopology, depth: number, alpha: number, beta: number, ply: number): NodeResult {
    this.checkTime(); this.nodes++;
    const terminal = this.terminal(domain, domain.activePlayer, ply);
    if (terminal !== undefined) return { score: terminal, pv: [], fullWidth:true, searchedReplies:0, freezeReplies:0 };
    const immediate = SpellChessMoveGenerator.findKingCapture(domain, domain.activePlayer, topology);
    if (immediate) return { score: MATE - ply - 1, pv: [immediate], fullWidth:true, searchedReplies:1, freezeReplies:0 };
    if (depth <= 0) return this.quiescence(domain, topology, alpha, beta, ply, 2);
    const originalAlpha = alpha, originalBeta = beta;
    const key = SpellChessProfiler.measure('hash',()=>this.tt.computeKey(domain, domain.activePlayer, SpellChessSearch.resources(domain, 'P1'), SpellChessSearch.resources(domain, 'P2'), [], []));
    const cached = this.tt.get(key);
    if (cached && cached.depth >= depth && (cached.flag === 'EXACT' ||
      (cached.flag === 'LOWERBOUND' && cached.score >= beta) || (cached.flag === 'UPPERBOUND' && cached.score <= alpha))) {
      return { score: cached.score, pv: cached.principalVariation ?? [], fullWidth:cached.flag==='EXACT', searchedReplies:0,freezeReplies:0 };
    }
    const actions = SpellChessMoveGenerator.iterateTurnActions(domain, domain.activePlayer, topology, SpellChessSearch.resources(domain, domain.activePlayer));
    let best: NodeResult = { score: -Infinity, pv: [] };
    let fullWidth=true,searchedReplies=0,freezeReplies=0;
    for (const action of actions) {
      this.checkTime();
      searchedReplies++;if(action.spell.type==='FREEZE')freezeReplies++;
      const next = SpellChessSimulation.run(domain, action, topology);
      const value = this.negamax(next, topology, depth - 1, -beta, -alpha, ply + 1);
      if (-value.score > best.score) best = { score: -value.score, pv: [action, ...value.pv] };
      alpha = Math.max(alpha, best.score);
      if (alpha >= beta) {fullWidth=false;break;}
    }
    if (best.score === -Infinity) return { score: this.evaluate(domain, topology, ply), pv: [] };
    this.tt.set(key, { key, depth, score: best.score, bestAction: best.pv[0], principalVariation: best.pv,
      flag: best.score <= originalAlpha ? 'UPPERBOUND' : best.score >= originalBeta ? 'LOWERBOUND' : 'EXACT' });
    return {...best,fullWidth,searchedReplies,freezeReplies};
  }
  private quiescence(domain: IDomainState, topology: ITopology, alpha: number, beta: number, ply: number, remaining: number): NodeResult {
    this.checkTime(); this.qnodes++;
    const terminal = this.terminal(domain, domain.activePlayer, ply);
    if (terminal !== undefined) return { score: terminal, pv: [], fullWidth:true, searchedReplies:0, freezeReplies:0 };
    const win = SpellChessMoveGenerator.findKingCapture(domain, domain.activePlayer, topology);
    if (win) return { score: MATE - ply - 1, pv: [win] };
    // Threat probe only: expire effects at this turn's boundary, without adjudicating a null move.
    const probe = OfficialSpellRules.sync({ ...domain, activePlayer: opposite(domain.activePlayer),
      metadata: { ...domain.metadata, hasCastSpellThisTurn: false } }, OfficialSpellEngine.advanceTurn(
      OfficialSpellRules.getState(domain), domain.activePlayer === 'P1' ? 'WHITE' : 'BLACK'));
    const royalThreat = Boolean(SpellChessMoveGenerator.findKingCapture(probe, probe.activePlayer, topology));
    const majorThreat = OfficialSpellRules.pieces(domain).some((p) => p.ownerId === domain.activePlayer &&
      (SpellChessMaterialSafety.values[p.variantId] ?? 0) >= 500 &&
      SpellChessMoveGenerator.findCapture(probe, probe.activePlayer, topology, p.position));
    const threatened = royalThreat || majorThreat;
    const standPat = this.evaluate(domain, topology, ply);
    if (remaining === 0) {
      if (!threatened) return { score: standPat, pv: [] };
      // A hypothetical pass is an ordering probe, never a proof of unavoidable mate.
      // Execute an actual evasion before assessing the opponent's captures at the horizon.
      let leaf:NodeResult={score:-Infinity,pv:[]};
      for(const action of SpellChessMoveGenerator.iterateTurnActions(domain,domain.activePlayer,topology,SpellChessSearch.resources(domain,domain.activePlayer))){
        this.checkTime();this.nodes++;
        const next=SpellChessSimulation.run(domain,action,topology);
        const material=SpellChessMaterialSafety.inspect(next,domain.activePlayer,topology,()=>this.checkTime(),undefined,2,ply+1,0,action.move.to);
        this.nodes+=material.simulations;
        const value=material.outcome?material.score:-this.evaluate(next,topology,ply+1)+material.score-
          SpellChessMaterialSafety.balance(next,domain.activePlayer)+(material.resourceScore??SpellChessResources.inventory(next,domain.activePlayer))-
          SpellChessResources.inventory(next,domain.activePlayer);
        if(value>leaf.score)leaf={score:value,pv:[action,...material.line]};
        alpha=Math.max(alpha,leaf.score);if(alpha>=beta)break;
      }
      return leaf.score===-Infinity?{score:standPat,pv:[]}:leaf;
    }
    let best: NodeResult = { score: threatened ? -Infinity : standPat, pv: [] };
    if (!threatened) { if (standPat >= beta) return best; alpha = Math.max(alpha, standPat); }
    // Quiet evasions and defensive Freeze are necessary when a major piece is hanging too.
    const resources = SpellChessSearch.resources(domain, domain.activePlayer);
    const actions = SpellChessMoveGenerator.iterateTurnActions(domain, domain.activePlayer, topology,
      resources, [], [], undefined, !threatened);
    for (const action of actions) {
      this.checkTime(); this.nodes++;
      const next = SpellChessSimulation.run(domain, action, topology);
      const reply = this.quiescence(next, topology, -beta, -alpha, ply + 1, remaining - 1);
      if (-reply.score > best.score) best = { score: -reply.score, pv: [action, ...reply.pv] };
      alpha = Math.max(alpha, best.score);
      if (alpha >= beta) break;
    }
    return best.score === -Infinity ? { score: 0, pv: [] } : best;
  }
  private checkTime(): void { if (performance.now() >= this.deadline) throw new SearchTimeout(); }
}

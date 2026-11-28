import { SpellChessSimulation } from './SpellChessSimulation';
import { SpellChessProfiler } from './SpellChessProfiler';
import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessMoveGenerator } from './SpellChessMoveGenerator';
import { SpellChessTurnAction, SpellResources } from './SpellChessTurnAction';
import { SPELL_CHESS_MATE_SCORE } from './SpellChessPositionEvaluator';
import { SpellChessResources } from './SpellChessResources';
import { OfficialSpellEngine } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { asCoordinateKey } from '../../../../core/coordinates';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';

export interface MaterialInspection {
  score: number;
  reply?: SpellChessTurnAction;
  line: SpellChessTurnAction[];
  repliesExamined: number;
  simulations: number;
  outcome?: 'WIN' | 'LOSS' | 'DRAW';
  resourceScore?: number;
  refutedCaptures?: Array<{attempt:SpellChessTurnAction;response:SpellChessTurnAction[];scoreCp:number;resourceCp:number}>;
  spellRepliesExamined?: {NONE:number;FREEZE:number;JUMP:number};
}

/** Legal, spell-aware exchange search. Geometry alone never proves a capture or recapture. */
export class SpellChessMaterialSafety {
  private static cache?:WeakMap<IDomainState,Map<string,MaterialInspection>>;
  public static beginCache():void{this.cache=new WeakMap();}
  public static endCache():void{this.cache=undefined;}
  public static readonly values: Readonly<Record<string, number>> = { PAWN: 100, KNIGHT: 320, BISHOP: 330, ROOK: 500, QUEEN: 900, KING: 0 };

  public static balance(domain: IDomainState, player: PlayerId): number {
    return OfficialSpellRules.pieces(domain).reduce((sum, p) => sum +
      (p.ownerId === player ? 1 : -1) * (this.values[p.variantId] ?? 0), 0);
  }

  public static resources(domain: IDomainState): SpellResources {
    const s = OfficialSpellRules.getState(domain);
    const c = domain.activePlayer === 'P1' ? s.whiteCharges : s.blackCharges;
    return { freezeRemaining: c.freezeCharges, jumpRemaining: c.jumpCharges,
      freezeCooldown: c.freezeCooldownTurns, jumpCooldown: c.jumpCooldownTurns };
  }

  /** At most three capture plies, including recaptures and terminal counterattacks anywhere. */
  public static inspect(domain: IDomainState, player: PlayerId, topology: ITopology,
    checkTime: () => void = () => {}, targetSquare?: string, remaining = 3, ply = 1, tempoExtensions = 1, tempoTarget?:string): MaterialInspection {
    const key=JSON.stringify([player,targetSquare,remaining,ply,tempoExtensions,tempoTarget]);
    const cached=this.cache?.get(domain)?.get(key);
    if(cached){SpellChessProfiler.hit('material');return {...cached,simulations:0,repliesExamined:0,spellRepliesExamined:{NONE:0,FREEZE:0,JUMP:0}};}
    const result=this.inspectImpl(domain,player,topology,checkTime,targetSquare,remaining,ply,tempoExtensions,tempoTarget);
    if(this.cache){let entries=this.cache.get(domain);if(!entries){entries=new Map();this.cache.set(domain,entries);}entries.set(key,result);}
    return result;
  }
  private static inspectImpl(domain:IDomainState,player:PlayerId,topology:ITopology,checkTime:()=>void,
    targetSquare:string|undefined,remaining:number,ply:number,tempoExtensions:number,tempoTarget?:string):MaterialInspection {
    const terminal = domain.isGameOver ? domain.winnerId === null ? 0 :
      domain.winnerId === player ? SPELL_CHESS_MATE_SCORE - ply : -SPELL_CHESS_MATE_SCORE + ply : undefined;
    if (terminal !== undefined) return { score: terminal, line: [], repliesExamined: 0, simulations: 0,
      outcome: domain.winnerId === null ? 'DRAW' : domain.winnerId === player ? 'WIN' : 'LOSS' };
    const win = SpellChessMoveGenerator.findKingCapture(domain, domain.activePlayer, topology);
    if (win) return { score: domain.activePlayer === player ? SPELL_CHESS_MATE_SCORE - ply - 1 : -SPELL_CHESS_MATE_SCORE + ply + 1,
      reply: win, line: [win], repliesExamined: 1, simulations: 0, outcome: domain.activePlayer === player ? 'WIN' : 'LOSS' };
    let best: MaterialInspection = { score: this.balance(domain, player), resourceScore: SpellChessResources.inventory(domain, player), line: [], repliesExamined: 0, simulations: 0,
      refutedCaptures:[],spellRepliesExamined:{NONE:0,FREEZE:0,JUMP:0} };
    if (!remaining) return best;
    const maximize = domain.activePlayer === player;
    const standUtility = this.utility(best);
    // Standing pat means declining a local exchange, not declaring the actual position quiet.
    for (const action of SpellChessMoveGenerator.iterateTurnActions(domain, domain.activePlayer, topology,
      this.resources(domain), [], [], undefined, true, targetSquare)) {
      checkTime();
      const next = SpellChessSimulation.run(domain, action, topology);
      const immediateScore = this.balance(next, player);
      // A capture which cannot worsen the current bound needs no recapture expansion.
      // Terminal replies still take precedence over material.
      const kingReply = SpellChessMoveGenerator.findKingCapture(next, next.activePlayer, topology);
      let value: MaterialInspection;
      const immediateUtility = immediateScore + SpellChessResources.inventory(next, player);
      if (!next.isGameOver && !kingReply && (maximize ? immediateUtility <= this.utility(best) : immediateUtility >= this.utility(best))) {
        value = { score: immediateScore, resourceScore: SpellChessResources.inventory(next, player), line: [], repliesExamined: 0, simulations: 0 };
      } else value = this.inspect(next, player, topology, checkTime, action.move.to, remaining - 1, ply + 1, tempoExtensions);
      best.repliesExamined++; best.simulations += 1 + value.simulations;
      best.spellRepliesExamined![action.spell.type]++;
      if (value.line.some(a=>a.spell.type==='FREEZE') && (maximize?this.utility(value)<=standUtility:this.utility(value)>=standUtility) && (best.refutedCaptures?.length??0)<3)
        best.refutedCaptures!.push({attempt:action,response:value.line,scoreCp:value.score,resourceCp:value.resourceScore??0});
      if (maximize ? this.utility(value) > this.utility(best) : this.utility(value) < this.utility(best)) {
        best = { ...best, score: value.score, resourceScore: value.resourceScore, reply: action, line: [action, ...value.line], outcome: value.outcome };
      }
    }
    if ((tempoTarget??targetSquare) && tempoExtensions > 0) best = this.counterFreezeBridge(domain, player, topology, (tempoTarget??targetSquare)!, best, checkTime, ply);
    return best;
  }

  public static utility(value: MaterialInspection): number { return value.score + (value.outcome ? 0 : value.resourceScore ?? 0); }

  /** One full waiting cycle, only when a frozen recapturer becomes legal after expiration. */
  private static counterFreezeBridge(domain: IDomainState, player: PlayerId, topology: ITopology, target: string,
    initial: MaterialInspection, checkTime: () => void, ply: number): MaterialInspection {
    const spells = OfficialSpellRules.getState(domain), acting = domain.activePlayer;
    const charges = acting === 'P1' ? spells.whiteCharges : spells.blackCharges;
    const victim = domain.boardEntities[domain.occupancy[asCoordinateKey(target)]];
    if (!victim || victim.type !== 'PIECE' || victim.ownerId === acting || domain.metadata?.hasCastSpellThisTurn ||
      charges.freezeCharges <= 0 || charges.freezeCooldownTurns > 0) return initial;
    const frozen = new Set<string>(OfficialSpellRules.pieces(domain).filter(p => p.ownerId === acting && p.metadata?.isFrozen).map(p => p.id));
    if (!frozen.size) return initial;
    const thawed = OfficialSpellRules.sync(domain, OfficialSpellEngine.advanceTurn(spells, acting === 'P1' ? 'WHITE' : 'BLACK'));
    if (![...SpellChessMoveGenerator.findCaptures(thawed, acting, topology, target)].some(a => frozen.has(a.move.pieceId))) return initial;
    const maximize = acting === player;
    const [tx,ty] = target.split(',').map(Number);
    const royalTarget=victim.variantId==='KING';
    const localRecovery = (royalTarget?SPELL_CHESS_MATE_SCORE:this.values[victim.variantId] ?? 0) + ((acting === 'P1' ? ty === 7 : ty === 0) ? 800 : 0);
    const recoveryBound = this.balance(domain, player) + SpellChessResources.inventory(domain, player) +
      (maximize ? localRecovery - SpellChessResources.freezeCp : -localRecovery + SpellChessResources.freezeCp);
    if (!royalTarget&&(maximize ? this.utility(initial) >= recoveryBound : this.utility(initial) <= recoveryBound)) return initial;
    let best = initial;
    const seen = new Set<string>();
    for (let x = Math.max(0,tx-1); x <= Math.min(7,tx+1); x++) for (let y = Math.max(0,ty-1); y <= Math.min(7,ty+1); y++) {
      checkTime();
      const spell = { type: 'FREEZE' as const, targetSquare: `${x},${y}` };
      let cast: IDomainState;
      try { cast = SpellChessProfiler.measure('generation',()=>OfficialSpellRules.cast(domain, spell, acting)); } catch { continue; }
      const signature = JSON.stringify(OfficialSpellRules.getState(cast).activeFrozenPieceIds);
      if (seen.has(signature)) continue;
      seen.add(signature);
      const opponent:PlayerId=acting==='P1'?'P2':'P1';
      const potentialReplyState={...cast,activePlayer:opponent,metadata:{...cast.metadata,hasCastSpellThisTurn:false}};
      const quietRays=SpellChessProfiler.measure('generation',()=>RulesEngine.getLegalMoves(potentialReplyState,topology)).filter(m=>!m.isCapture)
        .map(m=>SpellChessThreatAnalyzer.quietRoyalRay(potentialReplyState,m)).filter(path=>path.length);
      const waitingPriority=(move:{from:string;to:string})=>quietRays.reduce((score,path)=>score+Number(path.includes(move.to))-Number(path.includes(move.from)),0);
      const waits=SpellChessProfiler.measure('generation',()=>RulesEngine.getLegalMoves(cast, topology)).sort((a,b)=>waitingPriority(b)-waitingPriority(a));
      for (const move of waits) {
        if (move.isCapture || move.isPromotion) continue;
        checkTime();
        const wait: SpellChessTurnAction = { spell, move };
        const next = SpellChessSimulation.run(domain, wait, topology);
        best.simulations++;
        if (next.isGameOver) {
          const value = this.inspect(next,player,topology,checkTime,undefined,0,ply+1,0);
          if (maximize ? this.utility(value)>this.utility(best) : this.utility(value)<this.utility(best))
            best={...value,reply:wait,line:[wait],simulations:best.simulations};
          if (best.outcome===(maximize?'WIN':'LOSS')||(!royalTarget&&(maximize ? this.utility(best)>=recoveryBound : this.utility(best)<=recoveryBound))) return best;
          continue;
        }
        if (SpellChessMoveGenerator.findKingCapture(next, next.activePlayer, topology)) continue;
        if (!SpellChessMoveGenerator.findCapture({ ...next, activePlayer: acting }, acting, topology, target)) continue;
        let worst: MaterialInspection | undefined;
        let count = 0;
        for (const reply of SpellChessMoveGenerator.iterateTurnActions(next, next.activePlayer, topology, this.resources(next))) {
          checkTime();
          const afterReply = SpellChessSimulation.run(next, reply, topology);
          // Search local recaptures at both changed squares, not every unrelated exchange.
          // This is a conservative recovery proof: extra defensive options may improve it.
          const targets = new Set([target, reply.move.to]);
          let value: MaterialInspection | undefined;
          for (const square of targets) {
            const candidate = this.inspect(afterReply, player, topology, checkTime, square, 3, ply + 2, 0);
            count += candidate.simulations;
            if (!value || (maximize ? this.utility(candidate) > this.utility(value) : this.utility(candidate) < this.utility(value))) value = candidate;
          }
          if (!value) continue;
          count++;
          if (!worst || (maximize ? this.utility(value) < this.utility(worst) : this.utility(value) > this.utility(worst))) {
            worst = { ...value, line: [wait, reply, ...value.line] };
          }
          if (maximize ? this.utility(worst) <= this.utility(best) : this.utility(worst) >= this.utility(best)) break;
        }
        best.simulations += count;
        if (worst && (maximize ? this.utility(worst) > this.utility(best) : this.utility(worst) < this.utility(best))) {
          best = { ...worst, reply: wait, simulations: best.simulations, repliesExamined: best.repliesExamined + 1 };
          // This extension proves a sufficient local recovery, not a global quiet-move optimum.
          if (best.outcome===(maximize?'WIN':'LOSS')||(!royalTarget&&(maximize ? this.utility(best) >= recoveryBound : this.utility(best) <= recoveryBound))) return best;
        }
      }
    }
    return best;
  }
}

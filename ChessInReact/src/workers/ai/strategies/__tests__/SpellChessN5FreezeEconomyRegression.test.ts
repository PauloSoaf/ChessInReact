import {beforeAll,describe,expect,it} from 'vitest';
import {IDomainState} from '../../../../core/state/gameState';
import {RulesEngine} from '../../../../engine/rules/RulesEngine';
import {OfficialSpellRules as R} from '../../../../engine/variants/spells/OfficialSpellRules';
import {OfficialSpellEngine} from '../../../../engine/variants/spells/OfficialSpellEngine';
import {SpellOptimizationStrategy} from '../SpellOptimizationStrategy';
import {SpellChessTurnAction} from '../spell/SpellChessTurnAction';
import {SpellChessMaterialSafety as S} from '../spell/SpellChessMaterialSafety';
import {SpellChessPositionEvaluator as E} from '../spell/SpellChessPositionEvaluator';
import {SpellChessMoveGenerator as G} from '../spell/SpellChessMoveGenerator';
import {SpellChessSearch} from '../spell/SpellChessSearch';
import {freezeEconomyImage,imageAction,offensiveFreezeFixture} from '../spell/testing/FreezeEconomyFixtures';
import {materialTopology as t,materialTrap} from '../spell/testing/MaterialSafetyFixtures';
import {addPiece,mirrorColors,queenTrap} from '../spell/testing/KingSafetyFixtures';
import {createDefaultDomainState} from '../../../../core/state/initialState';

const decide=(d:IDomainState,budget=500)=>new SpellOptimizationStrategy().decideMove({domain:d,topology:t,matchId:d.matchId,
 variantId:d.variantId,actingPlayer:d.activePlayer,difficultyLevel:5,timeBudgetMs:budget,legalMoves:RulesEngine.getLegalMoves(d,t)});
const actionOf=(d:ReturnType<typeof decide>):SpellChessTurnAction=>({move:d.move,spell:d.secondaryAction?
 {type:d.secondaryAction.payload.spellType as 'FREEZE'|'JUMP',targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}});
const safe=(d:IDomainState,a:SpellChessTurnAction)=>{const n=R.simulate(d,a,t);expect(G.findKingCapture(n,n.activePlayer,t)).toBeUndefined();return n;};
const imageDecisions=new Map<boolean,ReturnType<typeof decide>>();
beforeAll(()=>{for(const mirror of [false,true])imageDecisions.set(mirror,decide(freezeEconomyImage(mirror),2500));},20000);

describe('PATCH-14: real Freeze economy, expiry and adversarial replies',()=>{
 for(const mirror of [false,true]){
  it(`image: preserves Freeze unless a matched search demonstrates marginal gain, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),r=imageDecisions.get(mirror)!,audit=r.spellTrace!.strategicAudit!;
   expect(r.spellTrace?.engine).toBe('SPELL_COMPOSITE');expect(r.fallbackUsed).toBe(false);
   safe(d,actionOf(r));expect(audit.bestWithoutSpell).not.toBeNull();
   if(actionOf(r).spell.type==='FREEZE'){
    expect(audit.freezeImpact?.provedBySearch).toBe(true);expect(audit.freezeImpact?.expectedNetBenefitCp).toBeGreaterThan(0);
   }else expect(actionOf(r).spell.type).toBe('NONE');
   expect(audit.completedOpponentReply).toBe(true);
  });
  it(`Bxc6 and bxc6 are executable and preserve the defended exchange, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),a=imageAction(d,'6,7','5,5',{type:'NONE'},mirror),after=R.simulate(d,a,t);
   const cap=imageAction(after,'1,4','2,5',{type:'NONE'},mirror),taken=R.simulate(after,cap,t);
   const rec=imageAction(taken,'1,6','2,5',{type:'NONE'},mirror),end=R.simulate(taken,rec,t);
   expect(S.balance(end,d.activePlayer)-S.balance(d,d.activePlayer)).toBe(10);
  });
  it(`a temporary field earns no stable positional bonus, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),none=R.simulate(d,imageAction(d,'6,7','5,5',{type:'NONE'},mirror),t),
    frozen=R.simulate(d,imageAction(d,'6,7','5,5',{type:'FREEZE',targetSquare:'0,3'},mirror),t);
   const explain=(s:IDomainState)=>E.explain(s,d.activePlayer,t,SpellChessSearch.resources(s,d.activePlayer),SpellChessSearch.resources(s,none.activePlayer));
   const a=explain(none),b=explain(frozen);
   for(const key of ['material','mobility','development','coordination','pawnStructure','openFiles','kingSafety','exposure'] as const)expect(b[key]).toBe(a[key]);
   expect(b.inventory+b.readiness).toBeLessThan(a.inventory+a.readiness);
  });
  it(`image Freeze+a6 can produce a capture, but counter-Freeze can stop that plan, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),a=R.simulate(d,imageAction(d,'0,6','0,5',{type:'FREEZE',targetSquare:'0,3'},mirror),t);
   const waiting=imageAction(a,'4,2','4,3',{type:'NONE'},mirror),ready=R.simulate(a,waiting,t);
   const capture=imageAction(ready,'0,5','1,4',{type:'NONE'},mirror);
   expect(()=>R.simulate(ready,capture,t)).not.toThrow();
   const counter=imageAction(a,'4,2','4,3',{type:'FREEZE',targetSquare:'0,5'},mirror),held=R.simulate(a,counter,t);
   expect(()=>R.simulate(held,imageAction(held,'0,5','1,4',{type:'NONE'},mirror),t)).toThrow();
  });
  it(`own pieces frozen by a speculative field provide no free mobility advantage, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),s=R.simulate(d,imageAction(d,'6,7','5,5',{type:'FREEZE',targetSquare:'4,6'},mirror),t);
   expect(R.pieces(s).some(p=>p.ownerId===d.activePlayer&&p.metadata?.isFrozen)).toBe(true);
   const audit=imageDecisions.get(mirror)!.spellTrace!.strategicAudit!;
   expect(audit.spellResourceCost).toBe(0);
  });
  it(`last charge is conserved in the image rather than banned by move number, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),s=R.getState(d),key=d.activePlayer==='P1'?'whiteCharges':'blackCharges';
   const state=R.sync(d,{...s,[key]:{...s[key],freezeCharges:1}}),r=decide(state,400);
   safe(state,actionOf(r));if(actionOf(r).spell.type==='FREEZE')expect(r.spellTrace?.strategicAudit?.freezeImpact?.provedBySearch).toBe(true);
  });
  it(`cooldown one expires on the caster's completed turn, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),s=R.getState(d),key=d.activePlayer==='P1'?'whiteCharges':'blackCharges';
   const state=R.sync(d,{...s,[key]:{...s[key],freezeCooldownTurns:1}}),r=decide(state,300);
   expect(actionOf(r).spell.type).not.toBe('FREEZE');const next=safe(state,actionOf(r));
   expect(R.getState(next)[key].freezeCooldownTurns).toBe(0);
  });
  it(`offensive Freeze can win a real opening tempo when counter-Freeze is unavailable, mirror=${mirror}`,()=>{
   const d=freezeEconomyImage(mirror),s=R.getState(d),enemyKey=d.activePlayer==='P1'?'blackCharges':'whiteCharges';
   const state=R.sync(d,{...s,[enemyKey]:{...s[enemyKey],freezeCharges:0,jumpCharges:0}}),r=decide(state,2500);
   safe(state,actionOf(r));
   if(actionOf(r).spell.type==='FREEZE'){
    const impact=r.spellTrace!.strategicAudit!.freezeImpact!;
    expect(impact.provedBySearch||impact.materialSavedCp!>0||impact.materialWonCp!>0).toBe(true);
   }
  },10000);
  it(`uses Freeze offensively when it forces king capture, including the last charge, mirror=${mirror}`,()=>{
   const d=offensiveFreezeFixture({lastCharge:true},mirror),r=decide(d,1200),a=actionOf(r),n=safe(d,a);
   expect(a.spell.type).toBe('FREEZE');expect(n.isGameOver).toBe(false);
   const replies=G.generateTurnActions(n,n.activePlayer,t,SpellChessSearch.resources(n,n.activePlayer));
   expect(replies.length).toBeGreaterThan(0);
   for(const reply of replies){const after=R.simulate(n,reply,t);expect(G.findKingCapture(after,after.activePlayer,t)).toBeDefined();}
  },10000);
  it(`counter-Freeze is an actual defensive reply, not an imaginary permanent freeze, mirror=${mirror}`,()=>{
   const d=offensiveFreezeFixture({counterFreeze:1,lastCharge:true},mirror),a=imageAction(d,'0,0','0,6',{type:'FREEZE',targetSquare:'0,7'},mirror);
   const n=R.simulate(d,a,t),proof=S.inspect(n,d.activePlayer,t,()=>{},undefined,3,1,1,a.move.to);
   expect(proof.outcome).not.toBe('WIN');expect(S.utility(proof)).toBeLessThan(400);
   expect(proof.line.some(turn=>turn.spell.type==='FREEZE')).toBe(true);
  });
  it(`a counter-Freeze still on cooldown cannot prevent the immediate next capture, mirror=${mirror}`,()=>{
   const d=offensiveFreezeFixture({counterFreeze:1,counterCooldown:1,lastCharge:true},mirror),r=decide(d,1000),n=safe(d,actionOf(r));
   expect(actionOf(r).spell.type).toBe('FREEZE');
   for(const reply of G.generateTurnActions(n,n.activePlayer,t,SpellChessSearch.resources(n,n.activePlayer))){
    const end=R.simulate(n,reply,t);expect(G.findKingCapture(end,end.activePlayer,t)).toBeDefined();
   }
  },10000);
  it(`one blocker enables Jump, two independent blockers prevent the same royal capture, mirror=${mirror}`,()=>{
   let one=queenTrap(),two=queenTrap({secondBlocker:true});if(mirror){one=mirrorColors(one);two=mirrorColors(two);}
   expect(G.findKingCapture(one,one.activePlayer,t)).toBeDefined();expect(G.findKingCapture(two,two.activePlayer,t)).toBeUndefined();
  });
  it(`keeps a winning Jump and rejects a queen-for-pawn Jump, mirror=${mirror}`,()=>{
   const f=materialTrap('BISHOP',mirror),r=decide(f.domain,100);
   expect(S.inspect(R.simulate(f.domain,actionOf(r),t),f.domain.activePlayer,t).score).toBeGreaterThanOrEqual(S.balance(f.domain,f.domain.activePlayer)-200);
   let d=queenTrap();if(mirror)d=mirrorColors(d);expect(actionOf(decide(d,100)).spell.type).toBe('JUMP');
  });
 }
 it('records a legal counter-Freeze waiting line instead of losing a temporarily frozen recapture',()=>{
  const d=freezeEconomyImage(),n=R.simulate(d,imageAction(d,'6,7','5,5'),t),proof=S.inspect(n,'P2',t);
  expect(proof.score).toBeGreaterThanOrEqual(-100);
  expect(proof.refutedCaptures?.some(r=>r.attempt.spell.type==='FREEZE'&&r.response.some(a=>a.spell.type==='FREEZE'))).toBe(true);
  for(const row of proof.refutedCaptures??[]){let s=R.simulate(n,row.attempt,t);for(const a of row.response)s=R.simulate(s,a,t);expect(Number.isFinite(row.scoreCp)).toBe(true);}
 });
 it('keeps a Freeze-induced stalemate as a real DRAW in the waiting extension',()=>{
  let d=createDefaultDomainState('patch14-draw','SPELL_CHESS_KING_CAPTURE_ONLY');
  addPiece(d,'wk','P1','KING','0,0');addPiece(d,'wr','P1','ROOK','0,3');addPiece(d,'wp','P1','PAWN','7,1');
  addPiece(d,'bk','P2','KING','1,6');addPiece(d,'bb','P2','BISHOP','0,5');addPiece(d,'bq','P2','QUEEN','1,5');
  const s=OfficialSpellEngine.createInitialState();d=R.sync(d,{...s,whiteCharges:{freezeCharges:1,jumpCharges:0,freezeCooldownTurns:0,jumpCooldownTurns:0},
   blackCharges:{freezeCharges:0,jumpCharges:0,freezeCooldownTurns:0,jumpCooldownTurns:0},activeFrozenPieceIds:{wr:1}});
  expect(S.inspect(d,'P1',t,()=>{},'0,5')).toMatchObject({score:0,outcome:'DRAW'});
 });
 it('never calls a live frozen king captured in static evaluation',()=>{
  const d=offensiveFreezeFixture(),s=R.getState(d),frozen=R.sync(d,{...s,activeFrozenPieceIds:{bk:2}});
  const value=E.evaluate(frozen,'P1',t,SpellChessSearch.resources(frozen,'P1'),SpellChessSearch.resources(frozen,'P2'));
  expect(Math.abs(value)).toBeLessThan(20000);expect(frozen.isGameOver).toBe(false);
 });
 it('does not reuse mutable-input analysis across distinct searches',()=>{
  const d=offensiveFreezeFixture(),before=JSON.stringify(d);decide(d,100);expect(JSON.stringify(d)).toBe(before);
  const s=R.getState(d),changed=R.sync(d,{...s,whiteCharges:{...s.whiteCharges,freezeCharges:0}});
  expect(actionOf(decide(changed,100)).spell.type).not.toBe('FREEZE');
 });
 it('reports resource economics and true completion separately under a short budget',()=>{
  const r=decide(offensiveFreezeFixture({counterFreeze:1}),1),a=r.spellTrace!.strategicAudit!;
  expect(a.tacticalSafetyChecked).toBe(true);expect(a.nodesSearched).toBe(r.nodesEvaluated);
  expect(a.searchTimeMs).toBe(r.elapsedMs);expect(a.rootCandidatesSearched).toBeLessThanOrEqual(a.rootCandidatesGenerated);
  // Even a 1 ms budget searches the opponent's reply before choosing.
  expect(a.depthCompleted).toBeGreaterThanOrEqual(2);expect(a.nodesSearched).toBeGreaterThan(a.rootCandidatesSearched);
 });
});

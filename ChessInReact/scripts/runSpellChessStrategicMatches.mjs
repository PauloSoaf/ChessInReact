import {build} from 'esbuild';
import {Worker} from 'node:worker_threads';
import {readFileSync,writeFileSync,mkdirSync,cpSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const directory=resolve(process.env.SPELL_MATCH_DIR??'docs/autonomous/patches/patch14-evidence/strength-matches');mkdirSync(directory,{recursive:true});
const overlay=JSON.parse(readFileSync('docs/autonomous/patches/patch14-evidence/patch13-baseline-overlay.json','utf8'));
const baseline=mkdtempSync(join(tmpdir(),'chess-patch14-baseline-'));cpSync(resolve('src'),join(baseline,'src'),{recursive:true});
for(const [name,content] of Object.entries(overlay.files)){if(!name.startsWith('src/')||name.includes('..'))throw Error('Invalid overlay path');writeFileSync(join(baseline,name),content);}
const budget=Number(process.env.SPELL_MATCH_BUDGET_MS??2500),maxPlies=Number(process.env.SPELL_MATCH_MAX_PLIES??200);
const openings=[{name:'e3-Nc6-Bb5',moves:[['4,1','4,2'],['1,7','2,5'],['5,0','1,4']]},
 {name:'e3-Nc6-Qf3',moves:[['4,1','4,2'],['1,7','2,5'],['3,0','5,2']]},
 {name:'d3-Nc6',moves:[['3,1','3,2'],['1,7','2,5']]},
 {name:'e4-e6',moves:[['4,1','4,3'],['4,6','4,5']]},
 {name:'d4-Nf6',moves:[['3,1','3,3'],['6,7','5,5']]},
 {name:'g3-d5',moves:[['6,1','6,2'],['3,6','3,4']]},
 {name:'Nf3-g6',moves:[['6,0','5,2'],['6,6','6,5']]},
 {name:'c4-e5',moves:[['2,1','2,3'],['4,6','4,4']]}];
const allJobs=['previousN5','N4'].flatMap(opponent=>openings.flatMap(opening=>['P1','P2'].map(newColor=>({opponent,opening,newColor,budget,maxPlies}))));
const jobs=allJobs.slice(0,Number(process.env.SPELL_MATCH_GAMES??allJobs.length));
const baselineStrategy=join(baseline,'src/workers/ai/strategies/SpellOptimizationStrategy.ts').replaceAll(String.fromCharCode(92),'/');
const baselineSearch=join(baseline,'src/workers/ai/strategies/spell/SpellChessSearch.ts').replaceAll(String.fromCharCode(92),'/');
const contents=`
import {SpellOptimizationStrategy as Current} from './src/workers/ai/strategies/SpellOptimizationStrategy';
import {SpellOptimizationStrategy as Previous} from ${JSON.stringify(baselineStrategy)};
import {SpellChessSearch as PreviousSearch} from ${JSON.stringify(baselineSearch)};
import {SpellChessSearch} from './src/workers/ai/strategies/spell/SpellChessSearch';
import {SpellChessMaterialSafety as S} from './src/workers/ai/strategies/spell/SpellChessMaterialSafety';
import {SpellChessResources as Economy} from './src/workers/ai/strategies/spell/SpellChessResources';
import {SpellChessMoveGenerator as G} from './src/workers/ai/strategies/spell/SpellChessMoveGenerator';
import {OfficialSpellRules as R} from './src/engine/variants/spells/OfficialSpellRules';
import {OfficialSpellEngine} from './src/engine/variants/spells/OfficialSpellEngine';
import {RulesEngine} from './src/engine/rules/RulesEngine';
import {createDefaultDomainState} from './src/core/state/initialState';
import {createStandardChessPieces} from './src/core/bootstrap/GameInitializer';
import {SquareTopology} from './src/core/topology/SquareTopology';
const topology=new SquareTopology({width:8,height:8});
const opposite=p=>p==='P1'?'P2':'P1';
const actionOf=d=>({move:d.move,spell:d.secondaryAction?{type:d.secondaryAction.payload.spellType,targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}});
const request=(domain,level,budget)=>{const s=R.getState(domain),mine=domain.activePlayer==='P1'?s.whiteCharges:s.blackCharges,enemy=domain.activePlayer==='P1'?s.blackCharges:s.whiteCharges;
 let legalMoves=RulesEngine.getLegalMoves(domain,topology);if(!legalMoves.length)legalMoves=G.generateTurnActions(domain,domain.activePlayer,topology,S.resources(domain)).map(a=>a.move);
 return {matchId:domain.matchId,variantId:domain.variantId,actingPlayer:domain.activePlayer,domain,topology,difficultyLevel:level,timeBudgetMs:budget,legalMoves,
 specializedContext:{freezeCharges:mine.freezeCharges,jumpCharges:mine.jumpCharges,freezeCooldown:mine.freezeCooldownTurns,jumpCooldown:mine.jumpCooldownTurns,
 opponentFreezeCharges:enemy.freezeCharges,opponentJumpCharges:enemy.jumpCharges,opponentFreezeCooldown:enemy.freezeCooldownTurns,opponentJumpCooldown:enemy.jumpCooldownTurns,
 activeFrozenCoordinates:Object.keys(s.activeFrozenCoordinates)}};};
export function playGame(config,progress){
 const current=new Current(),previous=new Previous();
 let state=createDefaultDomainState('patch14-match','SPELL_CHESS_KING_CAPTURE_ONLY');
 for(const p of createStandardChessPieces()){state.boardEntities[p.id]=p;state.occupancy[p.position]=p.id;}
 state=R.sync(state,OfficialSpellEngine.createInitialState());
 for(const [from,to] of config.opening.moves)state=R.simulate(state,{spell:{type:'NONE'},move:{pieceId:state.occupancy[from],from,to}},topology);
 const turns=[],states=[state];let rejections=0,illegalExecuted=0;
 for(let ply=0;ply<config.maxPlies&&!state.isGameOver;ply++){
  const isCurrent=state.activePlayer===config.newColor,name=isCurrent?'current':config.opponent;
  const level=name==='N4'?4:5,limit=level===4?Math.min(config.budget,1500):config.budget;
  const r=request(state,level,limit),start=performance.now();let d,action,next,failure;
  try{d=(isCurrent?current:previous).decideMove(r);action=actionOf(d);next=R.simulate(state,action,topology);}
  catch(error){rejections++;failure=String(error);
   const fallback=name==='previousN5'?new PreviousSearch():new SpellChessSearch();
   const g=fallback.searchBestTurnAction(state,state.activePlayer,topology,SpellChessSearch.resources(state,state.activePlayer),SpellChessSearch.resources(state,opposite(state.activePlayer)),Math.max(100,Math.min(300,limit)),0);
   action=g.bestAction;next=R.simulate(state,action,topology);d={depthReached:0,nodesEvaluated:g.nodesEvaluated,elapsedMs:g.elapsedMs,fallbackUsed:true,failureReason:failure,spellTrace:{...g.trace,fallbackUsed:true}};
  }
  const elapsedMs=performance.now()-start,trace=d.spellTrace,audit=trace?.strategicAudit;
  const row={ply:ply+1,engine:name,player:state.activePlayer,action,depth:d.depthReached,nodes:d.nodesEvaluated,
   elapsedMs,requestedMs:limit,wouldTripProductionWatchdog:elapsedMs>limit+5000,fallback:!!d.fallbackUsed,failureReason:failure,
   resourcesBefore:R.getState(state),resourcesAfter:R.getState(next),materialBefore:S.balance(state,state.activePlayer),
   profile:trace?.profile,strategicAudit:audit,replyCoverage:audit?.replyCoverage??null,
   immediateRoyalError:!!G.findKingCapture(next,next.activePlayer,topology),spellEvidence:null};
  if(action.spell.type==='FREEZE'){
   if(audit?.freezeImpact?.provedBySearch&&audit.freezeImpact.expectedNetBenefitCp>0)row.spellEvidence={classification:'MATCHED_SEARCH_GAIN',gainCp:audit.freezeImpact.expectedNetBenefitCp};
   else{
    try{const noSpell={...action,spell:{type:'NONE'}},normal=R.simulate(state,noSpell,topology);
     const afterProof=S.inspect(next,state.activePlayer,topology,()=>{},undefined,3,1,1,action.move.to),beforeProof=S.inspect(normal,state.activePlayer,topology,()=>{},undefined,3,1,1,action.move.to);
     const gain=S.utility(afterProof)-S.utility(beforeProof);
     row.spellEvidence={classification:gain>0?'TACTICAL_GAIN':gain===0?'NO_MARGINAL_GAIN':'NO_DEMONSTRATED_GAIN',gainCp:gain,
      castScore:afterProof.score,noneScore:beforeProof.score,castOutcome:afterProof.outcome,noneOutcome:beforeProof.outcome};
    }catch(error){row.spellEvidence={classification:'NO_SPELL_COUNTERPART_ILLEGAL',error:String(error)};}
   }
  }
  turns.push(row);state=next;states.push(state);
  if(ply%8===7)progress({ply:ply+1,engine:name,depth:d.depthReached,elapsedMs:Math.round(elapsedMs)});
 }
 for(let i=0;i<turns.length;i++){
  const row=turns[i],before=states[i],player=row.player;
  const queens=R.pieces(before).filter(p=>p.ownerId===player&&p.variantId==='QUEEN').map(p=>p.id);
  const one=states[Math.min(i+2,states.length-1)],two=states[Math.min(i+4,states.length-1)];
  row.queenLostOneReply=queens.some(id=>one.boardEntities[id]?.isCaptured);
  row.queenLostTwoReplies=queens.some(id=>two.boardEntities[id]?.isCaptured);
  row.materialDeltaOneReplyCp=S.balance(one,player)-S.balance(before,player);
  row.materialDeltaTwoRepliesCp=S.balance(two,player)-S.balance(before,player);
  const c=player==='P1'?R.getState(before).whiteCharges:R.getState(before).blackCharges;
  row.kingCapturedWhileFreezeCooling=one.isGameOver&&one.winnerId!==player&&one.winnerId!==null&&c.freezeCooldownTurns>0;
 }
 return {config,turns,terminal:state.isGameOver,winner:state.winnerId,reason:state.isGameOver?'ACTUAL_TERMINAL':'PLY_LIMIT_UNFINISHED',
 rejections,illegalExecuted,finalResources:R.getState(state),finalMaterial:{P1:S.balance(state,'P1'),P2:S.balance(state,'P2')},
 notes:['Only actual shared-rule transitions adjudicate this match. A ply limit is unfinished, not a draw.',
 'Spell evidence uses completed matched search when available; otherwise the same-move no-spell counterfactual is inspected with the bounded exchange model.']};
}
`;
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,
 metafile:true,plugins:[{name:'baseline-packages',setup(b){
 b.onResolve({filter:/^(immer|react|zustand|@[^/]+\/[^/]+)(\/.*)?$/},async args=>args.resolveDir.startsWith(baseline)?b.resolve(args.path,{resolveDir:process.cwd(),kind:args.kind}):undefined);}}]});
const runtime=join(baseline,'strategic-runtime.mjs');writeFileSync(runtime,bundle.outputFiles[0].text);
const baselineNormalized=baseline.replaceAll(String.fromCharCode(92),'/');
const inputHashes=Object.keys(bundle.metafile.inputs).filter(p=>!p.startsWith('<')).map(name=>{
 const path=resolve(name),normalized=path.replaceAll(String.fromCharCode(92),'/');
 const label=normalized.startsWith(baselineNormalized+'/')?'BASELINE/'+normalized.slice(baselineNormalized.length+1):normalized.slice(process.cwd().replaceAll(String.fromCharCode(92),'/').length+1);
 return [label,createHash('sha256').update(readFileSync(path)).digest('hex')];
}).sort(([a],[b])=>a.localeCompare(b));
const sha=createHash('sha256').update(JSON.stringify(inputHashes)+contents.replaceAll(baselineStrategy,'BASELINE_STRATEGY').replaceAll(baselineSearch,'BASELINE_SEARCH')).digest('hex');
const manifestPath=join(directory,'manifest.json');
if(existsSync(manifestPath)){const old=JSON.parse(readFileSync(manifestPath,'utf8'));if(old.fingerprint!==sha)throw Error('Source fingerprint changed: select a new SPELL_MATCH_DIR; prior results are preserved.');}
writeFileSync(manifestPath,JSON.stringify({date:'2026-11-27',timezone:'America/Manaus',baseline:overlay.baseline,fingerprint:sha,budgetMs:budget,
 N4BudgetMs:Math.min(budget,1500),maxPlies,jobs:jobs.length,openings,concurrency:4},null,2));
let sequence=0;const results=[];
async function execute(config){
 const id=config.opponent+'-'+config.newColor+'-'+config.opening.name,path=join(directory,id+'.json');
 if(existsSync(path)){const saved=JSON.parse(readFileSync(path,'utf8'));results.push(saved);console.log('Reusing',id);return;}
 console.log('Starting',id);
 const result=await new Promise((resolve,reject)=>{
  const w=new Worker(`const {parentPort,workerData}=require('node:worker_threads');import(workerData.url).then(m=>{
   const r=m.playGame(workerData.config,p=>parentPort.postMessage({kind:'progress',...p}));parentPort.postMessage({kind:'result',result:r});
  }).catch(e=>parentPort.postMessage({kind:'failure',error:e.stack??String(e)}));`,{eval:true,workerData:{url:pathToFileURL(runtime).href,config}});
  w.on('message',m=>{if(m.kind==='result'){resolve(m.result);w.terminate();}else if(m.kind==='failure'){reject(Error(m.error));w.terminate();}else console.log('Progress',id,m.ply,m.depth,m.elapsedMs+'ms');});
  w.on('error',reject);w.on('exit',code=>{if(code!==0&&code!==1)reject(Error('Worker exit '+code));});
 });
 result.fingerprint=sha;writeFileSync(path,JSON.stringify(result,null,2));results.push(result);
 console.log('Finished',id,result.reason,result.winner,result.turns.length);
}
await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{for(;;){const i=sequence++;if(i>=jobs.length)return;await execute(jobs[i]);}}));
let rng=0x8142026;const random=()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)/4294967296};
const summary=['previousN5','N4'].map(opponent=>{
 const games=results.filter(g=>g.config.opponent===opponent),completed=games.filter(g=>g.terminal);
 const wins=completed.filter(g=>g.winner===g.config.newColor).length,losses=completed.filter(g=>g.winner&&g.winner!==g.config.newColor).length,draws=completed.filter(g=>!g.winner).length;
 const pairs=openings.map(o=>games.filter(g=>g.config.opening.name===o.name)).filter(rows=>rows.length===2&&rows.every(g=>g.terminal));
 const pairScores=pairs.map(rows=>rows.reduce((sum,g)=>sum+(g.winner===g.config.newColor?1:g.winner===null?.5:0),0)/2);
 const samples=[];if(completed.length===games.length&&pairScores.length===openings.length)for(let i=0;i<10000;i++)samples.push(pairScores.reduce(s=>s+pairScores[Math.floor(random()*pairScores.length)],0)/pairScores.length);
 samples.sort((a,b)=>a-b);
 const rows=games.flatMap(g=>g.turns.filter(t=>t.engine==='current'));
 return {opponent,games:games.length,wins,losses,draws,unfinished:games.length-completed.length,score:completed.length?(wins+.5*draws)/completed.length:null,
 pairedOpeningBootstrap95:samples.length?[samples[250],samples[9749]]:null,
 current:{turns:rows.length,depthZero:rows.filter(r=>r.depth===0).length,fallbacks:rows.filter(r=>r.fallback).length,
 wouldTripProductionWatchdog:rows.filter(r=>r.wouldTripProductionWatchdog).length,queenLossesOneReply:rows.filter(r=>r.queenLostOneReply).length,
 severeBalanceDeclinesOneReply:rows.filter(r=>r.materialDeltaOneReplyCp < -200).length,
 freezes:rows.filter(r=>r.action.spell.type==='FREEZE').length,freezesWithoutDemonstratedGain:rows.filter(r=>r.spellEvidence?.classification==='NO_DEMONSTRATED_GAIN'||r.spellEvidence?.classification==='NO_MARGINAL_GAIN').length,
 averageMs:rows.reduce((s,r)=>s+r.elapsedMs,0)/Math.max(1,rows.length),averageDepth:rows.reduce((s,r)=>s+r.depth,0)/Math.max(1,rows.length),
 nodesPerSecond:rows.reduce((s,r)=>s+r.nodes,0)/(rows.reduce((s,r)=>s+r.elapsedMs,0)/1000)}};
});
writeFileSync(join(directory,'summary.json'),JSON.stringify({manifest:JSON.parse(readFileSync(manifestPath,'utf8')),summary,
 limitations:['Paired opening suite, not an Elo estimate. Bootstrap resamples opening pairs, not individual moves.',
 'No adjudication by evaluation score. Unfinished games are excluded from WDL and prevent complete-suite confidence claims.',
 'Would-trip-watchdog timings are reported: these Node strategy matches do not simulate a stopped browser Worker.']},null,2));
console.log(JSON.stringify(summary,null,2));

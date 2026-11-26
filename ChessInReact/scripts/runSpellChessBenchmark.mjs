import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baselineRef = process.env.SPELL_BASELINE_REF ?? '474377d';
const budget = Number(process.env.SPELL_BENCH_BUDGET_MS ?? 250);
const maxPlies = Number(process.env.SPELL_BENCH_MAX_PLIES ?? 200);
const resume = process.env.SPELL_BENCH_RESUME === '1' ? JSON.parse(readFileSync(resolve('docs/autonomous/patches/patch12-evidence/benchmark.json'), 'utf8')) : undefined;
const outputDir = resolve('docs/autonomous/patches/patch12-evidence');
mkdirSync(outputDir, { recursive: true });
const oldSource = execFileSync('git', ['show', `${baselineRef}:ChessInReact/src/workers/ai/strategies/SpellOptimizationStrategy.ts`], { encoding: 'utf8' });
const bundle = await build({ stdin: { contents: `
import { SpellOptimizationStrategy as Previous } from 'baseline-spell-strategy';
import { SpellOptimizationStrategy as Current } from './src/workers/ai/strategies/SpellOptimizationStrategy';
import { queenTrap, mirrorColors } from './src/workers/ai/strategies/spell/testing/KingSafetyFixtures';
import { OfficialSpellRules as Rules } from './src/engine/variants/spells/OfficialSpellRules';
import { OfficialSpellEngine } from './src/engine/variants/spells/OfficialSpellEngine';
import { SpellChessMoveGenerator as Generator } from './src/workers/ai/strategies/spell/SpellChessMoveGenerator';
import { SpellChessSearch } from './src/workers/ai/strategies/spell/SpellChessSearch';
import { RulesEngine } from './src/engine/rules/RulesEngine';
import { SquareTopology } from './src/core/topology/SquareTopology';
import { createDefaultDomainState } from './src/core/state/initialState';
import { createStandardChessPieces } from './src/core/bootstrap/GameInitializer';
const topology = new SquareTopology({width:8,height:8});
const old = new Previous(), current = new Current();
const request = (domain, level=5) => {
 const spells=Rules.getState(domain), mine=domain.activePlayer==='P1'?spells.whiteCharges:spells.blackCharges,
 enemy=domain.activePlayer==='P1'?spells.blackCharges:spells.whiteCharges;
 return {domain:JSON.parse(JSON.stringify(domain)), topology, matchId:domain.matchId, variantId:domain.variantId, actingPlayer:domain.activePlayer,
 difficultyLevel:level, timeBudgetMs:${budget}, legalMoves:RulesEngine.getLegalMoves(domain,topology),
 specializedContext:{freezeCharges:mine.freezeCharges,jumpCharges:mine.jumpCharges,freezeCooldown:mine.freezeCooldownTurns,
 jumpCooldown:mine.jumpCooldownTurns,opponentFreezeCharges:enemy.freezeCharges,opponentJumpCharges:enemy.jumpCharges,
 opponentFreezeCooldown:enemy.freezeCooldownTurns,opponentJumpCooldown:enemy.jumpCooldownTurns,
 activeFrozenCoordinates:Object.keys(spells.activeFrozenCoordinates)}};
};
const actionOf = d => ({move:d.move,spell:d.secondaryAction?.type==='CAST_SPELL'?
 {type:d.secondaryAction.payload.spellType,targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}});
const cases=[];
for(const options of [{beforeCapture:true},{beforeCapture:true,jump:0},{beforeCapture:true,cooldown:1},
 {beforeCapture:true,bishopFrozen:1},{beforeCapture:true,bishopFrozen:2},{beforeCapture:true,secondBlocker:true},
 {beforeCapture:true,blackFreeze:1},{},{jump:0},{cooldown:1},{bishopFrozen:1},{secondBlocker:true}])
 for(const mirrored of [false,true]) cases.push(mirrored?mirrorColors(queenTrap(options)):queenTrap(options));
const tactical=[];
for(let i=0;i<cases.length;i++) for(const [name,engine] of [['previous',old],['current',current]]){
 const domain=cases[i]; const started=performance.now();
 try {const d=engine.decideMove(request(domain)); const action=actionOf(d), next=Rules.simulate(domain,action,topology);
 tactical.push({case:i,engine:name,action,illegal:false,allowsImmediateKingCapture:!!Generator.findKingCapture(next,next.activePlayer,topology),
 won:next.winnerId===domain.activePlayer,depth:name==='current'?d.depthReached:null,reportedDepth:d.depthReached,nodes:name==='current'?d.nodesEvaluated:null,reportedNodes:d.nodesEvaluated,elapsedMs:performance.now()-started,fallback:!!d.fallbackUsed});}
 catch(error){tactical.push({case:i,engine:name,illegal:true,error:String(error),elapsedMs:performance.now()-started});}
}
const games=[];const previousReport=${JSON.stringify(resume ?? null)};
for(const opponent of ['previous','N4','N3']) for(const newColor of ['P1','P2']) for(const opening of ['e3','d3']){
 const saved=previousReport?.games.find(g=>g.opponent===opponent&&g.newColor===newColor&&g.opening===opening);
 if(saved?.terminal){games.push(saved);continue;}
 let state=createDefaultDomainState('benchmark','SPELL_CHESS_KING_CAPTURE_ONLY');
 for(const p of createStandardChessPieces()){state.boardEntities[p.id]=p;state.occupancy[p.position]=p.id;}
 state=Rules.sync(state,OfficialSpellEngine.createInitialState());
 const to=opening==='e3'?'4,2':'3,2',from=opening==='e3'?'4,1':'3,1';
 state=Rules.simulate(state,{spell:{type:'NONE'},move:{pieceId:state.occupancy[from],from,to}},topology);
 const turns=saved?[...saved.turns]:[];let illegal=0;let rejectedProposals=saved?.rejectedProposals??0;let reason='ply-limit';
 for(const turn of turns)state=Rules.simulate(state,turn.action,topology);
 for(let ply=turns.length;ply<${maxPlies}&&!state.isGameOver;ply++){
  const isCurrent=state.activePlayer===newColor,engine=isCurrent?current:old,level=isCurrent||opponent==='previous'?5:opponent==='N4'?4:3;
  const r=request(state,level);if(!r.legalMoves.length){
   r.legalMoves=Generator.generateTurnActions(state,state.activePlayer,topology,SpellChessSearch.resources(state,state.activePlayer)).map(a=>a.move);
   if(!r.legalMoves.length){const result=RulesEngine.getGameResult(state,topology);state={...state,isGameOver:result.isGameOver,winnerId:result.winnerId};reason='no-actions';break;}
  }
  const started=performance.now();
  try{let d,action,next;
   try{d=engine.decideMove(r);action=actionOf(d);}
   catch(error){rejectedProposals++;const guard=new SpellChessSearch().searchBestTurnAction(state,state.activePlayer,topology,
     SpellChessSearch.resources(state,state.activePlayer),SpellChessSearch.resources(state,state.activePlayer==='P1'?'P2':'P1'),${budget},0);
     action=guard.bestAction;d={depthReached:0,nodesEvaluated:guard.nodesEvaluated,fallbackUsed:true,failureReason:String(error)};}

   try{next=Rules.simulate(state,action,topology);}
   catch(error){rejectedProposals++;
    const guard=new SpellChessSearch().searchBestTurnAction(state,state.activePlayer,topology,
     SpellChessSearch.resources(state,state.activePlayer),SpellChessSearch.resources(state,state.activePlayer==='P1'?'P2':'P1'),${budget},0);
    action=guard.bestAction;next=Rules.simulate(state,action,topology);d={...d,depthReached:0,nodesEvaluated:guard.nodesEvaluated,
     fallbackUsed:true,failureReason:String(error)};
   }
   turns.push({engine:isCurrent?'current':opponent,player:state.activePlayer,action,depth:isCurrent||d.fallbackUsed?d.depthReached:null,reportedDepth:d.depthReached,nodes:isCurrent||d.fallbackUsed?d.nodesEvaluated:null,
    elapsedMs:performance.now()-started,fallback:!!d.fallbackUsed,spell:action.spell.type!=='NONE',
    immediateError:!!Generator.findKingCapture(next,next.activePlayer,topology),
    avoidableImmediateError:!!Generator.findKingCapture(next,next.activePlayer,topology)&&!!d.spellTrace?.candidates?.some(c=>c.safetyChecked&&!c.allowsImmediateKingCapture)});state=next;
   if(state.isGameOver)reason='terminal';
  }catch(error){illegal++;reason=String(error);break;}
 }
 games.push({opponent,newColor,opening,winner:state.winnerId,terminal:state.isGameOver,reason,illegal,rejectedProposals,turns,failureEngine:illegal?(state.activePlayer===newColor?'current':opponent):undefined,failureState:illegal?state:undefined});
 console.error('Game',opponent,newColor,opening,reason,state.winnerId,turns.length);
}
const aggregate=name=>{const rows=tactical.filter(r=>r.engine===name);return{positions:rows.length,illegal:rows.filter(r=>r.illegal).length,
 immediateErrors:rows.filter(r=>r.allowsImmediateKingCapture).length,wins:rows.filter(r=>r.won).length,
 averageMs:rows.reduce((s,r)=>s+r.elapsedMs,0)/rows.length};};
const summary={previous:aggregate('previous'),current:aggregate('current'),games:games.map(g=>({opponent:g.opponent,newColor:g.newColor,
 opening:g.opening,winner:g.winner,terminal:g.terminal,reason:g.reason,illegal:g.illegal,rejectedProposals:g.rejectedProposals,plies:g.turns.length})),
 gamesByOpponent:['previous','N4','N3'].map(name=>{const rows=games.filter(g=>g.opponent===name);return{opponent:name,
 wins:rows.filter(g=>g.winner===g.newColor).length,losses:rows.filter(g=>g.winner&&g.winner!==g.newColor).length,
 draws:rows.filter(g=>g.terminal&&!g.winner).length,unfinished:rows.filter(g=>!g.terminal).length};})};
export default {baselineRef:${JSON.stringify(baselineRef)},budgetMs:${budget},maxPlies:${maxPlies},resumed:${JSON.stringify(Boolean(resume))},notes:['Previous strategy runs with the same corrected rules and transition as current; requests are isolated clones.',
 'Full games use the production-style safety fallback for rejected proposals; these are recorded separately, not executed illegally.',
 'Small deterministic paired sample; not an Elo estimate. A ply limit is unfinished, not a draw.'],tactical,games,summary};
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', write: false,
  plugins: [{ name: 'baseline', setup(b) {
    b.onResolve({ filter: /^baseline-spell-strategy$/ }, () => ({ path: 'baseline', namespace: 'baseline' }));
    b.onLoad({ filter: /.*/, namespace: 'baseline' }, () => ({ contents: oldSource, loader: 'ts', resolveDir: resolve('src/workers/ai/strategies') }));
  } }] });
const result = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
writeFileSync(resolve(outputDir, 'benchmark.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));

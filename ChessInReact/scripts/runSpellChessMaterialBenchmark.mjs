import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const archive = JSON.parse(readFileSync('docs/autonomous/patches/patch12-evidence/benchmark.json', 'utf8'));
const directory = resolve('docs/autonomous/patches/patch13-evidence'); mkdirSync(directory, { recursive: true });
const budget = Number(process.env.SPELL_MATERIAL_BUDGET_MS ?? 250);
const selectedCaseIds = process.env.SPELL_MATERIAL_CASES?.split(',');
const bundle = await build({ stdin: { contents: `
import { SpellOptimizationStrategy } from './src/workers/ai/strategies/SpellOptimizationStrategy';
import { SpellChessMaterialSafety as Safety } from './src/workers/ai/strategies/spell/SpellChessMaterialSafety';
import { OfficialSpellRules as Rules } from './src/engine/variants/spells/OfficialSpellRules';
import { OfficialSpellEngine } from './src/engine/variants/spells/OfficialSpellEngine';
import { RulesEngine } from './src/engine/rules/RulesEngine';
import { SquareTopology } from './src/core/topology/SquareTopology';
import { createDefaultDomainState } from './src/core/state/initialState';
import { createStandardChessPieces } from './src/core/bootstrap/GameInitializer';
import { SpellChessTranspositionTable } from './src/workers/ai/strategies/spell/SpellChessTranspositionTable';
const topology = new SquareTopology({width:8,height:8}), engine = new SpellOptimizationStrategy();
const archive = ${JSON.stringify(archive)};
const games = [];const selectedCaseIds=${JSON.stringify(selectedCaseIds ?? null)};
const balance = Safety.balance.bind(Safety);
const actionOf = d => ({move:d.move,spell:d.secondaryAction?{type:d.secondaryAction.payload.spellType,targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}});
let replayed = 0;
const keySamples=[];
for (const [gameIndex, game] of archive.games.entries()) {
 let state=createDefaultDomainState('benchmark','SPELL_CHESS_KING_CAPTURE_ONLY');
 for(const p of createStandardChessPieces()){state.boardEntities[p.id]=p;state.occupancy[p.position]=p.id;}
 state=Rules.sync(state,OfficialSpellEngine.createInitialState());
 const x=game.opening==='d3'?3:4;
 state=Rules.simulate(state,{spell:{type:'NONE'},move:{pieceId:state.occupancy[x+',1'],from:x+',1',to:x+',2'}},topology);
 const states=[state]; for(const turn of game.turns){state=Rules.simulate(state,turn.action,topology);states.push(state);replayed++;}
 if(state.isGameOver!==game.terminal||state.winnerId!==game.winner)throw Error('Archived terminal mismatch '+gameIndex);
 const actualReplyAt=index=>{const action=game.turns[index]?.action;if(!action)return undefined;
  return {...action,move:{...action.move,isCapture:Rules.pieces(states[index+1]).length<Rules.pieces(states[index]).length}};};
 const decisions=[];
 for(let i=0;i<game.turns.length;i++){
  const turn=game.turns[i];if(turn.engine!=='current'||(selectedCaseIds&&!selectedCaseIds.includes(gameIndex+':'+(i+1))))continue;
  const before=states[i],after=states[i+1],player=before.activePlayer,base=balance(before,player);
  const queenIds=Rules.pieces(before).filter(p=>p.ownerId===player&&p.variantId==='QUEEN').map(p=>p.id);
  const queenLost=offset=>queenIds.some(id=>states[Math.min(i+offset,states.length-1)].boardEntities[id]?.isCaptured);
  const oldProof=Safety.inspect(after,player,topology);
  const d=engine.decideMove({matchId:before.matchId,variantId:before.variantId,actingPlayer:player,difficultyLevel:5,
   timeBudgetMs:${budget},domain:before,topology,legalMoves:RulesEngine.getLegalMoves(before,topology)});
  const action=actionOf(d),next=Rules.simulate(before,action,topology),proof=Safety.inspect(next,player,topology);
  const queenLostInLine=(start,line)=>{let s=start;for(const a of line)s=Rules.simulate(s,a,topology);return queenIds.some(id=>s.boardEntities[id]?.isCaptured)};
  const row={ply:i+1,player,previousAction:turn.action,currentAction:action,
   previous:{actualReply:actualReplyAt(i+1),actualSecondReply:actualReplyAt(i+3),outcome:oldProof.outcome,depth:turn.depth,elapsedMs:turn.elapsedMs,materialDeltaCp:oldProof.score-base,
    queenLostInOneReply:queenLost(2),queenLostInTwoReplies:queenLost(4),queenCapturedInLine:queenLostInLine(after,oldProof.line),
    actualMaterialDeltaOneReplyCp:balance(states[Math.min(i+2,states.length-1)],player)-base,
    actualMaterialDeltaTwoRepliesCp:balance(states[Math.min(i+4,states.length-1)],player)-base,
    bestCaptureReply:oldProof.reply,line:oldProof.line},
   current:{outcome:proof.outcome,depth:d.depthReached,elapsedMs:d.elapsedMs,nodes:d.nodesEvaluated,materialDeltaCp:proof.score-base,
    fallback:!!d.fallbackUsed,minimumInspection:d.spellTrace?.materialInspectionCompleted,
    rootFullyEnumerated:d.spellTrace?.rootFullyEnumerated,queenCapturedInLine:queenLostInLine(next,proof.line),bestCaptureReply:proof.reply,line:proof.line,
    chosenDiagnostic:d.spellTrace?.candidates?.find(c=>c.action.move.pieceId===action.move.pieceId&&c.action.move.to===action.move.to&&c.action.spell.type===action.spell.type&&(c.action.spell.type==='NONE'||c.action.spell.targetSquare===action.spell.targetSquare))}};
  decisions.push(row);keySamples.push(before);
 }
 games.push({gameIndex,opponent:game.opponent,newColor:game.newColor,opening:game.opening,replayed:game.turns.length,
  terminal:state.isGameOver,winner:state.winnerId,decisions});
 console.error('Material comparison',gameIndex+1,'/12; decisions',decisions.length);
}
const rows=games.flatMap(g=>g.decisions);
const metric=name=>({decisions:rows.length,
 queenCapturedInExchangeLine:rows.filter(r=>r[name].queenCapturedInLine).length,
 uncompensatedQueenInExchangeLine:rows.filter(r=>r[name].queenCapturedInLine&&r[name].materialDeltaCp < -200).length,
 queenSacrificesWithDemonstratedCompensation:rows.filter(r=>r[name].queenCapturedInLine&&r[name].materialDeltaCp >= 0).length,
 immediateRoyalCaptures:rows.filter(r=>r[name].materialDeltaCp > 90000).length,
 depthZero:rows.filter(r=>r[name].depth===0).length,
 severeMaterialLosses:rows.filter(r=>r[name].outcome!=='DRAW'&&r[name].materialDeltaCp < -200 && r[name].materialDeltaCp > -90000).length,
 royalLosses:rows.filter(r=>r[name].materialDeltaCp <= -90000).length,
 wastedJump:rows.filter(r=>(name==='previous'?r.previousAction:r.currentAction).spell.type==='JUMP'&&r[name].materialDeltaCp < -200).length,
 averageMs:rows.reduce((s,r)=>s+r[name].elapsedMs,0)/rows.length,
 unchecked:name==='current'?rows.filter(r=>!r.current.minimumInspection).length:null});
// Time the original textual key and current compact key on identical historical states.
const oldKey=(d)=>JSON.stringify({...d.turnState,lastActionTimestamp:0})+'|'+JSON.stringify(d.metadata?.officialSpellState)+'|'+
 Object.entries(d.occupancy).sort(([a],[b])=>a.localeCompare(b)).map(([c,id])=>{const p=d.boardEntities[id];return c+':'+p.ownerId+':'+p.variantId+':'+p.hasMoved+':'+!!p.metadata?.isFrozen+':'+!!p.metadata?.canBeJumpedOver}).join('|');
const tt=new SpellChessTranspositionTable();let oldLength=0,newLength=0;
const timed=(fn)=>{const start=performance.now();for(let round=0;round<10;round++)for(const d of keySamples)fn(d);return performance.now()-start};
const oldKeyMs=timed(d=>{oldLength=oldKey(d).length});
const newKeyMs=timed(d=>{newLength=tt.computeKey(d,d.activePlayer,Safety.resources({...d,activePlayer:'P1'}),Safety.resources({...d,activePlayer:'P2'}),[],[]).length});
export default {baselineRef:'95b88c1',notesActualReplyAnnotation:'Capture flags for actual historical replies are derived from replayed before/after piece counts, including en passant.',selectedCaseIds,budgetMs:${budget},replayedActions:replayed,games,
 summary:{previous:metric('previous'),current:metric('current'),
  betterMaterialDefenseFound:rows.filter(r=>r.previous.materialDeltaCp < -200 && r.current.materialDeltaCp >= -200).length,
  errorsByGame:games.map(g=>({gameIndex:g.gameIndex,previous:g.decisions.filter(r=>r.previous.materialDeltaCp < -200).length,current:g.decisions.filter(r=>r.current.materialDeltaCp < -200).length})),
  actualArchivedQueenLossesOneReply:rows.filter(r=>r.previous.queenLostInOneReply).length,
  actualArchivedQueenLossesTwoReplies:rows.filter(r=>r.previous.queenLostInTwoReplies).length,
  firstDecisions:games.map(g=>g.decisions[0]),keyTiming:{samples:keySamples.length,rounds:10,oldKeyMs,newKeyMs,lastOldLength:oldLength,lastNewLength:newLength}},
 limitations:['Counterfactual decisions use the identical archived position; these are not new full games.',
 'Material proof is bounded to three legal capture plies and local recaptures; it is not a proof of long-term compensation.',
 'Actual historical one/two-reply losses are reported separately from counterfactual exchange scores.',
 'Old key timing reconstructs its expensive components; it is not a full end-to-end search speedup.']};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const result=(await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
writeFileSync(resolve(directory,selectedCaseIds?'material-diagnostic-sample.json':'material-benchmark.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result.summary,null,2));

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const budget = Number(process.env.SPELL_TACTICAL_BUDGET_MS ?? 120);
const directory = resolve('docs/autonomous/patches/patch12-evidence');
mkdirSync(directory, { recursive: true });
const bundle = await build({ stdin: { contents: `
import { SpellOptimizationStrategy } from './src/workers/ai/strategies/SpellOptimizationStrategy';
import { OfficialSpellRules as Rules } from './src/engine/variants/spells/OfficialSpellRules';
import { SpellChessMoveGenerator as Generator } from './src/workers/ai/strategies/spell/SpellChessMoveGenerator';
import { SpellChessSearch } from './src/workers/ai/strategies/spell/SpellChessSearch';
import { CheckValidator } from './src/engine/rules/CheckValidator';
import { RulesEngine } from './src/engine/rules/RulesEngine';
import { SANNotationGenerator as SAN } from './src/engine/rules/notation/SANNotationGenerator';
import { SquareTopology } from './src/core/topology/SquareTopology';
import { queenTrap } from './src/workers/ai/strategies/spell/testing/KingSafetyFixtures';
import { TACTICAL_GEOMETRIES, TACTICAL_CONDITIONS, tacticalEquivalenceFixture, mandatoryFreezeFixture } from './src/workers/ai/strategies/spell/testing/TacticalEquivalenceFixtures';
const topology=new SquareTopology({width:8,height:8});
const strategy=new SpellOptimizationStrategy();
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const decide=(domain,budget)=>strategy.decideMove({matchId:domain.matchId,variantId:domain.variantId,
 actingPlayer:domain.activePlayer,difficultyLevel:5,timeBudgetMs:budget,domain,topology,legalMoves:RulesEngine.getLegalMoves(domain,topology)});
const actionOf=d=>({move:d.move,spell:d.secondaryAction?{type:d.secondaryAction.payload.spellType,targetSquare:String(d.secondaryAction.payload.targetCoord)}:{type:'NONE'}});
const describe=(before,action)=>{
 const withSpell=Rules.cast(before,action.spell,before.activePlayer);
 const after=Rules.simulate(before,action,topology);
 const san=SAN.generateSAN({from:action.move.from,to:action.move.to,pieceId:action.move.pieceId,
  domainBefore:withSpell,domainAfter:after,topology,promotionVariant:action.move.promotion});
 const label=action.spell.type==='NONE'?san:(action.spell.type==='JUMP'?'Jump':'Freeze')+'('+SAN.coordToAlgebraic(action.spell.targetSquare)+') + '+san;
 return {label,action,after};
};
const position=queenTrap({beforeCapture:true});
const result=decide(position,2500);
const rejected=result.spellTrace.candidates.find(d=>d.action.spell.type==='NONE'&&d.action.move.pieceId==='bk'&&d.action.move.to==='5,6');
assert(rejected?.allowsImmediateKingCapture,'Missing poisoned queen diagnostic');
const first=describe(position,rejected.action);
const reply=describe(first.after,rejected.opponentBestReply);
assert(reply.after.winnerId==='P1','Counterfactual reply did not capture the king');
const chosen=describe(position,actionOf(result));
assert(!Generator.findKingCapture(chosen.after,chosen.after.activePlayer,topology),'Chosen defense allows immediate capture');
let pvState=position;
const pv=[];
for(const action of result.spellTrace.principalVariation){const step=describe(pvState,action);pv.push({label:step.label,action});pvState=step.after;}
const allCaptures=domain=>{if(domain.isGameOver)return[];const king=CheckValidator.findRoyalPiece(domain.activePlayer==='P1'?'P2':'P1',domain);
 return Generator.generateTurnActions(domain,domain.activePlayer,topology,SpellChessSearch.resources(domain,domain.activePlayer)).filter(a=>a.move.to===king?.position);};
const snapshot=domain=>({activePlayer:domain.activePlayer,turnNumber:domain.turnNumber,isGameOver:domain.isGameOver,winnerId:domain.winnerId,
 hasCastSpellThisTurn:!!domain.metadata?.hasCastSpellThisTurn,spellState:Rules.getState(domain),
 pieces:Rules.pieces(domain).map(p=>({id:p.id,owner:p.ownerId,type:p.variantId,square:p.position,frozen:!!p.metadata?.isFrozen,jump:!!p.metadata?.canBeJumpedOver}))});
const cases=[];
for(const geometry of TACTICAL_GEOMETRIES)for(const condition of TACTICAL_CONDITIONS)for(const mirror of [false,true]){
 const fixture=tacticalEquivalenceFixture(geometry,condition,mirror),domain=fixture.domain;
 const after=Rules.simulate(domain,fixture.poisonedCapture,topology);
 const winningReply=Generator.findKingCapture(after,after.activePlayer,topology);
 assert((allCaptures(after).length>0)===condition.losesKing,'Exhaustive reply mismatch: '+domain.matchId);
 assert(!!winningReply===condition.losesKing,'Incorrect resource-dependent reply: '+domain.matchId);
 const decision=decide(domain,${budget});
 const diagnostic=decision.spellTrace.candidates.find(d=>d.action.spell.type==='NONE'&&d.action.move.pieceId===fixture.poisonedCapture.move.pieceId&&d.action.move.to===fixture.poisonedCapture.move.to);
 assert(diagnostic?.safetyChecked&&diagnostic.allowsImmediateKingCapture===condition.losesKing,'Incorrect N5 diagnostic: '+domain.matchId);
 const selected=describe(domain,actionOf(decision));
 assert(allCaptures(selected.after).length===0,'Unsafe action under exhaustive replies: '+domain.matchId);
 assert(!Generator.findKingCapture(selected.after,selected.after.activePlayer,topology),'N5 chose unsafe action: '+domain.matchId);
 assert(!(selected.after.isGameOver&&selected.after.winnerId&&selected.after.winnerId!==domain.activePlayer),'N5 chose a losing terminal: '+domain.matchId);
 cases.push({geometry:geometry.name,piece:geometry.piece,blockerType:geometry.blockerType,blockerOwner:mirror?(geometry.blockerOwner==='P1'?'P2':'P1'):geometry.blockerOwner,condition:condition.name,mirror,expectedLosingCapture:condition.losesKing,
  stateBefore:snapshot(domain),afterCounterfactual:snapshot(after),diagnostic,winningReply:winningReply??null,selected:{label:selected.label,action:selected.action},
  depthReached:decision.depthReached,nodes:decision.nodesEvaluated,elapsedMs:decision.elapsedMs,fallbackUsed:!!decision.fallbackUsed});
}
const freezeDefenses=[];
for(const geometry of TACTICAL_GEOMETRIES)for(const mirror of [false,true]){
 const domain=mandatoryFreezeFixture(geometry,mirror);
 const resources=SpellChessSearch.resources(domain,domain.activePlayer);
 const withoutFreeze=Generator.generateTurnActions(domain,domain.activePlayer,topology,{...resources,freezeRemaining:0});
 assert(withoutFreeze.length>0&&withoutFreeze.every(a=>allCaptures(Rules.simulate(domain,a,topology)).length>0),'Freeze was not necessary in fixture: '+domain.matchId);
 const decision=decide(domain,150);
 assert(decision.secondaryAction?.payload.spellType==='FREEZE','N5 missed mandatory Freeze: '+domain.matchId);
 const selected=describe(domain,actionOf(decision));
 assert(CheckValidator.findRoyalPiece(domain.activePlayer,selected.after),'Freeze defense lost the king');
 assert(allCaptures(selected.after).length===0,'Freeze defense permits immediate capture');
 if(selected.after.isGameOver)assert(selected.after.winnerId===null&&RulesEngine.getGameResult(selected.after,topology).status==='STALEMATE','Unexpected terminal defense');
 freezeDefenses.push({geometry:geometry.name,mirror,stateBefore:snapshot(domain),stateAfter:snapshot(selected.after),withoutFreezeEveryActionLosesKing:true,selected:{label:selected.label,action:selected.action},
  opponentHasKingCapture:false,result:{isGameOver:selected.after.isGameOver,winnerId:selected.after.winnerId},
  depthReached:decision.depthReached,nodes:decision.nodesEvaluated,fallbackUsed:!!decision.fallbackUsed});
}
export default {historicalReconstruction:false,note:'Deterministic controlled fixtures; original spell chronology remains unknown.',
 originalPosition:{domain:position,rejected:{label:first.label,materialGainCp:rejected.capturedMaterialCp,score:rejected.score,
  diagnostic:rejected,reply:{label:reply.label,action:reply.action},result:{winner:reply.after.winnerId,
  kingActuallyCaptured:reply.after.boardEntities.bk.isCaptured}},chosen:{label:chosen.label,action:chosen.action,
  immediateEnemyKingCaptureAvailable:false},principalVariation:pv,depthReached:result.depthReached,nodes:result.nodesEvaluated,
  elapsedMs:result.elapsedMs,liveInputStillInProgress:!position.isGameOver&&position.winnerId===null},
 summary:{geometries:TACTICAL_GEOMETRIES.length,conditions:TACTICAL_CONDITIONS.length,colors:2,cases:cases.length,
  losingCaptures:cases.filter(c=>c.expectedLosingCapture).length,nonLosingImmediateCaptures:cases.filter(c=>!c.expectedLosingCapture).length,
  exhaustiveReplyEnumeration:true,mandatoryFreezeCases:freezeDefenses.length,totalCases:cases.length+freezeDefenses.length,
  freezeDraws:freezeDefenses.filter(c=>c.result.isGameOver).length,mismatches:0,unsafeSelections:0,fallbacks:cases.filter(c=>c.fallbackUsed).length,budgetMs:${budget}},cases,freezeDefenses};
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const result = (await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)).default;
writeFileSync(resolve(directory, 'tactical-equivalence.json'), JSON.stringify(result, null, 2));
const p = result.originalPosition;
const lines = ['# PATCH-12 — Evidência de generalização tática', '',
  'Fixtures determinísticas de teste. Não constituem reconstrução dos feitiços da sessão histórica.', '',
  `Linha rejeitada pelo N5: **${p.rejected.label} → ${p.rejected.reply.label} → rei preto capturado**.`,
  `Ganho material: ${p.rejected.materialGainCp} cp. Avaliação do candidato: ${p.rejected.score} cp.`,
  `Alternativa escolhida: **${p.chosen.label}**. Captura imediata adversária após sua execução: nenhuma.`,
  `Linha principal calculada: ${p.principalVariation.map(s => s.label).join(' → ')}.`,
  `Profundidade concluída: ${p.depthReached}; nós: ${p.nodes}; tempo: ${p.elapsedMs.toFixed(2)} ms.`, '',
  `Matriz: ${result.summary.geometries} geometrias × ${result.summary.conditions} estados de feitiços × 2 cores = **${result.summary.cases} casos**.`,
  `Defesas obrigatórias com Freeze: **${result.summary.mandatoryFreezeCases}**, incluindo ${result.summary.freezeDraws} empate(s) legal(is) sem ações disponíveis. Total: **${result.summary.totalCases} casos**.`,
  `${result.summary.losingCaptures} capturas da dama permitem a captura imediata do rei; ${result.summary.nonLosingImmediateCaptures} não permitem essa resposta imediata.`,
  `Divergências: ${result.summary.mismatches}. Escolhas inseguras: ${result.summary.unsafeSelections}. Fallbacks: ${result.summary.fallbacks}.`, '',
  '| Geometria | Atacante | Bloqueador | Condição | Cores | Casos |', '| --- | --- | --- | --- | ---: | ---: |',
  ...TACTICAL_ROWS(result.cases), '',
  'Os testes verificam a captura concreta com as regras compartilhadas e a estratégia N5 usada em produção. Não há regra especial para Kxf7 ou para as casas da partida relatada.', '',
  '[Dados completos, diagnósticos e ações](tactical-equivalence.json).', ''];
writeFileSync(resolve(directory, 'TACTICAL-EQUIVALENCE.md'), lines.join('\n'));
console.log(JSON.stringify({ originalPosition: { rejected: p.rejected.label, reply: p.rejected.reply.label,
  chosen: p.chosen.label, score: p.rejected.score, principalVariation: p.principalVariation.map(s => s.label) }, summary: result.summary }, null, 2));

function TACTICAL_ROWS(cases) {
  const rows = new Map();
  for (const c of cases) {
    const relation = c.blockerOwner === (c.mirror ? 'P2' : 'P1') ? 'aliado' : 'adversário';
    const key = `${c.geometry}|${c.piece}|${c.blockerType} (${relation})|${c.condition}`;
    rows.set(key, (rows.get(key) ?? 0) + 1);
  }
  return [...rows].map(([key, count]) => `| ${key.split('|').join(' | ')} | 2 | ${count} |`);
}

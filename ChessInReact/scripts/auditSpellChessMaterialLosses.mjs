import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const archive=JSON.parse(readFileSync('docs/autonomous/patches/patch12-evidence/benchmark.json','utf8'));
const comparison=JSON.parse(readFileSync('docs/autonomous/patches/patch13-evidence/material-benchmark.json','utf8'));
const bundle=await build({stdin:{contents:`
import { OfficialSpellRules as R } from './src/engine/variants/spells/OfficialSpellRules';
import { OfficialSpellEngine } from './src/engine/variants/spells/OfficialSpellEngine';
import { SpellChessMaterialSafety as S } from './src/workers/ai/strategies/spell/SpellChessMaterialSafety';
import { SpellChessMoveGenerator as G } from './src/workers/ai/strategies/spell/SpellChessMoveGenerator';
import { SquareTopology } from './src/core/topology/SquareTopology';
import { createDefaultDomainState } from './src/core/state/initialState';
import { createStandardChessPieces } from './src/core/bootstrap/GameInitializer';
const archive=${JSON.stringify(archive)}, comparison=${JSON.stringify(comparison)};
const topology=new SquareTopology({width:8,height:8}),results=[];
for (const [gi,game] of archive.games.entries()) {
 let state=createDefaultDomainState('benchmark','SPELL_CHESS_KING_CAPTURE_ONLY');
 for(const p of createStandardChessPieces()){state.boardEntities[p.id]=p;state.occupancy[p.position]=p.id;}
 state=R.sync(state,OfficialSpellEngine.createInitialState());const x=game.opening==='d3'?3:4;
 state=R.simulate(state,{spell:{type:'NONE'},move:{pieceId:state.occupancy[x+',1'],from:x+',1',to:x+',2'}},topology);
 for (const [i,turn] of game.turns.entries()) {
  const row=comparison.games[gi].decisions.find(r=>r.ply===i+1);
  if(row&&row.current.materialDeltaCp < -200) {
   const base=S.balance(state,state.activePlayer);let best=-Infinity,bestAction,actions=0,kingSafeActions=0;
   const start=performance.now();
   for(const action of G.iterateTurnActions(state,state.activePlayer,topology,S.resources(state))) {
    actions++;const next=R.simulate(state,action,topology),royal=G.findKingCapture(next,next.activePlayer,topology);
    if(royal)continue;kingSafeActions++;
    const value=S.inspect(next,state.activePlayer,topology).score-base;
    if(value>best){best=value;bestAction=action;}
   }
   results.push({gameIndex:gi,ply:i+1,chosenDeltaCp:row.current.materialDeltaCp,bestAvailableDeltaCp:best,
    bestAction,actions,kingSafeActions,avoidableAdditionalLossCp:Number.isFinite(best)?best-row.current.materialDeltaCp:0,
    missesMaterialDefenseByMoreThanTwoPawns:Number.isFinite(best)&&best-row.current.materialDeltaCp>200,avoidableSevereLoss:best>=-200,elapsedMs:performance.now()-start,
    explanation:!kingSafeActions?'Every legal action permits immediate royal capture':best < -200?'Every king-safe action loses material within the bounded exchange model':'A material-safe alternative exists'});
   console.error('Audited',gi,i+1,'chosen',row.current.materialDeltaCp,'best',best,'actions',actions);
  }
  state=R.simulate(state,turn.action,topology);
 }
}
export default {results,avoidable:results.filter(r=>r.avoidableSevereLoss).length,missedMaterialDefenses:results.filter(r=>r.missesMaterialDefenseByMoreThanTwoPawns).length,notes:'Exhaustive legal root alternatives, bounded local capture exchange; not a proof of long-term loss.'};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false});
const result=process.env.SPELL_MATERIAL_REPORT_ONLY==='1'?JSON.parse(readFileSync('docs/autonomous/patches/patch13-evidence/material-loss-audit.json','utf8')):(await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))).default;
writeFileSync('docs/autonomous/patches/patch13-evidence/material-loss-audit.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));

const a = comparison.summary.previous, b = comparison.summary.current;
const square = c => { const [x,y]=c.split(',').map(Number); return String.fromCharCode(97+x)+(y+1); };
const label = action => {
 if (!action) return '—';
 const type = action.move.pieceId.split('-')[1];
 const symbol = {queen:'Q',king:'K',rook:'R',bishop:'B',knight:'N',pawn:''}[type] ?? '';
 const move = symbol+square(action.move.from)+(action.move.isCapture?'x':'-')+square(action.move.to);
 return (action.spell.type==='NONE'?'':action.spell.type+'('+square(action.spell.targetSquare)+') + ')+move;
};
const first = comparison.games.map(g=>g.decisions[0]);
const lines = [
 '# PATCH-13 — Comparação material com as 12 partidas do PATCH-12', '',
 'Data: 27/11/2026. Foram reproduzidas '+comparison.replayedActions+' ações legais das 12 partidas arquivadas e recalculadas '+b.decisions+' decisões do N5 nos mesmos estados. Orçamento solicitado: '+comparison.budgetMs+' ms por decisão, abaixo dos 2.500 ms usados pelo controlador em produção.', '',
 '**As novas decisões são contrafactuais, não partidas novas.** Os resultados terminais das partidas arquivadas foram conferidos; nenhum placar novo ou Elo é inferido.', '',
 '| Métrica no modelo de trocas legais | PATCH-12 arquivado | PATCH-13 |',
 '| --- | ---: | ---: |',
 ...[
  ['Decisões', a.decisions,b.decisions],
  ['Quedas de saldo material maiores que 200 cp',a.severeMaterialLosses,b.severeMaterialLosses],
  ['Captura do próprio rei disponível na linha',a.royalLosses,b.royalLosses],
  ['Jump seguido de queda grave de saldo',a.wastedJump,b.wastedJump],
  ['Dama capturada na continuação de troca escolhida',a.queenCapturedInExchangeLine,b.queenCapturedInExchangeLine],
  ['Dama capturada nessa linha sem compensação material',a.uncompensatedQueenInExchangeLine,b.uncompensatedQueenInExchangeLine],
  ['Dama sacrificada com compensação demonstrada nessa linha',a.queenSacrificesWithDemonstratedCompensation,b.queenSacrificesWithDemonstratedCompensation],
  ['Vitória imediata identificada',a.immediateRoyalCaptures,b.immediateRoyalCaptures],
  ['Profundidade global zero',a.depthZero,b.depthZero],
  ['Decisões novas sem inspeção material concluída','não registrado',b.unchecked],
  ['Tempo médio medido (ms)',a.averageMs.toFixed(2),b.averageMs.toFixed(2)],
 ].map(row=>'| '+row.join(' | ')+' |'), '',
 'Uma queda de saldo inclui capturas, trocas e promoções: não equivale automaticamente a um erro evitável. O modelo pesquisa a resposta capturante e recapturas locais, com limite de três capturas; não prova compensação em qualquer horizonte.', '',
 'No arquivo histórico real, a dama foi perdida em '+comparison.summary.actualArchivedQueenLossesOneReply+' decisões dentro de uma resposta e em '+comparison.summary.actualArchivedQueenLossesTwoReplies+' dentro de duas respostas. Esses eventos observados são separados das previsões nas novas decisões.', '',
 '## Primeira decisão de cada partida', '',
 'Notação longa indica origem e destino; não é uma reconstrução de SAN completa.', '',
 '| Partida | Ação antiga | Resposta realmente jogada | Resposta capturante calculada | Nova ação | Saldo antigo / novo (cp) | Profundidade nova |',
 '| --- | --- | --- | --- | --- | ---: | ---: |',
 ...first.map((r,i)=>'| '+[i+1,label(r.previousAction),label(r.previous.actualReply),label(r.previous.bestCaptureReply),label(r.currentAction),r.previous.materialDeltaCp+' / '+r.current.materialDeltaCp,r.current.depth].join(' | ')+' |'), '',
 'A resposta calculada pode diferir da histórica, inclusive por empate na avaliação material. As duas são apresentadas separadamente; os flags de captura ausentes no arquivo antigo foram derivados do replay, não presumidos como movimentos tranquilos.', '',
 '## Auditoria das perdas restantes', '',
 'Todos os candidatos legais foram enumerados nos '+result.results.length+' estados restantes com perda grave de saldo ou ameaça terminal. Alternativas que evitariam a perda grave: **'+result.avoidable+'**. Defesas materiais melhores por mais de dois peões que a decisão escolhida: **'+result.missedMaterialDefenses+'**.', '',
 'Isso descreve esses estados históricos, alguns já perdidos: não prova que a perda original era inevitável vários lances antes. O caso sem qualquer ação segura para o rei fica separado. A análise das alternativas usa o mesmo módulo de troca e, portanto, valida a seleção dentro desse modelo; as regressões independentes validam capturas executadas e saldos esperados.', '',
 '## Tempo e chave de transposição', '',
 'Na microcomparação das partes caras da chave antiga, '+comparison.summary.keyTiming.samples+' estados × '+comparison.summary.keyTiming.rounds+' repetições: antiga '+comparison.summary.keyTiming.oldKeyMs.toFixed(2)+' ms; compacta '+comparison.summary.keyTiming.newKeyMs.toFixed(2)+' ms. Última chave: '+comparison.summary.keyTiming.lastOldLength+' versus '+comparison.summary.keyTiming.lastNewLength+' caracteres. A chave antiga foi reconstruída pelo comparador; isso não mede aceleração integral da engine.', '',
 'A inspeção obrigatória tem custo real e pode ultrapassar um orçamento muito curto para concluir o primeiro candidato. Profundidade global zero continua frequente; agora a ação escolhida passou pela inspeção material. A cobertura parcial é registrada, e essa distinção não homologa força geral de N5.', '',
 'Dados: [decisão por decisão](material-benchmark.json), [auditoria das alternativas](material-loss-audit.json), [navegador real](browser.json) e [gates e hashes](validation.json).', '',
];
writeFileSync('docs/autonomous/patches/patch13-evidence/MATERIAL-COMPARISON.md',lines.join('\n'));

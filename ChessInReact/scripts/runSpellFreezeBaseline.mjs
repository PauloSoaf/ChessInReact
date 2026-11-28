import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
const b=await build({stdin:{contents:`
import {freezeEconomyImage,imageAction} from './src/workers/ai/strategies/spell/testing/FreezeEconomyFixtures';
import {materialTopology as topology} from './src/workers/ai/strategies/spell/testing/MaterialSafetyFixtures';
import {SpellOptimizationStrategy} from './src/workers/ai/strategies/SpellOptimizationStrategy';
import {SpellChessMaterialSafety as S} from './src/workers/ai/strategies/spell/SpellChessMaterialSafety';
import {OfficialSpellRules as R} from './src/engine/variants/spells/OfficialSpellRules';
import {RulesEngine} from './src/engine/rules/RulesEngine';
import {SpellChessPositionEvaluator as E} from './src/workers/ai/strategies/spell/SpellChessPositionEvaluator';
import {SpellChessSearch} from './src/workers/ai/strategies/spell/SpellChessSearch';
const domain=freezeEconomyImage();
const d=new SpellOptimizationStrategy().decideMove({matchId:domain.matchId,variantId:domain.variantId,actingPlayer:domain.activePlayer,
 domain,topology,difficultyLevel:5,timeBudgetMs:2500,legalMoves:RulesEngine.getLegalMoves(domain,topology)});
const actions=[['Nf6',imageAction(domain,'6,7','5,5')],['Freeze(a4)+Nf6',imageAction(domain,'6,7','5,5',{type:'FREEZE',targetSquare:'0,3'})],
 ['Freeze(a4)+a6',imageAction(domain,'0,6','0,5',{type:'FREEZE',targetSquare:'0,3'})],['Nb8',imageAction(domain,'2,5','1,7')],['d5',imageAction(domain,'3,6','3,4')]];
const comparisons=actions.map(([label,action])=>{const start=performance.now();const next=R.simulate(domain,action,topology);const material=S.inspect(next,'P2',topology);console.error(label,performance.now()-start,'ms',material.simulations,'simulations');return {label,action,elapsedMs:performance.now()-start,
 evaluation:E.evaluate(next,'P2',topology,SpellChessSearch.resources(next,'P2'),SpellChessSearch.resources(next,'P1')),
 material,resources:R.getState(next)};});
export default {hypothesis:true,domain,decision:d,comparisons};
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const r=(await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))).default;
mkdirSync('docs/autonomous/patches/patch14-evidence',{recursive:true});
writeFileSync('docs/autonomous/patches/patch14-evidence/'+(process.env.SPELL_FREEZE_OUTPUT ?? 'image-current.json'),JSON.stringify(r,null,2));
console.log(JSON.stringify({move:r.decision.move,spell:r.decision.secondaryAction,depth:r.decision.depthReached,elapsed:r.decision.elapsedMs,
 comparisons:r.comparisons.map(c=>({label:c.label,evaluation:c.evaluation,material:c.material.score,line:c.material.line}))},null,2));

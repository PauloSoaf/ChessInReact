import {SpellChessProfiler} from './SpellChessProfiler';
import {SpellChessSimulation} from './SpellChessSimulation';
import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { OfficialSpellRules as R } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessMaterialSafety as Material } from './SpellChessMaterialSafety';
import { SpellChessPositionEvaluator as Evaluation } from './SpellChessPositionEvaluator';
import { SpellChessMoveGenerator as Generator } from './SpellChessMoveGenerator';
import { CandidateDiagnostic, SpellChessTurnAction, SpellStrategicAlternative, FreezeImpactAnalysis } from './SpellChessTurnAction';

export class SpellChessStrategicAudit {
 public static alternative(d:CandidateDiagnostic|undefined):SpellStrategicAlternative|null {
  return d?{action:d.action,scoreCp:d.score,depthCompleted:d.completedDepth,
   opponentBestReply:d.opponentBestReply??null,replyCoverage:d.replyCoverage??'CAPTURES_ONLY'}:null;
 }
 public static resourceCost(root:IDomainState,next:IDomainState,action:SpellChessTurnAction,player:PlayerId,topology:ITopology):number {
  if(action.spell.type==='NONE')return 0;
  const mine=Material.resources({...next,activePlayer:player}),enemy=Material.resources({...next,activePlayer:player==='P1'?'P2':'P1'});
  const restored={...mine,...(action.spell.type==='FREEZE'?{freezeRemaining:mine.freezeRemaining+1,freezeCooldown:0}:{jumpRemaining:mine.jumpRemaining+1,jumpCooldown:0})};
  void root;
  const actual=SpellChessProfiler.measure('evaluation',()=>Evaluation.explain(next,player,topology,mine,enemy)),saved=SpellChessProfiler.measure('evaluation',()=>Evaluation.explain(next,player,topology,restored,enemy));
  return saved.inventory+saved.readiness-actual.inventory-actual.readiness;
 }
 public static freezeImpact(root:IDomainState,next:IDomainState,chosen:CandidateDiagnostic,baseline:CandidateDiagnostic|undefined,
  pv:SpellChessTurnAction[],player:PlayerId,topology:ITopology):FreezeImpactAnalysis|null {
  if(chosen.action.spell.type!=='FREEZE')return null;
  const [x,y]=chosen.action.spell.targetSquare.split(',').map(Number);
  const affected=R.pieces(root).filter(p=>{const [px,py]=p.position.split(',').map(Number);return Math.abs(px-x)<=1&&Math.abs(py-y)<=1;}).map(p=>p.id);
  let end=next;for(const action of pv.slice(1))end=SpellChessSimulation.run(end,action,topology);
  const normalState=baseline?SpellChessSimulation.run(root,baseline.action,topology):undefined;
  const directCount=(s:IDomainState)=>s.isGameOver?0:Generator.getLegalCaptures(s,topology).length;
  const terminalBaseline=baseline?.materialOutcome!==undefined;
  const full=Boolean(baseline&&baseline.completedDepth>=2&&baseline.completedDepth===chosen.completedDepth&&
   baseline.replyCoverage==='FULL_TURN'&&chosen.replyCoverage==='FULL_TURN');
  return {affectedPieces:affected,threatsRemoved:baseline?Math.max(0,Number((baseline.materialLossCp??0)>200)-Number((chosen.materialLossCp??0)>200)):null,
   threatsCreated:null,
   kingSafetyImprovement:baseline?Number(baseline.allowsImmediateKingCapture&&!chosen.allowsImmediateKingCapture):null,
   materialSavedCp:baseline&&!terminalBaseline&&!chosen.materialOutcome?Math.max(0,(chosen.materialBalanceAfterRepliesCp??0)-(baseline.materialBalanceAfterRepliesCp??0)):null,
   materialWonCp:Math.max(0,Material.balance(end,player)-Material.balance(root,player)),
   attacksNeutralized:normalState?Math.max(0,directCount(normalState)-directCount(next)):null,
   concreteFollowUp:pv,opponentBestResponse:pv[1]??chosen.opponentBestReply??null,
   counterFreezeRisk:chosen.counterFreezeRepliesSearched??0,resourceOpportunityCostCp:this.resourceCost(root,next,chosen.action,player,topology),
   expectedNetBenefitCp:full&&baseline?chosen.score-baseline.score:null,provedBySearch:full};
 }
}

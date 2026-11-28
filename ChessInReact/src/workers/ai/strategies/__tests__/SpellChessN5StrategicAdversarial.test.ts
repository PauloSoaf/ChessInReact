import {describe,expect,it} from 'vitest';
import {createDefaultDomainState} from '../../../../core/state/initialState';
import {IDomainState} from '../../../../core/state/gameState';
import {OfficialSpellEngine} from '../../../../engine/variants/spells/OfficialSpellEngine';
import {OfficialSpellRules as R} from '../../../../engine/variants/spells/OfficialSpellRules';
import {SpellChessSearch} from '../spell/SpellChessSearch';
import {SpellChessMaterialSafety as S} from '../spell/SpellChessMaterialSafety';
import {SpellChessPositionEvaluator as E} from '../spell/SpellChessPositionEvaluator';
import {SpellChessStrategicAudit as Audit} from '../spell/SpellChessStrategicAudit';
import {SpellChessMoveGenerator as G} from '../spell/SpellChessMoveGenerator';
import {SpellChessTurnAction} from '../spell/SpellChessTurnAction';
import {addPiece,mirrorColors,queenTrap} from '../spell/testing/KingSafetyFixtures';
import {imageAction} from '../spell/testing/FreezeEconomyFixtures';
import {materialTopology as t} from '../spell/testing/MaterialSafetyFixtures';

function horizon(d:IDomainState){
 const engine=new SpellChessSearch() as unknown as {deadline:number;quiescence:(d:IDomainState,t:typeof import('../spell/testing/MaterialSafetyFixtures').materialTopology,a:number,b:number,ply:number,q:number)=>{score:number;pv:SpellChessTurnAction[]}};
 engine.deadline=performance.now()+2000;return engine.quiescence(d,t,-Infinity,Infinity,0,0);
}
function rookCheck(freeze:number,cooldown=0,frozen=false):IDomainState{
 let d=createDefaultDomainState('patch14-horizon','SPELL_CHESS_KING_CAPTURE_ONLY');
 addPiece(d,'wk','P1','KING','4,0');addPiece(d,'wp','P1','PAWN','0,1');addPiece(d,'bk','P2','KING','7,7');addPiece(d,'br','P2','ROOK','4,7');
 const s=OfficialSpellEngine.createInitialState();d=R.sync(d,{...s,whiteCharges:{freezeCharges:freeze,jumpCharges:0,freezeCooldownTurns:cooldown,jumpCooldownTurns:0},
 blackCharges:{freezeCharges:0,jumpCharges:0,freezeCooldownTurns:0,jumpCooldownTurns:0},activeFrozenPieceIds:frozen?{wk:1}:{}});return d;
}
describe('PATCH-14: adversarial horizon and scarcity',()=>{
 for(const mirror of [false,true]){
  it(`a hypothetical pass is not mate when the king can evade, mirror=${mirror}`,()=>{
   const d=mirror?mirrorColors(rookCheck(0)):rookCheck(0),r=horizon(d);
   expect(r.score).toBeGreaterThan(-90000);expect(r.pv.length).toBeGreaterThan(0);
   const next=R.simulate(d,r.pv[0],t);expect(G.findKingCapture(next,next.activePlayer,t)).toBeUndefined();
  });
  it(`the last Freeze defends a temporarily immobile king, mirror=${mirror}`,()=>{
   const d=mirror?mirrorColors(rookCheck(1,0,true)):rookCheck(1,0,true),r=horizon(d);
   expect(r.score).toBeGreaterThan(-90000);expect(r.pv[0].spell.type).toBe('FREEZE');
  });
  it(`cooldown blocks that defense and every actual legal move loses the king, mirror=${mirror}`,()=>{
   const d=mirror?mirrorColors(rookCheck(1,1,true)):rookCheck(1,1,true),r=horizon(d);
   expect(r.score).toBeLessThan(-90000);
   const actions=G.generateTurnActions(d,d.activePlayer,t,SpellChessSearch.resources(d,d.activePlayer));
   expect(actions.length).toBeGreaterThan(0);
   expect(actions.every(a=>G.findKingCapture(R.simulate(d,a,t),d.activePlayer==='P1'?'P2':'P1',t))).toBe(true);
  });
  it(`Freeze the king plus a waiting move is a real royal threat, not a zero-valued exchange, mirror=${mirror}`,()=>{
   let d=queenTrap({beforeCapture:true,bishopFrozen:2});const s=R.getState(d);
   d=R.sync(d,{...s,whiteCharges:{freezeCharges:1,jumpCharges:1,freezeCooldownTurns:0,jumpCooldownTurns:0},
    blackCharges:{freezeCharges:0,jumpCharges:0,freezeCooldownTurns:0,jumpCooldownTurns:0}});
   if(mirror)d=mirrorColors(d);
   const a=imageAction(d,'4,7','5,6',{type:'NONE'},mirror),n=R.simulate(d,a,t),proof=S.inspect(n,d.activePlayer,t,()=>{},undefined,3,1,1,a.move.to);
   expect(proof.outcome).toBe('LOSS');expect(proof.score).toBeLessThan(-90000);
   expect(proof.line[0].spell.type).toBe('FREEZE');let end=n;for(const turn of proof.line)end=R.simulate(end,turn,t);
   expect(end.winnerId).not.toBe(d.activePlayer);expect(end.isGameOver).toBe(true);
  },10000);
 }
 it('spending the last Freeze is not cheaper than spending the penultimate on the same board',()=>{
  const costs=[1,2].map(charges=>{let d=rookCheck(charges);addPiece(d,'block','P2','PAWN','4,5');
   const s=R.getState(d);d=R.sync(d,{...s,blackCharges:{...s.blackCharges,jumpCharges:1}});
   const a=imageAction(d,'0,1','0,2',{type:'FREEZE',targetSquare:'4,7'}),n=R.simulate(d,a,t);return Audit.resourceCost(d,n,a,'P1',t);});
  expect(costs[0]).toBeGreaterThanOrEqual(costs[1]);expect(costs[0]).toBeGreaterThan(0);
 });
 it('increasing only Jump cooldown cannot improve the same position',()=>{
  let d=createDefaultDomainState('patch14-cooldown','SPELL_CHESS_KING_CAPTURE_ONLY');
  addPiece(d,'wk','P1','KING','7,0');addPiece(d,'wr','P1','ROOK','0,0');addPiece(d,'bk','P2','KING','0,7');addPiece(d,'bp','P2','PAWN','0,6');
  const s=OfficialSpellEngine.createInitialState();d=R.sync(d,{...s,whiteCharges:{freezeCharges:0,jumpCharges:1,freezeCooldownTurns:0,jumpCooldownTurns:0},
   blackCharges:{freezeCharges:1,jumpCharges:0,freezeCooldownTurns:0,jumpCooldownTurns:0}});
  const scores=[0,1,2,3].map(cd=>E.evaluate(d,'P1',t,{freezeRemaining:0,jumpRemaining:1,freezeCooldown:0,jumpCooldown:cd},SpellChessSearch.resources(d,'P2')));
  for(let i=1;i<scores.length;i++)expect(scores[i]).toBeLessThanOrEqual(scores[i-1]);
 });
 it('does not expose a mutable cached positional explanation',()=>{
  const d=rookCheck(1),r=E.explain(d,'P1',t,SpellChessSearch.resources(d,'P1'),SpellChessSearch.resources(d,'P2'));
  expect(Object.isFrozen(r)).toBe(true);expect(Number.isFinite(r.total)).toBe(true);
 });
});

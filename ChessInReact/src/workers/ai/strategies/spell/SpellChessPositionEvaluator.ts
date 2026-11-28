import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId } from '../../../../core/coordinates/types';
import { IPieceEntity } from '../../../../core/entities/types';
import { ITopology } from '../../../../core/topology/types';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { OfficialSpellEngine } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { SpellChessThreatAnalyzer as Rays } from './SpellChessThreatAnalyzer';
import { SpellResources } from './SpellChessTurnAction';
import { SpellChessResources } from './SpellChessResources';

export const SPELL_CHESS_MATE_SCORE = 100_000;
const VALUES: Record<string,number> = {PAWN:100,KNIGHT:320,BISHOP:330,ROOK:500,QUEEN:900,KING:0};
export interface SpellPositionEvaluation {
 material: number; mobility: number; development: number; coordination: number;
 pawnStructure: number; openFiles: number; kingSafety: number; exposure: number;
 inventory: number; readiness: number; terminal: number | null; total: number;
}

/** Positional terms use the board after temporary fields expire. Freeze earns no immobilization bonus. */
export class SpellChessPositionEvaluator {
 private static readonly cache = new WeakMap<IDomainState, WeakMap<ITopology, Map<string,SpellPositionEvaluation>>>();
 public static evaluate(domain: IDomainState, player: PlayerId, topology: ITopology,
  mine: SpellResources, enemy: SpellResources, _frozen: readonly string[] = [], _jump: readonly string[] = [], ply = 0): number {
  void _frozen; void _jump;
  return this.explain(domain,player,topology,mine,enemy,ply).total;
 }
 public static explain(domain: IDomainState, player: PlayerId, topology: ITopology,
  mine: SpellResources, enemy: SpellResources, ply = 0): SpellPositionEvaluation {
  const result: SpellPositionEvaluation = {material:0,mobility:0,development:0,coordination:0,pawnStructure:0,
   openFiles:0,kingSafety:0,exposure:0,inventory:0,readiness:0,terminal:null,total:0};
  const opponent: PlayerId = player==='P1'?'P2':'P1';
  const captured = Object.values(domain.boardEntities).filter((p):p is IPieceEntity=>p.type==='PIECE'&&p.isCaptured&&p.variantId==='KING');
  const terminal = captured.some(p=>p.ownerId===opponent)?SPELL_CHESS_MATE_SCORE-ply:
   captured.some(p=>p.ownerId===player)?-SPELL_CHESS_MATE_SCORE+ply:domain.isGameOver?
    domain.winnerId===null?0:domain.winnerId===player?SPELL_CHESS_MATE_SCORE-ply:-SPELL_CHESS_MATE_SCORE+ply:undefined;
  if(terminal!==undefined)return {...result,terminal,total:terminal};
  const key=JSON.stringify([player,mine,enemy]);
  let byTopology=this.cache.get(domain);if(!byTopology){byTopology=new WeakMap();this.cache.set(domain,byTopology);}
  let cached=byTopology.get(topology);if(!cached){cached=new Map();byTopology.set(topology,cached);}
  const prior=cached.get(key);if(prior)return prior;
  const spells=OfficialSpellRules.getState(domain);
  const stable=OfficialSpellRules.sync(domain,OfficialSpellEngine.advanceTurn(OfficialSpellEngine.advanceTurn(spells,'WHITE'),'BLACK'));
  const pieces=OfficialSpellRules.pieces(stable);
  const moves=(side:PlayerId)=>RulesEngine.getLegalMoves({...stable,activePlayer:side,metadata:{...stable.metadata,hasCastSpellThisTurn:false}},topology);
  const ownMoves=moves(player),enemyMoves=moves(opponent);
  // These are real normal-move mobilities after expiry; tactical spell legality is searched separately.
  result.mobility=(ownMoves.length-enemyMoves.length)*2;
  const attacks=(side:PlayerId,target:IPieceEntity)=>pieces.filter(p=>p.ownerId===side&&p.id!==target.id).filter(p=>{
   const [x,y]=Rays.parseCoord(p.position),[tx,ty]=Rays.parseCoord(target.position),dx=tx-x,dy=ty-y;
   if(p.variantId==='KNIGHT')return Math.abs(dx)*Math.abs(dy)===2;
   if(p.variantId==='PAWN')return Math.abs(dx)===1&&dy===(side==='P1'?1:-1);
   if(p.variantId==='KING')return Math.max(Math.abs(dx),Math.abs(dy))===1;
   if(!(p.variantId==='QUEEN'&&(dx===0||dy===0||Math.abs(dx)===Math.abs(dy))||
    p.variantId==='ROOK'&&(dx===0||dy===0)||p.variantId==='BISHOP'&&Math.abs(dx)===Math.abs(dy)))return false;
   const sx=Math.sign(dx),sy=Math.sign(dy);let cx=x+sx,cy=y+sy;
   while(cx!==tx||cy!==ty){if(stable.occupancy[`${cx},${cy}` as keyof typeof stable.occupancy])return false;cx+=sx;cy+=sy;}
   return true;
  }).length;
  const danger: Record<string,number> = {[player]:0,[opponent]:0};
  for(const p of pieces){
   const sign=p.ownerId===player?1:-1,[x,y]=Rays.parseCoord(p.position),rank=p.ownerId==='P1'?y:7-y;
   result.material+=sign*(VALUES[p.variantId]??100);
   if(p.variantId==='KNIGHT'||p.variantId==='BISHOP'){
    result.development+=sign*((p.hasMoved?8:0)+(7-Math.abs(x-3.5)-Math.abs(y-3.5))*3);
   }
   const support=attacks(p.ownerId,p);
   if(p.variantId!=='KING'&&support)result.coordination+=sign*Math.min(support,2)*3;
   if(p.variantId==='PAWN'){
    const ownPawns=pieces.filter(q=>q.ownerId===p.ownerId&&q.variantId==='PAWN'&&q.id!==p.id);
    if(ownPawns.some(q=>Rays.parseCoord(q.position)[0]===x))result.pawnStructure-=sign*6;
    if(!ownPawns.some(q=>Math.abs(Rays.parseCoord(q.position)[0]-x)===1))result.pawnStructure-=sign*8;
    const passed=!pieces.some(q=>q.ownerId!==p.ownerId&&q.variantId==='PAWN'&&Math.abs(Rays.parseCoord(q.position)[0]-x)<=1&&
      (p.ownerId==='P1'?Rays.parseCoord(q.position)[1]>y:Rays.parseCoord(q.position)[1]<y));
    if(passed)result.pawnStructure+=sign*rank*8;
   }
   if(p.variantId==='ROOK'){
    const pawnFile=pieces.filter(q=>q.variantId==='PAWN'&&Rays.parseCoord(q.position)[0]===x);
    result.openFiles+=sign*(!pawnFile.length?12:!pawnFile.some(q=>q.ownerId===p.ownerId)?6:0);
   }
   if(p.variantId==='KING'){
    const royalAttack=(p.ownerId===player?enemyMoves:ownMoves).some(m=>m.isCapture&&m.to===p.position);
    if(royalAttack){danger[p.ownerId]+=SpellChessResources.freezeCp;result.kingSafety-=sign*30;}
    result.kingSafety-=sign*rank*18;
    result.kingSafety+=sign*pieces.filter(q=>q.ownerId===p.ownerId&&q.variantId==='PAWN'&&
      Math.abs(Rays.parseCoord(q.position)[0]-x)<=1&&Rays.parseCoord(q.position)[1]-y===(p.ownerId==='P1'?1:-1)).length*5;
    const rayCount=Rays.detectOneObstacleJumpRays(stable,p.position,p.ownerId).length;
    const attackResources=p.ownerId===player?enemy:mine;
    const availability=attackResources.jumpRemaining>0?1/(1+attackResources.jumpCooldown):0;
    danger[p.ownerId]+=rayCount*SpellChessResources.freezeCp*Number(attackResources.jumpRemaining>0);
    result.kingSafety-=sign*Math.min(30,rayCount*10)*availability;
   }
   const opposingMoves=p.ownerId===player?enemyMoves:ownMoves;
   if(p.variantId!=='KING'&&opposingMoves.some(m=>m.to===p.position&&m.isCapture)){
    // Bounded positional exposure, never a material-loss or terminal proof.
    const risk=support?0:Math.min(30,(VALUES[p.variantId]??0)/20);
    result.exposure-=sign*risk;danger[p.ownerId]+=risk;
   }
  }
  const inventory=(r:SpellResources)=>r.freezeRemaining*SpellChessResources.freezeCp+r.jumpRemaining*SpellChessResources.jumpCp;
  result.inventory=inventory(mine)-inventory(enemy);
  const optionValue=(r:SpellResources,side:PlayerId)=>{
   const risk=Math.min(SpellChessResources.freezeCp,danger[side]??0);
   const freeze=r.freezeRemaining>0?risk/(1+r.freezeRemaining)*(1-Math.min(3,r.freezeCooldown)/3):0;
   const jump=r.jumpRemaining>0?Math.min(30,risk)/(1+r.jumpRemaining)*(1-Math.min(3,r.jumpCooldown)/3):0;
   return freeze+jump;
  };
  result.readiness=optionValue(mine,player)-optionValue(enemy,opponent);
  result.total=Math.max(-20000,Math.min(20000,Object.entries(result).filter(([k])=>k!=='total'&&k!=='terminal').reduce((sum,[,v])=>sum+(v??0),0)));
  cached.set(key,Object.freeze(result));return result;
 }
}

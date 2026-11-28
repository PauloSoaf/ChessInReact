import {describe,expect,it,vi} from 'vitest';
import {asCoordinateKey,asEntityId} from '../../../../core/coordinates';
import {IPieceEntity} from '../../../../core/entities/types';
import {createDefaultDomainState} from '../../../../core/state/initialState';
import {OfficialSpellEngine} from '../../../../engine/variants/spells/OfficialSpellEngine';
import {OfficialSpellRules as R} from '../../../../engine/variants/spells/OfficialSpellRules';
import {SpellChessMoveGenerator as G} from '../spell/SpellChessMoveGenerator';
import {SpellChessSearch} from '../spell/SpellChessSearch';
import {SpellChessTurnAction} from '../spell/SpellChessTurnAction';
import {freezeEconomyImage,offensiveFreezeFixture} from '../spell/testing/FreezeEconomyFixtures';
import {queenTrap,mirrorColors,addPiece} from '../spell/testing/KingSafetyFixtures';
import {materialTopology as t,materialTrap} from '../spell/testing/MaterialSafetyFixtures';
const key=(a:SpellChessTurnAction)=>JSON.stringify([a.spell.type,a.spell.type==='NONE'?'':a.spell.targetSquare,a.move.pieceId,a.move.from,a.move.to,a.move.promotion??'']);
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;}
function special(){const d=createDefaultDomainState('patch14-parity','SPELL_CHESS_KING_CAPTURE_ONLY');addPiece(d,'wk','P1','KING','4,0');addPiece(d,'bk','P2','KING','4,7');return R.sync(d,OfficialSpellEngine.createInitialState());}
const positions=[freezeEconomyImage(),offensiveFreezeFixture(),offensiveFreezeFixture({counterFreeze:1}),queenTrap(),queenTrap({beforeCapture:true,bishopFrozen:1}),
 queenTrap({secondBlocker:true}),materialTrap('BISHOP').domain,materialTrap('KNIGHT').domain];
describe('PATCH-14: exact move/simulation differential oracle',()=>{
 for(const [index,base] of positions.entries())for(const mirror of [false,true])it(`capture fast path equals exhaustive move generation, vector=${index},mirror=${mirror}`,()=>{
  const d=mirror?mirrorColors(base):base,r=SpellChessSearch.resources(d,d.activePlayer);
  const oracle=G.generateTurnActions(d,d.activePlayer,t,r).filter(a=>a.move.isCapture||a.move.promotion).map(key).sort();
  const fast=[...G.iterateTurnActions(d,d.activePlayer,t,r,[],[],undefined,true)].map(key).sort();expect(fast).toEqual(oracle);
 });
 it.each(['capture','castle','en-passant','promotion'] as const)('structural simulation matches JSON oracle on a deep-frozen %s input',kind=>{
  let d=special();let action:SpellChessTurnAction;
  if(kind==='capture'){d=queenTrap({beforeCapture:true});action={spell:{type:'NONE'},move:{pieceId:'bk',from:'4,7',to:'5,6'}};}
  else if(kind==='castle'){
   addPiece(d,'wr','P1','ROOK','7,0');for(const id of ['wk','wr']){const p=d.boardEntities[asEntityId(id)] as IPieceEntity;d.boardEntities[p.id]={...p,hasMoved:false};}
   action={spell:{type:'NONE'},move:{pieceId:'wk',from:'4,0',to:'6,0'}};
  }else if(kind==='en-passant'){
   addPiece(d,'wp','P1','PAWN','4,4');addPiece(d,'bp','P2','PAWN','3,4');d={...d,turnState:{...d.turnState,enPassantTarget:asCoordinateKey('3,5')}};
   action={spell:{type:'NONE'},move:{pieceId:'wp',from:'4,4',to:'3,5'}};
  }else{addPiece(d,'wp','P1','PAWN','0,6');action={spell:{type:'NONE'},move:{pieceId:'wp',from:'0,6',to:'0,7',promotion:'KNIGHT'}};}
  freeze(d);const before=JSON.stringify(d),clock=vi.spyOn(Date,'now').mockReturnValue(123456);
  try{const fast=R.simulate(d,action,t),oracle=R.simulate(d,action,t,'JSON_REFERENCE');expect(JSON.stringify(fast)).toBe(JSON.stringify(oracle));expect(JSON.stringify(d)).toBe(before);}
  finally{clock.mockRestore();}
 });
 it('retains all relevant spell durations, charges and repetition context after a differential sequence',()=>{
  const d=freezeEconomyImage();const actions=G.generateTurnActions(d,d.activePlayer,t,SpellChessSearch.resources(d,d.activePlayer)).slice(0,12);
  const clock=vi.spyOn(Date,'now').mockReturnValue(456789);try{
   for(const a of actions){const f=R.simulate(d,a,t),o=R.simulate(d,a,t,'JSON_REFERENCE');expect(JSON.stringify(f)).toBe(JSON.stringify(o));
    const replies=G.generateTurnActions(o,o.activePlayer,t,SpellChessSearch.resources(o,o.activePlayer)).slice(0,6);
    for(const reply of replies)expect(JSON.stringify(R.simulate(f,reply,t))).toBe(JSON.stringify(R.simulate(o,reply,t,'JSON_REFERENCE')));
   }
  }finally{clock.mockRestore();}
 });
});

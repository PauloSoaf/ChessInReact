import {IDomainState} from '../../../../core/state/gameState';
import {ITopology} from '../../../../core/topology/types';
import {OfficialSpellRules} from '../../../../engine/variants/spells/OfficialSpellRules';
import {SpellChessTurnAction} from './SpellChessTurnAction';
import {SpellChessProfiler} from './SpellChessProfiler';
/** Search-local memoization of the shared immutable transition; never used by live play. */
export class SpellChessSimulation {
 private static cache?:WeakMap<IDomainState,Map<string,IDomainState>>;
 public static begin():void{this.cache=new WeakMap();}
 public static end():void{this.cache=undefined;}
 public static run(domain:IDomainState,action:SpellChessTurnAction,topology:ITopology):IDomainState{
  const key=JSON.stringify([action.spell,action.move.pieceId,action.move.from,action.move.to,action.move.promotion]);
  let entries=this.cache?.get(domain);const found=entries?.get(key);if(found){SpellChessProfiler.hit('simulation');return found;}
  const next=SpellChessProfiler.measure('simulation',()=>OfficialSpellRules.simulate(domain,action,topology));
  if(this.cache){if(!entries){entries=new Map();this.cache.set(domain,entries);}entries.set(key,next);}return next;
 }
}

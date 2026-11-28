export type SpellProfileStage = 'generation' | 'simulation' | 'evaluation' | 'hash';
export interface SpellSearchProfile { generationMs:number;simulationMs:number;evaluationMs:number;hashMs:number;unattributedMs:number;
 generationCalls:number;simulationCalls:number;evaluationCalls:number;hashCalls:number;simulationCacheHits:number;materialCacheHits:number; }
/** Synchronous search-local measurements; no application logging or persistent global state. */
export class SpellChessProfiler {
 private static active?: SpellSearchProfile;
 public static begin(): SpellSearchProfile { return this.active={generationMs:0,simulationMs:0,evaluationMs:0,hashMs:0,unattributedMs:0,
 generationCalls:0,simulationCalls:0,evaluationCalls:0,hashCalls:0,simulationCacheHits:0,materialCacheHits:0}; }
 public static hit(kind:'simulation'|'material'):void{if(this.active)this.active[`${kind}CacheHits`]++;}
 public static end(): void { this.active=undefined; }
 public static measure<T>(stage:SpellProfileStage,run:()=>T):T {
  const profile=this.active;if(!profile)return run();
  const started=performance.now();try{return run();}finally{profile[`${stage}Ms`]+=performance.now()-started;profile[`${stage}Calls`]++;}
 }
}

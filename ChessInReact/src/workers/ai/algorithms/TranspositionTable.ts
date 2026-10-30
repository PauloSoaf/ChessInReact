import { IMoveRecommendation } from '../interfaces/IAIEngineContracts';

export type TTEntryFlag = 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';

export interface ITTEntry {
  readonly hash: bigint;
  readonly depth: number;
  readonly score: number;
  readonly flag: TTEntryFlag;
  readonly bestMove?: IMoveRecommendation;
}

/**
 * Size-capped Transposition Table (Spec 05 § 10.2, § 17 RNF-04, RNF-08).
 * Capped at 32MB heap budget via fixed maxEntries and LRU / replacement policy.
 */
export class TranspositionTable {
  private readonly maxEntries: number;
  private table: Map<bigint, ITTEntry>;
  private hits = 0;
  private lookups = 0;

  /**
   * @param maxEntries Max stored transposition entries (default 100,000 ~12MB heap).
   */
  constructor(maxEntries = 100000) {
    this.maxEntries = maxEntries;
    this.table = new Map<bigint, ITTEntry>();
  }

  public get(hash: bigint): ITTEntry | undefined {
    this.lookups++;
    const entry = this.table.get(hash);
    if (entry) {
      this.hits++;
      // Refresh key for LRU-like preservation
      this.table.delete(hash);
      this.table.set(hash, entry);
      return entry;
    }
    return undefined;
  }

  public set(
    hash: bigint,
    depth: number,
    score: number,
    flag: TTEntryFlag,
    bestMove?: IMoveRecommendation
  ): void {
    // If over capacity, evict oldest entry
    if (this.table.size >= this.maxEntries) {
      const oldestKey = this.table.keys().next().value;
      if (oldestKey !== undefined) {
        this.table.delete(oldestKey);
      }
    }

    this.table.set(hash, {
      hash,
      depth,
      score,
      flag,
      bestMove,
    });
  }

  public clear(): void {
    this.table.clear();
    this.hits = 0;
    this.lookups = 0;
  }

  public get size(): number {
    return this.table.size;
  }

  public get hitRate(): number {
    return this.lookups === 0 ? 0 : this.hits / this.lookups;
  }

  public getStats(): { size: number; hits: number; lookups: number; hitRate: number } {
    return {
      size: this.table.size,
      hits: this.hits,
      lookups: this.lookups,
      hitRate: this.hitRate,
    };
  }
}

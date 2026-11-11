import { 
  IBlunderMemoryRecord, 
  IAdaptiveBookMutationRecord, 
  IBotLearningExportPayload 
} from '../interfaces/IBotEcosystemContracts';

export class AdaptiveBotLearningEngine {
  public static readonly MAX_LRU_ENTRIES_PER_BOT = 500;
  public static readonly CRITICAL_BLUNDER_PENALTY = -15000;

  // botId -> Map<zobristHash, IBlunderMemoryRecord> (with LRU insertion order)
  private readonly blunderStore = new Map<string, Map<string, IBlunderMemoryRecord>>();

  // botId -> Map<fenKey+move, IAdaptiveBookMutationRecord>
  private readonly bookMutationStore = new Map<string, Map<string, IAdaptiveBookMutationRecord>>();

  /**
   * Records a critical blunder position and penalized move for an adaptive bot (Spec 11 § 6.2, RF-04).
   * Automatically evicts oldest entries when exceeding the 500 LRU capacity (RNF-09).
   */
  public recordBlunder(
    botId: string, 
    zobristHash: string, 
    penalizedMove: string, 
    now: number = Date.now()
  ): void {
    let botBlunders = this.blunderStore.get(botId);
    if (!botBlunders) {
      botBlunders = new Map<string, IBlunderMemoryRecord>();
      this.blunderStore.set(botId, botBlunders);
    }

    const existing = botBlunders.get(zobristHash);
    const occurrenceCount = existing ? existing.occurrenceCount + 1 : 1;

    // Delete existing to re-insert at end of Map (preserving LRU order)
    if (existing) {
      botBlunders.delete(zobristHash);
    } else if (botBlunders.size >= AdaptiveBotLearningEngine.MAX_LRU_ENTRIES_PER_BOT) {
      // Evict oldest entry (first item in Map iterator)
      const oldestKey = botBlunders.keys().next().value;
      if (oldestKey) {
        botBlunders.delete(oldestKey);
      }
    }

    botBlunders.set(zobristHash, {
      botId,
      zobristHash,
      penalizedMove,
      penaltyScore: AdaptiveBotLearningEngine.CRITICAL_BLUNDER_PENALTY,
      lossTimestamp: now,
      occurrenceCount,
    });
  }

  /**
   * Retrieves blunder penalty for a position and move in < 2ms (RNF-05).
   * Returns -15,000 if move caused a recorded blunder, 0 otherwise.
   */
  public getBlunderPenalty(botId: string, zobristHash: string, moveString: string): number {
    const botBlunders = this.blunderStore.get(botId);
    if (!botBlunders) {
      return 0;
    }

    const record = botBlunders.get(zobristHash);
    if (record && record.penalizedMove === moveString) {
      return record.penaltyScore;
    }

    return 0;
  }

  /**
   * Mutates the opening book when a bot loses, cutting the losing move weight by 50% (Spec 11 § 6.1, RF-03).
   */
  public recordOpeningLoss(
    botId: string,
    fenPositionKey: string,
    losingMove: string,
    now: number = Date.now()
  ): void {
    let botMutations = this.bookMutationStore.get(botId);
    if (!botMutations) {
      botMutations = new Map<string, IAdaptiveBookMutationRecord>();
      this.bookMutationStore.set(botId, botMutations);
    }

    const key = `${fenPositionKey}_${losingMove}`;
    const existing = botMutations.get(key);
    const currentWeight = existing ? existing.weightMultiplier : 1.0;
    // 50% multiplicative decay, floor at 0.1
    const newWeight = Math.max(0.1, currentWeight * 0.5);

    botMutations.set(key, {
      botId,
      fenPositionKey,
      moveString: losingMove,
      weightMultiplier: newWeight,
      updatedAt: now,
    });
  }

  /**
   * Retrieves weight multiplier for an opening move (default: 1.0).
   */
  public getBookWeightMultiplier(botId: string, fenPositionKey: string, moveString: string): number {
    const botMutations = this.bookMutationStore.get(botId);
    if (!botMutations) {
      return 1.0;
    }

    const key = `${fenPositionKey}_${moveString}`;
    const record = botMutations.get(key);
    return record ? record.weightMultiplier : 1.0;
  }

  /**
   * Clears blunder table and opening mutations for a bot (Factory Reset) (RF-13).
   */
  public resetBotLearning(botId: string): void {
    this.blunderStore.delete(botId);
    this.bookMutationStore.delete(botId);
  }

  /**
   * Returns current count of remembered blunders for a bot.
   */
  public getBlunderCount(botId: string): number {
    return this.blunderStore.get(botId)?.size ?? 0;
  }

  /**
   * Exports bot learning memories to JSON payload (RF-14).
   */
  public exportBotLearning(botId: string): IBotLearningExportPayload {
    const blunders = Array.from(this.blunderStore.get(botId)?.values() ?? []);
    const bookMutations = Array.from(this.bookMutationStore.get(botId)?.values() ?? []);

    return {
      exportVersion: 1,
      exportedAtTimestamp: Date.now(),
      botId,
      blunders,
      bookMutations,
    };
  }

  /**
   * Imports bot learning memories from JSON payload (RF-14).
   */
  public importBotLearning(payload: IBotLearningExportPayload): boolean {
    if (!payload || payload.exportVersion !== 1 || !payload.botId) {
      return false;
    }

    this.resetBotLearning(payload.botId);

    for (const b of payload.blunders) {
      this.recordBlunder(payload.botId, b.zobristHash, b.penalizedMove, b.lossTimestamp);
    }

    let botMutations = this.bookMutationStore.get(payload.botId);
    if (!botMutations) {
      botMutations = new Map<string, IAdaptiveBookMutationRecord>();
      this.bookMutationStore.set(payload.botId, botMutations);
    }

    for (const m of payload.bookMutations) {
      const key = `${m.fenPositionKey}_${m.moveString}`;
      botMutations.set(key, m);
    }

    return true;
  }
}


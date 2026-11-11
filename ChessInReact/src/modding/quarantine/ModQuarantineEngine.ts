/**
 * ChessInReact - Mod Quarantine & Health Watchdog Engine (Spec 10 § 6, RF-10)
 *
 * Automatically monitors error rates (GLTF_LOAD_ERROR, WebGL crashes, rule desyncs):
 * 1. Computes rolling error ratio per community mod.
 * 2. Enforces automatic quarantine when error rate exceeds 5% over >= 10 matches.
 * 3. Hides quarantined items from the public community workshop gallery.
 */

export interface IModHealthRecord {
  readonly modId: string;
  readonly totalMatchesPlayed: number;
  readonly totalErrorsLogged: number;
  readonly errorRatePercentage: number;
  readonly isQuarantined: boolean;
  readonly lastErrorTimestampMs?: number;
}

export class ModQuarantineEngine {
  public static readonly ERROR_RATE_THRESHOLD_PERCENT = 5.0; // 5% error ceiling
  public static readonly MINIMUM_SAMPLE_SIZE = 10; // Minimum matches before quarantine triggers

  private readonly records = new Map<string, IModHealthRecord>();

  /**
   * Records a successfully completed match for a mod.
   */
  public recordMatchSuccess(modId: string): IModHealthRecord {
    const existing = this.records.get(modId) ?? {
      modId,
      totalMatchesPlayed: 0,
      totalErrorsLogged: 0,
      errorRatePercentage: 0,
      isQuarantined: false,
    };

    const totalMatches = existing.totalMatchesPlayed + 1;
    const rate = Number(((existing.totalErrorsLogged / totalMatches) * 100).toFixed(2));
    const isQuarantined = totalMatches >= ModQuarantineEngine.MINIMUM_SAMPLE_SIZE && rate > ModQuarantineEngine.ERROR_RATE_THRESHOLD_PERCENT;

    const updated: IModHealthRecord = {
      ...existing,
      totalMatchesPlayed: totalMatches,
      errorRatePercentage: rate,
      isQuarantined,
    };

    this.records.set(modId, updated);
    return updated;
  }

  /**
   * Records a client error / crash occurring in a match using this mod.
   */
  public recordMatchError(modId: string, nowMs: number = Date.now()): IModHealthRecord {
    const existing = this.records.get(modId) ?? {
      modId,
      totalMatchesPlayed: 0,
      totalErrorsLogged: 0,
      errorRatePercentage: 0,
      isQuarantined: false,
    };

    const totalMatches = existing.totalMatchesPlayed + 1;
    const totalErrors = existing.totalErrorsLogged + 1;
    const rate = Number(((totalErrors / totalMatches) * 100).toFixed(2));
    const isQuarantined = totalMatches >= ModQuarantineEngine.MINIMUM_SAMPLE_SIZE && rate > ModQuarantineEngine.ERROR_RATE_THRESHOLD_PERCENT;

    const updated: IModHealthRecord = {
      modId,
      totalMatchesPlayed: totalMatches,
      totalErrorsLogged: totalErrors,
      errorRatePercentage: rate,
      isQuarantined,
      lastErrorTimestampMs: nowMs,
    };

    this.records.set(modId, updated);
    return updated;
  }

  /**
   * Checks whether a mod is healthy and allowed for public display.
   */
  public isModHealthy(modId: string): boolean {
    const record = this.records.get(modId);
    return record ? !record.isQuarantined : true;
  }

  /**
   * Manually lifts quarantine after creator patches the asset.
   */
  public liftQuarantine(modId: string): void {
    const existing = this.records.get(modId);
    if (existing) {
      this.records.set(modId, {
        ...existing,
        totalErrorsLogged: 0,
        errorRatePercentage: 0,
        isQuarantined: false,
      });
    }
  }
}

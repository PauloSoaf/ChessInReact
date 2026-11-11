/**
 * ChessInReact - Ladder Tier Progression Manager (Spec 11 § 5, RF-12)
 *
 * Implements unlocking logic for the 4 ladder tiers:
 * - Tier 1 (Iniciantes 0-500): Unlocked by default.
 * - Tier 2 (Intermediários 600-1100): Unlocked with Rating >= 500 OR 3 Tier-1 victories.
 * - Tier 3 (Avançados 1200-1700): Unlocked with Rating >= 1100 OR 5 Tier-2 victories.
 * - Tier 4 (Mestres 1800-2200+): Unlocked with Rating >= 1700 OR 5 Tier-3 victories.
 */

export type LadderTierId = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4';

export interface ITierUnlockStatus {
  readonly tierId: LadderTierId;
  readonly name: string;
  readonly ratingRange: string;
  readonly isUnlocked: boolean;
  readonly requirementDescription: string;
}

export interface IPlayerProgressionState {
  readonly playerRating: number;
  readonly victoriesByTier: Readonly<Record<LadderTierId, number>>;
}

export class TierProgressionManager {
  /**
   * Evaluates the unlock status for each tier based on the player's rating and victory tally.
   */
  public static evaluateAllTiers(state: IPlayerProgressionState): readonly ITierUnlockStatus[] {
    const v1 = state.victoriesByTier.tier_1 ?? 0;
    const v2 = state.victoriesByTier.tier_2 ?? 0;
    const v3 = state.victoriesByTier.tier_3 ?? 0;
    const r = state.playerRating;

    const t1Unlocked = true;
    const t2Unlocked = r >= 500 || v1 >= 3;
    const t3Unlocked = t2Unlocked && (r >= 1100 || v2 >= 5);
    const t4Unlocked = t3Unlocked && (r >= 1700 || v3 >= 5);

    return [
      {
        tierId: 'tier_1',
        name: 'Iniciantes (Bebê Peão a Peão Veterano)',
        ratingRange: '0 - 500',
        isUnlocked: t1Unlocked,
        requirementDescription: 'Acesso imediato e irrestrito.',
      },
      {
        tierId: 'tier_2',
        name: 'Intermediários (Cavalo Saltador a Bispo Sorrateiro)',
        ratingRange: '600 - 1100',
        isUnlocked: t2Unlocked,
        requirementDescription: 'Requer Rating >= 500 ou 3 vitórias no Tier 1.',
      },
      {
        tierId: 'tier_3',
        name: 'Avançados (Torre Muralha a Rainha Implacável)',
        ratingRange: '1200 - 1700',
        isUnlocked: t3Unlocked,
        requirementDescription: 'Requer Rating >= 1100 ou 5 vitórias no Tier 2.',
      },
      {
        tierId: 'tier_4',
        name: 'Mestres & Grandmasters (Oráculo Minimax a Nemesis Supremo)',
        ratingRange: '1800 - 2200+',
        isUnlocked: t4Unlocked,
        requirementDescription: 'Requer Rating >= 1700 ou 5 vitórias no Tier 3.',
      },
    ];
  }

  /**
   * Records a victory in a given tier and returns the updated state.
   */
  public static recordVictory(
    state: IPlayerProgressionState,
    tierId: LadderTierId
  ): IPlayerProgressionState {
    const current = state.victoriesByTier[tierId] ?? 0;
    return {
      ...state,
      victoriesByTier: {
        ...state.victoriesByTier,
        [tierId]: current + 1,
      },
    };
  }

  /**
   * Checks whether a specific tier is unlocked.
   */
  public static isTierUnlocked(state: IPlayerProgressionState, tierId: LadderTierId): boolean {
    const statuses = this.evaluateAllTiers(state);
    const found = statuses.find((s) => s.tierId === tierId);
    return found ? found.isUnlocked : false;
  }
}

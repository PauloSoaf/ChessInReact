/**
 * ChessInReact - Low-Rating Blunder & Noise Injector (Spec 11 § 5, RF-06)
 *
 * Simulates accessible, human-like beginner chess for bots rated below 800:
 * 1. Blunder probability scaling inversely with rating (from ~30% at rating 0 down to 0% at >= 800).
 * 2. Gaussian perturbation added to candidate move evaluations to create natural variability.
 * 3. Prevents low-tier bots from playing inhuman engine-perfect tactical defenses.
 */

export interface ICandidateMoveEval {
  readonly moveUci: string;
  readonly baseScoreCentipawns: number;
}

export class LowRatingBlunderInjector {
  public static readonly BLUNDER_THRESHOLD_RATING = 800;

  /**
   * Calculates the probability of committing an unforced blunder (0.0 to 1.0)
   * for a bot based on its nominal rating.
   */
  public static getBlunderProbability(rating: number): number {
    if (rating >= this.BLUNDER_THRESHOLD_RATING) {
      return 0.0;
    }

    const clampedRating = Math.max(0, rating);
    // Linear regression from 0.30 at rating 0 to 0.01 at rating 799
    const prob = 0.30 - (clampedRating / this.BLUNDER_THRESHOLD_RATING) * 0.29;
    return Number(Math.max(0.01, prob).toFixed(3));
  }

  /**
   * Applies rating-scaled evaluation noise to candidate moves and selects a move.
   */
  public static perturbAndSelectMove(
    candidates: readonly ICandidateMoveEval[],
    botRating: number,
    randomSeed: number = Math.random()
  ): { selectedMoveUci: string; isBlunderInjected: boolean } {
    if (candidates.length === 0) {
      throw new Error('Lista de lances candidatos vazia.');
    }

    if (candidates.length === 1) {
      return { selectedMoveUci: candidates[0]!.moveUci, isBlunderInjected: false };
    }

    const blunderProb = this.getBlunderProbability(botRating);
    const triggerBlunder = randomSeed < blunderProb;

    if (triggerBlunder && botRating < this.BLUNDER_THRESHOLD_RATING) {
      // Pick a random sub-optimal move from the bottom half of candidates
      const sorted = [...candidates].sort((a, b) => b.baseScoreCentipawns - a.baseScoreCentipawns);
      const subOptimalCandidates = sorted.slice(1);
      const chosen = subOptimalCandidates[Math.floor(randomSeed * subOptimalCandidates.length)] ?? candidates[0]!;

      return {
        selectedMoveUci: chosen.moveUci,
        isBlunderInjected: true,
      };
    }

    // Standard noise perturbation proportional to beginner rating
    const noiseStdDev = Math.max(0, (this.BLUNDER_THRESHOLD_RATING - botRating) * 0.5);

    const perturbed = candidates.map((c, idx) => {
      // Pseudo-random deterministic noise based on seed and index
      const noise = ((Math.sin(randomSeed * 1000 + idx) + 1) / 2 - 0.5) * 2 * noiseStdDev;
      return {
        moveUci: c.moveUci,
        perturbedScore: c.baseScoreCentipawns + noise,
      };
    });

    perturbed.sort((a, b) => b.perturbedScore - a.perturbedScore);
    return {
      selectedMoveUci: perturbed[0]!.moveUci,
      isBlunderInjected: false,
    };
  }
}

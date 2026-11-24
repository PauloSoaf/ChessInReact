/**
 * ChessInReact - Glicko-2 Competitive Rating Engine (Spec 08 § 13.1 #4, RF-13, RNF-11)
 *
 * Full 64-bit IEEE floating-point implementation of Mark Glickman's Glicko-2 rating system:
 * - Tracks Rating (R), Rating Deviation (RD), and Volatility (sigma) per player.
 * - Handles 1v1 match results and multiplayer FFA / multi-team matches.
 * - Supports rating period decay for inactive players.
 * - Uses Illinois bracketed root-finding for volatility calculation with system constant tau.
 */

export interface IGlicko2Player {
  readonly rating: number; // R (default: 1500)
  readonly ratingDeviation: number; // RD (default: 350)
  readonly volatility: number; // sigma (default: 0.06)
}

export interface IGlicko2MatchResult {
  readonly opponent: IGlicko2Player;
  readonly score: number; // 1 for win, 0.5 for draw, 0 for loss
}

export interface IGlicko2MultiplayerEntry {
  readonly playerId: string;
  readonly player: IGlicko2Player;
  readonly rank: number; // 1 = winner, 2 = 2nd, etc.
}

export class Glicko2Engine {
  public static readonly SCALE_FACTOR = 173.7178;
  public static readonly DEFAULT_RATING = 1500;
  public static readonly DEFAULT_RD = 350;
  public static readonly DEFAULT_VOLATILITY = 0.06;
  public static readonly DEFAULT_TAU = 0.5; // System constant tau (between 0.3 and 1.2)
  public static readonly EPSILON = 0.000001; // Convergence tolerance for volatility search
  public static readonly MIN_RD = 30;
  public static readonly MAX_RD = 350;

  private readonly tau: number;

  public constructor(tau: number = Glicko2Engine.DEFAULT_TAU) {
    this.tau = tau;
  }

  /**
   * Creates a default unrated player profile (1500, 350, 0.06).
   */
  public static createDefaultPlayer(): IGlicko2Player {
    return {
      rating: Glicko2Engine.DEFAULT_RATING,
      ratingDeviation: Glicko2Engine.DEFAULT_RD,
      volatility: Glicko2Engine.DEFAULT_VOLATILITY,
    };
  }

  /**
   * Helper g(phi) function.
   */
  public g(phi: number): number {
    return 1.0 / Math.sqrt(1.0 + (3.0 * phi * phi) / (Math.PI * Math.PI));
  }

  /**
   * Helper E(mu, mu_j, phi_j) expected outcome function.
   */
  public expectedOutcome(mu: number, muJ: number, phiJ: number): number {
    return 1.0 / (1.0 + Math.exp(-this.g(phiJ) * (mu - muJ)));
  }

  /**
   * Converts a player from original Glicko scale to Glicko-2 scale:
   * mu = (R - 1500) / 173.7178
   * phi = RD / 173.7178
   */
  public toGlicko2Scale(player: IGlicko2Player): { mu: number; phi: number; sigma: number } {
    return {
      mu: (player.rating - Glicko2Engine.DEFAULT_RATING) / Glicko2Engine.SCALE_FACTOR,
      phi: player.ratingDeviation / Glicko2Engine.SCALE_FACTOR,
      sigma: player.volatility,
    };
  }

  /**
   * Converts values from Glicko-2 scale back to standard Glicko scale.
   */
  public toOriginalScale(mu: number, phi: number, sigma: number): IGlicko2Player {
    const rawRating = mu * Glicko2Engine.SCALE_FACTOR + Glicko2Engine.DEFAULT_RATING;
    const rawRd = phi * Glicko2Engine.SCALE_FACTOR;

    const clampedRd = Math.max(Glicko2Engine.MIN_RD, Math.min(Glicko2Engine.MAX_RD, rawRd));

    return {
      rating: Math.round(rawRating * 100) / 100,
      ratingDeviation: Math.round(clampedRd * 100) / 100,
      volatility: Math.round(sigma * 1_000_000) / 1_000_000,
    };
  }

  /**
   * Decays rating deviation for an inactive rating period with zero games.
   * phi' = sqrt(phi^2 + sigma^2)
   */
  public decayInactivePlayer(player: IGlicko2Player): IGlicko2Player {
    const { mu, phi, sigma } = this.toGlicko2Scale(player);
    const newPhi = Math.sqrt(phi * phi + sigma * sigma);
    return this.toOriginalScale(mu, newPhi, sigma);
  }

  /**
   * Updates a player's rating based on an array of match results within a rating period.
   * Follows the official 5-step Glicko-2 algorithm with Illinois root finding.
   */
  public updatePlayer(player: IGlicko2Player, matches: readonly IGlicko2MatchResult[]): IGlicko2Player {
    if (matches.length === 0) {
      return this.decayInactivePlayer(player);
    }

    // Step 1: Convert to Glicko-2 scale
    const { mu, phi, sigma } = this.toGlicko2Scale(player);

    // Step 2: Compute estimated variance v and improvement Delta
    let vInverse = 0.0;
    let deltaSum = 0.0;

    for (const match of matches) {
      const oppG2 = this.toGlicko2Scale(match.opponent);
      const gPhiJ = this.g(oppG2.phi);
      const eVal = this.expectedOutcome(mu, oppG2.mu, oppG2.phi);

      vInverse += gPhiJ * gPhiJ * eVal * (1.0 - eVal);
      deltaSum += gPhiJ * (match.score - eVal);
    }

    const v = 1.0 / vInverse;
    const delta = v * deltaSum;

    // Step 3: Determine new volatility sigma' via Illinois algorithm on f(x)
    const a = Math.log(sigma * sigma);
    const tau = this.tau;

    const f = (x: number): number => {
      const expX = Math.exp(x);
      const dSquared = delta * delta;
      const phiSquared = phi * phi;
      const denom = 2.0 * Math.pow(phiSquared + v + expX, 2);
      const term1 = (expX * (dSquared - phiSquared - v - expX)) / denom;
      const term2 = (x - a) / (tau * tau);
      return term1 - term2;
    };

    let A = a;
    let B: number;

    if (delta * delta > phi * phi + v) {
      B = Math.log(delta * delta - phi * phi - v);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) {
        k++;
      }
      B = a - k * tau;
    }

    let fA = f(A);
    let fB = f(B);

    // Illinois method iterations
    while (Math.abs(B - A) > Glicko2Engine.EPSILON) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);

      if (fC * fB < 0) {
        A = B;
        fA = fB;
      } else {
        fA = fA / 2.0;
      }

      B = C;
      fB = fC;
    }

    const newSigma = Math.exp(A / 2.0);

    // Step 4: Update rating deviation phi' and rating mu'
    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1.0 / Math.sqrt(1.0 / (phiStar * phiStar) + 1.0 / v);
    const newMu = mu + newPhi * newPhi * deltaSum;

    // Step 5: Convert back to original scale
    return this.toOriginalScale(newMu, newPhi, newSigma);
  }

  /**
   * Processes a 1v1 match between Player A and Player B, returning updated profiles for both.
   * scoreA: 1 (A won), 0.5 (draw), 0 (B won).
   */
  public update1v1Match(
    playerA: IGlicko2Player,
    playerB: IGlicko2Player,
    scoreA: number
  ): { playerA: IGlicko2Player; playerB: IGlicko2Player } {
    const scoreB = 1.0 - scoreA;

    const updatedA = this.updatePlayer(playerA, [{ opponent: playerB, score: scoreA }]);
    const updatedB = this.updatePlayer(playerB, [{ opponent: playerA, score: scoreB }]);

    return {
      playerA: updatedA,
      playerB: updatedB,
    };
  }

  /**
   * Processes an N-player FFA match (e.g. 4-Player Hexagonal, 8-Player Chaos) (RF-04, RF-13).
   * In FFA, each player is treated as having played a 1v1 match against every other participant:
   * - If player rank < opponent rank: score = 1.0 (win)
   * - If player rank == opponent rank: score = 0.5 (draw)
   * - If player rank > opponent rank: score = 0.0 (loss)
   */
  public updateMultiplayerMatch(
    entries: readonly IGlicko2MultiplayerEntry[]
  ): Map<string, IGlicko2Player> {
    const updatedProfiles = new Map<string, IGlicko2Player>();

    for (let i = 0; i < entries.length; i++) {
      const current = entries[i];
      const matchResults: IGlicko2MatchResult[] = [];

      for (let j = 0; j < entries.length; j++) {
        if (i === j) continue;
        const opponent = entries[j];

        let score = 0.5;
        if (current.rank < opponent.rank) {
          score = 1.0;
        } else if (current.rank > opponent.rank) {
          score = 0.0;
        }

        matchResults.push({
          opponent: opponent.player,
          score,
        });
      }

      const updated = this.updatePlayer(current.player, matchResults);
      updatedProfiles.set(current.playerId, updated);
    }

    return updatedProfiles;
  }
}

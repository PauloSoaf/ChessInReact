/**
 * ChessInReact - Player Habit Profiler (Spec 11 § 5, RF-05)
 *
 * Gathers and models human tactical behavior to allow adaptive bots
 * to tailor their opening prep and positional responses:
 * 1. Aggressiveness score (0.0 = passive/solid, 1.0 = hyper-aggressive).
 * 2. Castling preference (Kingside, Queenside, None, Flexible).
 * 3. Deliberation tempo (Fast/Blitz < 3s, Classical > 10s).
 */

export interface IPlayerMoveSample {
  readonly ply: number;
  readonly moveUci: string;
  readonly isEarlyQueenMove: boolean;
  readonly isCheckDelivered: boolean;
  readonly isPawnCapture: boolean;
  readonly castledSide?: 'O-O' | 'O-O-O';
  readonly durationMs: number;
}

export interface IPlayerHabitProfile {
  readonly playerId: string;
  readonly totalMovesSampled: number;
  readonly aggressivenessScore: number; // 0.0 to 1.0
  readonly castlingPreference: 'KINGSIDE' | 'QUEENSIDE' | 'NONE' | 'FLEXIBLE';
  readonly averageMoveTimeMs: number;
  readonly earlyAttackTendency: number; // 0.0 to 1.0
}

export class PlayerHabitProfiler {
  /**
   * Analyzes an array of move samples from past games to construct player profile.
   */
  public static buildProfile(
    playerId: string,
    samples: readonly IPlayerMoveSample[]
  ): IPlayerHabitProfile {
    if (samples.length === 0) {
      return {
        playerId,
        totalMovesSampled: 0,
        aggressivenessScore: 0.5,
        castlingPreference: 'FLEXIBLE',
        averageMoveTimeMs: 5000,
        earlyAttackTendency: 0.0,
      };
    }

    let earlyQueenMoves = 0;
    let checksDelivered = 0;
    let pawnCaptures = 0;
    let totalTime = 0;
    let kingsideCastles = 0;
    let queensideCastles = 0;
    let gamesCount = 0;

    for (const sample of samples) {
      totalTime += Math.max(0, sample.durationMs);

      if (sample.ply <= 14) {
        if (sample.isEarlyQueenMove) earlyQueenMoves++;
        if (sample.isCheckDelivered) checksDelivered++;
      }

      if (sample.isPawnCapture) pawnCaptures++;

      if (sample.castledSide === 'O-O') {
        kingsideCastles++;
        gamesCount++;
      } else if (sample.castledSide === 'O-O-O') {
        queensideCastles++;
        gamesCount++;
      }
    }

    const n = samples.length;
    const avgTime = Math.round(totalTime / n);

    // Compute aggressiveness: checks + early queen + aggressive pawn takes normalized
    const aggroRaw = (checksDelivered * 3 + earlyQueenMoves * 4 + pawnCaptures * 0.5) / Math.max(1, n * 0.2);
    const aggressivenessScore = Number(Math.min(1.0, Math.max(0.0, aggroRaw)).toFixed(2));

    const earlyAttackTendency = Number(
      Math.min(1.0, (earlyQueenMoves * 2 + checksDelivered) / Math.max(1, n * 0.1)).toFixed(2)
    );

    // Castling preference
    let castlingPreference: 'KINGSIDE' | 'QUEENSIDE' | 'NONE' | 'FLEXIBLE' = 'FLEXIBLE';
    if (kingsideCastles > queensideCastles * 2 && kingsideCastles >= 2) {
      castlingPreference = 'KINGSIDE';
    } else if (queensideCastles > kingsideCastles * 2 && queensideCastles >= 2) {
      castlingPreference = 'QUEENSIDE';
    } else if (gamesCount > 3 && kingsideCastles === 0 && queensideCastles === 0) {
      castlingPreference = 'NONE';
    }

    return {
      playerId,
      totalMovesSampled: n,
      aggressivenessScore,
      castlingPreference,
      averageMoveTimeMs: avgTime,
      earlyAttackTendency,
    };
  }
}

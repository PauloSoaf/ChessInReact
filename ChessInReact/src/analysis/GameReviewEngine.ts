import { IEvalPoint, IGameReviewSummary, MoveClassification } from './types';

/**
 * Spec 12 § 1 & RF-01, RF-02: Deterministic Post-Game Review Engine.
 * Converts centipawns to scientific winning probabilities, calculates CAPS2 accuracies,
 * and categorizes each move into Brilliant, Great, Best, Inaccuracy, Mistake, or Blunder.
 */
export class GameReviewEngine {
  /**
   * Converts centipawns to winning probability percentage (0% to 100%)
   * using the canonical sigmoidal formula: P(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1).
   */
  public static centipawnsToWinProbability(cp: number): number {
    const clampedCp = Math.max(-2000, Math.min(2000, cp));
    const exponent = -0.00368208 * clampedCp;
    const winProb = 50 + 50 * (2 / (1 + Math.exp(exponent)) - 1);
    return Math.round(winProb * 100) / 100;
  }

  /**
   * Categorizes move quality based on winning percentage drop (Delta P) and tactical sacrifice context.
   */
  public static classifyMove(
    prevWinChance: number,
    currentWinChance: number,
    isWhite: boolean,
    options: { isSacrifice?: boolean; isBest?: boolean; isBook?: boolean } = {}
  ): MoveClassification {
    if (options.isBook) return 'BOOK';

    // Drop experienced by the acting player
    const drop = isWhite
      ? Math.max(0, prevWinChance - currentWinChance)
      : Math.max(0, currentWinChance - prevWinChance);

    // Brilliant move: A piece sacrifice that preserves or increases advantage
    if (options.isSacrifice && drop <= 1.5 && (isWhite ? prevWinChance >= 40 : prevWinChance <= 60)) {
      return 'BRILLIANT';
    }

    if (options.isBest || drop <= 1.0) {
      return 'BEST';
    }

    if (drop <= 3.5) {
      return 'EXCELLENT';
    }

    if (drop <= 7.0) {
      return 'GOOD';
    }

    // Missed Win: Dropped a crushing position (> 80% win chance) into contestable
    const hadWin = isWhite ? prevWinChance >= 80 : prevWinChance <= 20;
    const lostWin = isWhite ? currentWinChance < 60 : currentWinChance > 40;
    if (hadWin && lostWin && drop >= 20.0) {
      return 'MISSED_WIN';
    }

    if (drop <= 15.0) {
      return 'INACCURACY';
    }

    if (drop <= 30.0) {
      return 'MISTAKE';
    }

    return 'BLUNDER';
  }

  /**
   * Calculates player CAPS2 Accuracy metric (0% to 100%) based on cumulative winning chance drop.
   */
  public static computeCAPS2Accuracy(drops: readonly number[]): number {
    if (drops.length === 0) return 100.0;

    const avgLoss = drops.reduce((acc, d) => acc + d, 0) / drops.length;
    // Sigmoidal accuracy mapping: 0 avg loss -> 100%, 5 avg loss -> ~90%, 20 avg loss -> ~50%
    const accuracy = 103.1668 * Math.exp(-0.04354 * avgLoss) - 3.1668;
    return Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10));
  }

  /**
   * Analyzes an entire match evaluation stream into a comprehensive review summary.
   */
  public static analyzeMatch(
    evaluationsCp: readonly number[],
    moveSans: readonly string[] = []
  ): IGameReviewSummary {
    const evalStream: IEvalPoint[] = [];
    const whiteDrops: number[] = [];
    const blackDrops: number[] = [];

    const emptyCounts = (): Record<MoveClassification, number> => ({
      BRILLIANT: 0,
      GREAT: 0,
      BEST: 0,
      EXCELLENT: 0,
      GOOD: 0,
      BOOK: 0,
      INACCURACY: 0,
      MISTAKE: 0,
      BLUNDER: 0,
      MISSED_WIN: 0,
    });

    const counts = {
      P1: emptyCounts(),
      P2: emptyCounts(),
    };

    let prevWinChance = 50.0;

    for (let ply = 0; ply < evaluationsCp.length; ply++) {
      const evalCp = evaluationsCp[ply];
      const winChance = this.centipawnsToWinProbability(evalCp);
      const isWhite = ply % 2 === 0;
      const turnNumber = Math.floor(ply / 2) + 1;

      const drop = isWhite
        ? Math.max(0, prevWinChance - winChance)
        : Math.max(0, winChance - prevWinChance);

      const classification = this.classifyMove(prevWinChance, winChance, isWhite);

      if (isWhite) {
        whiteDrops.push(drop);
        counts.P1[classification]++;
      } else {
        blackDrops.push(drop);
        counts.P2[classification]++;
      }

      evalStream.push({
        ply: ply + 1,
        turnNumber,
        isWhite,
        evalCp,
        winChance,
        winChanceDelta: Math.round((winChance - prevWinChance) * 100) / 100,
        classification,
        moveSan: moveSans[ply],
      });

      prevWinChance = winChance;
    }

    return {
      whiteAccuracy: this.computeCAPS2Accuracy(whiteDrops),
      blackAccuracy: this.computeCAPS2Accuracy(blackDrops),
      counts,
      evalStream,
    };
  }

  /**
   * Maps a MoveClassification to standard FIDE Numeric Annotation Glyphs (NAG) and symbols (Spec 12 RF-15).
   * - $1 = ! (Good / Best)
   * - $2 = ? (Mistake)
   * - $3 = !! (Brilliant)
   * - $4 = ?? (Blunder / Missed Win)
   * - $5 = !? (Interesting / Excellent)
   * - $6 = ?! (Inaccuracy)
   */
  public static classificationToNAG(classification: MoveClassification): { readonly nag: string; readonly symbol: string } {
    switch (classification) {
      case 'BRILLIANT':
        return { nag: '$3', symbol: '!!' };
      case 'BEST':
      case 'GREAT':
        return { nag: '$1', symbol: '!' };
      case 'EXCELLENT':
        return { nag: '$5', symbol: '!?' };
      case 'INACCURACY':
        return { nag: '$6', symbol: '?!' };
      case 'MISTAKE':
        return { nag: '$2', symbol: '?' };
      case 'BLUNDER':
      case 'MISSED_WIN':
        return { nag: '$4', symbol: '??' };
      case 'BOOK':
      case 'GOOD':
      default:
        return { nag: '', symbol: '' };
    }
  }

  /**
   * Exports an annotated PGN string with FIDE NAG annotations, evaluation comments,
   * and CAPS2 accuracy headers (Spec 12 RF-15, RNF-17).
   */
  public static exportAnnotatedPGN(
    summary: IGameReviewSummary,
    headers: Record<string, string> = {}
  ): string {
    const sanitize = (val: string) => val.replace(/[<>"\\{}\n\r]/g, '');

    const headerLines: string[] = [
      `[Event "${sanitize(headers.Event ?? 'ChessInReact Match')}"]`,
      `[Site "${sanitize(headers.Site ?? 'ChessInReact Platform')}"]`,
      `[Date "${sanitize(headers.Date ?? new Date().toISOString().split('T')[0])}"]`,
      `[White "${sanitize(headers.White ?? 'White')}"]`,
      `[Black "${sanitize(headers.Black ?? 'Black')}"]`,
      `[Result "${sanitize(headers.Result ?? '*')}"]`,
      `[WhiteAccuracy "${summary.whiteAccuracy.toFixed(1)}%"]`,
      `[BlackAccuracy "${summary.blackAccuracy.toFixed(1)}%"]`,
    ];

    if (headers.ECO) {
      headerLines.push(`[ECO "${sanitize(headers.ECO)}"]`);
    }
    if (headers.Opening) {
      headerLines.push(`[Opening "${sanitize(headers.Opening)}"]`);
    }

    const moveTokens: string[] = [];
    for (let i = 0; i < summary.evalStream.length; i++) {
      const ep = summary.evalStream[i];
      const san = sanitize(ep.moveSan ?? '??');
      const { nag } = this.classificationToNAG(ep.classification);

      if (ep.isWhite) {
        moveTokens.push(`${ep.turnNumber}.`);
      } else if (i === 0) {
        moveTokens.push(`${ep.turnNumber}...`);
      }

      const nagToken = nag ? ` ${nag}` : '';
      const cpStr = (ep.evalCp / 100).toFixed(2);
      const commentToken = ` {[%eval ${cpStr}] [${ep.classification}]}`;
      moveTokens.push(`${san}${nagToken}${commentToken}`);
    }

    if (headers.Result) {
      moveTokens.push(sanitize(headers.Result));
    }

    return `${headerLines.join('\n')}\n\n${moveTokens.join(' ')}\n`;
  }
}


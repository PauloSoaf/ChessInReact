/**
 * ChessInReact - Spaced-Repetition Repertoire Trainer Engine
 * Spec 17: RF-17-04 & RF-17-05
 *
 * Implements Leitner / SuperMemo SM-2 spaced repetition for chess openings,
 * tracking accuracy, box levels, review intervals, and interactive move verification.
 */

import { IRepertoireCard, IRepertoireStudySession, ITrainingFeedback } from './types';

export class RepertoireTrainerEngine {
  private static readonly STORAGE_KEY = 'chessinreact_repertoire_v1';
  private static cards = new Map<string, IRepertoireCard>();

  static {
    this.loadCards();
    if (this.cards.size === 0) {
      this.seedDefaultRepertoire();
    }
  }

  /**
   * Evaluates a player's move against the expected repertoire move.
   * If correct, updates card spaced-repetition metrics (box level, interval, review date).
   * If incorrect, resets card to Box 1 for immediate retention drill.
   */
  public static verifyMove(cardId: string, playedMoveSan: string): ITrainingFeedback {
    const card = this.cards.get(cardId);
    if (!card) {
      throw new Error(`Repertoire card not found: ${cardId}`);
    }

    const cleanPlayed = playedMoveSan.trim().replace(/[+#]$/, '');
    const cleanExpected = card.expectedMoveSan.trim().replace(/[+#]$/, '');
    const cleanAlternatives = (card.alternativeMoves ?? []).map(m => m.trim().replace(/[+#]$/, ''));

    const isExact = cleanPlayed === cleanExpected;
    const isAlternative = cleanAlternatives.includes(cleanPlayed);
    const isCorrect = isExact || isAlternative;

    let updatedCard: IRepertoireCard;

    if (isCorrect) {
      const newBoxLevel = Math.min(5, card.boxLevel + 1);
      const newEaseFactor = Math.max(1.3, card.easeFactor + 0.1);
      const intervalDays = this.getIntervalForBox(newBoxLevel, newEaseFactor);
      const nextReviewDate = this.calculateNextDate(intervalDays);

      updatedCard = {
        ...card,
        boxLevel: newBoxLevel,
        intervalDays,
        easeFactor: Number(newEaseFactor.toFixed(2)),
        nextReviewDate,
        timesReviewed: card.timesReviewed + 1
      };
    } else {
      // Mistake: reset to Box 1
      const newEaseFactor = Math.max(1.3, card.easeFactor - 0.2);
      const intervalDays = 1;
      const nextReviewDate = this.calculateNextDate(intervalDays);

      updatedCard = {
        ...card,
        boxLevel: 1,
        intervalDays,
        easeFactor: Number(newEaseFactor.toFixed(2)),
        nextReviewDate,
        timesReviewed: card.timesReviewed + 1,
        timesFailed: card.timesFailed + 1
      };
    }

    this.cards.set(card.id, updatedCard);
    this.persistCards();

    let feedbackText = '';
    if (isExact) {
      feedbackText = `Excelente! O lance ${playedMoveSan} é a linha teórica principal (${card.openingName}).`;
    } else if (isAlternative) {
      feedbackText = `Bom lance! ${playedMoveSan} é uma variante alternativa válida, embora a recomendação principal seja ${card.expectedMoveSan}.`;
    } else {
      feedbackText = `Incorreto. O lance jogado foi ${playedMoveSan}, mas o repertório recomenda ${card.expectedMoveSan} (${card.openingName}).`;
    }

    return {
      isCorrect,
      isAlternative,
      expectedMoveSan: card.expectedMoveSan,
      playedMoveSan,
      feedbackText,
      updatedCard
    };
  }

  /**
   * Creates a training session with all cards due for review.
   */
  public static createStudySession(color?: 'WHITE' | 'BLACK'): IRepertoireStudySession {
    const all = Array.from(this.cards.values());
    const filtered = color ? all.filter(c => c.color === color) : all;

    return {
      cardsDue: filtered,
      totalCards: filtered.length,
      currentIndex: 0,
      completedCount: 0,
      correctCount: 0,
      mistakeCount: 0
    };
  }

  /**
   * Retrieves all registered repertoire cards.
   */
  public static getAllCards(): readonly IRepertoireCard[] {
    return Array.from(this.cards.values());
  }

  /**
   * Adds or updates a repertoire card.
   */
  public static saveCard(card: IRepertoireCard): void {
    this.cards.set(card.id, card);
    this.persistCards();
  }

  /**
   * Exports the entire repertoire as a JSON string.
   */
  public static exportRepertoireJson(): string {
    const list = Array.from(this.cards.values());
    return JSON.stringify({ schemaVersion: '1.0.0', exportedAt: new Date().toISOString(), cards: list }, null, 2);
  }

  /**
   * Imports repertoire cards from a JSON string.
   */
  public static importRepertoireJson(jsonStr: string): boolean {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.cards)) {
        for (const item of parsed.cards) {
          if (item.id && item.expectedMoveSan && item.normalizedFen) {
            this.cards.set(item.id, item);
          }
        }
        this.persistCards();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Calculates interval in days based on Leitner box level and ease factor.
   */
  private static getIntervalForBox(boxLevel: number, easeFactor: number): number {
    switch (boxLevel) {
      case 1:
        return 1;
      case 2:
        return 3;
      case 3:
        return Math.round(6 * easeFactor / 2.5);
      case 4:
        return Math.round(14 * easeFactor / 2.5);
      case 5:
        return Math.round(30 * easeFactor / 2.5);
      default:
        return 1;
    }
  }

  private static calculateNextDate(intervalDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + intervalDays);
    return date.toISOString();
  }

  private static persistCards(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload = JSON.stringify(Array.from(this.cards.values()));
        window.localStorage.setItem(this.STORAGE_KEY, payload);
      }
    } catch {
      // Storage unavailable or disabled
    }
  }

  private static loadCards(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const data = window.localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          const list = JSON.parse(data) as IRepertoireCard[];
          for (const card of list) {
            this.cards.set(card.id, card);
          }
        }
      }
    } catch {
      // Storage parsing failed, use in-memory state
    }
  }

  private static seedDefaultRepertoire(): void {
    const seeds: IRepertoireCard[] = [
      {
        id: 'rep_white_italian_e4',
        color: 'WHITE',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        normalizedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
        expectedMoveSan: 'e4',
        alternativeMoves: ['d4', 'Nf3'],
        openingName: 'Abertura Italiana (Linha do Rei)',
        eco: 'C50',
        explanation: 'Controle central clássico e abertura de linhas para a dama e bispo.',
        boxLevel: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString(),
        timesReviewed: 0,
        timesFailed: 0
      },
      {
        id: 'rep_white_italian_bc4',
        color: 'WHITE',
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        normalizedFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -',
        expectedMoveSan: 'Bc4',
        alternativeMoves: ['Bb5', 'd4'],
        openingName: 'Abertura Italiana: Giuoco Piano',
        eco: 'C50',
        explanation: 'Desenvolve o bispo mirando a debilidade de f7.',
        boxLevel: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString(),
        timesReviewed: 0,
        timesFailed: 0
      },
      {
        id: 'rep_black_sicilian_c5',
        color: 'BLACK',
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        normalizedFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3',
        expectedMoveSan: 'c5',
        alternativeMoves: ['e5', 'e6'],
        openingName: 'Defesa Siciliana',
        eco: 'B20',
        explanation: 'Contragolpe de flanco assimétrico disputando d4.',
        boxLevel: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString(),
        timesReviewed: 0,
        timesFailed: 0
      },
      {
        id: 'rep_black_najdorf_a6',
        color: 'BLACK',
        fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
        normalizedFen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
        expectedMoveSan: 'a6',
        openingName: 'Defesa Siciliana: Najdorf',
        eco: 'B90',
        explanation: 'Controla b5 e prepara a expansão com b5 e e5.',
        boxLevel: 1,
        intervalDays: 1,
        easeFactor: 2.5,
        nextReviewDate: new Date().toISOString(),
        timesReviewed: 0,
        timesFailed: 0
      }
    ];

    for (const card of seeds) {
      this.cards.set(card.id, card);
    }
  }
}

/**
 * ChessInReact - Interactive Chess Academy & Tactical Study Engine (Spec 12 & Spec 06)
 *
 * Implements a structured curriculum of chess lessons, foundational tactics,
 * checkmate patterns, endgame fundamentals, and interactive exercises with step verification.
 */

export type StudyCategory = 'FUNDAMENTALS' | 'TACTICS' | 'CHECKMATES' | 'ENDGAMES' | 'OPENINGS';

export interface ILessonTopic {
  readonly id: string;
  readonly title: string;
  readonly category: StudyCategory;
  readonly description: string;
  readonly keyPrinciples: readonly string[];
  readonly exerciseIds: readonly string[];
}

export interface IStudyExercise {
  readonly id: string;
  readonly topicId: string;
  readonly title: string;
  readonly category: StudyCategory;
  readonly difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  readonly initialPlayer: 'P1' | 'P2';
  readonly initialFen?: string;
  readonly prompt: string;
  readonly hint: string;
  readonly solutionExplanation: string;
  readonly solutionSequence: readonly string[]; // Sequence of correct move SANs or coordinate keys
}

export interface IVerificationOutcome {
  readonly isCorrect: boolean;
  readonly isComplete: boolean;
  readonly feedback: string;
  readonly nextStepIndex: number;
}

export class AcademyStudyEngine {
  private static readonly STORAGE_KEY = 'chessinreact_academy_progress_v1';
  private static readonly memoryCompletedIds = new Set<string>();

  public static readonly CURRICULUM: readonly ILessonTopic[] = [
    {
      id: 'topic_fundamentals_center',
      title: 'Domínio do Centro & Desenvolvimento',
      category: 'FUNDAMENTALS',
      description: 'Controle as quatro casas centrais (e4, d4, e5, d5) e desenvolva peças menores rapidamente.',
      keyPrinciples: [
        'Ocupe o centro com peões logo na abertura.',
        'Desenvolva cavalos antes de bispos em direção ao centro.',
        'Evite mover a mesma peça duas vezes na fase inicial.',
        'Realize o roque cedo para proteger o rei e ativar a torre.',
      ],
      exerciseIds: ['ex_center_01', 'ex_center_02'],
    },
    {
      id: 'topic_tactics_fork_pin',
      title: 'Garfos, Duplos & Cravadas',
      category: 'TACTICS',
      description: 'Armas táticas decisivas: ataque simultâneo a duas peças ou imobilização de uma peça diante de um alvo de maior valor.',
      keyPrinciples: [
        'O Cavalo é a peça mais letal para executar garfos reais sem poder ser bloqueado.',
        'Uma cravada absoluta impede o movimento da peça para não deixar o rei em xeque.',
        'Cravadas relativas forçam a perda de material se a peça cravada for movida.',
      ],
      exerciseIds: ['ex_fork_01', 'ex_pin_01'],
    },
    {
      id: 'topic_checkmates_patterns',
      title: 'Padrões Fundamentais de Mate',
      category: 'CHECKMATES',
      description: 'Reconheça geometrias clássicas de vitória: Mate do Pastor, Mate do Corredor e Mate Sufocado.',
      keyPrinciples: [
        'O ponto f7/f2 é o elo mais fraco da posição inicial porque é defendido apenas pelo rei.',
        'O mate do corredor ocorre quando a primeira ou oitava fileira carece de escape para o rei.',
        'O mate sufocado utiliza a própria conformação de peças inimigas para encurralar o rei.',
      ],
      exerciseIds: ['ex_backrank_01', 'ex_smothered_01'],
    },
    {
      id: 'topic_endgames_fundamentals',
      title: 'Finais Fundamentais de Torre & Peões',
      category: 'ENDGAMES',
      description: 'Conquiste a vitória técnica quando a maioria das peças foi trocada.',
      keyPrinciples: [
        'No final de jogo, o Rei torna-se uma peça de ataque ativa e deve ir ao centro.',
        'A Oposição de reis é a chave para a coroação de peões passados.',
        'Torres devem ficar posicionadas atrás de peões passados, próprios ou adversários.',
      ],
      exerciseIds: ['ex_endgame_oposition_01'],
    },
  ];

  public static readonly EXERCISES: readonly IStudyExercise[] = [
    {
      id: 'ex_center_01',
      topicId: 'topic_fundamentals_center',
      title: 'Ocupação Central Clássica',
      category: 'FUNDAMENTALS',
      difficulty: 'BEGINNER',
      initialPlayer: 'P1',
      initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      prompt: 'Qual o lance de peão mais recomendável para reivindicar o centro no primeiro movimento?',
      hint: 'Avance o peão do rei duas casas para controlar d5 e abrir diagonais para dama e bispo.',
      solutionExplanation: '1. e4 (ou 1. d4) ocupa o centro diretamente e libera diagonais fundamentais de desenvolvimento.',
      solutionSequence: ['e4', '4,1-4,3'],
    },
    {
      id: 'ex_center_02',
      topicId: 'topic_fundamentals_center',
      title: 'Desenvolvimento Ativo de Cavalo',
      category: 'FUNDAMENTALS',
      difficulty: 'BEGINNER',
      initialPlayer: 'P1',
      initialFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      prompt: 'As Pretas responderam 1... e5. Como desenvolver o Cavalo atacando o peão central e controlando o centro?',
      hint: 'Mova o cavalo do rei para uma casa que ataque imediatamente o peão de e5.',
      solutionExplanation: '2. Nf3 desenvolve com ganho de tempo, atacando o peão indefeso de e5 e preparando o roque curto.',
      solutionSequence: ['Nf3', '6,0-5,2'],
    },
    {
      id: 'ex_fork_01',
      topicId: 'topic_tactics_fork_pin',
      title: 'Garfo Real com Cavalo',
      category: 'TACTICS',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P1',
      initialFen: 'r3k2r/ppp2ppp/2n5/3qp3/1b6/3P1N2/PPP2PPP/R1BQK2R w KQkq - 0 10',
      prompt: 'Encontre o salto de cavalo em c7 que aplica xeque no rei adversário e ataca a torre de a8 simultaneamente.',
      hint: 'Verifique a casa c7 — um salto tático divide a atenção da defesa.',
      solutionExplanation: 'O Cavalo em c7 executa um duplo clássico entre Rei e Torre, ganhando material decisivo.',
      solutionSequence: ['Nc7+', 'c7', 'Nxc7'],
    },
    {
      id: 'ex_pin_01',
      topicId: 'topic_tactics_fork_pin',
      title: 'Cravada Absoluta com Bispo',
      category: 'TACTICS',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P1',
      initialFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5',
      prompt: 'Como cravar o cavalo branco em f3 contra a dama branca usando o bispo de casas pretas?',
      hint: 'Mova o bispo para g4, imobilizando o cavalo defensor.',
      solutionExplanation: 'Bg4 estabelece uma cravada incômoda que desorganiza a estrutura adversária.',
      solutionSequence: ['Bg4', '2,7-6,3'],
    },
    {
      id: 'ex_backrank_01',
      topicId: 'topic_checkmates_patterns',
      title: 'Mate do Corredor (Back-Rank Mate)',
      category: 'CHECKMATES',
      difficulty: 'BEGINNER',
      initialPlayer: 'P1',
      initialFen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
      prompt: 'O rei preto está preso atrás dos próprios peões na oitava fileira. Como aplicar mate em 1 lance?',
      hint: 'Invada a 8ª fileira com sua torre desimpedida.',
      solutionExplanation: '1. Ra8# finaliza a partida com mate do corredor imediato, já que os peões em f7, g7 e h7 impedem o escape.',
      solutionSequence: ['Ra8#', 'Ra8', '0,0-0,7'],
    },
    {
      id: 'ex_smothered_01',
      topicId: 'topic_checkmates_patterns',
      title: 'Mate Sufocado (Smothered Mate)',
      category: 'CHECKMATES',
      difficulty: 'ADVANCED',
      initialPlayer: 'P1',
      initialFen: '6rk/5Npp/8/8/8/8/8/7K w - - 0 1',
      prompt: 'O rei preto no canto h8 está encurralado pela própria torre e peões. Finalize a partida.',
      hint: 'Dê xeque com o cavalo na casa f7.',
      solutionExplanation: '1. Nh6# ou 1. Nf7# sela o famoso mate de Philidor/sufocado, onde as próprias peças pretas impedem a fuga do rei.',
      solutionSequence: ['Nf7#', 'Nf7', '5,6-5,6'],
    },
    {
      id: 'ex_endgame_oposition_01',
      topicId: 'topic_endgames_fundamentals',
      title: 'Oposição Direta de Reis',
      category: 'ENDGAMES',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P1',
      initialFen: '8/8/4k3/8/4K3/8/4P3/8 w - - 0 1',
      prompt: 'Como tomar a oposição frontal mantendo uma casa de distância ímpar entre os reis?',
      hint: 'Fique de frente para o rei inimigo na mesma coluna.',
      solutionExplanation: 'Ke4 mantém a oposição vertical, forçando o rei adversário a ceder passagem para o avanço seguro do peão.',
      solutionSequence: ['Ke4', 'Kd4', 'e3'],
    },
  ];

  /**
   * Returns list of completed exercise IDs stored in local storage or memory.
   */
  public static getCompletedExerciseIds(): string[] {
    const list = Array.from(this.memoryCompletedIds);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const stored: string[] = JSON.parse(raw);
          for (const id of stored) {
            if (!list.includes(id)) list.push(id);
          }
        }
      } catch {
        // Fallback to memory
      }
    }
    return list;
  }

  /**
   * Records an exercise as successfully mastered.
   */
  public static markExerciseCompleted(exerciseId: string): void {
    this.memoryCompletedIds.add(exerciseId);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const list = this.getCompletedExerciseIds();
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Resets local academy progress.
   */
  public static resetProgress(): void {
    this.memoryCompletedIds.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.STORAGE_KEY);
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Computes mastery completion stats.
   */
  public static getAcademyStats(): {
    totalExercises: number;
    completedCount: number;
    completionPercentage: number;
  } {
    const total = this.EXERCISES.length;
    const completed = this.getCompletedExerciseIds().filter((id) =>
      this.EXERCISES.some((e) => e.id === id)
    ).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      totalExercises: total,
      completedCount: completed,
      completionPercentage: percentage,
    };
  }

  /**
   * Verifies player's candidate move against the exercise's solution sequence.
   */
  public static verifyMove(
    exerciseId: string,
    stepIndex: number,
    candidateMove: string
  ): IVerificationOutcome {
    const exercise = this.EXERCISES.find((e) => e.id === exerciseId);
    if (!exercise) {
      return {
        isCorrect: false,
        isComplete: false,
        feedback: 'Exercício não encontrado.',
        nextStepIndex: stepIndex,
      };
    }

    const cleanCandidate = candidateMove.trim().replace(/[+#!?]/g, '').toLowerCase();

    // Check against expected sequence at stepIndex
    const expected = exercise.solutionSequence.map((s) =>
      s.trim().replace(/[+#!?]/g, '').toLowerCase()
    );

    const matchesExpected = expected.some((sol) => sol === cleanCandidate);

    if (matchesExpected) {
      this.markExerciseCompleted(exerciseId);
      return {
        isCorrect: true,
        isComplete: true,
        feedback: `Excelente! ${exercise.solutionExplanation}`,
        nextStepIndex: stepIndex + 1,
      };
    }

    return {
      isCorrect: false,
      isComplete: false,
      feedback: `Lance incorreto. Dica: ${exercise.hint}`,
      nextStepIndex: stepIndex,
    };
  }
}

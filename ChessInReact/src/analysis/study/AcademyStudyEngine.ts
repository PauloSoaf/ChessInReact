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

export interface IStudyStep {
  readonly expectedMove: string;
  readonly acceptedMoves: readonly string[];
  readonly explanation?: string;
}

export interface IStudyExercise {
  readonly id: string;
  readonly topicId: string;
  readonly title: string;
  readonly category: StudyCategory;
  readonly difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  readonly initialPlayer: 'P1' | 'P2';
  readonly initialFen: string;
  readonly prompt: string;
  readonly hint: string;
  readonly solutionExplanation: string;
  readonly steps: readonly IStudyStep[];
  readonly solutionSequence: readonly string[];
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
      exerciseIds: ['ex_fork_01', 'ex_pin_01', 'ex_multistep_01'],
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
      steps: [
        {
          expectedMove: 'e4',
          acceptedMoves: ['e4', '4,1-4,3', '1. e4', 'd4', '3,1-3,3', '1. d4'],
          explanation: 'Ocupa as casas centrais com ganho de espaço.',
        },
      ],
      solutionSequence: ['e4'],
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
      steps: [
        {
          expectedMove: 'Nf3',
          acceptedMoves: ['Nf3', '6,0-5,2', '2. Nf3'],
          explanation: 'Desenvolve atacando a debilidade em e5.',
        },
      ],
      solutionSequence: ['Nf3'],
    },
    {
      id: 'ex_fork_01',
      topicId: 'topic_tactics_fork_pin',
      title: 'Garfo Real com Cavalo',
      category: 'TACTICS',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P1',
      initialFen: 'r3k2r/ppp2ppp/8/3N4/8/8/PPPPPPPP/R3K2R w KQkq - 0 1',
      prompt: 'Encontre o salto de cavalo em c7 que aplica xeque no rei adversário e ataca a torre de a8 simultaneamente.',
      hint: 'Verifique a casa c7 — um salto tático divide a atenção da defesa.',
      solutionExplanation: 'O Cavalo em c7 (Nxc7+) executa um duplo clássico entre Rei e Torre, ganhando material decisivo.',
      steps: [
        {
          expectedMove: 'Nxc7+',
          acceptedMoves: ['Nxc7+', 'Nc7+', '3,4-2,6', 'Nxc7', 'Nc7'],
          explanation: 'Garfo real irresistível contra o Rei e a Torre.',
        },
      ],
      solutionSequence: ['Nxc7+'],
    },
    {
      id: 'ex_pin_01',
      topicId: 'topic_tactics_fork_pin',
      title: 'Cravada Absoluta com Bispo',
      category: 'TACTICS',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P2',
      initialFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5',
      prompt: 'Como cravar o cavalo branco em f3 contra a dama branca usando o bispo de casas pretas?',
      hint: 'Mova o bispo para g4, imobilizando o cavalo defensor.',
      solutionExplanation: 'Bg4 estabelece uma cravada incômoda que desorganiza a estrutura adversária.',
      steps: [
        {
          expectedMove: 'Bg4',
          acceptedMoves: ['Bg4', '2,7-6,3', '5... Bg4'],
          explanation: 'Cravada direta do cavalo contra a dama de d1.',
        },
      ],
      solutionSequence: ['Bg4'],
    },
    {
      id: 'ex_multistep_01',
      topicId: 'topic_tactics_fork_pin',
      title: 'Combinação em 2 Lances: Ataque Descoberto',
      category: 'TACTICS',
      difficulty: 'ADVANCED',
      initialPlayer: 'P1',
      initialFen: 'r1bq1rk1/ppp2ppp/2n5/4p1N1/2B5/8/PPP2PPP/R1BQR1K1 w - - 0 1',
      prompt: 'Execute a sequência tática em duas etapas: primeiro elimine a defesa com xeque (Bxf7+), depois recapture a dama em d8.',
      hint: 'Primeiro sacrifique o bispo em f7 com xeque, depois jogue Qxd8.',
      solutionExplanation: '1. Bxf7+ força a perda da torre/rei e 2. Qxd8 conclui a transposição com ganho de dama.',
      steps: [
        {
          expectedMove: 'Bxf7+',
          acceptedMoves: ['Bxf7+', 'Bxf7', '2,3-5,6', '1. Bxf7+'],
          explanation: 'Passo 1 concluído! O bispo desorganiza o roque adversário.',
        },
        {
          expectedMove: 'Qxd8',
          acceptedMoves: ['Qxd8', 'Qxd8+', '3,0-3,7', '2. Qxd8'],
          explanation: 'Passo 2 concluído! Dama adversária capturada.',
        },
      ],
      solutionSequence: ['Bxf7+', 'Qxd8'],
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
      steps: [
        {
          expectedMove: 'Ra8#',
          acceptedMoves: ['Ra8#', 'Ra8', '0,0-0,7', '1. Ra8#', '1. Ra8'],
          explanation: 'Mate imediato do corredor.',
        },
      ],
      solutionSequence: ['Ra8#'],
    },
    {
      id: 'ex_smothered_01',
      topicId: 'topic_checkmates_patterns',
      title: 'Mate Sufocado (Smothered Mate)',
      category: 'CHECKMATES',
      difficulty: 'ADVANCED',
      initialPlayer: 'P1',
      initialFen: '6rk/6pp/7N/8/8/8/8/7K w - - 0 1',
      prompt: 'O rei preto no canto h8 está encurralado pela própria torre e peões. Finalize a partida com xeque-mate do cavalo.',
      hint: 'Dê xeque com o cavalo na casa f7.',
      solutionExplanation: '1. Nf7# sela o famoso mate sufocado, onde as próprias peças pretas impedem a fuga do rei.',
      steps: [
        {
          expectedMove: 'Nf7#',
          acceptedMoves: ['Nf7#', 'Nf7', '7,5-5,6', '1. Nf7#'],
          explanation: 'O cavalo aplica mate sufocado perfeito.',
        },
      ],
      solutionSequence: ['Nf7#'],
    },
    {
      id: 'ex_endgame_oposition_01',
      topicId: 'topic_endgames_fundamentals',
      title: 'Oposição Direta de Reis',
      category: 'ENDGAMES',
      difficulty: 'INTERMEDIATE',
      initialPlayer: 'P1',
      initialFen: '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1',
      prompt: 'Como tomar a oposição frontal mantendo uma casa de distância ímpar entre os reis?',
      hint: 'Fique de frente para o rei inimigo na mesma coluna e4.',
      solutionExplanation: 'Ke4 mantém a oposição vertical, forçando o rei adversário a ceder passagem para o avanço seguro do peão.',
      steps: [
        {
          expectedMove: 'Ke4',
          acceptedMoves: ['Ke4', '4,2-4,3', '1. Ke4'],
          explanation: 'Oposição direta tomada.',
        },
      ],
      solutionSequence: ['Ke4'],
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
   * Marks an exercise as completed and persists progress.
   */
  public static markExerciseCompleted(exerciseId: string): void {
    this.memoryCompletedIds.add(exerciseId);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const current = this.getCompletedExerciseIds();
        if (!current.includes(exerciseId)) {
          current.push(exerciseId);
        }
        window.localStorage.setItem(this.STORAGE_KEY, JSON.stringify(current));
      } catch {
        // Fallback to memory
      }
    }
  }

  /**
   * Resets all progress (useful for re-testing).
   */
  public static resetProgress(): void {
    this.memoryCompletedIds.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.STORAGE_KEY);
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Calculates overall completion statistics by study category.
   */
  public static getAcademyStats(): {
    totalExercises: number;
    completedExercises: number;
    completionPercentage: number;
    byCategory: Record<StudyCategory, { total: number; completed: number }>;
  } {
    const completed = this.getCompletedExerciseIds();
    const byCategory: Record<StudyCategory, { total: number; completed: number }> = {
      FUNDAMENTALS: { total: 0, completed: 0 },
      TACTICS: { total: 0, completed: 0 },
      CHECKMATES: { total: 0, completed: 0 },
      ENDGAMES: { total: 0, completed: 0 },
      OPENINGS: { total: 0, completed: 0 },
    };

    for (const ex of this.EXERCISES) {
      byCategory[ex.category].total++;
      if (completed.includes(ex.id)) {
        byCategory[ex.category].completed++;
      }
    }

    const totalExercises = this.EXERCISES.length;
    const completedExercises = completed.length;
    const completionPercentage =
      totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;

    return {
      totalExercises,
      completedExercises,
      completionPercentage,
      byCategory,
    };
  }

  /**
   * Verifies player's candidate move against the exercise's solution step sequence.
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

    const currentStep = exercise.steps[stepIndex];
    if (!currentStep) {
      return {
        isCorrect: false,
        isComplete: true,
        feedback: 'Todas as etapas deste exercício já foram resolvidas.',
        nextStepIndex: stepIndex,
      };
    }

    const cleanCandidate = candidateMove.trim().toLowerCase().replace(/[+#!?]/g, '');

    // Check if candidate matches previous step (already played)
    if (stepIndex > 0) {
      const prevStep = exercise.steps[stepIndex - 1];
      const isPrev = prevStep.acceptedMoves.some(
        (m) => m.toLowerCase().replace(/[+#!?]/g, '') === cleanCandidate
      );
      if (isPrev) {
        return {
          isCorrect: false,
          isComplete: false,
          feedback: 'Esta etapa já foi executada. Prossiga para o próximo lance da sequência.',
          nextStepIndex: stepIndex,
        };
      }
    }

    // Check if candidate matches a future step out of order
    for (let i = stepIndex + 1; i < exercise.steps.length; i++) {
      const futureStep = exercise.steps[i];
      const isFuture = futureStep.acceptedMoves.some(
        (m) => m.toLowerCase().replace(/[+#!?]/g, '') === cleanCandidate
      );
      if (isFuture) {
        return {
          isCorrect: false,
          isComplete: false,
          feedback: 'Lance fora de ordem. Resolva primeiro o passo atual.',
          nextStepIndex: stepIndex,
        };
      }
    }

    // Validate against current step
    const isStepCorrect = currentStep.acceptedMoves.some(
      (m) =>
        m.toLowerCase().replace(/[+#!?]/g, '') === cleanCandidate ||
        m.toLowerCase() === candidateMove.trim().toLowerCase()
    );

    if (!isStepCorrect) {
      return {
        isCorrect: false,
        isComplete: false,
        feedback: 'Lance incorreto para esta posição. Analise a tática e tente novamente!',
        nextStepIndex: stepIndex,
      };
    }

    const isLastStep = stepIndex === exercise.steps.length - 1;
    if (isLastStep) {
      this.markExerciseCompleted(exerciseId);
      return {
        isCorrect: true,
        isComplete: true,
        feedback: `Excelente! ${exercise.solutionExplanation}`,
        nextStepIndex: stepIndex + 1,
      };
    }

    return {
      isCorrect: true,
      isComplete: false,
      feedback: `Excelente lance! ${currentStep.explanation ?? 'Agora encontre a próxima jogada para concluir o exercício.'}`,
      nextStepIndex: stepIndex + 1,
    };
  }

  /**
   * Retrieves educational hint for the exercise.
   */
  public static getHint(exerciseId: string): string {
    const exercise = this.EXERCISES.find((e) => e.id === exerciseId);
    return exercise?.hint ?? 'Analise o posicionamento das peças e procure táticas de ataque direto.';
  }
}

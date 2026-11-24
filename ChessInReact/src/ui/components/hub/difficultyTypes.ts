export interface IDifficultyMeta {
  readonly level: number;
  readonly name: string;
  readonly desc: string;
  readonly profile: string;
  readonly cadence: string;
}

export const DIFFICULTY_META: readonly IDifficultyMeta[] = [
  {
    level: 1,
    name: 'Iniciante',
    desc: 'Ideal para praticar movimentos fundamentais, capturas e desenvolvimento inicial.',
    profile: 'Treino Base',
    cadence: 'Ritmo Acessível',
  },
  {
    level: 2,
    name: 'Casual',
    desc: 'Transições fluidas para partidas recreativas e consolidação tática.',
    profile: 'Jogo Equilibrado',
    cadence: 'Ritmo Dinâmico',
  },
  {
    level: 3,
    name: 'Tático',
    desc: 'Explora peças desprotegidas e exige atenção constante na defesa.',
    profile: 'Intermediário',
    cadence: 'Ritmo Competitivo',
  },
  {
    level: 4,
    name: 'Avançado',
    desc: 'Cálculo profundo com controle posicional refinado e punição de imprecisões.',
    profile: 'Alta Pressão',
    cadence: 'Ritmo Ágil',
  },
  {
    level: 5,
    name: 'Mestre',
    desc: 'Máxima precisão heurística com avaliação aguçada de sacrifícios e finais.',
    profile: 'Nível Mestre',
    cadence: 'Tempo Real Otimizado',
  },
];


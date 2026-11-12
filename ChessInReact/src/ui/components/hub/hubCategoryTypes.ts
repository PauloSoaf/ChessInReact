export type HubCategoryKey =
  | 'CLASSIC'
  | 'MAGICAL'
  | 'ARENAS'
  | 'GEOMETRIC'
  | 'HISTORICAL'
  | 'ACADEMY';

export interface ICategoryTabMeta {
  readonly key: HubCategoryKey;
  readonly label: string;
  readonly badge: string;
  readonly icon: string;
  readonly summary: string;
}

export const HUB_CATEGORIES: readonly ICategoryTabMeta[] = [
  {
    key: 'CLASSIC',
    label: 'Clássico & Alternativo',
    badge: '1v1',
    icon: '♟️',
    summary: 'Xadrez FIDE, 960, Three-Check, King of the Hill, Racing Kings, Horde, Atomic, Antichess',
  },
  {
    key: 'MAGICAL',
    label: 'Modos Mágicos & Híbridos',
    badge: 'Spells/Duck',
    icon: '✨',
    summary: 'Spell Chess Oficial (2 feitiços), Spell Chess Expandido (7 feitiços), Duck Chess, Bughouse 2v2',
  },
  {
    key: 'ARENAS',
    label: 'Arenas Massivas (3 a 12P)',
    badge: '3-12P',
    icon: '🛡️',
    summary: '3-Player, 4-Player FFA, Cruz 160 casas, Hexágono 6P, Dodecágono 12P, Diplomacy Turnos Simultâneos',
  },
  {
    key: 'GEOMETRIC',
    label: 'Tabuleiros & Fadas',
    badge: 'Fairy',
    icon: '📐',
    summary: 'Capablanca 10×8 (Chanceler e Arcebispo), Gliński Hexagonal 91 casas, Amazon, Seirawan',
  },
  {
    key: 'HISTORICAL',
    label: 'Histórico & Regional',
    badge: 'Ásia/Pérsia',
    icon: '📜',
    summary: 'Shogi Japonês 9×9 (Drops e Promoção), Xiangqi Chinês (Rio e Palácio), Shatranj Persa, Makruk',
  },
  {
    key: 'ACADEMY',
    label: 'Academia & Puzzles',
    badge: 'Treino',
    icon: '🎓',
    summary: 'Puzzle Rush contra o relógio, Puzzle Battle vs Bot, Estudo tático e visualizador de gabarito',
  },
];


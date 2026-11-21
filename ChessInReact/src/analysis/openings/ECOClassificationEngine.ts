/**
 * ChessInReact - Canonical ECO Classification Engine
 * Spec 17: RF-17-01 & RF-17-02
 *
 * Implements high-speed O(1) classification of chess positions into official
 * Encyclopaedia of Chess Openings (ECO) codes (A00-E99), with transposition
 * resolution via normalized FEN keys.
 */

import { IOpeningDefinition } from './types';

export class ECOClassificationEngine {
  /**
   * Normalizes a FEN string by preserving only board placement, active player,
   * castling availability, and en-passant target, dropping halfmove clock and move count.
   * This guarantees that two distinct move orders reaching the exact same position
   * produce an identical lookup key (Transposition Invariance).
   */
  public static normalizeFen(fen: string): string {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) {
      return fen.trim();
    }
    const [placement, turn, castling, enPassant] = parts;
    return `${placement} ${turn} ${castling} ${enPassant}`;
  }

  /**
   * Canonical database of foundational chess openings.
   */
  public static readonly CANONICAL_OPENINGS: readonly IOpeningDefinition[] = [
    // Starting Position
    {
      eco: 'A00',
      name: 'Posição Inicial',
      movesSan: [],
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      normalizedFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
      description: 'Tabulheiro padrão antes de qualquer lance ser executado.'
    },

    // A - Flank Openings & Irregular
    {
      eco: 'A00',
      name: 'Abertura Polonesa (Sokolsky)',
      movesSan: ['b4'],
      fen: 'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq b3 0 1',
      normalizedFen: 'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq b3',
      description: 'Ataque de flanco incomum pelo flanco da dama.'
    },
    {
      eco: 'A04',
      name: 'Abertura Réti',
      movesSan: ['Nf3'],
      fen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
      normalizedFen: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq -',
      description: 'Sistema hipermoderno focado no controle à distância do centro.'
    },
    {
      eco: 'A10',
      name: 'Abertura Inglesa',
      movesSan: ['c4'],
      fen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3 0 1',
      normalizedFen: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq c3',
      description: 'Lance flexível de flanco que frequentemente transpõe para sistemas de d4.'
    },
    {
      eco: 'A40',
      name: 'Abertura do Peão da Dama',
      movesSan: ['d4'],
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1',
      normalizedFen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3',
      description: 'Controle imediato da casa e5 e abertura de diagonais para a dama e bispo.'
    },
    {
      eco: 'A80',
      name: 'Defesa Holandesa',
      movesSan: ['d4', 'f5'],
      fen: 'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6 0 2',
      normalizedFen: 'rnbqkbnr/ppppp1pp/8/5p2/3P4/8/PPP1PPPP/RNBQKBNR w KQkq f6',
      description: 'Resposta agressiva e assimétrica das Pretas com controle de e4.'
    },

    // B - Semi-Open Games (excluding French)
    {
      eco: 'B01',
      name: 'Defesa Escandinava',
      movesSan: ['e4', 'd5'],
      fen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2',
      normalizedFen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6',
      description: 'Desafio direto e imediato ao peão de e4 das Brancas.'
    },
    {
      eco: 'B02',
      name: 'Defesa Alekhine',
      movesSan: ['e4', 'Nf6'],
      fen: 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2',
      normalizedFen: 'rnbqkb1r/pppppppp/5n2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
      description: 'Provocação para que as Brancas avancem os peões centrais para atacá-los depois.'
    },
    {
      eco: 'B10',
      name: 'Defesa Caro-Kann',
      movesSan: ['e4', 'c6'],
      fen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      normalizedFen: 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
      description: 'Defesa ultra-sólida preparando o avanço d5 com suporte de c6.'
    },
    {
      eco: 'B12',
      name: 'Defesa Caro-Kann: Avanço',
      movesSan: ['e4', 'c6', 'd4', 'd5', 'e5'],
      fen: 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
      normalizedFen: 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq -',
      description: 'As Brancas ganham espaço central fechando a cadeia de peões.'
    },
    {
      eco: 'B20',
      name: 'Defesa Siciliana',
      movesSan: ['e4', 'c5'],
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      normalizedFen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6',
      description: 'A resposta mais popular e combativa contra 1. e4.'
    },
    {
      eco: 'B23',
      name: 'Defesa Siciliana Fechada',
      movesSan: ['e4', 'c5', 'Nc3'],
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2',
      normalizedFen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq -',
      description: 'Sistema posicional calmo evitando a abertura rápida do centro com d4.'
    },
    {
      eco: 'B27',
      name: 'Defesa Siciliana: Aberta',
      movesSan: ['e4', 'c5', 'Nf3'],
      fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      normalizedFen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -',
      description: 'Desenvolvimento do cavalo preparando a ruptura central d4.'
    },
    {
      eco: 'B90',
      name: 'Defesa Siciliana: Variante Najdorf',
      movesSan: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
      fen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
      normalizedFen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq -',
      description: 'A variante mais afiada e lendária do xadrez, imortalizada por Fischer e Kasparov.'
    },

    // C - Open Games & French Defense
    {
      eco: 'C00',
      name: 'Defesa Francesa',
      movesSan: ['e4', 'e6'],
      fen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      normalizedFen: 'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
      description: 'Defesa resiliente com contragolpe no centro após d5.'
    },
    {
      eco: 'C02',
      name: 'Defesa Francesa: Avanço',
      movesSan: ['e4', 'e6', 'd4', 'd5', 'e5'],
      fen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3',
      normalizedFen: 'rnbqkbnr/ppp2ppp/4p3/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq -',
      description: 'Bloqueio central imediato criando dinâmicas de cadeias de peões.'
    },
    {
      eco: 'C20',
      name: 'Abertura do Peão do Rei',
      movesSan: ['e4', 'e5'],
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      normalizedFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6',
      description: 'O início do clássico xadrez aberto.'
    },
    {
      eco: 'C42',
      name: 'Defesa Petrov (Russa)',
      movesSan: ['e4', 'e5', 'Nf3', 'Nf6'],
      fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      normalizedFen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -',
      description: 'Defesa extremamente sólida com contra-ataque simétrico ao peão de e4.'
    },
    {
      eco: 'C50',
      name: 'Abertura Italiana',
      movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
      fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      normalizedFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
      description: 'Abertura romântica visando o ponto fraco f7 das Pretas.'
    },
    {
      eco: 'C51',
      name: 'Gambito Evans',
      movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'],
      fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq b3 0 4',
      normalizedFen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/1PB1P3/5N2/P1PP1PPP/RNBQK2R b KQkq b3',
      description: 'Sacrifício de peão de flanco para obter iniciativa demolidora no centro.'
    },
    {
      eco: 'C60',
      name: 'Ruy Lopez (Abertura Espanhola)',
      movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
      fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      normalizedFen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -',
      description: 'A mais profunda e respeitada das aberturas abertas.'
    },
    {
      eco: 'C65',
      name: 'Ruy Lopez: Defesa Berlinesa',
      movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
      fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      normalizedFen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq -',
      description: 'O famoso "Muro de Berlim" que neutralizou Garry Kasparov no match de 2000.'
    },

    // D - Closed Games & Semi-Closed Games
    {
      eco: 'D00',
      name: 'Gambito da Dama',
      movesSan: ['d4', 'd5', 'c4'],
      fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3 0 2',
      normalizedFen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq c3',
      description: 'A mais nobre e estratégica batalha pelo domínio do centro.'
    },
    {
      eco: 'D20',
      name: 'Gambito da Dama Aceito',
      movesSan: ['d4', 'd5', 'c4', 'dxc4'],
      fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
      normalizedFen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq -',
      description: 'As Pretas cedem temporariamente o centro em troca de atividade de peças.'
    },
    {
      eco: 'D30',
      name: 'Gambito da Dama Recusado',
      movesSan: ['d4', 'd5', 'c4', 'e6'],
      fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
      normalizedFen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
      description: 'A resposta mais clássica e estruturada contra o Gambito da Dama.'
    },
    {
      eco: 'D80',
      name: 'Defesa Grünfeld',
      movesSan: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'],
      fen: 'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6 0 4',
      normalizedFen: 'rnbqkb1r/ppp1pp1p/5np1/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq d6',
      description: 'As Pretas convidam a ocupação de peões centrais para bombardeá-los com peças.'
    },

    // E - Indian Defenses
    {
      eco: 'E00',
      name: 'Abertura Catalã',
      movesSan: ['d4', 'Nf6', 'c4', 'e6', 'g3'],
      fen: 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq - 0 3',
      normalizedFen: 'rnbqkb1r/pppp1ppp/4pn2/8/2PP4/6P1/PP2PP1P/RNBQKBNR b KQkq -',
      description: 'Combinação harmoniosa do Gambito da Dama com o fianchetto do bispo rei.'
    },
    {
      eco: 'E20',
      name: 'Defesa Nimzoíndia',
      movesSan: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
      fen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 2 4',
      normalizedFen: 'rnbqk2r/pppp1ppp/4pn2/8/1bPP4/2N5/PP2PPPP/R1BQKBNR w KQkq -',
      description: 'Prevenção tática do lance e4 através da cravada do cavalo de c3.'
    },
    {
      eco: 'E60',
      name: 'Defesa Índia do Rei',
      movesSan: ['d4', 'Nf6', 'c4', 'g6'],
      fen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
      normalizedFen: 'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq -',
      description: 'Uma das defesas mais agressivas e dinâmicas contra o peão da dama.'
    }
  ];

  private static fenMap: Map<string, IOpeningDefinition> | null = null;
  private static movesTrie: Map<string, IOpeningDefinition> | null = null;

  private static initMaps(): void {
    if (this.fenMap && this.movesTrie) return;

    this.fenMap = new Map();
    this.movesTrie = new Map();

    for (const opening of this.CANONICAL_OPENINGS) {
      this.fenMap.set(opening.normalizedFen, opening);
      const moveKey = opening.movesSan.join(' ');
      this.movesTrie.set(moveKey, opening);
    }
  }

  /**
   * Classifies a position by its FEN string with O(1) complexity.
   */
  public static classifyFen(fen: string): IOpeningDefinition {
    this.initMaps();
    const normalized = this.normalizeFen(fen);
    const exact = this.fenMap?.get(normalized);
    if (exact) {
      return exact;
    }

    return {
      eco: 'A00',
      name: 'Posição Customizada / Fora de Livro',
      movesSan: [],
      fen,
      normalizedFen: normalized,
      description: 'Posição que divergiu das linhas principais do repertório canônico.'
    };
  }

  /**
   * Classifies a game by its sequence of moves in SAN notation.
   * Matches the longest known opening prefix.
   */
  public static classifyMoves(movesSan: readonly string[]): IOpeningDefinition {
    this.initMaps();
    let bestMatch: IOpeningDefinition = this.CANONICAL_OPENINGS[0]; // Starting position

    for (let i = movesSan.length; i >= 1; i--) {
      const subMoves = movesSan.slice(0, i).join(' ');
      const match = this.movesTrie?.get(subMoves);
      if (match) {
        bestMatch = match;
        break;
      }
    }

    return bestMatch;
  }
}


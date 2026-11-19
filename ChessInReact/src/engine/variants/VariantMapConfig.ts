/**
 * ChessInReact - Variable Variant Map Geometry & Visual Theme Configuration
 * (Spec 02, Spec 04, Spec 07, Spec 12, Spec 13, Spec 14)
 *
 * Defines per-variant board shapes (Cross 14x14 cutouts, Capablanca 10x8,
 * Hexagonal/Octagonal radial cutouts, Dodecagon ring), special map zones
 * (King of the Hill sanctuary, Racing Kings finish rank, Spell Chess mana conduits),
 * and custom 2D/3D board & piece skin palettes.
 */

export type VariantZoneType =
  | 'NORMAL'
  | 'VOID'
  | 'HILL_SANCTUARY'
  | 'FINISH_LINE'
  | 'ARCANE_CONDUIT'
  | 'CITADEL_RING';

export interface IVariantMapTheme {
  readonly id: string;
  readonly themeId: string;
  readonly displayName: string;
  readonly lightSquare: string;
  readonly darkSquare: string;
  readonly accentColor: string;
  readonly hasArcaneSkins?: boolean;
}

export class VariantMapConfig {
  /**
   * Determines if a given (col, row) coordinate is cut out (VOID) for the active variant map.
   * Classical 8x8 chess has zero void squares.
   */
  public static isVoidSquare(
    variantId: string | undefined | null,
    col: number,
    row: number,
    boardSize: number
  ): boolean {
    if (!variantId) return false;
    const v = variantId.toUpperCase();

    // 1. Capablanca Chess: 10 columns x 8 ranks (rows 8 and 9 are void when rendered in a 10x10 grid)
    if (v.includes('CAPABLANCA')) {
      return col < 0 || col >= 10 || row < 0 || row >= 8;
    }

    // 2. Xiangqi (Chinese Chess): 9 columns x 10 ranks (column 9 is void when rendered in a 10x10 grid)
    if (v.includes('XIANGQI')) {
      return col < 0 || col >= 9 || row < 0 || row >= 10;
    }

    // 2. 4-Player Cross Arena (14x14 with 3x3 corner cutouts = 160 active squares)
    if (
      v === 'FOUR_PLAYER_FFA' ||
      v === 'FOUR_PLAYER_TEAMS' ||
      v === 'FOUR_PLAYER_SOLO'
    ) {
      const cut = 3;
      const max = boardSize - cut;
      if (col < cut && row < cut) return true;
      if (col >= max && row < cut) return true;
      if (col < cut && row >= max) return true;
      if (col >= max && row >= max) return true;
      return false;
    }

    // 3. Hexagonal / Triangular 3-Player & 6-Player Radial Arenas: diamond corner cutouts
    if (
      v === 'THREE_PLAYER_CHESS' ||
      v === 'TRIANGULAR_CHAOS_3P' ||
      v === 'HEXAGON_SIX_PLAYER' ||
      v === 'SIX_PLAYER_TEAMS' ||
      v === 'MINI_HEXAGON_6P'
    ) {
      if (boardSize < 12) return false;
      const center = (boardSize - 1) / 2;
      const manhattan = Math.abs(col - center) + Math.abs(row - center);
      return manhattan > boardSize - 3.5;
    }

    // 4. Fortress 5P / Octagon 8P / Dodecagon 12P Ring Arenas: 2x2 outer corner cutouts
    if (
      v.includes('5P') ||
      v.includes('SEVEN_PLAYER') ||
      v.includes('OCTAGON') ||
      v.includes('NEXUS_10P') ||
      v.includes('DODECAGON_12P')
    ) {
      if (boardSize < 12) return false;
      const cut = 2;
      const max = boardSize - cut;
      if (col < cut && row < cut) return true;
      if (col >= max && row < cut) return true;
      if (col < cut && row >= max) return true;
      if (col >= max && row >= max) return true;
      return false;
    }

    return false;
  }

  /**
   * Returns the special zone classification of a square for visual 2D/3D rendering.
   */
  public static getSquareZone(
    variantId: string | undefined | null,
    col: number,
    row: number,
    boardSize: number
  ): VariantZoneType {
    if (this.isVoidSquare(variantId, col, row, boardSize)) {
      return 'VOID';
    }
    if (!variantId) return 'NORMAL';
    const v = variantId.toUpperCase();

    if (v.includes('KING_OF_THE_HILL') || v.includes('HILL')) {
      if ((col === 3 || col === 4) && (row === 3 || row === 4)) {
        return 'HILL_SANCTUARY';
      }
    }

    if (v.includes('RACING')) {
      if (row === 7) {
        return 'FINISH_LINE';
      }
    }

    if (v.includes('SPELL')) {
      if ((col === 3 || col === 4) && (row === 3 || row === 4)) {
        return 'ARCANE_CONDUIT';
      }
    }

    if (
      v.includes('FOUR_PLAYER') ||
      v.includes('5P') ||
      v.includes('HEXAGON') ||
      v.includes('OCTAGON') ||
      v.includes('DODECAGON')
    ) {
      const cMin = Math.floor(boardSize / 2) - 1;
      const cMax = Math.floor(boardSize / 2);
      if (col >= cMin && col <= cMax && row >= cMin && row <= cMax) {
        return 'CITADEL_RING';
      }
    }

    return 'NORMAL';
  }

  /**
   * Returns custom map colors and skin flags for the active variant.
   * Returns CLASSIC theme for standard chess so the user's selected theme applies unmodified.
   */
  public static getVariantTheme(variantId: string | undefined | null): IVariantMapTheme {
    const v = (variantId ?? '').toUpperCase();

    if (v.includes('SPELL')) {
      return {
        id: 'SPELL_ARCANE',
        themeId: 'SPELL_ARCANE',
        displayName: 'Santuário Arcano (Spell Chess)',
        lightSquare: '#312e81',
        darkSquare: '#0f172a',
        accentColor: '#22d3ee',
        hasArcaneSkins: true,
      };
    }

    if (v.includes('ATOMIC')) {
      return {
        id: 'ATOMIC_REACTOR',
        themeId: 'ATOMIC_REACTOR',
        displayName: 'Zona de Detonação (Atomic)',
        lightSquare: '#451a03',
        darkSquare: '#1c1917',
        accentColor: '#f97316',
      };
    }

    if (v.includes('DUCK')) {
      return {
        id: 'DUCK_LAGOON',
        themeId: 'DUCK_LAGOON',
        displayName: 'Lagoa Tática (Duck Chess)',
        lightSquare: '#134e4a',
        darkSquare: '#042f2e',
        accentColor: '#facc15',
      };
    }

    if (v.includes('RACING')) {
      return {
        id: 'RACING_TRACK',
        themeId: 'RACING_TRACK',
        displayName: 'Pista Real (Racing Kings)',
        lightSquare: '#1e293b',
        darkSquare: '#0f172a',
        accentColor: '#10b981',
      };
    }

    if (v.includes('HILL')) {
      return {
        id: 'HILL_THRONE',
        themeId: 'HILL_THRONE',
        displayName: 'Colina do Rei (King of the Hill)',
        lightSquare: '#3f2e1e',
        darkSquare: '#1c1611',
        accentColor: '#fbbf24',
      };
    }

    return {
      id: 'CLASSIC',
      themeId: 'CLASSIC',
      displayName: 'Clássico',
      lightSquare: '#e2e8f0',
      darkSquare: '#475569',
      accentColor: '#94a3b8',
    };
  }
}

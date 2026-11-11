/**
 * ChessInReact - Spell Chess Engine (Spec 12 § 5.1, § 6.3, § 11)
 *
 * Implements canonical Spell Chess mechanics:
 * - Mana Economy: Start with 2 mana, +1 per turn up to max 6 mana.
 * - 7 Canonical Spells: FREEZE, JUMP, INVISIBILITY, PORTAL, STEALTH_TRAP, RESURRECTION, MIRROR_SHIELD.
 * - Immutable State Transitions, cooldown decrements, and board interactions.
 */

export type SpellType = 
  | 'FREEZE' 
  | 'JUMP' 
  | 'INVISIBILITY' 
  | 'PORTAL' 
  | 'STEALTH_TRAP' 
  | 'RESURRECTION' 
  | 'MIRROR_SHIELD';

export interface ISpellCard {
  readonly id: string;
  readonly type: SpellType;
  readonly displayName: string;
  readonly manaCost: number;
  readonly iconSvg: string;
  readonly description: string;
  readonly durationTurns: number;
}

export interface ISpellGameState {
  readonly whiteMana: number;
  readonly blackMana: number;
  readonly maxMana: number;
  readonly frozenCoordinates: Readonly<Record<string, number>>; // coord -> turns remaining
  readonly activePortals: ReadonlyArray<{ readonly coordA: string; readonly coordB: string }>;
  readonly stealthTraps: Readonly<Record<string, string>>;      // coord -> ownerPlayerId ('WHITE' | 'BLACK')
  readonly invisiblePieces: ReadonlyArray<string>;              // pieceIds
  readonly shieldedPieces: Readonly<Record<string, number>>;    // pieceId -> turns remaining
  readonly jumpPieces: Readonly<Record<string, number>>;        // pieceId -> turns remaining
}

export const MAX_MANA_CAP = 6;
export const INITIAL_MANA = 2;
export const MANA_PER_TURN = 1;

export const SPELL_CATALOG: readonly ISpellCard[] = [
  {
    id: 'spell_freeze',
    type: 'FREEZE',
    displayName: 'Congelamento (Freeze)',
    manaCost: 2,
    iconSvg: 'snowflake',
    description: 'Congela a casa-alvo ou área por 1 turno. Nenhuma peça pode entrar ou sair.',
    durationTurns: 1,
  },
  {
    id: 'spell_jump',
    type: 'JUMP',
    displayName: 'Salto Mágico (Jump)',
    manaCost: 1,
    iconSvg: 'wind',
    description: 'Concede à peça selecionada a capacidade de saltar obstáculos no próximo lance.',
    durationTurns: 1,
  },
  {
    id: 'spell_invisibility',
    type: 'INVISIBILITY',
    displayName: 'Invisibilidade (Invisibility)',
    manaCost: 3,
    iconSvg: 'eye-off',
    description: 'Torna uma peça amiga invisível para o adversário por 2 turnos.',
    durationTurns: 2,
  },
  {
    id: 'spell_portal',
    type: 'PORTAL',
    displayName: 'Portal Dimensional (Portal)',
    manaCost: 4,
    iconSvg: 'circle-dot',
    description: 'Vincula duas casas vazias. Peças que pisam em uma são transportadas para a outra.',
    durationTurns: 4,
  },
  {
    id: 'spell_stealth_trap',
    type: 'STEALTH_TRAP',
    displayName: 'Armadilha Oculta (Trap)',
    manaCost: 2,
    iconSvg: 'bomb',
    description: 'Planta uma mina invisível. A primeira peça inimiga que pisar é eliminada.',
    durationTurns: 99,
  },
  {
    id: 'spell_resurrection',
    type: 'RESURRECTION',
    displayName: 'Ressurreição (Resurrection)',
    manaCost: 5,
    iconSvg: 'sparkles',
    description: 'Ressuscita uma peça menor previamente capturada em uma casa livre da primeira fileira.',
    durationTurns: 0,
  },
  {
    id: 'spell_mirror_shield',
    type: 'MIRROR_SHIELD',
    displayName: 'Escudo Espelhado (Shield)',
    manaCost: 3,
    iconSvg: 'shield',
    description: 'Protege a peça contra feitiços hostis por 3 turnos.',
    durationTurns: 3,
  },
];

export class SpellChessEngine {
  /**
   * Creates the initial Spell Chess state according to Spec 12 § 5.1
   */
  public static createInitialState(): ISpellGameState {
    return {
      whiteMana: INITIAL_MANA,
      blackMana: INITIAL_MANA,
      maxMana: MAX_MANA_CAP,
      frozenCoordinates: {},
      activePortals: [],
      stealthTraps: {},
      invisiblePieces: [],
      shieldedPieces: {},
      jumpPieces: {},
    };
  }

  /**
   * Advances turn for active player, generating +1 mana (capped at 6)
   * and decrementing active cooldowns on frozen coordinates, shields, and jumps.
   */
  public static advanceTurn(state: ISpellGameState, activePlayer: 'WHITE' | 'BLACK'): ISpellGameState {
    const isWhite = activePlayer === 'WHITE';
    const nextWhiteMana = isWhite ? Math.min(state.maxMana, state.whiteMana + MANA_PER_TURN) : state.whiteMana;
    const nextBlackMana = !isWhite ? Math.min(state.maxMana, state.blackMana + MANA_PER_TURN) : state.blackMana;

    // Decrement frozen coordinates
    const nextFrozen: Record<string, number> = {};
    for (const [coord, turns] of Object.entries(state.frozenCoordinates)) {
      if (turns > 1) {
        nextFrozen[coord] = turns - 1;
      }
    }

    // Decrement shielded pieces
    const nextShielded: Record<string, number> = {};
    for (const [pieceId, turns] of Object.entries(state.shieldedPieces)) {
      if (turns > 1) {
        nextShielded[pieceId] = turns - 1;
      }
    }

    // Decrement jump abilities
    const nextJump: Record<string, number> = {};
    for (const [pieceId, turns] of Object.entries(state.jumpPieces)) {
      if (turns > 1) {
        nextJump[pieceId] = turns - 1;
      }
    }

    return {
      ...state,
      whiteMana: nextWhiteMana,
      blackMana: nextBlackMana,
      frozenCoordinates: nextFrozen,
      shieldedPieces: nextShielded,
      jumpPieces: nextJump,
    };
  }

  /**
   * Validates if a player has sufficient mana to cast the requested spell.
   */
  public static canCast(
    state: ISpellGameState, 
    player: 'WHITE' | 'BLACK', 
    spellType: SpellType
  ): { allowed: boolean; reason?: string } {
    const spell = SPELL_CATALOG.find(s => s.type === spellType);
    if (!spell) {
      return { allowed: false, reason: `Feitiço ${spellType} desconhecido.` };
    }

    const currentMana = player === 'WHITE' ? state.whiteMana : state.blackMana;
    if (currentMana < spell.manaCost) {
      return { 
        allowed: false, 
        reason: `Mana insuficiente: requer ${spell.manaCost}, disponível ${currentMana}.` 
      };
    }

    return { allowed: true };
  }

  /**
   * Deducts mana cost for a cast spell.
   */
  private static deductMana(state: ISpellGameState, player: 'WHITE' | 'BLACK', cost: number): ISpellGameState {
    if (player === 'WHITE') {
      return { ...state, whiteMana: Math.max(0, state.whiteMana - cost) };
    }
    return { ...state, blackMana: Math.max(0, state.blackMana - cost) };
  }

  /**
   * Casts FREEZE on one or multiple coordinates.
   */
  public static castFreeze(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    targetCoords: string | string[]
  ): ISpellGameState {
    const coords = Array.isArray(targetCoords) ? targetCoords : [targetCoords];
    const validation = this.canCast(state, player, 'FREEZE');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 2);
    const nextFrozen = { ...stateAfterMana.frozenCoordinates };

    for (const c of coords) {
      nextFrozen[c] = 1; // 1 full turn
    }

    return {
      ...stateAfterMana,
      frozenCoordinates: nextFrozen,
    };
  }

  /**
   * Casts JUMP on a specific friendly piece.
   */
  public static castJump(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    pieceId: string
  ): ISpellGameState {
    const validation = this.canCast(state, player, 'JUMP');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 1);
    return {
      ...stateAfterMana,
      jumpPieces: {
        ...stateAfterMana.jumpPieces,
        [pieceId]: 1,
      },
    };
  }

  /**
   * Casts INVISIBILITY on a piece for 2 turns.
   */
  public static castInvisibility(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    pieceId: string
  ): ISpellGameState {
    const validation = this.canCast(state, player, 'INVISIBILITY');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 3);
    const set = new Set(stateAfterMana.invisiblePieces);
    set.add(pieceId);

    return {
      ...stateAfterMana,
      invisiblePieces: Array.from(set),
    };
  }

  /**
   * Casts PORTAL linking two empty board coordinates.
   */
  public static castPortal(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    coordA: string,
    coordB: string
  ): ISpellGameState {
    if (coordA === coordB) {
      throw new Error('Portais vinculados devem ocupar coordenadas distintas.');
    }

    const validation = this.canCast(state, player, 'PORTAL');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 4);
    return {
      ...stateAfterMana,
      activePortals: [
        ...stateAfterMana.activePortals,
        { coordA, coordB },
      ],
    };
  }

  /**
   * Plants a STEALTH TRAP on a target coordinate.
   */
  public static castStealthTrap(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    targetCoord: string
  ): ISpellGameState {
    const validation = this.canCast(state, player, 'STEALTH_TRAP');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 2);
    return {
      ...stateAfterMana,
      stealthTraps: {
        ...stateAfterMana.stealthTraps,
        [targetCoord]: player,
      },
    };
  }

  /**
   * Casts MIRROR SHIELD on a piece protecting it against enemy spells.
   */
  public static castMirrorShield(
    state: ISpellGameState,
    player: 'WHITE' | 'BLACK',
    pieceId: string
  ): ISpellGameState {
    const validation = this.canCast(state, player, 'MIRROR_SHIELD');
    if (!validation.allowed) {
      throw new Error(validation.reason);
    }

    const stateAfterMana = this.deductMana(state, player, 3);
    return {
      ...stateAfterMana,
      shieldedPieces: {
        ...stateAfterMana.shieldedPieces,
        [pieceId]: 3,
      },
    };
  }

  /**
   * Checks if a coordinate is currently frozen.
   */
  public static isCoordinateFrozen(state: ISpellGameState, coord: string): boolean {
    return (state.frozenCoordinates[coord] || 0) > 0;
  }

  /**
   * Checks if a piece has active jump ability.
   */
  public static hasJumpAbility(state: ISpellGameState, pieceId: string): boolean {
    return (state.jumpPieces[pieceId] || 0) > 0;
  }

  /**
   * Checks if a piece has active mirror shield.
   */
  public static isPieceShielded(state: ISpellGameState, pieceId: string): boolean {
    return (state.shieldedPieces[pieceId] || 0) > 0;
  }

  /**
   * Checks if a piece is currently invisible.
   */
  public static isPieceInvisible(state: ISpellGameState, pieceId: string): boolean {
    return state.invisiblePieces.includes(pieceId);
  }

  /**
   * Resolves a move onto a coordinate: checks stealth trap triggers.
   * If stepped on by opponent of the trap planter, trap detonates and piece is destroyed.
   */
  public static resolveTrapTrigger(
    state: ISpellGameState,
    coord: string,
    steppingPlayer: 'WHITE' | 'BLACK'
  ): { detonated: boolean; updatedState: ISpellGameState } {
    const trapOwner = state.stealthTraps[coord];
    if (trapOwner && trapOwner !== steppingPlayer) {
      const nextTraps = { ...state.stealthTraps };
      delete nextTraps[coord];

      return {
        detonated: true,
        updatedState: {
          ...state,
          stealthTraps: nextTraps,
        },
      };
    }

    return { detonated: false, updatedState: state };
  }

  /**
   * Resolves dimensional portal traversal. If coord matches one portal end,
   * returns the destination linked coordinate.
   */
  public static resolvePortalDestination(state: ISpellGameState, coord: string): string | null {
    for (const portal of state.activePortals) {
      if (portal.coordA === coord) {
        return portal.coordB;
      }
      if (portal.coordB === coord) {
        return portal.coordA;
      }
    }
    return null;
  }
}


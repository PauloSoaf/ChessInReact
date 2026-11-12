/**
 * ChessInReact - Official Chess.com Spell Chess Engine (Spec 13 § 3 Fonte 4, § 4.1 Família B.1, RF-13-02)
 *
 * Implements strictly authentic Chess.com Spell Chess rules:
 * - Exactly 2 Spells: FREEZE and JUMP.
 * - Charges per player: 2 Freezes, 2 Jumps per game.
 * - Cooldown: 3 turns per spell before reuse.
 * - NO Mana economy: mana points do NOT exist in this mode.
 */

export type OfficialSpellType = 'FREEZE' | 'JUMP';

export interface IPlayerSpellCharges {
  readonly freezeCharges: number;
  readonly jumpCharges: number;
  readonly freezeCooldownTurns: number;
  readonly jumpCooldownTurns: number;
}

export interface IOfficialSpellState {
  readonly whiteCharges: IPlayerSpellCharges;
  readonly blackCharges: IPlayerSpellCharges;
  readonly activeFrozenCoordinates: Readonly<Record<string, number>>; // coordKey -> remaining turns
  readonly activeJumpPieceIds: Readonly<Record<string, number>>; // pieceId -> remaining moves
}

export class OfficialSpellEngine {
  public static readonly INITIAL_CHARGES = 2;
  public static readonly COOLDOWN_TURNS = 3;

  public static createInitialState(): IOfficialSpellState {
    const initialPlayerCharges: IPlayerSpellCharges = {
      freezeCharges: this.INITIAL_CHARGES,
      jumpCharges: this.INITIAL_CHARGES,
      freezeCooldownTurns: 0,
      jumpCooldownTurns: 0,
    };

    return {
      whiteCharges: { ...initialPlayerCharges },
      blackCharges: { ...initialPlayerCharges },
      activeFrozenCoordinates: {},
      activeJumpPieceIds: {},
    };
  }

  /**
   * Casts Freeze spell on a center coordinate, freezing a 3x3 area.
   */
  public static castFreeze(
    state: IOfficialSpellState,
    player: 'WHITE' | 'BLACK',
    centerCoord: { file: number; rank: number }
  ): { success: boolean; state: IOfficialSpellState; reason?: string } {
    const charges = player === 'WHITE' ? state.whiteCharges : state.blackCharges;

    if (charges.freezeCharges <= 0) {
      return { success: false, state, reason: 'Sem cargas restantes de Congelamento (Freeze).' };
    }
    if (charges.freezeCooldownTurns > 0) {
      return {
        success: false,
        state,
        reason: `Freeze em tempo de recarga (${charges.freezeCooldownTurns} turno(s) restante(s)).`,
      };
    }

    const updatedFrozen: Record<string, number> = { ...state.activeFrozenCoordinates };
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        const f = centerCoord.file + df;
        const r = centerCoord.rank + dr;
        if (f >= 0 && f < 8 && r >= 0 && r < 8) {
          updatedFrozen[`${f},${r}`] = 1; // 1 full turn duration
        }
      }
    }

    const nextCharges: IPlayerSpellCharges = {
      ...charges,
      freezeCharges: charges.freezeCharges - 1,
      freezeCooldownTurns: this.COOLDOWN_TURNS,
    };

    const nextState: IOfficialSpellState = {
      ...state,
      whiteCharges: player === 'WHITE' ? nextCharges : state.whiteCharges,
      blackCharges: player === 'BLACK' ? nextCharges : state.blackCharges,
      activeFrozenCoordinates: updatedFrozen,
    };

    return { success: true, state: nextState };
  }

  /**
   * Casts Jump spell on a piece, allowing it to leap over intermediate obstacles on next move.
   */
  public static castJump(
    state: IOfficialSpellState,
    player: 'WHITE' | 'BLACK',
    pieceId: string
  ): { success: boolean; state: IOfficialSpellState; reason?: string } {
    const charges = player === 'WHITE' ? state.whiteCharges : state.blackCharges;

    if (charges.jumpCharges <= 0) {
      return { success: false, state, reason: 'Sem cargas restantes de Salto (Jump).' };
    }
    if (charges.jumpCooldownTurns > 0) {
      return {
        success: false,
        state,
        reason: `Jump em tempo de recarga (${charges.jumpCooldownTurns} turno(s) restante(s)).`,
      };
    }

    const nextCharges: IPlayerSpellCharges = {
      ...charges,
      jumpCharges: charges.jumpCharges - 1,
      jumpCooldownTurns: this.COOLDOWN_TURNS,
    };

    const nextState: IOfficialSpellState = {
      ...state,
      whiteCharges: player === 'WHITE' ? nextCharges : state.whiteCharges,
      blackCharges: player === 'BLACK' ? nextCharges : state.blackCharges,
      activeJumpPieceIds: {
        ...state.activeJumpPieceIds,
        [pieceId]: 1,
      },
    };

    return { success: true, state: nextState };
  }

  /**
   * Ticking turn advance: decrements cooldowns and expires frozen zones.
   */
  public static advanceTurn(
    state: IOfficialSpellState,
    completedPlayer: 'WHITE' | 'BLACK'
  ): IOfficialSpellState {
    const decrementCooldowns = (c: IPlayerSpellCharges): IPlayerSpellCharges => ({
      ...c,
      freezeCooldownTurns: Math.max(0, c.freezeCooldownTurns - 1),
      jumpCooldownTurns: Math.max(0, c.jumpCooldownTurns - 1),
    });

    const nextFrozen: Record<string, number> = {};
    for (const [coord, turns] of Object.entries(state.activeFrozenCoordinates)) {
      if (turns > 1) {
        nextFrozen[coord] = turns - 1;
      }
    }

    return {
      whiteCharges: completedPlayer === 'WHITE' ? decrementCooldowns(state.whiteCharges) : state.whiteCharges,
      blackCharges: completedPlayer === 'BLACK' ? decrementCooldowns(state.blackCharges) : state.blackCharges,
      activeFrozenCoordinates: nextFrozen,
      activeJumpPieceIds: { ...state.activeJumpPieceIds },
    };
  }

  public static isSquareFrozen(state: IOfficialSpellState, coordKey: string): boolean {
    return (state.activeFrozenCoordinates[coordKey] ?? 0) > 0;
  }

  public static hasJumpBuff(state: IOfficialSpellState, pieceId: string): boolean {
    return (state.activeJumpPieceIds[pieceId] ?? 0) > 0;
  }
}


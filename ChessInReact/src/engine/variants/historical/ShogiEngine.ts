/**
 * ChessInReact - Shogi Engine (Spec 13 § 4.1 Família E.3, RF-13-11)
 *
 * Implements canonical 9x9 Shogi rules:
 * - 9x9 grid coordinates (files 0-8, ranks 0-8).
 * - Full drop mechanics: captured pieces can be dropped on empty squares.
 * - Promotion zones: furthest 3 ranks (ranks 6-8 for White/Sente, ranks 0-2 for Black/Gote).
 * - Promotion transformations:
 *   - PAWN -> TOKIN
 *   - SILVER -> PROMOTED_SILVER
 *   - KNIGHT -> PROMOTED_KNIGHT
 *   - LANCE -> PROMOTED_LANCE
 *   - BISHOP -> HORSE (Ryuuma, moves as Bishop + 1 step orthogonal)
 *   - ROOK -> DRAGON (Ryuuou, moves as Rook + 1 step diagonal)
 */

export type ShogiPieceType =
  | 'KING'
  | 'ROOK'
  | 'BISHOP'
  | 'GOLD'
  | 'SILVER'
  | 'KNIGHT'
  | 'LANCE'
  | 'PAWN'
  | 'DRAGON'
  | 'HORSE'
  | 'PROMOTED_SILVER'
  | 'PROMOTED_KNIGHT'
  | 'PROMOTED_LANCE'
  | 'TOKIN';

export interface IShogiDropReserve {
  readonly ROOK: number;
  readonly BISHOP: number;
  readonly GOLD: number;
  readonly SILVER: number;
  readonly KNIGHT: number;
  readonly LANCE: number;
  readonly PAWN: number;
}

export interface IShogiGameState {
  readonly whiteReserve: IShogiDropReserve;
  readonly blackReserve: IShogiDropReserve;
  readonly activePlayer: 'WHITE' | 'BLACK';
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | null;
}

export class ShogiEngine {
  public static readonly SENTE_PROMOTION_ZONE = [6, 7, 8];
  public static readonly GOTE_PROMOTION_ZONE = [0, 1, 2];

  public static createInitialState(): IShogiGameState {
    const emptyReserve: IShogiDropReserve = {
      ROOK: 0,
      BISHOP: 0,
      GOLD: 0,
      SILVER: 0,
      KNIGHT: 0,
      LANCE: 0,
      PAWN: 0,
    };

    return {
      whiteReserve: { ...emptyReserve },
      blackReserve: { ...emptyReserve },
      activePlayer: 'WHITE',
      isGameOver: false,
      winner: null,
    };
  }

  public static isInPromotionZone(player: 'WHITE' | 'BLACK', rank: number): boolean {
    return player === 'WHITE'
      ? this.SENTE_PROMOTION_ZONE.includes(rank)
      : this.GOTE_PROMOTION_ZONE.includes(rank);
  }

  public static getPromotedPiece(piece: ShogiPieceType): ShogiPieceType | null {
    switch (piece) {
      case 'PAWN':
        return 'TOKIN';
      case 'SILVER':
        return 'PROMOTED_SILVER';
      case 'KNIGHT':
        return 'PROMOTED_KNIGHT';
      case 'LANCE':
        return 'PROMOTED_LANCE';
      case 'BISHOP':
        return 'HORSE';
      case 'ROOK':
        return 'DRAGON';
      default:
        return null;
    }
  }

  public static getUnpromotedType(piece: ShogiPieceType): ShogiPieceType {
    switch (piece) {
      case 'TOKIN':
        return 'PAWN';
      case 'PROMOTED_SILVER':
        return 'SILVER';
      case 'PROMOTED_KNIGHT':
        return 'KNIGHT';
      case 'PROMOTED_LANCE':
        return 'LANCE';
      case 'HORSE':
        return 'BISHOP';
      case 'DRAGON':
        return 'ROOK';
      default:
        return piece;
    }
  }

  /**
   * Adds a captured piece to the captor's drop reserve (demoting promoted pieces back to base type).
   */
  public static addCaptureToReserve(
    reserve: IShogiDropReserve,
    capturedPiece: ShogiPieceType
  ): IShogiDropReserve {
    const baseType = this.getUnpromotedType(capturedPiece);
    if (baseType in reserve) {
      const key = baseType as keyof IShogiDropReserve;
      return {
        ...reserve,
        [key]: reserve[key] + 1,
      };
    }
    return reserve;
  }

  /**
   * Validates if a drop move is legal.
   */
  public static canDropPiece(
    reserve: IShogiDropReserve,
    pieceType: keyof IShogiDropReserve,
    toRank: number,
    isSquareOccupied: boolean,
    player: 'WHITE' | 'BLACK'
  ): { allowed: boolean; reason?: string } {
    if (reserve[pieceType] <= 0) {
      return { allowed: false, reason: `Peça ${pieceType} não disponível na reserva de drops.` };
    }
    if (isSquareOccupied) {
      return { allowed: false, reason: 'Drops só são permitidos em casas completamente vazias.' };
    }

    // Pawn / Lance cannot be dropped on the furthest rank (no legal moves left)
    if (pieceType === 'PAWN' || pieceType === 'LANCE') {
      const deadRank = player === 'WHITE' ? 8 : 0;
      if (toRank === deadRank) {
        return { allowed: false, reason: 'Peões e Lanceiros não podem ser jogados na última fileira.' };
      }
    }

    // Knight cannot be dropped on the last 2 ranks
    if (pieceType === 'KNIGHT') {
      const deadRanks = player === 'WHITE' ? [7, 8] : [0, 1];
      if (deadRanks.includes(toRank)) {
        return { allowed: false, reason: 'Cavalos de Shogi não podem ser jogados nas duas últimas fileiras.' };
      }
    }

    return { allowed: true };
  }
}


/**
 * ChessInReact - Standard Algebraic Notation (SAN) Generator (Spec 04 § 4, Spec 09 § 4, Spec 16 § 4)
 *
 * Implements FIDE-compliant SAN generation and UCI formatting:
 * - Quiet pawn moves ('e4', 'd4') and pawn captures ('exd5', 'cxd4').
 * - Piece identification ('N', 'B', 'R', 'Q', 'K').
 * - Castling detection ('O-O', 'O-O-O').
 * - Promotion notation ('=Q', '=R', '=B', '=N') with capture combination ('exd8=Q#').
 * - Standard disambiguation by file ('Nbd7'), rank ('N1d2'), or full coordinate ('Qh4e1').
 * - Check ('+') and checkmate ('#') suffix evaluation.
 * - Reserve drops ('N@d5') and spell actions ('[Freeze:e4]').
 */

import { CoordinateKey, EntityId, PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { ITopology } from '../../../core/topology/types';
import { RulesEngine } from '../RulesEngine';
import { CheckValidator } from '../CheckValidator';

export interface ISANGenerationParams {
  readonly from: string;
  readonly to: string;
  readonly pieceId: string;
  readonly domainBefore: IDomainState;
  readonly domainAfter?: IDomainState;
  readonly topology: ITopology;
  readonly isCapture?: boolean;
  readonly isCastling?: boolean;
  readonly isEnPassant?: boolean;
  readonly promotionVariant?: string;
  readonly isDrop?: boolean;
  readonly dropPieceVariant?: string;
  readonly spellType?: string;
}

export class SANNotationGenerator {
  /**
   * Translates internal coordinate "col,row" (e.g. "4,0") to algebraic coordinate (e.g. "e1").
   */
  public static coordToAlgebraic(coord: string): string {
    const trimmed = coord.trim();
    if (/^[a-p][1-9]\d?$/i.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    const parts = trimmed.split(',');
    if (parts.length < 2) return trimmed;
    const col = parseInt(parts[0], 10);
    const row = parseInt(parts[1], 10);
    if (isNaN(col) || isNaN(row)) return trimmed;

    const file = String.fromCharCode(97 + col);
    const rank = String(row + 1);
    return `${file}${rank}`;
  }

  /**
   * Translates algebraic coordinate (e.g. "e1") to internal coordinate "col,row" (e.g. "4,0").
   */
  public static algebraicToCoord(algebraic: string): string {
    const trimmed = algebraic.trim().toLowerCase();
    if (trimmed.includes(',')) return trimmed;
    if (trimmed.length < 2) return algebraic;
    const col = trimmed.charCodeAt(0) - 97;
    const row = parseInt(trimmed.substring(1), 10) - 1;
    if (isNaN(col) || isNaN(row) || col < 0 || col > 25) return algebraic;
    return `${col},${row}`;
  }

  /**
   * Generates FIDE-compliant Standard Algebraic Notation (SAN) for a move.
   */
  public static generateSAN(params: ISANGenerationParams): string {
    const {
      from,
      to,
      pieceId,
      domainBefore,
      domainAfter,
      topology,
      promotionVariant,
      isDrop,
      dropPieceVariant,
      spellType,
    } = params;

    // 1. Spells in Spell Chess
    if (spellType) {
      const targetAlg = this.coordToAlgebraic(to);
      return `[${spellType}:${targetAlg}]`;
    }

    const toAlg = this.coordToAlgebraic(to);
    const fromAlg = this.coordToAlgebraic(from);

    // 2. Piece drops (Crazyhouse / Shogi / Bughouse)
    if (isDrop || from === 'reserve' || from === '@') {
      const variant = (dropPieceVariant ?? 'P').toUpperCase();
      const pieceLetter = variant === 'KNIGHT' ? 'N' : variant[0];
      return `${pieceLetter}@${toAlg}`;
    }

    const movingPiece = domainBefore.boardEntities[pieceId as EntityId] as IPieceEntity | undefined;
    if (!movingPiece) {
      return `${fromAlg}-${toAlg}`;
    }

    const variant = movingPiece.variantId.toUpperCase();
    const isPawn = variant === 'PAWN' || variant === 'P' || variant === 'SOLDIER';
    const isKing = variant === 'KING' || variant === 'K';

    // 3. Castling Detection (O-O and O-O-O)
    if (params.isCastling || (isKing && (fromAlg === 'e1' || fromAlg === 'e8'))) {
      if ((fromAlg === 'e1' && toAlg === 'g1') || (fromAlg === 'e8' && toAlg === 'g8')) {
        return this.appendCheckOrMateSuffix('O-O', domainAfter, topology, movingPiece.ownerId);
      }
      if ((fromAlg === 'e1' && toAlg === 'c1') || (fromAlg === 'e8' && toAlg === 'c8')) {
        return this.appendCheckOrMateSuffix('O-O-O', domainAfter, topology, movingPiece.ownerId);
      }
    }

    // 4. Capture Detection
    const destOccupant = domainBefore.occupancy[to as CoordinateKey];
    const isCapture =
      Boolean(params.isCapture) ||
      Boolean(params.isEnPassant) ||
      (destOccupant && destOccupant !== movingPiece.id);

    // 5. Piece Letter Prefix
    let pieceLetter = '';
    if (!isPawn) {
      if (variant === 'KNIGHT' || variant === 'N' || variant === 'HORSE') pieceLetter = 'N';
      else if (variant === 'BISHOP' || variant === 'B' || variant === 'ELEPHANT') pieceLetter = 'B';
      else if (variant === 'ROOK' || variant === 'R' || variant === 'CHARIOT') pieceLetter = 'R';
      else if (variant === 'QUEEN' || variant === 'Q') pieceLetter = 'Q';
      else if (variant === 'KING' || variant === 'K' || variant === 'GENERAL') pieceLetter = 'K';
      else pieceLetter = variant.slice(0, 1);
    }

    // 6. Disambiguation (FIDE Article 8.1)
    let disambiguation = '';
    if (!isPawn && !isKing && domainBefore) {
      const sameTypePieces = Object.values(domainBefore.boardEntities).filter(
        (e): e is IPieceEntity =>
          e.type === 'PIECE' &&
          !e.isCaptured &&
          e.ownerId === movingPiece.ownerId &&
          e.variantId.toUpperCase() === variant &&
          e.id !== movingPiece.id
      );

      const ambiguousCandidates = sameTypePieces.filter((candidate) => {
        try {
          const legalMoves = RulesEngine.getLegalMovesForPiece(candidate, domainBefore, topology);
          return legalMoves.some((m) => m.to === to || this.coordToAlgebraic(m.to) === toAlg);
        } catch {
          return false;
        }
      });

      if (ambiguousCandidates.length > 0) {
        const candidateAlgs = ambiguousCandidates.map((c) => this.coordToAlgebraic(c.position));
        const sameFile = candidateAlgs.some((alg) => alg[0] === fromAlg[0]);
        const sameRank = candidateAlgs.some((alg) => alg[1] === fromAlg[1]);

        if (!sameFile) {
          disambiguation = fromAlg[0]; // File letter (e.g. 'Nbd7')
        } else if (!sameRank) {
          disambiguation = fromAlg[1]; // Rank number (e.g. 'N1d2')
        } else {
          disambiguation = fromAlg; // Both file and rank (e.g. 'Qh4e1')
        }
      }
    }

    // 7. Assemble Base Move Notation
    let result = '';
    if (isPawn) {
      if (isCapture) {
        result = `${fromAlg[0]}x${toAlg}`;
      } else {
        result = toAlg;
      }

      if (promotionVariant) {
        const promoChar = promotionVariant.toUpperCase() === 'KNIGHT' ? 'N' : promotionVariant.toUpperCase()[0];
        result += `=${promoChar}`;
      }
    } else {
      const captureMark = isCapture ? 'x' : '';
      result = `${pieceLetter}${disambiguation}${captureMark}${toAlg}`;
    }

    // 8. Append Check ('+') or Checkmate ('#') suffix
    return this.appendCheckOrMateSuffix(result, domainAfter, topology, movingPiece.ownerId);
  }

  /**
   * Generates Universal Chess Interface (UCI) string (e.g. 'e2e4', 'e7e8q').
   */
  public static generateUCI(from: string, to: string, promotionVariant?: string): string {
    const fromAlg = this.coordToAlgebraic(from);
    const toAlg = this.coordToAlgebraic(to);
    const promo = promotionVariant ? promotionVariant.toLowerCase()[0] : '';
    return `${fromAlg}${toAlg}${promo}`;
  }

  private static appendCheckOrMateSuffix(
    baseNotation: string,
    domainAfter: IDomainState | undefined,
    topology: ITopology,
    movingPlayerId: PlayerId
  ): string {
    if (!domainAfter) return baseNotation;

    const opponentId: PlayerId = movingPlayerId === 'P1' ? 'P2' : 'P1';

    try {
      const inCheck = CheckValidator.isRoyalInCheck(opponentId, domainAfter, topology);
      if (inCheck) {
        const opponentMoves = RulesEngine.getLegalMoves(domainAfter, topology);
        if (opponentMoves.length === 0) {
          const isSpellChess = Boolean(
            domainAfter.variantId?.toUpperCase().includes('SPELL') ||
            Boolean((domainAfter.metadata as { officialSpellState?: unknown })?.officialSpellState)
          );
          if (isSpellChess) {
            const spellMeta = (domainAfter.metadata as { officialSpellState?: { whiteCharges?: { freezeCharges: number; freezeCooldownTurns: number }; blackCharges?: { freezeCharges: number; freezeCooldownTurns: number } } })?.officialSpellState;
            const charges = spellMeta
              ? (opponentId === 'P1' ? spellMeta.whiteCharges : spellMeta.blackCharges)
              : { freezeCharges: 2, freezeCooldownTurns: 0 };
            if (charges && charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0) {
              return `${baseNotation}+`;
            }
          }
          return `${baseNotation}#`;
        }
        return `${baseNotation}+`;
      }
    } catch {
      // Graceful fallback if check validation fails
    }

    return baseNotation;
  }
}


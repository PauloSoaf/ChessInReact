/**
 * ChessInReact - Atomic Chess Explosion Modifier (Spec 13 § 4.1 Família A.8, RF-13-05)
 *
 * Implements canonical Atomic Chess mechanics:
 * - On capture, the capturing piece and the captured piece are destroyed.
 * - All surrounding pieces within radius 1 (3x3 area) are destroyed, EXCEPT pawns.
 * - If any King is caught in the explosion, the game ends immediately.
 * - Kings cannot capture any piece (suicide is illegal).
 */

export interface IExplosionResult {
  readonly attackerDestroyedId: string;
  readonly victimDestroyedId: string;
  readonly collateralDestroyedIds: readonly string[];
  readonly kingsDestroyed: readonly ('WHITE' | 'BLACK')[];
  readonly isGameOver: boolean;
  readonly winner: 'WHITE' | 'BLACK' | null;
}

export interface IBoardPieceInfo {
  readonly id: string;
  readonly variantId: string; // 'PAWN', 'KNIGHT', 'KING', etc.
  readonly owner: 'WHITE' | 'BLACK';
  readonly file: number;
  readonly rank: number;
}

export class AtomicExplosionModifier {
  public static canKingCapture(): boolean {
    return false; // Kings cannot capture in Atomic
  }

  public static resolveExplosion(
    attacker: IBoardPieceInfo,
    victim: IBoardPieceInfo,
    allBoardPieces: readonly IBoardPieceInfo[]
  ): IExplosionResult {
    const blastCenterFile = victim.file;
    const blastCenterRank = victim.rank;

    const collateralDestroyed: string[] = [];
    const kingsDestroyed: ('WHITE' | 'BLACK')[] = [];

    if (victim.variantId.toUpperCase() === 'KING') {
      kingsDestroyed.push(victim.owner);
    }

    for (const piece of allBoardPieces) {
      if (piece.id === attacker.id || piece.id === victim.id) continue;

      const df = Math.abs(piece.file - blastCenterFile);
      const dr = Math.abs(piece.rank - blastCenterRank);

      if (df <= 1 && dr <= 1) {
        // Radius 1: pawns are immune according to official Atomic rules
        if (piece.variantId.toUpperCase() !== 'PAWN') {
          collateralDestroyed.push(piece.id);
          if (piece.variantId.toUpperCase() === 'KING') {
            kingsDestroyed.push(piece.owner);
          }
        }
      }
    }

    let isGameOver = false;
    let winner: 'WHITE' | 'BLACK' | null = null;

    if (kingsDestroyed.length > 0) {
      isGameOver = true;
      if (kingsDestroyed.includes('WHITE') && kingsDestroyed.includes('BLACK')) {
        // Both kings exploded: player who made the capture loses, or other side wins
        winner = attacker.owner === 'WHITE' ? 'BLACK' : 'WHITE';
      } else if (kingsDestroyed.includes('BLACK')) {
        winner = 'WHITE';
      } else if (kingsDestroyed.includes('WHITE')) {
        winner = 'BLACK';
      }
    }

    return {
      attackerDestroyedId: attacker.id,
      victimDestroyedId: victim.id,
      collateralDestroyedIds: collateralDestroyed,
      kingsDestroyed,
      isGameOver,
      winner,
    };
  }
}


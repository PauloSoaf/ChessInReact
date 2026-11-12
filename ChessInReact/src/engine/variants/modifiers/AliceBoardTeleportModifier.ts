/**
 * ChessInReact - Alice Chess Dual-Board Teleport Modifier (Spec 13 § 4.1 Família B.5)
 *
 * Implements Alice Chess mechanics:
 * - Played across two identical boards: Board A and Board B.
 * - When a move is completed on Board A, the piece teleports to the identical coordinate on Board B.
 * - Invariant: A move is ILLEGAL if the destination square on the twin board is already occupied.
 */

export type AliceBoardId = 'BOARD_A' | 'BOARD_B';

export interface IAlicePieceState {
  readonly id: string;
  readonly boardId: AliceBoardId;
  readonly coordKey: string;
}

export class AliceBoardTeleportModifier {
  public static getTwinBoard(boardId: AliceBoardId): AliceBoardId {
    return boardId === 'BOARD_A' ? 'BOARD_B' : 'BOARD_A';
  }

  /**
   * Validates if the teleport destination on the twin board is free.
   */
  public static canTeleport(
    targetBoardOccupancy: Readonly<Record<string, string>>,
    destinationCoordKey: string
  ): boolean {
    return !targetBoardOccupancy[destinationCoordKey];
  }

  /**
   * Applies the twin-board teleport to the moving piece.
   */
  public static resolveTeleport(
    currentBoard: AliceBoardId,
    coordKey: string
  ): { targetBoard: AliceBoardId; coordKey: string } {
    return {
      targetBoard: this.getTwinBoard(currentBoard),
      coordKey,
    };
  }
}


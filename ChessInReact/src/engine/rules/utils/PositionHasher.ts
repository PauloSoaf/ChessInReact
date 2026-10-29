import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { parseCoord, toCoordKey } from './CoordinateHelper';

/**
 * Computes a deterministic canonical string key representing the position state
 * for 3-fold and 5-fold repetition tracking (FIDE Article 9.2 & RF-11).
 *
 * Conforms strictly to FIDE rules:
 * 1. Same piece types and colors occupying the same squares (without generic hasMoved).
 * 2. Same player to move.
 * 3. Identical castling rights (based exclusively on King and Rook initial states).
 * 4. Effective en passant availability (only if opposing pawns can capture on this ply).
 */
export function computePositionKey(state: IDomainState): string {
  // 1. Piece positions and identities (sorted deterministically)
  const pieces: string[] = [];
  for (const entity of Object.values(state.boardEntities)) {
    if (entity.type === 'PIECE' && !entity.isCaptured) {
      const piece = entity as IPieceEntity;
      pieces.push(`${piece.position}:${piece.ownerId}:${piece.variantId.toUpperCase()}`);
    }
  }
  pieces.sort();

  // 2. Active player
  const player = state.activePlayer;

  // 3. FIDE Castling rights (King and Rook specific positions and hasMoved status)
  let castling = '';
  // White castling
  const wKing = Object.values(state.boardEntities).find(
    (e) =>
      e.type === 'PIECE' &&
      !e.isCaptured &&
      e.ownerId === 'P1' &&
      (e.variantId.toUpperCase() === 'KING' || e.variantId.toUpperCase() === 'K') &&
      e.position === '4,0' &&
      !e.hasMoved
  );
  if (wKing) {
    const wRookK = Object.values(state.boardEntities).find(
      (e) =>
        e.type === 'PIECE' &&
        !e.isCaptured &&
        e.ownerId === 'P1' &&
        (e.variantId.toUpperCase() === 'ROOK' || e.variantId.toUpperCase() === 'R') &&
        e.position === '7,0' &&
        !e.hasMoved
    );
    if (wRookK) castling += 'K';

    const wRookQ = Object.values(state.boardEntities).find(
      (e) =>
        e.type === 'PIECE' &&
        !e.isCaptured &&
        e.ownerId === 'P1' &&
        (e.variantId.toUpperCase() === 'ROOK' || e.variantId.toUpperCase() === 'R') &&
        e.position === '0,0' &&
        !e.hasMoved
    );
    if (wRookQ) castling += 'Q';
  }

  // Black castling
  const bKing = Object.values(state.boardEntities).find(
    (e) =>
      e.type === 'PIECE' &&
      !e.isCaptured &&
      e.ownerId === 'P2' &&
      (e.variantId.toUpperCase() === 'KING' || e.variantId.toUpperCase() === 'K') &&
      e.position === '4,7' &&
      !e.hasMoved
  );
  if (bKing) {
    const bRookK = Object.values(state.boardEntities).find(
      (e) =>
        e.type === 'PIECE' &&
        !e.isCaptured &&
        e.ownerId === 'P2' &&
        (e.variantId.toUpperCase() === 'ROOK' || e.variantId.toUpperCase() === 'R') &&
        e.position === '7,7' &&
        !e.hasMoved
    );
    if (bRookK) castling += 'k';

    const bRookQ = Object.values(state.boardEntities).find(
      (e) =>
        e.type === 'PIECE' &&
        !e.isCaptured &&
        e.ownerId === 'P2' &&
        (e.variantId.toUpperCase() === 'ROOK' || e.variantId.toUpperCase() === 'R') &&
        e.position === '0,7' &&
        !e.hasMoved
    );
    if (bRookQ) castling += 'q';
  }
  if (!castling) castling = '-';

  // 4. Effective En Passant target (only if opposing pawn can capture on this ply)
  let ep = '-';
  const target = state.turnState?.enPassantTarget;
  if (target) {
    const parsedTarget = parseCoord(target);
    if (parsedTarget) {
      // The captor must be a pawn belonging to the active player on the adjacent file
      // If active player is P1 (White capturing upward to y+1), captor is at y-1 from target
      // If active player is P2 (Black capturing downward to y-1), captor is at y+1 from target
      const captorPawnY = player === 'P1' ? parsedTarget.y - 1 : parsedTarget.y + 1;
      const leftCoord = toCoordKey(parsedTarget.x - 1, captorPawnY);
      const rightCoord = toCoordKey(parsedTarget.x + 1, captorPawnY);

      const hasCaptorPawn = [leftCoord, rightCoord].some((coord) => {
        const id = state.occupancy[coord];
        if (!id) return false;
        const p = state.boardEntities[id] as IPieceEntity | undefined;
        return (
          p &&
          p.type === 'PIECE' &&
          !p.isCaptured &&
          p.ownerId === player &&
          (p.variantId.toUpperCase() === 'PAWN' || p.variantId.toUpperCase() === 'P')
        );
      });

      if (hasCaptorPawn) {
        ep = target;
      }
    }
  }

  return `${player}|${castling}|${ep}|${pieces.join(';')}`;
}

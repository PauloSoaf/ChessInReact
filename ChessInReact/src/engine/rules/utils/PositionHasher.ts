import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';

/**
 * Computes a deterministic canonical string key representing the position state
 * for 3-fold and 5-fold repetition tracking (FIDE Article 9.2 & RF-11).
 */
export function computePositionKey(state: IDomainState): string {
  // 1. Piece positions sorted deterministically
  const pieces: string[] = [];
  for (const entity of Object.values(state.boardEntities)) {
    if (entity.type === 'PIECE' && !entity.isCaptured) {
      const piece = entity as IPieceEntity;
      pieces.push(`${piece.position}:${piece.ownerId}:${piece.variantId}:${piece.hasMoved ? '1' : '0'}`);
    }
  }
  pieces.sort();

  // 2. Active player
  const player = state.activePlayer;

  // 3. En passant target
  const ep = state.turnState.enPassantTarget ?? '-';

  return `${player}|${ep}|${pieces.join(';')}`;
}

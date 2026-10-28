import { CoordinateKey } from '../../../core/coordinates/types';
import { ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';

/**
 * Common behavior contract for piece move generation.
 * Produces pseudo-legal destinations (bounds-checked, collision-aware, but before king-check filtering).
 */
export interface IMoveBehavior {
  readonly name: string;

  /**
   * Generates candidate pseudo-legal coordinate keys.
   */
  generatePseudoLegalMoves(
    startCoord: CoordinateKey,
    topology: ITopology,
    state: IDomainState,
    piece: IPieceEntity,
    isWhite: boolean
  ): CoordinateKey[];
}

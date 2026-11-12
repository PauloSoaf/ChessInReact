/**
 * ChessInReact - Duck Placement Modifier (Spec 13 § 4.1 Família B.3, RF-13-04)
 *
 * Enforces two-phase atomic turn progression:
 * 1. Piece Move (regular legal piece move)
 * 2. Duck Placement (duck must be placed on any unoccupied square)
 */

export {
  DuckChessEngine as DuckPlacementModifier,
} from '../../../analysis/minigames/DuckChessEngine';

export type {
  DuckTurnPhase,
  IDuckChessState,
} from '../../../analysis/minigames/DuckChessEngine';


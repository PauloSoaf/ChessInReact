import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IDomainState } from '../state/gameState';

/**
 * Standard Command interface.
 */
export interface ICommand {
  readonly id: string;
  readonly type: string;
  readonly description: string;
  readonly actingPlayer: PlayerId;
  execute(draft: IDomainState): void;
  undo(draft: IDomainState): void;
}

/**
 * MoveCommand serialized descriptor.
 */
export interface MoveCommandPayload {
  readonly pieceId: EntityId;
  readonly from: CoordinateKey;
  readonly to: CoordinateKey;
  readonly actingPlayer: PlayerId;
}

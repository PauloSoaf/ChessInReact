import { CoordinateKey, EntityId, PlayerId } from '../../../../core/coordinates/types';
import { ITopology } from '../../../../core/topology/types';
import { IDomainState } from '../../../../core/state/gameState';
import { IPieceEntity } from '../../../../core/entities/types';
import { ILegalMove } from '../../interfaces/IRulesContracts';

export interface IAtomicExplosionResult {
  readonly state: IDomainState;
  readonly destroyedPieceIds: readonly EntityId[];
  readonly winnerId: PlayerId | null;
  readonly isGameOver: boolean;
}

export class AtomicModifier {
  /**
   * Applies Atomic explosion rules upon capture (RF-08 / RF-09).
   * Radius-1 explosion destroys capturing piece, captured piece, and all non-pawn pieces in radius 1.
   */
  public static applyExplosion(
    state: IDomainState,
    move: ILegalMove,
    topology: ITopology
  ): IAtomicExplosionResult {
    if (!move.isCapture) {
      return {
        state,
        destroyedPieceIds: [],
        winnerId: null,
        isGameOver: false,
      };
    }

    const nextOccupancy: Record<CoordinateKey, EntityId> = { ...state.occupancy };
    const nextEntities: Record<EntityId, IPieceEntity> = { ...state.boardEntities } as Record<
      EntityId,
      IPieceEntity
    >;
    const destroyedPieceIds: EntityId[] = [];

    // 1. Epicenter: The capturing piece itself is destroyed in the explosion!
    const capturingPiece = nextEntities[move.pieceId];
    if (capturingPiece) {
      nextEntities[move.pieceId] = { ...capturingPiece, isCaptured: true };
      delete nextOccupancy[move.to];
      destroyedPieceIds.push(move.pieceId);
    }

    // 2. The captured piece is already destroyed
    if (move.capturedPieceId) {
      const victim = nextEntities[move.capturedPieceId];
      if (victim) {
        nextEntities[move.capturedPieceId] = { ...victim, isCaptured: true };
        destroyedPieceIds.push(move.capturedPieceId);
      }
    }

    // 3. Radius 1 blast: All adjacent non-pawn pieces are destroyed (Pawns are immune outside epicenter)
    const neighbors = topology.getAllNeighbors(move.to);
    for (const neighborCoord of neighbors) {
      const occId = nextOccupancy[neighborCoord];
      if (occId) {
        const adjacentPiece = nextEntities[occId];
        if (adjacentPiece && adjacentPiece.type === 'PIECE' && !adjacentPiece.isCaptured) {
          const vUpper = adjacentPiece.variantId.toUpperCase();
          const isPawn = vUpper === 'PAWN' || vUpper === 'P';

          if (!isPawn) {
            // Destroy non-pawn piece
            nextEntities[occId] = { ...adjacentPiece, isCaptured: true };
            delete nextOccupancy[neighborCoord];
            destroyedPieceIds.push(occId);
          }
        }
      }
    }

    // 4. Check if any king was destroyed in the explosion
    let whiteKingAlive = false;
    let blackKingAlive = false;

    for (const entity of Object.values(nextEntities)) {
      if (entity.type === 'PIECE' && !entity.isCaptured) {
        const vUpper = entity.variantId.toUpperCase();
        if (vUpper === 'KING' || vUpper === 'K') {
          if (entity.ownerId === 'P1') whiteKingAlive = true;
          if (entity.ownerId === 'P2') blackKingAlive = true;
        }
      }
    }

    let winnerId: PlayerId | null = null;
    let isGameOver = false;

    if (!whiteKingAlive && !blackKingAlive) {
      isGameOver = true;
      winnerId = null; // Mutual destruction draw
    } else if (!whiteKingAlive) {
      isGameOver = true;
      winnerId = 'P2';
    } else if (!blackKingAlive) {
      isGameOver = true;
      winnerId = 'P1';
    }

    const nextState: IDomainState = {
      ...state,
      boardEntities: nextEntities,
      occupancy: nextOccupancy,
      isGameOver: isGameOver || state.isGameOver,
      winnerId: winnerId ?? state.winnerId,
    };

    return {
      state: nextState,
      destroyedPieceIds,
      winnerId,
      isGameOver,
    };
  }
}

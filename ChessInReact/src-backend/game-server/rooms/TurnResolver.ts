import { ChessRoomStateSchema, PlayerSchema } from '../schemas/RoomStateSchema';

export interface IQueuedMove {
  readonly playerId: string;
  readonly pieceId: string;
  readonly from: string;
  readonly to: string;
  readonly seqId: number;
  readonly timestamp: number;
}

export interface IMoveResolutionResult {
  readonly success: boolean;
  readonly reason?: string;
  readonly capturedPieceId?: string;
  readonly pieceId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly seqId?: number;
}

export interface ICollisionResult {
  readonly targetCoord: string;
  readonly victoriousPlayerId?: string;
  readonly destroyedPieceIds: string[];
}

/**
 * Piece rank weights for deterministic collision resolution.
 */
const PIECE_WEIGHTS: Record<string, number> = {
  K: 100,
  Q: 9,
  R: 5,
  B: 3,
  N: 3,
  P: 1,
};

/**
 * TurnResolver handles command buffering, sequential turn advancement, and simultaneous collision resolution.
 * Conforms to Spec 03 Sections 8, 16 (RF-06, RF-07), and 20.
 */
export class TurnResolver {
  /**
   * Validates and applies a sequential turn move (1v1 strict sequential policy).
   */
  public executeSequentialMove(
    move: IQueuedMove,
    state: ChessRoomStateSchema
  ): IMoveResolutionResult {
    // 1. Verify game phase
    if (state.phase !== 'PLAYING') {
      return { success: false, reason: `Move rejected: Game is in "${state.phase}" phase.` };
    }

    // 2. Strict Sequential Policy: Verify turn
    if (state.activePlayerId !== move.playerId) {
      return {
        success: false,
        reason: `Move rejected: Not your turn. Active player is "${state.activePlayerId}".`,
      };
    }

    // 3. Piece existence and ownership
    const piece = state.boardEntities.get(move.pieceId);
    if (!piece) {
      return { success: false, reason: `Move rejected: Piece "${move.pieceId}" not found.` };
    }

    if (piece.ownerId !== move.playerId) {
      return {
        success: false,
        reason: `Move rejected: Anti-cheat violation. Piece "${move.pieceId}" belongs to "${piece.ownerId}".`,
      };
    }

    if (piece.isCaptured) {
      return { success: false, reason: `Move rejected: Piece "${move.pieceId}" is already captured.` };
    }

    if (piece.position !== move.from) {
      return {
        success: false,
        reason: `Move rejected: Desynchronization. Piece is at "${piece.position}", not "${move.from}".`,
      };
    }

    if (move.from === move.to) {
      return { success: false, reason: 'Move rejected: Destination equals origin.' };
    }

    // 4. Target occupancy & legality check
    let capturedPieceId: string | undefined;
    for (const [id, entity] of state.boardEntities.entries()) {
      if (entity.position === move.to && !entity.isCaptured && id !== move.pieceId) {
        if (entity.ownerId === move.playerId) {
          return {
            success: false,
            reason: `Move rejected: Cannot capture friendly piece "${id}" at "${move.to}".`,
          };
        }
        // Enemy piece - capture!
        entity.isCaptured = true;
        entity.position = '';
        capturedPieceId = id;
        break;
      }
    }

    // 5. Apply state mutation
    piece.position = move.to;
    piece.hasMoved = true;
    state.lastProcessedSequenceId = move.seqId;
    state.turnNumber += 1;

    // Toggle active player among connected active players
    const activePlayers: PlayerSchema[] = [];
    state.players.forEach((p) => {
      if (p.role === 'WHITE' || p.role === 'BLACK') {
        activePlayers.push(p);
      }
    });
    if (activePlayers.length >= 2) {
      const nextPlayer = activePlayers.find((p) => p.playerId !== move.playerId);
      if (nextPlayer) {
        state.activePlayerId = nextPlayer.playerId;
      }
    }

    // Reset turn timer to 30s
    state.turnTimeRemainingMs = 30000;

    return {
      success: true,
      pieceId: move.pieceId,
      from: move.from,
      to: move.to,
      seqId: move.seqId,
      capturedPieceId,
    };
  }

  /**
   * Resolves simultaneous collisions when multiple players move in the same turn window.
   * Conforms to Spec 03 Section 8.2 and RF-06/RF-07.
   */
  public resolveSimultaneousCollisions(
    moves: IQueuedMove[],
    state: ChessRoomStateSchema
  ): {
    resolutions: IMoveResolutionResult[];
    collisions: ICollisionResult[];
  } {
    const resolutions: IMoveResolutionResult[] = [];
    const collisions: ICollisionResult[] = [];

    // Group moves by target coordinate
    const targetMap = new Map<string, IQueuedMove[]>();
    for (const move of moves) {
      if (!targetMap.has(move.to)) {
        targetMap.set(move.to, []);
      }
      targetMap.get(move.to)!.push(move);
    }

    for (const [targetCoord, targetMoves] of targetMap.entries()) {
      if (targetMoves.length === 1) {
        // Uncontested move
        const move = targetMoves[0];
        const piece = state.boardEntities.get(move.pieceId);
        if (piece && !piece.isCaptured && piece.ownerId === move.playerId) {
          // Check if capturing stationary occupant
          let capturedPieceId: string | undefined;
          for (const [id, entity] of state.boardEntities.entries()) {
            if (entity.position === targetCoord && !entity.isCaptured && id !== move.pieceId) {
              entity.isCaptured = true;
              entity.position = '';
              capturedPieceId = id;
              break;
            }
          }
          piece.position = targetCoord;
          piece.hasMoved = true;
          resolutions.push({
            success: true,
            pieceId: move.pieceId,
            from: move.from,
            to: targetCoord,
            seqId: move.seqId,
            capturedPieceId,
          });
        }
      } else {
        // Multi-actor collision! Apply piece weight priority
        let highestWeight = -1;
        let victorMove: IQueuedMove | null = null;
        let isTie = false;
        const destroyedPieceIds: string[] = [];

        for (const move of targetMoves) {
          const piece = state.boardEntities.get(move.pieceId);
          const weight = piece ? (PIECE_WEIGHTS[piece.variantId] ?? 1) : 0;
          if (weight > highestWeight) {
            highestWeight = weight;
            victorMove = move;
            isTie = false;
          } else if (weight === highestWeight) {
            isTie = true;
          }
        }

        if (isTie || !victorMove) {
          // Mutual annihilation (Atomic clash): all contending pieces are destroyed
          for (const move of targetMoves) {
            const piece = state.boardEntities.get(move.pieceId);
            if (piece) {
              piece.isCaptured = true;
              piece.position = '';
              destroyedPieceIds.push(piece.id);
            }
            resolutions.push({
              success: false,
              reason: `Collision mutual annihilation at "${targetCoord}".`,
              pieceId: move.pieceId,
              seqId: move.seqId,
            });
          }
          collisions.push({
            targetCoord,
            destroyedPieceIds,
          });
        } else {
          // Victorious piece stays at target, losers are destroyed
          const victorPiece = state.boardEntities.get(victorMove.pieceId);
          if (victorPiece) {
            victorPiece.position = targetCoord;
            victorPiece.hasMoved = true;
          }

          for (const move of targetMoves) {
            if (move !== victorMove) {
              const loserPiece = state.boardEntities.get(move.pieceId);
              if (loserPiece) {
                loserPiece.isCaptured = true;
                loserPiece.position = '';
                destroyedPieceIds.push(loserPiece.id);
              }
              resolutions.push({
                success: false,
                reason: `Collision defeat by superior piece at "${targetCoord}".`,
                pieceId: move.pieceId,
                seqId: move.seqId,
              });
            }
          }

          resolutions.push({
            success: true,
            pieceId: victorMove.pieceId,
            from: victorMove.from,
            to: targetCoord,
            seqId: victorMove.seqId,
          });

          collisions.push({
            targetCoord,
            victoriousPlayerId: victorMove.playerId,
            destroyedPieceIds,
          });
        }
      }
    }

    return { resolutions, collisions };
  }
}

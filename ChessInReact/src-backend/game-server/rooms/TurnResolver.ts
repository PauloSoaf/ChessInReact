import { ChessRoomStateSchema, PlayerSchema } from '../schemas/RoomStateSchema';
import { validateStandardMove, parseBoardPosition, toAlgebraic, buildDomainStateFromNetworkEntities } from './StandardMoveValidator';
import { RulesEngine } from '../../../src/engine/rules/RulesEngine';
import { SquareTopology } from '../../../src/core/topology/SquareTopology';
import { computePositionKey } from '../../../src/engine/rules/utils/PositionHasher';

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
  readonly gameOver?: boolean;
  readonly gameOverReason?: string;
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

    // 4. Determine player color for directional movement (Pawns)
    let isWhite = true;
    for (const player of state.players.values()) {
      if (player.playerId === move.playerId) {
        isWhite = player.role === 'WHITE';
        break;
      }
    }

    // 5. Authoritative Geometric and Obstacle Validation
    const validation = validateStandardMove(
      piece,
      move.from,
      move.to,
      isWhite,
      state.boardEntities.values(),
      state.enPassantTarget || undefined
    );

    if (!validation.valid) {
      return {
        success: false,
        reason: validation.reason || 'Move rejected: Geometric or path validation failed.',
      };
    }

    // 6. Apply state mutation atomically only after all checks pass
    let capturedPieceId: string | undefined;
    if (validation.capturedPiece) {
      validation.capturedPiece.isCaptured = true;
      validation.capturedPiece.position = '';
      capturedPieceId = validation.capturedPiece.id;
    } else if (validation.isEnPassant) {
      // En Passant capture: remove victim pawn at (destX, originY)
      const fromPos = parseBoardPosition(move.from);
      const toPos = parseBoardPosition(move.to);
      if (fromPos && toPos) {
        for (const [id, entity] of state.boardEntities.entries()) {
          if (!entity.isCaptured && entity.position) {
            const ePos = parseBoardPosition(entity.position);
            if (ePos && ePos.x === toPos.x && ePos.y === fromPos.y) {
              entity.isCaptured = true;
              entity.position = '';
              capturedPieceId = id;
              break;
            }
          }
        }
      }
    }

    piece.position = move.to;
    piece.hasMoved = true;

    // Handle En Passant Target tracking (FIDE Article 3.7d & RF-07)
    const vUpper = (piece.variantId || 'P').toUpperCase();
    const parsedFromPos = parseBoardPosition(move.from);
    const parsedToPos = parseBoardPosition(move.to);
    if (
      (vUpper === 'P' || vUpper === 'PAWN') &&
      parsedFromPos &&
      parsedToPos &&
      Math.abs(parsedToPos.y - parsedFromPos.y) === 2
    ) {
      const midY = (parsedFromPos.y + parsedToPos.y) / 2;
      state.enPassantTarget = move.to.includes(',')
        ? `${parsedToPos.x},${midY}`
        : toAlgebraic(parsedToPos.x, midY);
    } else {
      state.enPassantTarget = '';
    }

    // Handle Castling Rook repositioning (Spec 04 FIDE Article 3.8)
    if (validation.isCastling) {
      const isKingside = validation.isCastling === 'KINGSIDE';
      for (const entity of state.boardEntities.values()) {
        if (
          entity.ownerId === move.playerId &&
          !entity.isCaptured &&
          (entity.variantId.toUpperCase() === 'R' || entity.variantId.toUpperCase() === 'ROOK')
        ) {
          const rPos = parseBoardPosition(entity.position);
          if (rPos && ((isKingside && rPos.x === 7) || (!isKingside && rPos.x === 0))) {
            const targetX = isKingside ? 5 : 3;
            entity.position = entity.position.includes(',')
              ? `${targetX},${rPos.y}`
              : toAlgebraic(targetX, rPos.y);
            entity.hasMoved = true;
            break;
          }
        }
      }
    }

    // Handle Pawn Promotion (defaults to Queen if not specified)
    if (validation.isPromotion) {
      piece.variantId = 'Q';
    }

    // Fifty-move counter update (FIDE Article 9.3)
    const isPawnMove = vUpper === 'P' || vUpper === 'PAWN';
    const isCaptureMove = Boolean(capturedPieceId);
    if (isPawnMove || isCaptureMove) {
      state.fiftyMoveCounter = 0;
    } else {
      state.fiftyMoveCounter += 1;
    }

    state.lastProcessedSequenceId = move.seqId;
    if (state.playerSequenceAcks) {
      state.playerSequenceAcks.set(move.playerId, move.seqId);
    }
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

    // 7. Authoritative Game Over evaluation (Spec 04 RF-05, RF-11, RF-15)
    let gameOver = false;
    let gameOverReason: string | undefined;

    const nextPlayerObj = activePlayers.find((p) => p.playerId === state.activePlayerId);
    const isNextWhite = nextPlayerObj?.role === 'WHITE';
    const currentHistory: string[] = state.positionHistory
      ? Array.from(state.positionHistory).filter((k): k is string => typeof k === 'string')
      : [];
    const nextDomainState = buildDomainStateFromNetworkEntities(
      state.boardEntities.values(),
      state.activePlayerId,
      Boolean(isNextWhite),
      state.enPassantTarget || undefined,
      state.fiftyMoveCounter,
      currentHistory
    );

    // Compute canonical position key and track in state.positionHistory
    const currentKey = computePositionKey(nextDomainState);
    if (state.positionHistory) {
      state.positionHistory.push(currentKey);
    }
    const updatedHistory: string[] = state.positionHistory
      ? Array.from(state.positionHistory).filter((k): k is string => typeof k === 'string')
      : [currentKey];
    (nextDomainState.turnState as { positionHistory?: readonly string[] }).positionHistory = updatedHistory;

    const topology = new SquareTopology({ width: 8, height: 8 });
    const gameResult = RulesEngine.getGameResult(
      nextDomainState,
      topology,
      { variantId: 'CHESS_STANDARD', claimableDrawRules: true },
      updatedHistory
    );

    if (gameResult.isGameOver) {
      gameOver = true;
      gameOverReason = gameResult.reason;
      state.phase = 'GAME_OVER';

      if (gameResult.winnerId) {
        const winnerRole = gameResult.winnerId === 'P1' ? 'WHITE' : 'BLACK';
        const winner = activePlayers.find((p) => p.role === winnerRole);
        state.winnerId = winner ? winner.playerId : '';
      } else {
        state.winnerId = ''; // Stalemate or Draw
      }
    }

    return {
      success: true,
      pieceId: move.pieceId,
      from: move.from,
      to: move.to,
      seqId: move.seqId,
      capturedPieceId,
      gameOver,
      gameOverReason,
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

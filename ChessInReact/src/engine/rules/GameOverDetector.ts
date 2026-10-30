import { ITopology } from '../../core/topology/types';
import { IDomainState } from '../../core/state/gameState';
import { IPieceEntity } from '../../core/entities/types';
import { IGameResult, IVariantConfiguration } from './interfaces/IRulesContracts';
import { CheckValidator } from './CheckValidator';

export class GameOverDetector {
  /**
   * Universal game termination detection (RF-05, RF-11, RF-12, RF-15).
   */
  public static evaluateGameResult(
    state: IDomainState,
    topology: ITopology,
    legalMovesCount: number,
    variantConfig?: IVariantConfiguration,
    positionHistory?: readonly string[]
  ): IGameResult {
    const activePlayer = state.activePlayer;
    const opponentPlayer = activePlayer === 'P1' ? 'P2' : 'P1';

    // 1. King of the Hill (RF-12)
    const hillCoords = variantConfig?.hillCenterCoords ?? (
      variantConfig?.variantId === 'KING_OF_THE_HILL' ? ['3,3', '4,3', '3,4', '4,4'] : undefined
    );
    if (hillCoords && hillCoords.length > 0) {
      for (const entity of Object.values(state.boardEntities)) {
        if (
          entity.type === 'PIECE' &&
          !entity.isCaptured &&
          (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K') &&
          hillCoords.includes(entity.position)
        ) {
          return {
            isGameOver: true,
            status: 'HILL_CONTROLLED',
            winnerId: entity.ownerId,
            reason: `Player ${entity.ownerId}'s King reached the center hill square ${entity.position}.`,
          };
        }
      }
    }

    // 2. Antichess / Giveaway win condition (RF-10)
    if (variantConfig?.variantId === 'ANTICHESS') {
      const activePieces = Object.values(state.boardEntities).filter(
        (e) => e.type === 'PIECE' && !e.isCaptured && e.ownerId === activePlayer
      );
      if (activePieces.length === 0) {
        return {
          isGameOver: true,
          status: 'ALL_PIECES_LOST',
          winnerId: activePlayer,
          reason: `Antichess victory: Player ${activePlayer} lost all pieces.`,
        };
      }
      if (legalMovesCount === 0) {
        return {
          isGameOver: true,
          status: 'STALEMATE',
          winnerId: activePlayer,
          reason: `Antichess victory: Player ${activePlayer} has no legal moves (stalemate win).`,
        };
      }
    }

    // 3. Checkmate or Stalemate when no legal moves exist (RF-05)
    if (legalMovesCount === 0) {
      const isCheck = CheckValidator.isRoyalInCheck(activePlayer, state, topology);
      if (isCheck) {
        return {
          isGameOver: true,
          status: 'CHECKMATE',
          winnerId: opponentPlayer,
          reason: `Checkmate: Player ${activePlayer}'s King is trapped in check with no legal moves.`,
        };
      } else {
        return {
          isGameOver: true,
          status: 'STALEMATE',
          winnerId: null,
          reason: `Stalemate: Player ${activePlayer} has no legal moves and is not in check.`,
        };
      }
    }

    // 4. Mandatory Draws (FIDE Article 9.6)
    // 4.1 Seventy-five-move rule (FIDE Article 9.6.2): 75 consecutive moves (150 halfmoves) without capture or pawn advance
    const halfMoves = state.turnState.fiftyMoveCounter ?? 0;
    if (halfMoves >= 150) {
      return {
        isGameOver: true,
        status: 'SEVENTYFIVE_MOVE_RULE',
        winnerId: null,
        reason: 'Draw: 75 consecutive moves (150 halfmoves) elapsed without capture or pawn advance.',
      };
    }

    // 4.2 Fivefold repetition (FIDE Article 9.6.1): Exact position occurred 5 times
    let repetitionOccurrences = 0;
    if (positionHistory && positionHistory.length > 0) {
      const currentKey = positionHistory[positionHistory.length - 1];
      for (const key of positionHistory) {
        if (key === currentKey) repetitionOccurrences++;
      }
      if (repetitionOccurrences >= 5) {
        return {
          isGameOver: true,
          status: 'FIVEFOLD_REPETITION',
          winnerId: null,
          reason: 'Draw: The exact position has occurred 5 times.',
        };
      }
    }

    // 5. Claimable Draws (FIDE Article 9.2 & 9.3)
    // 5.1 Threefold repetition (FIDE Article 9.2): Exact position occurred 3 times
    if (repetitionOccurrences >= 3) {
      if (variantConfig?.claimableDrawRules) {
        return {
          isGameOver: false,
          canClaimDraw: true,
          status: 'THREEFOLD_REPETITION',
          winnerId: null,
          reason: 'Claimable draw: The exact position has occurred 3 times.',
        };
      }
      return {
        isGameOver: true,
        status: 'THREEFOLD_REPETITION',
        winnerId: null,
        reason: 'Draw: The exact position has occurred 3 times.',
      };
    }

    // 5.2 Fifty-move rule (FIDE Article 9.3): 50 consecutive moves (100 halfmoves) without capture or pawn advance
    if (halfMoves >= 100) {
      if (variantConfig?.claimableDrawRules) {
        return {
          isGameOver: false,
          canClaimDraw: true,
          status: 'FIFTY_MOVE_RULE',
          winnerId: null,
          reason: 'Claimable draw: 50 consecutive moves (100 halfmoves) elapsed without capture or pawn advance.',
        };
      }
      return {
        isGameOver: true,
        status: 'FIFTY_MOVE_RULE',
        winnerId: null,
        reason: 'Draw: 50 consecutive moves (100 halfmoves) elapsed without capture or pawn advance.',
      };
    }

    // 6. Insufficient Material (RF-15)
    const activePieces = Object.values(state.boardEntities).filter(
      (e) => e.type === 'PIECE' && !e.isCaptured
    ) as IPieceEntity[];

    if (this.isInsufficientMaterial(activePieces, topology)) {
      return {
        isGameOver: true,
        status: 'INSUFFICIENT_MATERIAL',
        winnerId: null,
        reason: 'Draw: Insufficient material to force checkmate.',
      };
    }

    return {
      isGameOver: false,
      status: 'IN_PROGRESS',
      winnerId: null,
    };
  }

  /**
   * Checks if pieces on the board constitute an impossible checkmate condition (FIDE Article 9.6).
   */
  public static isInsufficientMaterial(
    pieces: readonly IPieceEntity[],
    topology: ITopology
  ): boolean {
    // If any Pawns, Rooks, or Queens remain, material is sufficient
    for (const p of pieces) {
      const v = p.variantId.toUpperCase();
      if (v === 'PAWN' || v === 'ROOK' || v === 'QUEEN' || v === 'P' || v === 'R' || v === 'Q') {
        return false;
      }
    }

    // Only Kings, Bishops, Knights can be left
    const nonKings = pieces.filter((p) => {
      const v = p.variantId.toUpperCase();
      return v !== 'KING' && v !== 'K';
    });

    // 1. King vs King (0 non-kings)
    if (nonKings.length === 0) return true;

    // 2. King + Minor vs King (1 non-king: Bishop or Knight)
    if (nonKings.length === 1) {
      const v = nonKings[0].variantId.toUpperCase();
      if (v === 'BISHOP' || v === 'KNIGHT' || v === 'B' || v === 'N') {
        return true;
      }
    }

    // 3. King + Bishop vs King + Bishop (2 non-kings, both Bishops of same color square)
    if (nonKings.length === 2) {
      const [p1, p2] = nonKings;
      const v1 = p1.variantId.toUpperCase();
      const v2 = p2.variantId.toUpperCase();
      if ((v1 === 'BISHOP' || v1 === 'B') && (v2 === 'BISHOP' || v2 === 'B')) {
        if (p1.ownerId !== p2.ownerId) {
          const c1 = topology.getCellColorIndex(p1.position);
          const c2 = topology.getCellColorIndex(p2.position);
          if (c1 === c2) {
            return true;
          }
        }
      }
    }

    return false;
  }
}

import { ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../RulesEngine';
import { ILegalMove, IVariantConfiguration } from '../interfaces/IRulesContracts';
import { parseCoord, toCoordKey } from './CoordinateHelper';

export class Perft {
  /**
   * Applies a legal move to produce the next official state for Perft recursion.
   */
  public static applyMove(
    state: IDomainState,
    move: ILegalMove,
    _topology: ITopology
  ): IDomainState {
    void _topology;
    const piece = state.boardEntities[move.pieceId] as IPieceEntity;
    const vUpper = piece.variantId.toUpperCase();
    const isPawn = vUpper === 'PAWN' || vUpper === 'P';

    // 1. Simulate base spatial movements and captures
    const baseNext = RulesEngine.simulateMove(
      state,
      piece,
      move.to,
      move.isCastling,
      move.isEnPassant
    );

    // 2. Handle Pawn Promotion if applicable
    if (move.isPromotion) {
      const promotedPiece = baseNext.boardEntities[piece.id] as IPieceEntity;
      const promotionVariant = move.promotionOptions?.[0] ?? 'QUEEN';
      (baseNext.boardEntities as Record<string, IPieceEntity>)[piece.id] = {
        ...promotedPiece,
        variantId: promotionVariant,
      };
    }

    // 3. Compute En Passant target if double advance
    let nextEpTarget = null;
    const fromCoord = parseCoord(move.from);
    const toCoord = parseCoord(move.to);
    if (isPawn && fromCoord && toCoord && Math.abs(toCoord.y - fromCoord.y) === 2) {
      const skippedY = (fromCoord.y + toCoord.y) / 2;
      nextEpTarget = toCoordKey(fromCoord.x, skippedY);
    }

    // 4. Update halfmove clock and active player
    const nextFifty = (isPawn || move.isCapture) ? 0 : (state.turnState.fiftyMoveCounter + 1);
    const nextPlayer = state.activePlayer === 'P1' ? 'P2' : 'P1';
    const nextTurn = state.activePlayer === 'P2' ? state.turnNumber + 1 : state.turnNumber;

    return {
      ...baseNext,
      activePlayer: nextPlayer,
      turnNumber: nextTurn,
      revision: state.revision + 1,
      turnState: {
        ...state.turnState,
        enPassantTarget: nextEpTarget,
        fiftyMoveCounter: nextFifty,
        lastActionTimestamp: Date.now(),
      },
    };
  }

  /**
   * Computes the number of leaf nodes in the move tree up to depth (RNF-01, RNF-06).
   */
  public static countNodes(
    state: IDomainState,
    topology: ITopology,
    depth: number,
    variantConfig?: IVariantConfiguration
  ): number {
    if (depth <= 0) return 1;

    const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    if (depth === 1) {
      let count = 0;
      for (const move of legalMoves) {
        count += (move.isPromotion && move.promotionOptions && move.promotionOptions.length > 0)
          ? move.promotionOptions.length
          : 1;
      }
      return count;
    }

    let nodes = 0;
    for (const move of legalMoves) {
      // In standard perft, if promotion is available, each promotion option represents a distinct branch
      if (move.isPromotion && move.promotionOptions && move.promotionOptions.length > 0) {
        for (const promo of move.promotionOptions) {
          const promoMove: ILegalMove = {
            ...move,
            promotionOptions: [promo],
          };
          const nextState = this.applyMove(state, promoMove, topology);
          nodes += this.countNodes(nextState, topology, depth - 1, variantConfig);
        }
      } else {
        const nextState = this.applyMove(state, move, topology);
        nodes += this.countNodes(nextState, topology, depth - 1, variantConfig);
      }
    }

    return nodes;
  }
}

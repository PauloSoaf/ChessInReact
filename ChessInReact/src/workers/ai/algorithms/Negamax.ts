import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { ILegalMove, IVariantConfiguration } from '../../../engine/rules/interfaces/IRulesContracts';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import {
  IBestMoveResult,
  IMoveRecommendation,
  IAISearchOptions,
} from '../interfaces/IAIEngineContracts';
import { ZobristHasher } from '../heuristics/ZobristHasher';
import { TranspositionTable, TTEntryFlag } from './TranspositionTable';
import { QuiescenceSearch } from './Quiescence';

/**
 * 2-Player Negamax search with Alpha-Beta Pruning, Transposition Table,
 * Quiescence Search, and Iterative Deepening (Spec 05 § 4 Fonte 3, § 16 RF-01, RF-06, RF-07, RF-14).
 */
export class NegamaxSearch {
  private tt: TranspositionTable;
  private nodesCalculated = 0;
  private startTime = 0;
  private timeBudgetMs = 1500;
  private isAborted = false;

  constructor(tt?: TranspositionTable) {
    this.tt = tt ?? new TranspositionTable(100000);
  }

  /**
   * Sorts candidate moves: TT best move first, then MVV-LVA captures, then quiet moves.
   */
  private orderMoves(
    moves: readonly ILegalMove[],
    _state: IDomainState,
    ttBestMove?: IMoveRecommendation
  ): ILegalMove[] {
    const sorted = [...moves];
    return sorted.sort((a, b) => {
      // 1. Prioritize TT move if available
      if (ttBestMove) {
        const isA = a.from === ttBestMove.fromCoord && a.to === ttBestMove.toCoord;
        const isB = b.from === ttBestMove.fromCoord && b.to === ttBestMove.toCoord;
        if (isA && !isB) return -1;
        if (!isA && isB) return 1;
      }

      // 2. Prioritize captures over non-captures
      if (a.isCapture && !b.isCapture) return -1;
      if (!a.isCapture && b.isCapture) return 1;

      // 3. Prioritize promotions
      if (a.isPromotion && !b.isPromotion) return -1;
      if (!a.isPromotion && b.isPromotion) return 1;

      return 0;
    });
  }

  /**
   * Recursive Negamax with Alpha-Beta Pruning.
   */
  private negamax(
    state: IDomainState,
    depth: number,
    alpha: number,
    beta: number,
    activePlayer: PlayerId,
    opponentPlayer: PlayerId,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    options?: IAISearchOptions
  ): number {
    if (this.isAborted || options?.cancellationToken?.aborted) {
      this.isAborted = true;
      return alpha;
    }

    this.nodesCalculated++;

    // Time budget and abort check every 64 nodes
    if ((this.nodesCalculated & 63) === 0) {
      if (options?.cancellationToken?.aborted || performance.now() - this.startTime > this.timeBudgetMs) {
        this.isAborted = true;
        return alpha;
      }
    }

    const hash = ZobristHasher.hash(state);
    const ttEntry = this.tt.get(hash);

    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 'EXACT') {
        return ttEntry.score;
      } else if (ttEntry.flag === 'LOWERBOUND' && ttEntry.score >= beta) {
        return ttEntry.score;
      } else if (ttEntry.flag === 'UPPERBOUND' && ttEntry.score <= alpha) {
        return ttEntry.score;
      }
    }

    // Leaf node: check game over or depth limit
    if (state.isGameOver) {
      if (state.winnerId === activePlayer) return 100000 + depth;
      if (state.winnerId === opponentPlayer) return -100000 - depth;
      return 0; // Draw
    }

    if (depth <= 0) {
      return QuiescenceSearch.search(
        state,
        alpha,
        beta,
        activePlayer,
        opponentPlayer,
        topology,
        variantConfig
      );
    }

    const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    if (legalMoves.length === 0) {
      // Stalemate or Checkmate
      const royalPiece = Object.values(state.boardEntities).find(
        (e) =>
          e.type === 'PIECE' &&
          (e as IPieceEntity).ownerId === activePlayer &&
          (e as IPieceEntity).variantId.toUpperCase() === 'KING'
      ) as IPieceEntity | undefined;
      const isCheck = royalPiece
        ? RulesEngine.isSquareAttacked(royalPiece.position, opponentPlayer, state, topology)
        : false;
      if (isCheck) {
        return -100000 - depth; // Checkmated
      }
      return 0; // Stalemate
    }

    const sortedMoves = this.orderMoves(legalMoves, state, ttEntry?.bestMove);
    let bestScore = -Infinity;
    let bestMove: IMoveRecommendation | undefined;
    const originalAlpha = alpha;

    for (const move of sortedMoves) {
      const piece = state.boardEntities[move.pieceId] as IPieceEntity;
      const nextSimulated = RulesEngine.simulateMove(
        state,
        piece,
        move.to,
        move.isCastling,
        move.isEnPassant
      );
      const nextState: IDomainState = {
        ...nextSimulated,
        activePlayer: opponentPlayer,
      };

      const score = -this.negamax(
        nextState,
        depth - 1,
        -beta,
        -alpha,
        opponentPlayer,
        activePlayer,
        topology,
        variantConfig,
        options
      );

      if (this.isAborted) {
        return bestScore;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = {
          fromCoord: move.from,
          toCoord: move.to,
          pieceId: move.pieceId,
          promotionVariant: move.promotionOptions?.[0],
        };
      }

      if (score > alpha) {
        alpha = score;
      }

      if (alpha >= beta) {
        break; // Alpha-Beta cut-off
      }
    }

    // Store evaluation in Transposition Table
    let flag: TTEntryFlag = 'EXACT';
    if (bestScore <= originalAlpha) {
      flag = 'UPPERBOUND';
    } else if (bestScore >= beta) {
      flag = 'LOWERBOUND';
    }

    this.tt.set(hash, depth, bestScore, flag, bestMove);

    return bestScore;
  }

  /**
   * Iterative Deepening Negamax driver (Spec 05 § 10.2, § 16 RF-01, RF-14).
   */
  public searchBestMove(
    state: IDomainState,
    topology: ITopology,
    options?: IAISearchOptions,
    variantConfig?: IVariantConfiguration
  ): IBestMoveResult {
    this.nodesCalculated = 0;
    this.startTime = performance.now();
    this.timeBudgetMs = options?.timeBudgetMs ?? 1500;
    this.isAborted = false;

    const activePlayer = state.activePlayer;
    const opponentPlayer: PlayerId = activePlayer === 'P1' ? 'P2' : 'P1';
    const targetDepth = options?.depthLimit ?? 4;

    if (options?.cancellationToken?.aborted) {
      this.isAborted = true;
      return {
        bestMove: null,
        evaluationScore: 0,
        depthReached: 0,
        nodesCalculated: 0,
        calculationTimeMs: 0,
        pvLine: [],
        hitRate: 0,
      };
    }

    const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    if (legalMoves.length === 0) {
      return {
        bestMove: null,
        evaluationScore: 0,
        depthReached: 0,
        nodesCalculated: 0,
        calculationTimeMs: 0,
        pvLine: [],
        hitRate: 0,
      };
    }

    let currentBestMove: IMoveRecommendation = {
      fromCoord: legalMoves[0].from,
      toCoord: legalMoves[0].to,
      pieceId: legalMoves[0].pieceId,
    };
    let currentBestScore = 0;
    let depthReached = 0;

    // Iterative Deepening from depth 1 to targetDepth
    for (let depth = 1; depth <= targetDepth; depth++) {
      if (
        this.isAborted ||
        options?.cancellationToken?.aborted ||
        (depth > 1 && performance.now() - this.startTime > this.timeBudgetMs)
      ) {
        this.isAborted = true;
        break;
      }

      let bestScoreForDepth = -Infinity;
      let bestMoveForDepth: IMoveRecommendation | undefined;
      const sortedMoves = this.orderMoves(legalMoves, state, currentBestMove);

      for (const move of sortedMoves) {
        if (
          this.isAborted ||
          options?.cancellationToken?.aborted ||
          (depth > 1 && performance.now() - this.startTime > this.timeBudgetMs)
        ) {
          this.isAborted = true;
          break;
        }
        const piece = state.boardEntities[move.pieceId] as IPieceEntity;
        const nextSimulated = RulesEngine.simulateMove(
          state,
          piece,
          move.to,
          move.isCastling,
          move.isEnPassant
        );
        const nextState: IDomainState = {
          ...nextSimulated,
          activePlayer: opponentPlayer,
        };

        const score = -this.negamax(
          nextState,
          depth - 1,
          -Infinity,
          Infinity,
          opponentPlayer,
          activePlayer,
          topology,
          variantConfig,
          options
        );

        if (this.isAborted) {
          break;
        }

        if (score > bestScoreForDepth) {
          bestScoreForDepth = score;
          bestMoveForDepth = {
            fromCoord: move.from,
            toCoord: move.to,
            pieceId: move.pieceId,
            promotionVariant: move.promotionOptions?.[0],
          };
        }
      }

      if (!this.isAborted && bestMoveForDepth) {
        currentBestMove = bestMoveForDepth;
        currentBestScore = bestScoreForDepth;
        depthReached = depth;

        if (options?.onProgress) {
          const elapsed = performance.now() - this.startTime;
          const nps = elapsed > 0 ? Math.round((this.nodesCalculated / elapsed) * 1000) : 0;
          options.onProgress({
            depthReached,
            nps,
            currentBestMove,
          });
        }
      }
    }

    const totalTimeMs = Math.round(performance.now() - this.startTime);

    return {
      bestMove: currentBestMove,
      evaluationScore: currentBestScore,
      depthReached,
      nodesCalculated: this.nodesCalculated,
      calculationTimeMs: totalTimeMs,
      pvLine: [
        `${currentBestMove.fromCoord}->${currentBestMove.toCoord}`,
      ],
      hitRate: this.tt.hitRate,
    };
  }
}

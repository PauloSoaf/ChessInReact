import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { IVariantConfiguration } from '../../../engine/rules/interfaces/IRulesContracts';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import {
  IBestMoveResult,
  IMoveRecommendation,
  IAISearchOptions,
  ScoreTuple,
} from '../interfaces/IAIEngineContracts';
import { BoardEvaluator } from '../heuristics/BoardEvaluator';
import { ZobristHasher } from '../heuristics/ZobristHasher';
import { TranspositionTable } from './TranspositionTable';

/**
 * Max-N and Paranoid Search for 3 to 8 players (Spec 05 § 3.2, § 4 Fonte 1, § 7, § 16 RF-03, RF-09).
 */
export class ParanoidSearch {
  private tt: TranspositionTable;
  private nodesCalculated = 0;
  private startTime = 0;
  private timeBudgetMs = 1500;
  private isAborted = false;

  constructor(tt?: TranspositionTable) {
    this.tt = tt ?? new TranspositionTable(100000);
  }

  /**
   * Resolves the next player in rotational turn order among remaining active players.
   */
  private getNextPlayer(
    currentPlayer: PlayerId,
    playerList: readonly PlayerId[]
  ): PlayerId {
    const idx = playerList.indexOf(currentPlayer);
    if (idx === -1) return playerList[0];
    return playerList[(idx + 1) % playerList.length];
  }

  /**
   * Paranoid evaluation: Bot score minus weighted sum of all enemy scores (Spec 05 § 7 lines 167-173).
   */
  private evaluateParanoid(
    state: IDomainState,
    botPlayerId: PlayerId,
    topology: ITopology
  ): number {
    const scores = BoardEvaluator.evaluate(state, topology);
    let enemySum = 0;
    for (const key in scores) {
      if (key !== botPlayerId && key !== 'NONE') {
        enemySum += scores[key] ?? 0;
      }
    }
    const myScore = scores[botPlayerId] ?? 0;
    // Mitigation factor 0.33 to avoid over-pessimism in free-for-all
    return myScore - enemySum * 0.33;
  }

  /**
   * Recursive Paranoid Alpha-Beta search.
   */
  private searchInternal(
    state: IDomainState,
    depth: number,
    isMaximizer: boolean,
    alpha: number,
    beta: number,
    botPlayerId: PlayerId,
    playerList: readonly PlayerId[],
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    options?: IAISearchOptions
  ): number {
    this.nodesCalculated++;

    if ((this.nodesCalculated & 1023) === 0) {
      if (options?.cancellationToken?.aborted || performance.now() - this.startTime > this.timeBudgetMs) {
        this.isAborted = true;
        return alpha;
      }
    }

    if (this.isAborted) {
      return alpha;
    }

    const hash = ZobristHasher.hash(state);
    const ttEntry = this.tt.get(hash);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 'EXACT') return ttEntry.score;
      if (ttEntry.flag === 'LOWERBOUND' && ttEntry.score >= beta) return ttEntry.score;
      if (ttEntry.flag === 'UPPERBOUND' && ttEntry.score <= alpha) return ttEntry.score;
    }

    if (depth === 0 || state.isGameOver) {
      return this.evaluateParanoid(state, botPlayerId, topology);
    }

    const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    if (legalMoves.length === 0) {
      return this.evaluateParanoid(state, botPlayerId, topology);
    }

    const nextPlayer = this.getNextPlayer(state.activePlayer, playerList);

    if (isMaximizer) {
      let maxEval = -Infinity;
      let bestMove: IMoveRecommendation | undefined;

      for (const move of legalMoves) {
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
          activePlayer: nextPlayer,
        };

        const nextIsMax = nextPlayer === botPlayerId;
        const ev = this.searchInternal(
          nextState,
          depth - 1,
          nextIsMax,
          alpha,
          beta,
          botPlayerId,
          playerList,
          topology,
          variantConfig,
          options
        );

        if (this.isAborted) return maxEval;

        if (ev > maxEval) {
          maxEval = ev;
          bestMove = {
            fromCoord: move.from,
            toCoord: move.to,
            pieceId: move.pieceId,
            promotionVariant: move.promotionOptions?.[0],
          };
        }

        alpha = Math.max(alpha, ev);
        if (beta <= alpha) {
          break; // Alpha-Beta cutoff in multiplayer paranoid mode
        }
      }

      this.tt.set(hash, depth, maxEval, 'EXACT', bestMove);
      return maxEval;
    } else {
      let minEval = Infinity;

      for (const move of legalMoves) {
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
          activePlayer: nextPlayer,
        };

        const nextIsMax = nextPlayer === botPlayerId;
        const ev = this.searchInternal(
          nextState,
          depth - 1,
          nextIsMax,
          alpha,
          beta,
          botPlayerId,
          playerList,
          topology,
          variantConfig,
          options
        );

        if (this.isAborted) return minEval;

        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) {
          break; // Alpha-Beta cutoff
        }
      }

      this.tt.set(hash, depth, minEval, 'EXACT');
      return minEval;
    }
  }

  /**
   * Pure Max-N algorithm returning N-tuple payoff (Spec 05 § 4 Fonte 1, § 16 RF-03).
   */
  public searchMaxN(
    state: IDomainState,
    depth: number,
    playerList: readonly PlayerId[],
    topology: ITopology,
    variantConfig?: IVariantConfiguration
  ): { bestMove: IMoveRecommendation | null; scores: ScoreTuple } {
    if (depth === 0 || state.isGameOver) {
      return {
        bestMove: null,
        scores: BoardEvaluator.evaluate(state, topology),
      };
    }

    const legalMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);
    if (legalMoves.length === 0) {
      return {
        bestMove: null,
        scores: BoardEvaluator.evaluate(state, topology),
      };
    }

    const activePlayer = state.activePlayer;
    const nextPlayer = this.getNextPlayer(activePlayer, playerList);

    let maxScoreForActive = -Infinity;
    let bestTuple: ScoreTuple = { P1: 0, P2: 0, P3: 0, P4: 0 };
    let bestMove: IMoveRecommendation | null = null;

    for (const move of legalMoves) {
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
        activePlayer: nextPlayer,
      };

      const result = this.searchMaxN(nextState, depth - 1, playerList, topology, variantConfig);
      const activeVal = result.scores[activePlayer] ?? 0;

      if (activeVal > maxScoreForActive) {
        maxScoreForActive = activeVal;
        bestTuple = result.scores;
        bestMove = {
          fromCoord: move.from,
          toCoord: move.to,
          pieceId: move.pieceId,
          promotionVariant: move.promotionOptions?.[0],
        };
      }
    }

    return { bestMove, scores: bestTuple };
  }

  /**
   * Driver searching for best move in multiplayer environments.
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

    const botPlayerId = state.activePlayer;
    const playerCount = options?.playerCount ?? 4;
    const playerList: PlayerId[] = [];
    for (let i = 1; i <= playerCount; i++) {
      playerList.push(`P${i}` as PlayerId);
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

    const targetDepth = options?.depthLimit ?? 3;
    let currentBestMove: IMoveRecommendation = {
      fromCoord: legalMoves[0].from,
      toCoord: legalMoves[0].to,
      pieceId: legalMoves[0].pieceId,
    };
    let currentBestScore = 0;
    let depthReached = 0;

    for (let depth = 1; depth <= targetDepth; depth++) {
      if (this.isAborted || performance.now() - this.startTime > this.timeBudgetMs) {
        break;
      }

      let bestScoreForDepth = -Infinity;
      let bestMoveForDepth: IMoveRecommendation | undefined;

      for (const move of legalMoves) {
        const piece = state.boardEntities[move.pieceId] as IPieceEntity;
        const nextPlayer = this.getNextPlayer(botPlayerId, playerList);
        const nextSimulated = RulesEngine.simulateMove(
          state,
          piece,
          move.to,
          move.isCastling,
          move.isEnPassant
        );
        const nextState: IDomainState = {
          ...nextSimulated,
          activePlayer: nextPlayer,
        };

        const nextIsMax = nextPlayer === botPlayerId;
        const ev = this.searchInternal(
          nextState,
          depth - 1,
          nextIsMax,
          -Infinity,
          Infinity,
          botPlayerId,
          playerList,
          topology,
          variantConfig,
          options
        );

        if (this.isAborted) break;

        if (ev > bestScoreForDepth) {
          bestScoreForDepth = ev;
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
        currentBestScore = Math.round(bestScoreForDepth);
        depthReached = depth;
      }
    }

    const totalTimeMs = Math.round(performance.now() - this.startTime);

    return {
      bestMove: currentBestMove,
      evaluationScore: currentBestScore,
      depthReached,
      nodesCalculated: this.nodesCalculated,
      calculationTimeMs: totalTimeMs,
      pvLine: [`${currentBestMove.fromCoord}->${currentBestMove.toCoord}`],
      hitRate: this.tt.hitRate,
    };
  }
}

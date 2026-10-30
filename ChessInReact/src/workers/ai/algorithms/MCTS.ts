import { PlayerId } from '../../../core/coordinates/types';
import { IDomainState } from '../../../core/state/gameState';
import { ITopology } from '../../../core/topology/types';
import { ILegalMove, IVariantConfiguration } from '../../../engine/rules/interfaces/IRulesContracts';
import { IPieceEntity } from '../../../core/entities/types';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import {
  IBestMoveResult,
  IAISearchOptions,
} from '../interfaces/IAIEngineContracts';
import { BoardEvaluator } from '../heuristics/BoardEvaluator';

/**
 * Deterministic pseudo-random generator (Mulberry32) for reproducible MCTS rollouts (Spec 05 § 17 RNF-11).
 */
class Mulberry32 {
  private state: number;

  constructor(seed = 1337) {
    this.state = seed;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

export class MCTSNode {
  public visits = 0;
  public wins = 0;
  public move: ILegalMove | null = null;
  public parent: MCTSNode | null = null;
  public children: Map<string, MCTSNode> = new Map();
  public unvisitedMoves: ILegalMove[] = [];
  public state: IDomainState;

  constructor(state: IDomainState, parent: MCTSNode | null = null, move: ILegalMove | null = null) {
    this.state = state;
    this.parent = parent;
    this.move = move;
  }

  public get UCB1(): number {
    if (this.visits === 0) return Infinity;
    const explorationParam = 1.41421356; // Math.SQRT2
    const parentVisits = this.parent ? this.parent.visits : this.visits;
    return (
      this.wins / this.visits +
      explorationParam * Math.sqrt(Math.log(Math.max(1, parentVisits)) / this.visits)
    );
  }
}

/**
 * Monte Carlo Tree Search (UCT / ISMCTS) for stochastic and simultaneous games (Spec 05 § 8, § 16 RF-04).
 */
export class MCTS {
  private prng: Mulberry32;

  constructor(seed = 42) {
    this.prng = new Mulberry32(seed);
  }

  public setSeed(seed: number): void {
    this.prng = new Mulberry32(seed);
  }

  /**
   * Selects child with highest UCB1 score.
   */
  private getHighestUCB1(node: MCTSNode): MCTSNode {
    let bestChild: MCTSNode | null = null;
    let bestUCB = -Infinity;

    for (const child of node.children.values()) {
      const ucb = child.UCB1;
      if (ucb > bestUCB) {
        bestUCB = ucb;
        bestChild = child;
      }
    }

    return bestChild ?? node;
  }

  /**
   * Fast simulation/rollout of a random match up to maxPlies.
   */
  private rollout(
    startState: IDomainState,
    botPlayerId: PlayerId,
    topology: ITopology,
    variantConfig?: IVariantConfiguration,
    maxPlies = 10
  ): number {
    let current = startState;
    let ply = 0;

    while (ply < maxPlies && !current.isGameOver) {
      const moves = RulesEngine.getLegalMoves(current, topology, variantConfig);
      if (moves.length === 0) break;

      const randomIdx = this.prng.nextInt(0, moves.length - 1);
      const chosen = moves[randomIdx];

      const piece = current.boardEntities[chosen.pieceId] as IPieceEntity;
      const simulated = RulesEngine.simulateMove(
        current,
        piece,
        chosen.to,
        chosen.isCastling,
        chosen.isEnPassant
      );

      const nextPlayer: PlayerId = current.activePlayer === 'P1' ? 'P2' : 'P1';
      current = {
        ...simulated,
        activePlayer: nextPlayer,
      };

      ply++;
    }

    if (current.isGameOver) {
      if (current.winnerId === botPlayerId) return 1.0;
      if (current.winnerId === null) return 0.5; // Draw
      return 0.0;
    }

    // Heuristic payoff at terminal rollout horizon
    const evalScore = BoardEvaluator.evaluateRelative2P(
      current,
      topology,
      botPlayerId,
      botPlayerId === 'P1' ? 'P2' : 'P1'
    );
    // Sigmoid compression: score in centipawns mapped to 0..1
    return 1 / (1 + Math.exp(-evalScore / 400));
  }

  /**
   * Backpropagates rollout reward up the tree.
   */
  private backpropagate(node: MCTSNode, reward: number): void {
    let curr: MCTSNode | null = node;
    while (curr !== null) {
      curr.visits++;
      curr.wins += reward;
      curr = curr.parent;
    }
  }

  /**
   * Executes MCTS search within time budget or rollout iteration limit.
   */
  public searchBestMove(
    state: IDomainState,
    topology: ITopology,
    options?: IAISearchOptions,
    variantConfig?: IVariantConfiguration
  ): IBestMoveResult {
    const startTime = performance.now();
    const timeLimitMs = options?.timeBudgetMs ?? 800;
    const maxRollouts = options?.maxRollouts ?? (options?.randomSeed !== undefined ? 100 : 2500);
    const botPlayerId = state.activePlayer;

    if (options?.randomSeed !== undefined) {
      this.setSeed(options.randomSeed);
    }

    const root = new MCTSNode(state);
    root.unvisitedMoves = RulesEngine.getLegalMoves(state, topology, variantConfig);

    if (root.unvisitedMoves.length === 0) {
      return {
        bestMove: null,
        evaluationScore: 0,
        depthReached: 0,
        nodesCalculated: 0,
        calculationTimeMs: 0,
        pvLine: [],
      };
    }

    let iterations = 0;

    while (
      iterations < maxRollouts &&
      performance.now() - startTime < timeLimitMs &&
      !options?.cancellationToken?.aborted
    ) {
      iterations++;

      // 1. Selection
      let node = root;
      while (node.unvisitedMoves.length === 0 && node.children.size > 0) {
        node = this.getHighestUCB1(node);
      }

      // 2. Expansion
      if (node.unvisitedMoves.length > 0) {
        const move = node.unvisitedMoves.pop()!;
        const piece = node.state.boardEntities[move.pieceId] as IPieceEntity;
        const nextSimulated = RulesEngine.simulateMove(
          node.state,
          piece,
          move.to,
          move.isCastling,
          move.isEnPassant
        );
        const nextPlayer: PlayerId = node.state.activePlayer === 'P1' ? 'P2' : 'P1';
        const nextState: IDomainState = {
          ...nextSimulated,
          activePlayer: nextPlayer,
        };

        const childNode = new MCTSNode(nextState, node, move);
        childNode.unvisitedMoves = RulesEngine.getLegalMoves(nextState, topology, variantConfig);
        const moveKey = `${move.from}->${move.to}`;
        node.children.set(moveKey, childNode);
        node = childNode;
      }

      // 3. Simulation
      const reward = this.rollout(node.state, botPlayerId, topology, variantConfig);

      // 4. Backpropagation
      this.backpropagate(node, reward);
    }

    // Most visited child is the robust decision (Spec 05 § 8 line 274)
    let bestChild: MCTSNode | null = null;
    let maxVisits = -1;

    for (const child of root.children.values()) {
      if (child.visits > maxVisits) {
        maxVisits = child.visits;
        bestChild = child;
      }
    }

    const chosenMove = bestChild?.move ?? root.unvisitedMoves[0] ?? null;
    const calcTime = Math.round(performance.now() - startTime);

    const winRate = bestChild && bestChild.visits > 0 ? bestChild.wins / bestChild.visits : 0.5;
    // Win rate to approximate centipawns: 0.5 -> 0, 0.75 -> ~200
    const centipawns = Math.round((winRate - 0.5) * 800);

    return {
      bestMove: chosenMove
        ? {
            fromCoord: chosenMove.from,
            toCoord: chosenMove.to,
            pieceId: chosenMove.pieceId,
            promotionVariant: chosenMove.promotionOptions?.[0],
          }
        : null,
      evaluationScore: centipawns,
      depthReached: 3,
      nodesCalculated: iterations,
      calculationTimeMs: calcTime,
      pvLine: chosenMove ? [`${chosenMove.from}->${chosenMove.to}`] : [],
    };
  }
}

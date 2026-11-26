/**
 * ChessInReact - Spell Chess Adversarial Tactical Search Engine (Spec 15 § 4 Estratégia 7, RF-15-06)
 *
 * Implements an adversarial Alpha-Beta / Negamax search over composite Spell Chess turn actions:
 * - Unit of search: SpellChessTurnAction = Optional Spell + Mandatory Piece Move.
 * - Iterative deepening with strict time budget enforcement (RNF-15-01).
 * - Full Transposition Table with augmented state indexing.
 * - Quiescence search for captures and king assault sequences.
 * - High-precision telemetry trace generation for auditing and tuning.
 */

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, CoordinateKey, EntityId } from '../../../../core/coordinates/types';
import { IPieceEntity } from '../../../../core/entities/types';
import { ITopology } from '../../../../core/topology/types';
import { MovePieceCommand } from '../../../../core/commands/MovePieceCommand';
import {
  SpellAction,
  SpellChessTurnAction,
  SpellResources,
  SpellChessDecisionTrace,
} from './SpellChessTurnAction';
import { SpellChessMoveGenerator } from './SpellChessMoveGenerator';
import {
  SpellChessPositionEvaluator,
  SPELL_CHESS_MATE_SCORE,
} from './SpellChessPositionEvaluator';
import { SpellChessTranspositionTable } from './SpellChessTranspositionTable';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';

export interface ISpellChessSearchResult {
  readonly bestAction: SpellChessTurnAction;
  readonly evaluationCentipawns: number;
  readonly depthReached: number;
  readonly nodesEvaluated: number;
  readonly elapsedMs: number;
  readonly trace: SpellChessDecisionTrace;
}

export class SpellChessSearch {
  private readonly tt: SpellChessTranspositionTable;
  private nodesCount = 0;
  private startTime = 0;
  private timeBudgetMs = 2500;
  private isTimeExhausted = false;

  constructor(ttSize: number = 32_768) {
    this.tt = new SpellChessTranspositionTable(ttSize);
  }

  /**
   * Main search entry point with iterative deepening.
   */
  public searchBestTurnAction(
    domain: IDomainState,
    actingPlayer: PlayerId,
    topology: ITopology,
    playerResources: SpellResources,
    opponentResources: SpellResources,
    timeBudgetMs: number = 2500,
    maxDepth: number = 5,
    activeFrozenCoords: readonly string[] = [],
    activeJumpCoords: readonly string[] = [],
    fallbackLegalMoves?: readonly {
      readonly from: string;
      readonly to: string;
      readonly pieceId: string;
      readonly isCapture?: boolean;
      readonly promotion?: string;
    }[]
  ): ISpellChessSearchResult {
    this.startTime = performance.now();
    this.timeBudgetMs = timeBudgetMs;
    this.nodesCount = 0;
    this.isTimeExhausted = false;

    // Generate root turn actions
    const rootActions = SpellChessMoveGenerator.generateTurnActions(
      domain,
      actingPlayer,
      topology,
      playerResources,
      activeFrozenCoords,
      activeJumpCoords,
      fallbackLegalMoves
    );

    if (rootActions.length === 0) {
      throw new Error('Nenhum movimento legal disponível em Spell Chess.');
    }

    // 0. Immediate Check: If any root action captures opponent King, execute immediately!
    const opponentPlayer: PlayerId = actingPlayer === 'P1' ? 'P2' : 'P1';
    const opponentKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, opponentPlayer);
    for (const action of rootActions) {
      if (action.move.to === opponentKingCoord) {
        const elapsed = performance.now() - this.startTime;
        return {
          bestAction: action,
          evaluationCentipawns: SPELL_CHESS_MATE_SCORE,
          depthReached: 1,
          nodesEvaluated: 1,
          elapsedMs: elapsed,
          trace: {
            depthReached: 1,
            nodesSearched: 1,
            elapsedMs: elapsed,
            legalTurnActionsConsidered: rootActions.length,
            topCandidates: [{ spell: action.spell, move: `${action.move.from}->${action.move.to}`, score: SPELL_CHESS_MATE_SCORE }],
            chosenAction: action,
            principalVariation: [action],
          },
        };
      }
    }

    let globalBestAction = rootActions[0];
    let globalBestScore = -Infinity;
    let completedDepth = 1;
    const topCandidatesRecord: Array<{ spell: SpellAction; move: string; score: number }> = [];

    // Iterative deepening from depth 1 to maxDepth
    for (let depth = 1; depth <= maxDepth; depth++) {
      let currentBestAction = rootActions[0];
      let currentBestScore = -Infinity;
      let alpha = -Infinity;
      const beta = Infinity;

      for (const action of rootActions) {
        if (this.checkTimeCutoff()) break;

        const nextDomain = this.simulateTurnAction(domain, action, actingPlayer, topology);
        const nextPlayerResources = this.updateResourcesAfterTurn(playerResources, action.spell);
        const nextOpponentResources = { ...opponentResources };

        // Negamax recursive call
        const score = -this.negamax(
          nextDomain,
          depth - 1,
          -beta,
          -alpha,
          opponentPlayer,
          actingPlayer,
          topology,
          nextOpponentResources,
          nextPlayerResources,
          activeFrozenCoords,
          activeJumpCoords,
          1
        );

        if (this.isTimeExhausted) break;

        if (score > currentBestScore) {
          currentBestScore = score;
          currentBestAction = action;
        }
        if (score > alpha) {
          alpha = score;
        }

        if (depth === maxDepth) {
          topCandidatesRecord.push({
            spell: action.spell,
            move: `${action.move.from}->${action.move.to}`,
            score,
          });
        }
      }

      if (!this.isTimeExhausted) {
        globalBestAction = currentBestAction;
        globalBestScore = currentBestScore;
        completedDepth = depth;

        // If a forced win is found, no need to search deeper
        if (globalBestScore >= SPELL_CHESS_MATE_SCORE - 10) {
          break;
        }
      } else {
        break;
      }
    }

    const elapsedMs = performance.now() - this.startTime;
    topCandidatesRecord.sort((a, b) => b.score - a.score);

    return {
      bestAction: globalBestAction,
      evaluationCentipawns: Math.round(globalBestScore === -Infinity ? 0 : globalBestScore),
      depthReached: completedDepth,
      nodesEvaluated: this.nodesCount,
      elapsedMs,
      trace: {
        depthReached: completedDepth,
        nodesSearched: this.nodesCount,
        elapsedMs,
        legalTurnActionsConsidered: rootActions.length,
        topCandidates: topCandidatesRecord.slice(0, 5),
        chosenAction: globalBestAction,
        principalVariation: [globalBestAction],
      },
    };
  }

  /**
   * Recursive Negamax with Alpha-Beta Pruning.
   */
  private negamax(
    domain: IDomainState,
    depth: number,
    alpha: number,
    beta: number,
    activePlayer: PlayerId,
    rootPlayer: PlayerId,
    topology: ITopology,
    playerResources: SpellResources,
    opponentResources: SpellResources,
    activeFrozenCoords: readonly string[],
    activeJumpCoords: readonly string[],
    ply: number
  ): number {
    this.nodesCount++;

    if (this.checkTimeCutoff()) {
      return 0;
    }

    const opponentPlayer: PlayerId = activePlayer === 'P1' ? 'P2' : 'P1';

    // 1. Terminal Royal Capture Evaluation
    let friendlyKingCaptured = false;
    let opponentKingCaptured = false;
    for (const entity of Object.values(domain.boardEntities)) {
      if (
        entity &&
        entity.type === 'PIECE' &&
        (entity.variantId.toUpperCase() === 'KING' || entity.variantId.toUpperCase() === 'K')
      ) {
        if (entity.ownerId === activePlayer && entity.isCaptured) {
          friendlyKingCaptured = true;
        } else if (entity.ownerId === opponentPlayer && entity.isCaptured) {
          opponentKingCaptured = true;
        }
      }
    }

    if (friendlyKingCaptured) {
      return -SPELL_CHESS_MATE_SCORE + ply;
    }
    if (opponentKingCaptured) {
      return SPELL_CHESS_MATE_SCORE - ply;
    }

    // 2. Leaf Node Evaluation or Quiescence
    if (depth <= 0) {
      return this.quiescence(
        domain,
        alpha,
        beta,
        activePlayer,
        topology,
        playerResources,
        opponentResources,
        activeFrozenCoords,
        activeJumpCoords,
        ply
      );
    }

    // 3. Transposition Table Lookup
    const ttKey = this.tt.computeKey(
      domain,
      activePlayer,
      activePlayer === 'P1' ? playerResources : opponentResources,
      activePlayer === 'P1' ? opponentResources : playerResources,
      activeFrozenCoords,
      activeJumpCoords
    );
    const ttEntry = this.tt.get(ttKey);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 'EXACT') return ttEntry.score;
      if (ttEntry.flag === 'LOWERBOUND' && ttEntry.score >= beta) return ttEntry.score;
      if (ttEntry.flag === 'UPPERBOUND' && ttEntry.score <= alpha) return ttEntry.score;
    }

    // 4. Generate Legal Turn Actions
    const actions = SpellChessMoveGenerator.generateTurnActions(
      domain,
      activePlayer,
      topology,
      playerResources,
      activeFrozenCoords,
      activeJumpCoords
    );

    if (actions.length === 0) {
      // No legal moves
      return 0; // Draw / Stalemate
    }

    let maxScore = -Infinity;
    let bestAction = actions[0];
    const opponentKingCoord = SpellChessThreatAnalyzer.findKingCoord(domain, opponentPlayer);

    for (const action of actions) {
      // Immediate King Capture cutoff
      if (opponentKingCoord && action.move.to === opponentKingCoord) {
        return SPELL_CHESS_MATE_SCORE - ply;
      }

      const nextDomain = this.simulateTurnAction(domain, action, activePlayer, topology);
      const nextPlayerResources = this.updateResourcesAfterTurn(playerResources, action.spell);
      const nextOpponentResources = { ...opponentResources };

      const score = -this.negamax(
        nextDomain,
        depth - 1,
        -beta,
        -alpha,
        opponentPlayer,
        rootPlayer,
        topology,
        nextOpponentResources,
        nextPlayerResources,
        activeFrozenCoords,
        activeJumpCoords,
        ply + 1
      );

      if (this.isTimeExhausted) return 0;

      if (score > maxScore) {
        maxScore = score;
        bestAction = action;
      }
      if (score > alpha) {
        alpha = score;
      }
      if (alpha >= beta) {
        // Beta cutoff
        break;
      }
    }

    // Store in Transposition Table
    const flag = maxScore <= alpha ? 'UPPERBOUND' : maxScore >= beta ? 'LOWERBOUND' : 'EXACT';
    this.tt.set(ttKey, {
      key: ttKey,
      depth,
      flag,
      score: maxScore,
      bestAction,
    });

    return maxScore;
  }

  /**
   * Quiescence search to avoid the horizon effect on tactical captures.
   */
  private quiescence(
    domain: IDomainState,
    alpha: number,
    beta: number,
    activePlayer: PlayerId,
    topology: ITopology,
    playerResources: SpellResources,
    opponentResources: SpellResources,
    activeFrozenCoords: readonly string[],
    activeJumpCoords: readonly string[],
    ply: number
  ): number {
    this.nodesCount++;

    const standPat = SpellChessPositionEvaluator.evaluate(
      domain,
      activePlayer,
      topology,
      playerResources,
      opponentResources,
      activeFrozenCoords,
      activeJumpCoords,
      ply
    );

    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    // In quiescence, only examine non-spell tactical captures
    const captureMoves = SpellChessMoveGenerator.generateTurnActions(
      domain,
      activePlayer,
      topology,
      { ...playerResources, freezeRemaining: 0, jumpRemaining: 0 }, // non-spell only in quiescence
      activeFrozenCoords,
      activeJumpCoords
    ).filter((a) => a.move.isCapture);

    const opponentPlayer: PlayerId = activePlayer === 'P1' ? 'P2' : 'P1';

    for (const action of captureMoves) {
      const nextDomain = this.simulateTurnAction(domain, action, activePlayer, topology);
      const score = -this.quiescence(
        nextDomain,
        -beta,
        -alpha,
        opponentPlayer,
        topology,
        opponentResources,
        playerResources,
        activeFrozenCoords,
        activeJumpCoords,
        ply + 1
      );

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  }

  /**
   * Simulates a full turn action on an isolated clone of domain state.
   */
  private simulateTurnAction(
    domain: IDomainState,
    action: SpellChessTurnAction,
    actingPlayer: PlayerId,
    topology: ITopology
  ): IDomainState {
    // 1. Apply Spell
    const stateWithSpell = SpellChessMoveGenerator.cloneAndApplySpell(domain, action.spell, actingPlayer);

    // 2. Execute Move
    const cmd = new MovePieceCommand(
      action.move.pieceId as EntityId,
      action.move.from as CoordinateKey,
      action.move.to as CoordinateKey,
      actingPlayer,
      undefined,
      true, // advance turn
      false, // bypass standard check restriction (royal capture valid)
      action.move.promotion,
      topology
    );

    const clonedEntities: Record<string, IPieceEntity> = {};
    for (const [k, v] of Object.entries(stateWithSpell.boardEntities)) {
      if (v) {
        clonedEntities[k] = { ...v, metadata: { ...(v.metadata ?? {}) } } as IPieceEntity;
      }
    }
    const draft = {
      ...stateWithSpell,
      activePlayer: actingPlayer,
      boardEntities: clonedEntities,
      occupancy: { ...stateWithSpell.occupancy },
    };

    try {
      cmd.execute(draft);
    } catch {
      // Fallback manual displacement if command rejected in simulated sandbox
      const occupantId = draft.occupancy[action.move.to as CoordinateKey];
      if (occupantId) {
        const victim = draft.boardEntities[occupantId];
        if (victim && victim.type === 'PIECE') {
          draft.boardEntities[occupantId] = { ...(victim as IPieceEntity), isCaptured: true };
        }
      }
      delete draft.occupancy[action.move.from as CoordinateKey];
      draft.occupancy[action.move.to as CoordinateKey] = action.move.pieceId as EntityId;
      const movedEntity = draft.boardEntities[action.move.pieceId as EntityId];
      if (movedEntity && movedEntity.type === 'PIECE') {
        draft.boardEntities[action.move.pieceId as EntityId] = {
          ...movedEntity,
          position: action.move.to as CoordinateKey,
          hasMoved: true,
        };
      }
    }

    draft.activePlayer = actingPlayer === 'P1' ? 'P2' : 'P1';
    return draft;
  }

  /**
   * Updates spell resources after a turn.
   */
  private updateResourcesAfterTurn(
    res: SpellResources,
    spell: SpellAction
  ): SpellResources {
    let freezeRemaining = res.freezeRemaining;
    let jumpRemaining = res.jumpRemaining;
    let freezeCooldown = Math.max(0, res.freezeCooldown - 1);
    let jumpCooldown = Math.max(0, res.jumpCooldown - 1);

    if (spell.type === 'FREEZE') {
      freezeRemaining = Math.max(0, freezeRemaining - 1);
      freezeCooldown = 3;
    } else if (spell.type === 'JUMP') {
      jumpRemaining = Math.max(0, jumpRemaining - 1);
      jumpCooldown = 3;
    }

    return {
      freezeRemaining,
      jumpRemaining,
      freezeCooldown,
      jumpCooldown,
    };
  }

  private checkTimeCutoff(): boolean {
    if (this.isTimeExhausted) return true;
    if (this.nodesCount % 64 === 0) {
      if (performance.now() - this.startTime >= this.timeBudgetMs) {
        this.isTimeExhausted = true;
        return true;
      }
    }
    return false;
  }
}

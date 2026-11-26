/**
 * ChessInReact - Universal AI Worker Pool & Strategy Router (Spec 15 § 4, § 5, RF-15-08, RNF-15-02)
 *
 * Routes bot move requests to the specialized AI strategy:
 * - 9 pluggable search families.
 * - Dedicated Worker for official/custom Spell Chess N5 in browsers.
 * - Identified fallback with composite king-safety inspection for Spell Chess.
 */

import {
  AIEngineStrategyId,
  IAIDecisionRequest,
  IAIDecisionResponse,
  IUniversalAIStrategy,
} from './interfaces/IUniversalAIEngine';
import { SpellChessSearch } from './strategies/spell/SpellChessSearch';
import { PlayerId } from '../../core/coordinates';
import { OfficialSpellRules } from '../../engine/variants/spells/OfficialSpellRules';
import { MaxNMultiplayerStrategy } from './strategies/MaxNMultiplayerStrategy';
import { ISMCTSFogOfWarStrategy } from './strategies/ISMCTSFogOfWarStrategy';
import { DuckChessPlannerStrategy } from './strategies/DuckChessPlannerStrategy';
import { BughouseCoordinatedAgent } from './strategies/BughouseCoordinatedAgent';
import { SpellOptimizationStrategy } from './strategies/SpellOptimizationStrategy';
import { VariantSpecializedStrategy } from './strategies/VariantSpecializedStrategy';
import { AlphaBetaMinimaxStrategy } from './strategies/AlphaBetaMinimaxStrategy';
import { SimultaneousForecaster } from './strategies/SimultaneousForecaster';

export class AIWorkerPool {
  private static readonly strategies = new Map<AIEngineStrategyId, IUniversalAIStrategy>();
  private static initialized = false;

  private static ensureInitialized(): void {
    if (this.initialized) return;

    this.registerStrategy(new MaxNMultiplayerStrategy());
    this.registerStrategy(new ISMCTSFogOfWarStrategy());
    this.registerStrategy(new DuckChessPlannerStrategy());
    this.registerStrategy(new BughouseCoordinatedAgent());
    this.registerStrategy(new SpellOptimizationStrategy());
    this.registerStrategy(new VariantSpecializedStrategy());
    this.registerStrategy(new AlphaBetaMinimaxStrategy());
    this.registerStrategy(new SimultaneousForecaster());

    this.initialized = true;
  }

  public static registerStrategy(strategy: IUniversalAIStrategy): void {
    this.strategies.set(strategy.strategyId, strategy);
  }

  /**
   * Resolves the optimal strategy ID for any given variant or match configuration.
   */
  public static selectStrategyForVariant(variantId: string, participantCount: number = 2): AIEngineStrategyId {
    const v = variantId.toUpperCase();

    if (v.includes('DIPLOMACY')) {
      return 'CONCURRENT_ACTION_FORECASTER';
    }
    if (participantCount > 2) {
      return 'MAXN_MULTIPLAYER';
    }
    if (v.includes('FOG') || v.includes('BLINDFOLD')) {
      return 'ISMCTS_FOG_OF_WAR';
    }
    if (v.includes('DUCK')) {
      return 'JOINT_MOVE_DUCK_PLANNER';
    }
    if (v.includes('BUGHOUSE')) {
      return 'BUGHOUSE_PARTNER_AGENT';
    }
    if (v.includes('SPELL')) {
      return 'SPELL_OPTIMIZER';
    }
    if (
      v.includes('ATOMIC') ||
      v.includes('CRAZYHOUSE') ||
      v.includes('CAPABLANCA') ||
      v.includes('RACING') ||
      v.includes('ANTICHESS')
    ) {
      return 'VARIANT_SPECIALIZED';
    }

    return 'MINIMAX_ALPHA_BETA';
  }

  /**
   * Dispatches move calculation with emergency fallback safeguard.
   */
  public static async dispatchDecision(request: IAIDecisionRequest): Promise<IAIDecisionResponse> {
    this.ensureInitialized();
    // Async boundary; heavy N5 Spell Chess work is dispatched to a Worker below.
    await Promise.resolve();
    const participants = Number(request.specializedContext?.participantCount ?? 2);
    const strategyId = this.selectStrategyForVariant(request.variantId, participants);
    const strategy = this.strategies.get(strategyId);

    if (strategy) {
      try {
        if (strategyId === 'SPELL_OPTIMIZER' && request.difficultyLevel === 5 &&
          !request.variantId.toUpperCase().includes('EXPANDED') && request.domain && request.topology && typeof Worker !== 'undefined') {
          return await this.dispatchSpellWorker(request);
        }
        const calculationRequest = request.domain
          ? { ...request, domain: JSON.parse(JSON.stringify(request.domain)) }
          : request;
        const result = await strategy.decideMove(calculationRequest);
        if (strategyId === 'SPELL_OPTIMIZER' && !request.variantId.toUpperCase().includes('EXPANDED') && request.domain && request.topology) {
          const spell = result.secondaryAction?.type === 'CAST_SPELL'
            ? { type: result.secondaryAction.payload.spellType as 'FREEZE' | 'JUMP', targetSquare: String(result.secondaryAction.payload.targetCoord) }
            : { type: 'NONE' as const };
          OfficialSpellRules.simulate(request.domain, { spell, move: result.move }, request.topology);
        }
        return result;
      } catch (error) {
        const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error('[AIWorkerPool] Search failed', { matchId: request.matchId, strategyId, reason });
        return this.executeEmergencyFallback(request, reason);
      }
    }

    return this.executeEmergencyFallback(request);
  }

  private static dispatchSpellWorker(request: IAIDecisionRequest): Promise<IAIDecisionResponse> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./SpellDecisionWorker.ts', import.meta.url), { type: 'module' });
      const timer = setTimeout(() => {
        worker.terminate(); reject(new Error('Spell worker stalled beyond search deadline'));
      }, request.timeBudgetMs + 5000);
      const stop = () => { clearTimeout(timer); worker.terminate(); };
      worker.onmessage = (event: MessageEvent<{ result?: IAIDecisionResponse; error?: string }>) => {
        stop();
        if (event.data.error || !event.data.result) reject(new Error(event.data.error ?? 'Missing worker decision'));
        else resolve(event.data.result);
      };
      worker.onerror = (event) => { stop(); reject(new Error(event.message)); };
      const topology = request.topology as { width?: number; height?: number };
      try { worker.postMessage({ request: { ...request, topology: undefined }, width: topology.width ?? 8, height: topology.height ?? 8 }); }
      catch (error) { stop(); reject(error); }
    });
  }

  /**
   * Emergency selection. Spell Chess prioritizes an inspected legal turn over a latency claim.
   */
  public static executeEmergencyFallback(request: IAIDecisionRequest, failureReason = 'Strategy unavailable'): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para o fallback de emergência.');
    }

    if (request.variantId.toUpperCase().includes('SPELL') && !request.variantId.toUpperCase().includes('EXPANDED') && request.domain && request.topology) {
      const player = request.actingPlayer as PlayerId;
      const result = new SpellChessSearch().searchBestTurnAction(request.domain, player, request.topology,
        SpellChessSearch.resources(request.domain, player), SpellChessSearch.resources(request.domain, player === 'P1' ? 'P2' : 'P1'),
        Math.max(100, Math.min(request.timeBudgetMs, 300)), 0);
      const action = result.bestAction;
      return { move: action.move, secondaryAction: action.spell.type === 'NONE' ? undefined : {
        type: 'CAST_SPELL', payload: { spellType: action.spell.type, targetCoord: action.spell.targetSquare },
      }, evaluationCentipawns: result.evaluationCentipawns, depthReached: 0, nodesEvaluated: result.nodesEvaluated,
        elapsedMs: performance.now() - t0, strategyUsed: 'SPELL_OPTIMIZER', fallbackUsed: true, failureReason,
        spellTrace: { ...result.trace, fallbackUsed: true,
          candidates: result.trace.candidates?.map((d) => ({ ...d, usedFallback: true })) } };
    }
    // Conventional fallback only; Spell Chess above inspects real opponent replies.
    const chosen = moves.find((m) => m.isCapture) ?? moves[0];
    const elapsedMs = performance.now() - t0;

    return {
      move: {
        from: chosen.from,
        to: chosen.to,
        pieceId: chosen.pieceId,
        promotion: chosen.promotion,
      },
      evaluationCentipawns: 0,
      depthReached: 0,
      nodesEvaluated: 0,
      fallbackUsed: true,
      failureReason,
      elapsedMs,
      strategyUsed: 'MINIMAX_ALPHA_BETA',
    };
  }
}


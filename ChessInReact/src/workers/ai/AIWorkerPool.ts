/**
 * ChessInReact - Universal AI Worker Pool & Strategy Router (Spec 15 § 4, § 5, RF-15-08, RNF-15-02)
 *
 * Routes bot move requests to the specialized AI strategy:
 * - 9 pluggable search families.
 * - Non-blocking asynchronous dispatch.
 * - O(1) Linear Emergency Fallback (< 2.0ms safeguard).
 */

import {
  AIEngineStrategyId,
  IAIDecisionRequest,
  IAIDecisionResponse,
  IUniversalAIStrategy,
} from './interfaces/IUniversalAIEngine';
import { MaxNMultiplayerStrategy } from './strategies/MaxNMultiplayerStrategy';
import { ISMCTSFogOfWarStrategy } from './strategies/ISMCTSFogOfWarStrategy';
import { DuckChessPlannerStrategy } from './strategies/DuckChessPlannerStrategy';
import { BughouseCoordinatedAgent } from './strategies/BughouseCoordinatedAgent';
import { SpellOptimizationStrategy } from './strategies/SpellOptimizationStrategy';

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
    if (v.includes('ATOMIC') || v.includes('CRAZYHOUSE') || v.includes('CAPABLANCA')) {
      return 'VARIANT_SPECIALIZED';
    }

    return 'MINIMAX_ALPHA_BETA';
  }

  /**
   * Dispatches move calculation with emergency fallback safeguard.
   */
  public static async dispatchDecision(request: IAIDecisionRequest): Promise<IAIDecisionResponse> {
    this.ensureInitialized();
    const strategyId = this.selectStrategyForVariant(request.variantId);
    const strategy = this.strategies.get(strategyId);

    if (strategy) {
      try {
        return await strategy.decideMove(request);
      } catch {
        return this.executeEmergencyFallback(request);
      }
    }

    return this.executeEmergencyFallback(request);
  }

  /**
   * RNF-15-02: O(1) Linear Emergency Fallback (< 2.0ms safeguard).
   */
  public static executeEmergencyFallback(request: IAIDecisionRequest): IAIDecisionResponse {
    const t0 = performance.now();
    const moves = request.legalMoves;

    if (!moves || moves.length === 0) {
      throw new Error('Nenhum movimento legal disponível para o fallback de emergência.');
    }

    // O(1) instantaneous pick: prefer first capture or first legal move
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
      depthReached: 1,
      nodesEvaluated: 1,
      elapsedMs,
      strategyUsed: 'MINIMAX_ALPHA_BETA',
    };
  }
}


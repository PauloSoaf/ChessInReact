import { deserializeWorkerState } from '../../core/serialization/FlatArraySerializer';
import { createTopology, TopologyType } from '../../core/topology';
import { VariantRegistry } from '../../engine/rules/VariantRegistry';
import { IAIWorkerRequest, IAIWorkerResponse } from './interfaces/IAIEngineContracts';
import { AIEngine } from './AIEngine';
import { reconstructDomainState } from './utils/StateReconstructor';

export interface ICustomBotWorkerScope {
  onmessage: ((event: { data: IAIWorkerRequest }) => void) | null;
  postMessage(message: IAIWorkerResponse): void;
}

const aiEngine = new AIEngine();
let currentAbortSignal = { aborted: false };

/**
 * Pure handler processing AI worker requests.
 */
export function processAIWorkerRequest(req: IAIWorkerRequest): IAIWorkerResponse {
  try {
    switch (req.type) {
      case 'STOP_EVALUATION': {
        currentAbortSignal.aborted = true;
        return {
          taskId: req.taskId,
          success: true,
        };
      }

      case 'CALCULATE_BEST_MOVE':
      case 'START_CONTINUOUS_EVALUATION': {
        currentAbortSignal = { aborted: false };
        const payload = req.payload;

        if (!payload.stateBuffer || !payload.stringTable) {
          return {
            taskId: req.taskId,
            success: false,
            error: 'Missing stateBuffer or stringTable payload',
          };
        }

        const workerState = deserializeWorkerState(
          new Int32Array(payload.stateBuffer),
          payload.stringTable
        );
        const state = reconstructDomainState(workerState, payload.variantId ?? 'CHESS_STANDARD');

        // Derive topology
        const topType: TopologyType =
          payload.variantId?.includes('HEX') ? 'HEXAGONAL' : 'SQUARE';
        const topology = createTopology(topType);

        // Derive variant configuration
        const variantConfig = payload.variantId
          ? VariantRegistry.getVariant(payload.variantId)?.config
          : undefined;

        const bestMoveResult = aiEngine.calculateBestMove(
          state,
          topology,
          {
            difficulty: payload.difficulty,
            timeBudgetMs: payload.timeBudgetMs,
            depthLimit: payload.depthLimit,
            isMultiplayerFFA: payload.isMultiplayerFFA,
            playerCount: payload.playerCount,
            randomSeed: payload.randomSeed,
            isAssistanceMode: payload.isAssistanceMode,
            cancellationToken: currentAbortSignal,
          },
          variantConfig
        );

        return {
          taskId: req.taskId,
          success: true,
          bestMove: bestMoveResult.bestMove,
          evaluationScore: bestMoveResult.evaluationScore,
          depthReached: bestMoveResult.depthReached,
          nodesCalculated: bestMoveResult.nodesCalculated,
          calculationTimeMs: bestMoveResult.calculationTimeMs,
          pvLine: bestMoveResult.pvLine,
          hitRate: bestMoveResult.hitRate,
        };
      }

      default:
        return {
          taskId: req.taskId,
          success: false,
          error: `Unsupported AI request type: ${(req as { type: string }).type}`,
        };
    }
  } catch (err) {
    return {
      taskId: req.taskId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Attaches the message listener if running within a DedicatedWorkerGlobalScope.
 */
if (typeof self !== 'undefined' && 'postMessage' in self) {
  const scope = self as unknown as ICustomBotWorkerScope;
  scope.onmessage = (event) => {
    const response = processAIWorkerRequest(event.data);
    scope.postMessage(response);
  };
}

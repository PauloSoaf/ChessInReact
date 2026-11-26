import { SquareTopology } from '../../core/topology/SquareTopology';
import { IAIDecisionRequest } from './interfaces/IUniversalAIEngine';
import { SpellOptimizationStrategy } from './strategies/SpellOptimizationStrategy';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<{ request: Omit<IAIDecisionRequest, 'topology'>; width: number; height: number }>) => void) | null;
  postMessage: (value: unknown) => void;
};
scope.onmessage = (event) => {
  try {
    const { request, width, height } = event.data;
    const result = new SpellOptimizationStrategy().decideMove({ ...request, topology: new SquareTopology({ width, height }) });
    scope.postMessage({ result });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
  }
};

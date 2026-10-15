import { attachWorkerHandler, IWorkerScope } from './workerHandler';

/**
 * Browser Web Worker entrypoint. Instantiated by EngineBridge via
 * `new Worker(new URL('./engineWorker.ts', import.meta.url), { type: 'module' })`.
 * Registers the `message` receiver that `dummyWorker.ts` (a pure module) never did.
 */
attachWorkerHandler(self as unknown as IWorkerScope);

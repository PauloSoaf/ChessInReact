import { parentPort } from 'node:worker_threads';
import { processWorkerRequest } from './dummyWorker';
import { IWorkerRequest } from './types';

/**
 * worker_threads entrypoint. Bundled by NodeWorkerPort so that it runs the exact same
 * `processWorkerRequest` / `deserializeWorkerState` code as the browser worker.
 */
if (parentPort) {
  const port = parentPort;
  port.on('message', (req: IWorkerRequest) => {
    port.postMessage(processWorkerRequest(req));
  });
}

import { processWorkerRequest } from './dummyWorker';
import { IWorkerRequest, IWorkerResponse } from './types';

/**
 * Minimal structural view of a dedicated worker global scope (`self`).
 * Kept structural so it can be exercised in Node tests without DOM/WebWorker libs.
 */
export interface IWorkerScope {
  onmessage: ((event: { data: IWorkerRequest }) => void) | null;
  postMessage(message: IWorkerResponse): void;
}

/**
 * Registers the shared engine protocol handler on a worker scope.
 * Every transport (browser Worker, Node worker_threads) must delegate to
 * `processWorkerRequest`, so there is a single implementation of the binary protocol.
 */
export function attachWorkerHandler(scope: IWorkerScope): void {
  scope.onmessage = (event) => {
    scope.postMessage(processWorkerRequest(event.data));
  };
}

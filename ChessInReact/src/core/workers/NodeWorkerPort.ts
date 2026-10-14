import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { IWorkerPort, IWorkerRequest, IWorkerResponse } from './types';

/**
 * Real multi-threaded Worker port executing in a separate OS thread via Node.js worker_threads.
 * Supports native zero-copy Transferable buffer detachment (PATCH-08).
 */
export class NodeWorkerPort implements IWorkerPort {
  private worker: Worker;
  public onmessage: ((event: { data: IWorkerResponse }) => void) | null = null;
  public onerror: ((error: ErrorEvent | Error) => void) | null = null;

  constructor(scriptPath?: string) {
    const defaultPath = path.resolve(__dirname, 'workerThreadRunner.cjs');
    this.worker = new Worker(scriptPath ?? defaultPath);

    this.worker.on('message', (data: IWorkerResponse) => {
      if (this.onmessage) {
        this.onmessage({ data });
      }
    });

    this.worker.on('error', (err: Error) => {
      if (this.onerror) {
        this.onerror(err);
      }
    });
  }

  public postMessage(message: IWorkerRequest, transfer?: Transferable[]): void {
    this.worker.postMessage(
      message,
      transfer as unknown as Parameters<Worker['postMessage']>[1]
    );
  }

  public terminate(): void {
    this.worker.terminate();
  }
}

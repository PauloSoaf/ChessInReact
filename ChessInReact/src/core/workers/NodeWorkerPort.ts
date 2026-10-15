import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { buildSync } from 'esbuild';
import { IWorkerPort, IWorkerRequest, IWorkerResponse } from './types';

let cachedBundle: string | null = null;

/**
 * Bundles nodeWorkerEntry.ts (and the shared serializer it imports) into a single CJS script,
 * so the Node worker thread runs the same TypeScript protocol implementation as the browser.
 */
function getWorkerBundle(): string {
  if (cachedBundle === null) {
    const result = buildSync({
      entryPoints: [path.resolve(__dirname, 'nodeWorkerEntry.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node18',
      write: false,
    });
    cachedBundle = result.outputFiles[0].text;
  }
  return cachedBundle;
}

/**
 * Real multi-threaded Worker port executing in a separate OS thread via Node.js worker_threads.
 * Supports native zero-copy Transferable buffer detachment (PATCH-08).
 */
export class NodeWorkerPort implements IWorkerPort {
  private worker: Worker;
  public onmessage: ((event: { data: IWorkerResponse }) => void) | null = null;
  public onerror: ((error: ErrorEvent | Error) => void) | null = null;

  constructor() {
    this.worker = new Worker(getWorkerBundle(), { eval: true });

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
    void this.worker.terminate();
  }
}

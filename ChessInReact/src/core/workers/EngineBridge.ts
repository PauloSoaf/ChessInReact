import { serializeStateForWorker } from '../serialization/FlatArraySerializer';
import { IDomainState } from '../state/gameState';
import {
  IEngineMetadataResponse,
  IWorkerPort,
  IWorkerRequest,
  IWorkerResponse,
} from './types';

export interface IEngineBridgeOptions {
  readonly timeoutMs?: number;
  readonly workerPort?: IWorkerPort;
}

interface PendingPromiseRecord {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * EngineBridge manages asynchronous multithreaded communication with the AI/Worker engine.
 * Protects against memory leaks, handles timeouts, and transfers ArrayBuffers with zero-copy.
 */
export class EngineBridge {
  private worker: IWorkerPort;
  private messageCounter = 0;
  private pendingPromises = new Map<number, PendingPromiseRecord>();
  private readonly timeoutMs: number;
  private isDisposed = false;

  constructor(options?: IEngineBridgeOptions) {
    this.timeoutMs = options?.timeoutMs ?? 5000;

    if (options?.workerPort) {
      this.worker = options.workerPort;
    } else if (typeof Worker !== 'undefined') {
      // Browser WebWorker initialization
      this.worker = new Worker(new URL('./dummyWorker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as IWorkerPort;
    } else {
      throw new Error(
        'Worker is not available in current environment. Please supply a mock workerPort.'
      );
    }

    this.worker.onmessage = (event: { data: IWorkerResponse }) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (err: ErrorEvent | Error) => {
      this.handleWorkerError(err);
    };
  }

  private handleWorkerMessage(data: IWorkerResponse): void {
    if (!data || typeof data.id !== 'number') return;

    const pending = this.pendingPromises.get(data.id);
    if (!pending) {
      // Unknown or already timed out request ID - safely ignore
      return;
    }

    clearTimeout(pending.timeoutId);
    this.pendingPromises.delete(data.id);

    if (data.type === 'ERROR' || data.error) {
      pending.reject(new Error(data.error ?? 'Unknown worker error'));
    } else {
      pending.resolve(data.result);
    }
  }

  private handleWorkerError(err: ErrorEvent | Error): void {
    const errorMsg =
      err instanceof Error
        ? err.message
        : (err as ErrorEvent).message ?? 'Worker crashed';

    // Reject and clean up all pending promises
    for (const [id, pending] of this.pendingPromises.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(`Worker failure: ${errorMsg}`));
      this.pendingPromises.delete(id);
    }
  }

  public async ping(): Promise<string> {
    return this.sendRequest<string>('PING');
  }

  public async echoStateMetadata(state: IDomainState): Promise<IEngineMetadataResponse> {
    const flat = serializeStateForWorker(state);
    return this.sendRequest<IEngineMetadataResponse>(
      'ECHO_STATE_METADATA',
      { buffer: flat.buffer, activePlayer: state.activePlayer },
      [flat.buffer]
    );
  }

  public async validateSerialization(
    state: IDomainState
  ): Promise<{ valid: boolean; entityCount: number }> {
    const flat = serializeStateForWorker(state);
    return this.sendRequest<{ valid: boolean; entityCount: number }>(
      'VALIDATE_SERIALIZATION',
      { buffer: flat.buffer },
      [flat.buffer]
    );
  }

  public getPendingCount(): number {
    return this.pendingPromises.size;
  }

  private sendRequest<T>(
    type: IWorkerRequest['type'],
    payload?: IWorkerRequest['payload'],
    transfer?: Transferable[]
  ): Promise<T> {
    if (this.isDisposed) {
      return Promise.reject(new Error('EngineBridge is disposed'));
    }

    const id = ++this.messageCounter;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingPromises.has(id)) {
          this.pendingPromises.delete(id);
          reject(new Error(`Worker request timed out after ${this.timeoutMs}ms (ID: ${id})`));
        }
      }, this.timeoutMs);

      this.pendingPromises.set(id, {
        resolve: (val: unknown) => resolve(val as T),
        reject,
        timeoutId,
      });

      try {
        const req: IWorkerRequest = { id, type, payload };
        this.worker.postMessage(req, transfer);
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingPromises.delete(id);
        reject(err);
      }
    });
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const [id, pending] of this.pendingPromises.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('EngineBridge was disposed before response arrived.'));
      this.pendingPromises.delete(id);
    }

    if (this.worker.terminate) {
      this.worker.terminate();
    }
  }
}

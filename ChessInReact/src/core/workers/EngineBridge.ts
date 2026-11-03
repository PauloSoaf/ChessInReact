import { serializeStateForWorker } from '../serialization/FlatArraySerializer';
import { IDomainState } from '../state/gameState';
import { CoordinateKey } from '../coordinates';
import { TopologyType } from '../topology/types';
import { IChunkData } from '../procedural/types';
import { IPathResult } from '../topology/pathfinding/AStarPathfinder';
import {
  IDeserializedEchoResponse,
  IEngineMetadataResponse,
  IWorkerPort,
  IWorkerRequest,
  IWorkerResponse,
} from './types';
import { IBestMoveResult, AIDifficultyLevel } from '../../workers/ai/interfaces/IAIEngineContracts';
import { MockWorkerPort } from './dummyWorker';

export interface IEngineBridgeOptions {
  readonly timeoutMs?: number;
  readonly workerPort?: IWorkerPort;
  readonly workerFactory?: () => IWorkerPort;
}

interface PendingPromiseRecord {
  readonly generation: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * EngineBridge manages asynchronous multithreaded communication with the AI/Worker engine.
 * Protects against memory leaks, handles timeouts, and transfers ArrayBuffers with zero-copy.
 */
export class EngineBridge {
  private worker!: IWorkerPort;
  private messageCounter = 0;
  private currentGeneration = 0;
  private pendingPromises = new Map<number, PendingPromiseRecord>();
  private readonly timeoutMs: number;
  private isDisposed = false;
  private options?: IEngineBridgeOptions;

  constructor(options?: IEngineBridgeOptions) {
    this.options = options;
    this.timeoutMs = options?.timeoutMs ?? 5000;
    this.initWorker();
  }

  private initWorker(): void {
    if (this.isDisposed) return;

    if (this.options?.workerFactory) {
      this.worker = this.options.workerFactory();
    } else if (this.options?.workerPort) {
      const existing = this.options.workerPort as {
        isTerminated?: boolean;
        createFresh?: () => IWorkerPort;
        responseDelayMs?: number;
      };
      if (existing.isTerminated) {
        if (typeof existing.createFresh === 'function') {
          this.worker = existing.createFresh();
          (this.options as { workerPort: IWorkerPort }).workerPort = this.worker;
        } else if (existing instanceof MockWorkerPort) {
          this.worker = new MockWorkerPort(existing.responseDelayMs ?? 0);
          (this.options as { workerPort: IWorkerPort }).workerPort = this.worker;
        } else {
          throw new Error(
            'Worker is terminated and cannot be re-instantiated without a workerFactory.'
          );
        }
      } else {
        this.worker = this.options.workerPort;
      }
    } else if (typeof Worker !== 'undefined') {
      // Browser WebWorker initialization
      this.worker = new Worker(new URL('./engineWorker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as IWorkerPort;
    } else {
      throw new Error(
        'Worker is not available in current environment. Please supply a mock workerPort or workerFactory.'
      );
    }

    this.worker.onmessage = (event: { data: IWorkerResponse }) => {
      this.handleWorkerMessage(event.data);
    };

    this.worker.onerror = (err: ErrorEvent | Error) => {
      this.handleWorkerError(err);
    };
  }

  /**
   * Immediately aborts all active AI searches and resets worker execution (RNF-09, RNF-14).
   * Guarantees cancellation in < 10ms by terminating worker thread directly and spawning a fresh instance.
   */
  public cancelPendingSearches(): void {
    if (this.isDisposed) return;
    this.currentGeneration++;

    // 1. Reject all pending promises immediately with cancellation error
    for (const [id, pending] of this.pendingPromises.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('AI calculation aborted'));
      this.pendingPromises.delete(id);
    }

    // 2. Detach listeners so no events or errors from the dying worker leak into current state
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      if (this.worker.terminate) {
        try {
          this.worker.terminate();
        } catch (err) {
          console.warn('[EngineBridge] Worker terminate failed:', err);
        }
      }
    }

    // 3. Re-instantiate fresh worker (RNF-14)
    this.initWorker();
  }

  private handleWorkerMessage(data: IWorkerResponse): void {
    if (!data || typeof data.id !== 'number') return;

    const pending = this.pendingPromises.get(data.id);
    if (!pending) {
      // Unknown, cancelled or already timed out request ID - safely ignore
      return;
    }

    // Stale generation check
    if (pending.generation !== this.currentGeneration) {
      clearTimeout(pending.timeoutId);
      this.pendingPromises.delete(data.id);
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

    // Resilient auto-restart (RNF-14): recover in < 500ms
    if (!this.isDisposed) {
      try {
        if (this.worker) {
          this.worker.onmessage = null;
          this.worker.onerror = null;
          if (this.worker.terminate) {
            try {
              this.worker.terminate();
            } catch {
              // ignore
            }
          }
        }
        this.initWorker();
      } catch (restartErr) {
        console.warn('[EngineBridge] Auto-restart worker failed:', restartErr);
      }
    }
  }

  public async ping(): Promise<string> {
    return this.sendRequest<string>('PING');
  }

  public async echoStateMetadata(state: IDomainState): Promise<IEngineMetadataResponse> {
    const snapshot = serializeStateForWorker(state);
    return this.sendRequest<IEngineMetadataResponse>(
      'ECHO_STATE_METADATA',
      { buffer: snapshot.buffer.buffer, stringTable: snapshot.stringTable, activePlayer: state.activePlayer },
      [snapshot.buffer.buffer]
    );
  }

  public async validateSerialization(
    state: IDomainState
  ): Promise<{ valid: boolean; entityCount: number }> {
    const snapshot = serializeStateForWorker(state);
    return this.sendRequest<{ valid: boolean; entityCount: number }>(
      'VALIDATE_SERIALIZATION',
      { buffer: snapshot.buffer.buffer, stringTable: snapshot.stringTable },
      [snapshot.buffer.buffer]
    );
  }

  public async echoDeserializedEntities(
    state: IDomainState
  ): Promise<IDeserializedEchoResponse> {
    const snapshot = serializeStateForWorker(state);
    return this.sendRequest<IDeserializedEchoResponse>(
      'ECHO_DESERIALIZED_ENTITIES',
      { buffer: snapshot.buffer.buffer, stringTable: snapshot.stringTable, activePlayer: state.activePlayer },
      [snapshot.buffer.buffer]
    );
  }

  public async generateChunks(options: {
    topologyType?: TopologyType;
    seed: string;
    chunkCoords: { chunkX: number; chunkY: number }[];
    chunkSize?: number;
    topologyOptions?: {
      width?: number | null;
      height?: number | null;
      toroidal?: boolean;
      cellSize?: number;
      boundingRadius?: number | null;
      seed?: string;
      jitterFactor?: number;
      orientation?: 'POINTY_TOP' | 'FLAT_TOP';
      [key: string]: unknown;
    };
  }): Promise<IChunkData[]> {
    return this.sendRequest<IChunkData[]>('GENERATE_CHUNKS', options);
  }

  public async computePath(options: {
    topologyType?: TopologyType;
    /** World seed shared with generateChunks; mandatory for VORONOI_IRREGULAR. */
    seed?: string;
    start: CoordinateKey;
    goal: CoordinateKey;
    obstacleCoords?: CoordinateKey[];
    topologyOptions?: {
      width?: number | null;
      height?: number | null;
      toroidal?: boolean;
      cellSize?: number;
      boundingRadius?: number | null;
      seed?: string;
      jitterFactor?: number;
      orientation?: 'POINTY_TOP' | 'FLAT_TOP';
      [key: string]: unknown;
    };
  }): Promise<IPathResult> {
    return this.sendRequest<IPathResult>('COMPUTE_PATHFINDING', options);
  }

  public async calculateBestMove(
    state: IDomainState,
    options?: {
      difficulty?: AIDifficultyLevel;
      timeBudgetMs?: number;
      depthLimit?: number;
      isMultiplayerFFA?: boolean;
      playerCount?: number;
      randomSeed?: number;
      isAssistanceMode?: boolean;
      variantId?: string;
      topologyOptions?: Record<string, unknown>;
    }
  ): Promise<IBestMoveResult> {
    const snapshot = serializeStateForWorker(state);
    return this.sendRequest<IBestMoveResult>(
      'CALCULATE_BEST_MOVE',
      {
        buffer: snapshot.buffer.buffer,
        stringTable: snapshot.stringTable,
        metadata: snapshot.metadata,
        activePlayer: state.activePlayer,
        variantId: state.variantId ?? options?.variantId,
        ...options,
      },
      [snapshot.buffer.buffer]
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
    const generation = this.currentGeneration;

    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingPromises.has(id)) {
          this.pendingPromises.delete(id);
          reject(new Error(`Worker request timed out after ${this.timeoutMs}ms (ID: ${id})`));
        }
      }, this.timeoutMs);

      this.pendingPromises.set(id, {
        generation,
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

  public isDisposedBridge(): boolean {
    return this.isDisposed;
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    for (const [id, pending] of this.pendingPromises.entries()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('EngineBridge was disposed before response arrived.'));
      this.pendingPromises.delete(id);
    }

    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      if (this.worker.terminate) {
        try {
          this.worker.terminate();
        } catch {
          // ignore
        }
      }
    }
  }
}

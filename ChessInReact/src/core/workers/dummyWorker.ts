import { deserializeWorkerState } from '../serialization/FlatArraySerializer';
import { IWorkerPort, IWorkerRequest, IWorkerResponse } from './types';

/**
 * Handles incoming requests according to the Engine protocol.
 */
export function processWorkerRequest(req: IWorkerRequest): IWorkerResponse {
  try {
    switch (req.type) {
      case 'PING':
        return {
          id: req.id,
          type: 'PONG',
          result: 'PONG',
        };

      case 'ECHO_STATE_METADATA': {
        const buffer = req.payload?.buffer;
        const stringTable = req.payload?.stringTable;
        if (!buffer) {
          return { id: req.id, type: 'ERROR', error: 'Missing ArrayBuffer payload' };
        }
        const state = deserializeWorkerState(new Int32Array(buffer), stringTable);
        return {
          id: req.id,
          type: 'METADATA_RESULT',
          result: {
            entityCount: state.entityCount,
            activePlayer: state.activePlayer,
            turnNumber: state.turnNumber,
            schemaVersion: state.schemaVersion,
          },
        };
      }

      case 'VALIDATE_SERIALIZATION': {
        const buffer = req.payload?.buffer;
        const stringTable = req.payload?.stringTable;
        if (!buffer) {
          return { id: req.id, type: 'ERROR', error: 'Missing ArrayBuffer payload' };
        }
        const state = deserializeWorkerState(new Int32Array(buffer), stringTable);
        return {
          id: req.id,
          type: 'VALIDATION_RESULT',
          result: {
            valid: true,
            entityCount: state.entityCount,
          },
        };
      }

      default:
        return {
          id: req.id,
          type: 'ERROR',
          error: `Unknown worker request type: ${(req as { type: string }).type}`,
        };
    }
  } catch (err) {
    return {
      id: req.id,
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * In-memory MockWorkerPort simulating an asynchronous worker thread in Node/headless.
 */
export class MockWorkerPort implements IWorkerPort {
  public onmessage: ((event: { data: IWorkerResponse }) => void) | null = null;
  public onerror: ((error: ErrorEvent | Error) => void) | null = null;
  public isTerminated = false;
  private responseDelayMs: number;

  constructor(responseDelayMs = 0) {
    this.responseDelayMs = responseDelayMs;
  }

  public postMessage(message: IWorkerRequest): void {
    if (this.isTerminated) {
      if (this.onerror) {
        this.onerror(new Error('Worker is terminated'));
      }
      return;
    }

    setTimeout(() => {
      if (this.isTerminated) return;
      const response = processWorkerRequest(message);
      if (this.onmessage) {
        this.onmessage({ data: response });
      }
    }, this.responseDelayMs);
  }

  public terminate(): void {
    this.isTerminated = true;
  }
}

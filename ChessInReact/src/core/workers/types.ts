import { PlayerId } from '../coordinates/types';

/**
 * Worker message types supported by the EngineBridge protocol.
 */
export type WorkerRequestType =
  | 'PING'
  | 'ECHO_STATE_METADATA'
  | 'VALIDATE_SERIALIZATION'
  | 'CALCULATE_BEST_MOVE';

export type WorkerResponseType =
  | 'PONG'
  | 'METADATA_RESULT'
  | 'VALIDATION_RESULT'
  | 'BEST_MOVE_RESULT'
  | 'ERROR';

export interface IWorkerRequest {
  readonly id: number;
  readonly type: WorkerRequestType;
  readonly payload?: {
    readonly buffer?: ArrayBuffer;
    readonly depth?: number;
    readonly activePlayer?: PlayerId;
    readonly [key: string]: unknown;
  };
}

export interface IWorkerResponse {
  readonly id: number;
  readonly type: WorkerResponseType;
  readonly error?: string;
  readonly result?: unknown;
}

export interface IEngineMetadataResponse {
  readonly entityCount: number;
  readonly activePlayer: PlayerId;
  readonly turnNumber: number;
  readonly schemaVersion: number;
}

/**
 * Abstract Worker communication channel allowing testability in Node / WebWorker.
 */
export interface IWorkerPort {
  postMessage(message: IWorkerRequest, transfer?: Transferable[]): void;
  onmessage: ((event: { data: IWorkerResponse }) => void) | null;
  onerror: ((error: ErrorEvent | Error) => void) | null;
  terminate?(): void;
}

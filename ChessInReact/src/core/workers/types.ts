import { PlayerId } from '../coordinates/types';

/**
 * Worker message types supported by the EngineBridge protocol.
 */
export type WorkerRequestType =
  | 'PING'
  | 'ECHO_STATE_METADATA'
  | 'VALIDATE_SERIALIZATION'
  | 'ECHO_DESERIALIZED_ENTITIES'
  | 'CALCULATE_BEST_MOVE';

export type WorkerResponseType =
  | 'PONG'
  | 'METADATA_RESULT'
  | 'VALIDATION_RESULT'
  | 'DESERIALIZED_ENTITIES_RESULT'
  | 'BEST_MOVE_RESULT'
  | 'ERROR';

export interface IWorkerRequest {
  readonly id: number;
  readonly type: WorkerRequestType;
  readonly payload?: {
    readonly buffer?: ArrayBuffer;
    readonly stringTable?: readonly string[];
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

export interface IDeserializedEchoEntity {
  readonly id: string;
  readonly type: string;
  readonly ownerId: string;
  readonly position: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly isCaptured: boolean;
  readonly variantId?: string;
}

export interface IDeserializedEchoResponse {
  readonly entityCount: number;
  readonly activePlayer: PlayerId;
  readonly turnNumber: number;
  readonly schemaVersion: number;
  readonly entities: readonly IDeserializedEchoEntity[];
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

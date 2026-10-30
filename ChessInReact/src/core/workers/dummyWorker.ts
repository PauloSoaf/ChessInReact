import { deserializeWorkerState } from '../serialization/FlatArraySerializer';
import { IWorkerPort, IWorkerRequest, IWorkerResponse } from './types';
import { CoordinateKey } from '../coordinates';
import { createTopology, TopologyType } from '../topology';
import { ChunkManager } from '../procedural/ChunkManager';
import { findPathAStar } from '../topology/pathfinding/AStarPathfinder';
import { AIEngine } from '../../workers/ai/AIEngine';
import { AIDifficultyLevel } from '../../workers/ai/interfaces/IAIEngineContracts';
import { reconstructDomainState } from '../../workers/ai/utils/StateReconstructor';

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
        if (!stringTable) {
          return { id: req.id, type: 'ERROR', error: 'Missing stringTable payload' };
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
        if (!stringTable) {
          return { id: req.id, type: 'ERROR', error: 'Missing stringTable payload' };
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

      case 'ECHO_DESERIALIZED_ENTITIES': {
        const buffer = req.payload?.buffer;
        const stringTable = req.payload?.stringTable;
        if (!buffer) {
          return { id: req.id, type: 'ERROR', error: 'Missing ArrayBuffer payload' };
        }
        if (!stringTable) {
          return { id: req.id, type: 'ERROR', error: 'Missing stringTable payload' };
        }
        const state = deserializeWorkerState(new Int32Array(buffer), stringTable);
        return {
          id: req.id,
          type: 'DESERIALIZED_ENTITIES_RESULT',
          result: {
            entityCount: state.entityCount,
            activePlayer: state.activePlayer,
            turnNumber: state.turnNumber,
            schemaVersion: state.schemaVersion,
            entities: state.entities.map((e) => ({
              id: e.id,
              type: e.type,
              ownerId: e.ownerId,
              kind: e.kind,
              x: e.x,
              y: e.y,
              z: e.z,
              position: e.kind === 'HEX_CUBIC' ? `${e.x},${e.y},${e.z}` : `${e.x},${e.y}`,
              isCaptured: e.isCaptured,
              variantId: 'variantId' in e ? (e as { variantId?: string }).variantId : undefined,
            })),
          },
        };
      }

      case 'GENERATE_CHUNKS': {
        const payload = req.payload as {
          topologyType?: TopologyType;
          seed: string;
          chunkCoords: { chunkX: number; chunkY: number }[];
          chunkSize?: number;
          topologyOptions?: Record<string, unknown>;
        };
        const topType = payload.topologyType ?? 'HEXAGONAL';
        // Shared typed topology factory supporting VORONOI_IRREGULAR (PATCH-13).
        // The world seed is authoritative: a conflicting topologyOptions.seed is rejected.
        const topology = createTopology(topType, payload.topologyOptions, {
          seed: payload.seed,
          requireSeed: true,
        });

        const chunkManager = new ChunkManager(topology, {
          seed: payload.seed,
          chunkSize: payload.chunkSize ?? 16,
        });

        const chunks = payload.chunkCoords.map((c) => chunkManager.getOrGenerateChunk(c));
        return {
          id: req.id,
          type: 'GENERATE_CHUNKS_RESULT',
          result: chunks,
        };
      }

      case 'COMPUTE_PATHFINDING': {
        const payload = req.payload as {
          topologyType?: TopologyType;
          /** World seed shared with GENERATE_CHUNKS (mandatory for seed-dependent topologies). */
          seed?: string;
          start: CoordinateKey;
          goal: CoordinateKey;
          obstacleCoords?: CoordinateKey[];
          topologyOptions?: Record<string, unknown>;
        };
        const topType = payload.topologyType ?? 'HEXAGONAL';
        // Same seed contract as generation: Voronoi pathfinding can never run on a default/other seed.
        const topology = createTopology(topType, payload.topologyOptions, {
          seed: payload.seed,
          requireSeed: true,
        });

        const blocked = new Set(payload.obstacleCoords || []);
        const pathResult = findPathAStar(topology, payload.start, payload.goal, {
          isWalkable: (coord) => !blocked.has(coord),
        });

        return {
          id: req.id,
          type: 'PATHFINDING_RESULT',
          result: pathResult,
        };
      }

      case 'CALCULATE_BEST_MOVE': {
        const buffer = req.payload?.buffer;
        const stringTable = req.payload?.stringTable;
        if (!buffer || !stringTable) {
          return { id: req.id, type: 'ERROR', error: 'Missing buffer or stringTable payload' };
        }
        const workerState = deserializeWorkerState(new Int32Array(buffer), stringTable);
        const state = reconstructDomainState(
          workerState,
          (req.payload?.variantId as string | undefined) ?? 'CHESS_STANDARD'
        );
        const topType = (req.payload?.variantId as string | undefined)?.includes('HEX')
          ? 'HEXAGONAL'
          : 'SQUARE';
        const topology = createTopology(topType);
        const ai = new AIEngine();
        const bestMoveResult = ai.calculateBestMove(state, topology, {
          difficulty: req.payload?.difficulty as AIDifficultyLevel,
          timeBudgetMs: req.payload?.timeBudgetMs as number,
          depthLimit: req.payload?.depthLimit as number,
          isMultiplayerFFA: req.payload?.isMultiplayerFFA as boolean,
          playerCount: req.payload?.playerCount as number,
          randomSeed: req.payload?.randomSeed as number,
          isAssistanceMode: req.payload?.isAssistanceMode as boolean,
          variantId: req.payload?.variantId as string,
        });

        return {
          id: req.id,
          type: 'BEST_MOVE_RESULT',
          result: bestMoveResult,
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

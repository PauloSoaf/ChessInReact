import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../coordinates';
import { IEntity, IObstacleEntity, ITerrainEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ITopology } from '../topology/types';
import { NoiseGenerator } from './NoiseGenerator';
import { IChunkCoordinate, IChunkData, IProceduralConfig, ITerrainCell } from './types';

export interface IChunkManagerOptions {
  readonly chunkSize?: number; // Macro-chunk size (default 16x16)
  readonly renderDistance?: number; // Ring distance in units (default 8)
  readonly viewRadiusChunks?: number; // Distance in macro-chunks (default 1)
  readonly maxChunksInMemory?: number; // Maximum loaded chunks before LRU eviction
  readonly unloadTimeoutMs?: number; // Default 30,000 ms (30s)
  readonly maxLoadedEntities?: number; // Default 15,000 (well below 20,000 cap)
}

export interface IChunkStreamingDelta {
  readonly newEntities: Record<EntityId, IEntity>;
  readonly unloadedEntityIds: EntityId[];
}

export class ChunkManager {
  public readonly chunkSize: number;
  public readonly renderDistance: number;
  public readonly viewRadiusChunks: number;
  public readonly maxChunksInMemory: number | null;
  public readonly unloadTimeoutMs: number;
  public readonly maxLoadedEntities: number;

  private topology: ITopology;
  private noiseGen: NoiseGenerator;
  private loadedChunks = new Map<string, IChunkData>();

  constructor(
    topology: ITopology,
    config?: Partial<IProceduralConfig>,
    options?: IChunkManagerOptions
  ) {
    const fullConfig: IProceduralConfig = {
      seed: config?.seed ?? 'chunk-default-seed',
      noiseOctaves: config?.noiseOctaves ?? 4,
      noisePersistence: config?.noisePersistence ?? 0.5,
      noiseScale: config?.noiseScale ?? 0.05,
      obstacleThreshold: config?.obstacleThreshold ?? 0.75,
      waterThreshold: config?.waterThreshold ?? 0.25,
      spawnRadius: config?.spawnRadius ?? 3,
      chunkSize: config?.chunkSize ?? options?.chunkSize ?? 16,
    };
    this.topology = topology;
    this.chunkSize = options?.chunkSize ?? fullConfig.chunkSize ?? 16;
    this.renderDistance = options?.renderDistance ?? 8;
    this.viewRadiusChunks = options?.viewRadiusChunks ?? (config as { viewRadiusChunks?: number })?.viewRadiusChunks ?? 1;
    this.maxChunksInMemory = options?.maxChunksInMemory ?? (config as { maxChunksInMemory?: number })?.maxChunksInMemory ?? null;
    this.unloadTimeoutMs = options?.unloadTimeoutMs ?? 30000;
    this.maxLoadedEntities = options?.maxLoadedEntities ?? 15000;
    this.noiseGen = new NoiseGenerator(fullConfig);
  }

  public getChunkId(chunkX: number, chunkY: number): string {
    return `chunk_${chunkX}_${chunkY}`;
  }

  /**
   * Resolves chunk coordinate for any given board coordinate.
   */
  public getChunkCoordinate(coord: CoordinateKey): IChunkCoordinate {
    const parts = coord.split(',').map((p) => parseInt(p, 10));
    const u = parts[0] ?? 0;
    const v = parts[1] ?? 0;

    const chunkX = Math.floor(u / this.chunkSize);
    const chunkY = Math.floor(v / this.chunkSize);
    return { chunkX, chunkY };
  }

  /**
   * Generates or retrieves a single chunk's cells deterministically.
   */
  public getOrGenerateChunk(chunkCoords: IChunkCoordinate): IChunkData {
    const chunkId = this.getChunkId(chunkCoords.chunkX, chunkCoords.chunkY);
    const existing = this.loadedChunks.get(chunkId);
    if (existing) {
      existing.lastAccessedTimestamp = Date.now();
      return existing;
    }

    const cells: Record<CoordinateKey, ITerrainCell> = {};
    const startU = chunkCoords.chunkX * this.chunkSize;
    const startV = chunkCoords.chunkY * this.chunkSize;

    for (let du = 0; du < this.chunkSize; du++) {
      for (let dv = 0; dv < this.chunkSize; dv++) {
        const u = startU + du;
        const v = startV + dv;

        let key: CoordinateKey;
        if (this.topology.type === 'HEXAGONAL') {
          key = asCoordinateKey(`${u},${v},${-u - v}`);
        } else {
          key = asCoordinateKey(`${u},${v}`);
        }

        if (this.topology.isValidCoordinate(key)) {
          cells[key] = this.noiseGen.generateCell(key, this.topology);
        }
      }
    }

    if (this.maxChunksInMemory !== null && this.loadedChunks.size >= this.maxChunksInMemory) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of this.loadedChunks.entries()) {
        if (v.lastAccessedTimestamp < oldestTime) {
          oldestTime = v.lastAccessedTimestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        this.loadedChunks.delete(oldestKey);
      }
    }

    const chunkData: IChunkData = {
      chunkId,
      coords: chunkCoords,
      cells,
      boundingRadius: Math.sqrt(2) * (this.chunkSize / 2),
      lastAccessedTimestamp: Date.now(),
    };

    this.loadedChunks.set(chunkId, chunkData);
    return chunkData;
  }

  public getChunkCoord(coord: CoordinateKey): IChunkCoordinate {
    return this.getChunkCoordinate(coord);
  }

  public hasChunk(chunkCoords: IChunkCoordinate): boolean {
    return this.loadedChunks.has(this.getChunkId(chunkCoords.chunkX, chunkCoords.chunkY));
  }

  public getCell(coord: CoordinateKey): ITerrainCell | null {
    const c = this.getChunkCoordinate(coord);
    const chunk = this.getOrGenerateChunk(c);
    return chunk.cells[coord] ?? null;
  }

  public getLoadedChunkCount(): number {
    return this.loadedChunks.size;
  }

  public getTotalLoadedCellCount(): number {
    let count = 0;
    for (const chunk of this.loadedChunks.values()) {
      count += Object.keys(chunk.cells).length;
    }
    return count;
  }

  public updateActiveChunks(activeCoords: CoordinateKey[]): {
    loadedChunks: IChunkData[];
    unloadedChunkIds: string[];
  } {
    const requiredChunkIds = new Set<string>();
    for (const coord of activeCoords) {
      const c = this.getChunkCoordinate(coord);
      for (let dx = -this.viewRadiusChunks; dx <= this.viewRadiusChunks; dx++) {
        for (let dy = -this.viewRadiusChunks; dy <= this.viewRadiusChunks; dy++) {
          requiredChunkIds.add(this.getChunkId(c.chunkX + dx, c.chunkY + dy));
        }
      }
    }

    const loadedChunks: IChunkData[] = [];
    for (const cid of requiredChunkIds) {
      const parts = cid.split('_');
      const cx = parseInt(parts[1], 10);
      const cy = parseInt(parts[2], 10);
      const chunk = this.getOrGenerateChunk({ chunkX: cx, chunkY: cy });
      loadedChunks.push(chunk);
    }

    const unloadedChunkIds: string[] = [];
    for (const cid of Array.from(this.loadedChunks.keys())) {
      if (!requiredChunkIds.has(cid)) {
        this.loadedChunks.delete(cid);
        unloadedChunkIds.push(cid);
      }
    }

    return { loadedChunks, unloadedChunkIds };
  }

  /**
   * Computes the set of chunk coordinates required to cover the render distance
   * around all active player pieces.
   */
  public getRequiredChunksForPieces(pieceCoords: readonly CoordinateKey[]): Set<string> {
    const requiredChunkIds = new Set<string>();
    const chunkRadius = Math.ceil(this.renderDistance / this.chunkSize);

    for (const pCoord of pieceCoords) {
      const centerChunk = this.getChunkCoordinate(pCoord);
      for (let dx = -chunkRadius; dx <= chunkRadius; dx++) {
        for (let dy = -chunkRadius; dy <= chunkRadius; dy++) {
          const cid = this.getChunkId(centerChunk.chunkX + dx, centerChunk.chunkY + dy);
          requiredChunkIds.add(cid);
        }
      }
    }

    // Always include the origin chunk (0, 0)
    requiredChunkIds.add(this.getChunkId(0, 0));
    return requiredChunkIds;
  }

  /**
   * Evaluates the current state, dynamically generates missing chunks around pieces,
   * unloads distant stale chunks, and returns an atomic delta for the state.
   */
  public updateStreaming(state: IDomainState): IChunkStreamingDelta {
    const activePieceCoords: CoordinateKey[] = [];
    const entityKeys = Object.keys(state.boardEntities) as EntityId[];

    for (const eid of entityKeys) {
      const ent = state.boardEntities[eid];
      if (ent && ent.type === 'PIECE' && !ent.isCaptured) {
        activePieceCoords.push(ent.position);
      }
    }

    const requiredChunkIds = this.getRequiredChunksForPieces(activePieceCoords);
    const newEntities: Record<EntityId, IEntity> = {};
    const now = Date.now();

    // 1. Generate missing required chunks
    for (const cid of requiredChunkIds) {
      const parts = cid.split('_');
      const cx = parseInt(parts[1], 10);
      const cy = parseInt(parts[2], 10);
      const chunk = this.getOrGenerateChunk({ chunkX: cx, chunkY: cy });
      chunk.lastAccessedTimestamp = now;

      // Extract entities for cells not yet in the domain state
      for (const [coord, cell] of Object.entries(chunk.cells)) {
        const cKey = coord as CoordinateKey;
        // If coordinate is not occupied or not registered as terrain
        if (!state.occupancy[cKey]) {
          const eid = asEntityId(`terr_${cell.biome.toLowerCase()}_${cKey.replace(/,/g, '_')}`);
          if (!state.boardEntities[eid]) {
            if (cell.biome === 'CHASM') {
              const obs: IObstacleEntity = {
                id: eid,
                type: 'OBSTACLE',
                destructible: false,
                position: cKey,
                metadata: { biome: 'CHASM', elevation: cell.elevation },
              };
              newEntities[eid] = obs;
            } else {
              const terr: ITerrainEntity = {
                id: eid,
                type: 'TERRAIN',
                variantId: cell.biome,
                position: cKey,
                elevation: cell.elevation,
                metadata: {
                  biome: cell.biome,
                  colorIndex: cell.colorIndex,
                  costMultiplier: cell.costMultiplier,
                },
              };
              newEntities[eid] = terr;
            }
          }
        }
      }
    }

    // 2. Garbage Collection: identify chunks eligible for unloading
    const unloadedEntityIds: EntityId[] = [];
    const totalEntitiesCount = Object.keys(state.boardEntities).length + Object.keys(newEntities).length;

    for (const [cid, chunk] of this.loadedChunks.entries()) {
      if (!requiredChunkIds.has(cid)) {
        const isStale = now - chunk.lastAccessedTimestamp > this.unloadTimeoutMs;
        const isOverMemoryLimit = totalEntitiesCount > this.maxLoadedEntities;

        if (isStale || isOverMemoryLimit) {
          // Verify no active piece is inside this chunk
          let hasActivePiece = false;
          for (const cellCoord of Object.keys(chunk.cells)) {
            const occupantId = state.occupancy[cellCoord as CoordinateKey];
            if (occupantId) {
              const occupant = state.boardEntities[occupantId];
              if (occupant && occupant.type === 'PIECE' && !occupant.isCaptured) {
                hasActivePiece = true;
                break;
              }
            }
          }

          if (!hasActivePiece) {
            // Unload this chunk
            for (const cellCoord of Object.keys(chunk.cells)) {
              const occupantId = state.occupancy[cellCoord as CoordinateKey];
              if (occupantId) {
                const ent = state.boardEntities[occupantId];
                if (ent && ent.type !== 'PIECE') {
                  unloadedEntityIds.push(occupantId);
                }
              }
            }
            this.loadedChunks.delete(cid);
          }
        }
      }
    }

    return {
      newEntities,
      unloadedEntityIds,
    };
  }

  public getLoadedChunksCount(): number {
    return this.loadedChunks.size;
  }

  public clear(): void {
    this.loadedChunks.clear();
  }
}

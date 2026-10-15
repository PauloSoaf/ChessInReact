import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../coordinates';
import { IEntity, IObstacleEntity, ITerrainEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ITopology } from '../topology/types';
import { NoiseGenerator } from './NoiseGenerator';
import { BiomeType, IChunkCoordinate, IChunkData, IPersistentTileModification, IProceduralConfig, ITerrainCell } from './types';

export interface IChunkManagerOptions {
  readonly chunkSize?: number; // Macro-chunk size (default 16x16)
  readonly renderDistance?: number; // Ring distance in units (default 8)
  readonly viewRadiusChunks?: number; // Distance in macro-chunks (default 1)
  readonly maxChunksInMemory?: number; // Maximum loaded chunks before LRU eviction (default 50)
  readonly unloadTimeoutMs?: number; // Default 30,000 ms (30s)
  readonly maxLoadedEntities?: number; // Default 15,000 (well below 20,000 cap)
  readonly persistentModifications?: Record<CoordinateKey, IPersistentTileModification>;
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
  private persistentModifications = new Map<CoordinateKey, IPersistentTileModification>();

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
    // Enforce default memory budget of 50 chunks (PATCH-16 Defeito B)
    this.maxChunksInMemory =
      options?.maxChunksInMemory !== undefined
        ? options.maxChunksInMemory
        : (config as { maxChunksInMemory?: number })?.maxChunksInMemory !== undefined
        ? (config as { maxChunksInMemory?: number }).maxChunksInMemory!
        : 50;
    this.unloadTimeoutMs = options?.unloadTimeoutMs ?? 30000;
    this.maxLoadedEntities = options?.maxLoadedEntities ?? 15000;
    this.noiseGen = new NoiseGenerator(fullConfig);

    if (options?.persistentModifications) {
      for (const [coord, mod] of Object.entries(options.persistentModifications)) {
        this.setPersistentModification(coord as CoordinateKey, mod);
      }
    }
  }

  public setPersistentModification(coord: CoordinateKey, mod: IPersistentTileModification): void {
    if (mod.elevation !== undefined) {
      if (!Number.isFinite(mod.elevation) || mod.elevation < 0 || mod.elevation > 3.0) {
        throw new Error(`Invalid elevation override: "${mod.elevation}". Must be a finite number between 0.0 and 3.0.`);
      }
    }
    const clonedMod: IPersistentTileModification = {
      ...(mod.biome !== undefined ? { biome: mod.biome } : {}),
      ...(mod.elevation !== undefined ? { elevation: mod.elevation } : {}),
      ...(mod.isObstacle !== undefined ? { isObstacle: Boolean(mod.isObstacle) } : {}),
      ...(mod.metadata !== undefined ? { metadata: { ...mod.metadata } } : {}),
    };
    this.persistentModifications.set(coord, clonedMod);

    const chunkCoords = this.getChunkCoordinate(coord);
    const chunkId = this.getChunkId(chunkCoords.chunkX, chunkCoords.chunkY);
    const loaded = this.loadedChunks.get(chunkId);
    if (loaded && loaded.cells[coord]) {
      loaded.cells[coord] = this.applyModification(loaded.cells[coord], clonedMod);
      loaded.isDirty = true;
    }
  }

  public getPersistentModifications(): Record<CoordinateKey, IPersistentTileModification> {
    const result: Record<CoordinateKey, IPersistentTileModification> = {};
    for (const [k, v] of this.persistentModifications.entries()) {
      result[k] = { ...v, metadata: v.metadata ? { ...v.metadata } : undefined };
    }
    return result;
  }

  private applyModification(baseCell: ITerrainCell, mod: IPersistentTileModification): ITerrainCell {
    let biome = baseCell.biome;
    let elevation = baseCell.elevation;
    let isObstacle = baseCell.isObstacle;
    let costMultiplier = baseCell.costMultiplier;

    if (mod.biome !== undefined) {
      biome = mod.biome as BiomeType;
      if (mod.isObstacle === undefined) {
        if (biome === 'WATER' || biome === 'CHASM' || biome === 'MOUNTAIN') {
          isObstacle = true;
          costMultiplier = 999.0;
        } else if (biome === 'FOREST') {
          isObstacle = false;
          costMultiplier = 1.5;
        } else {
          isObstacle = false;
          costMultiplier = 1.0;
        }
      }
    }

    if (mod.elevation !== undefined) {
      elevation = mod.elevation;
    }

    if (mod.isObstacle !== undefined) {
      isObstacle = mod.isObstacle;
      if (isObstacle) {
        costMultiplier = Math.max(costMultiplier, 999.0);
      } else if (costMultiplier >= 999.0) {
        costMultiplier = 1.0;
      }
    }

    return {
      ...baseCell,
      biome,
      elevation,
      isObstacle,
      costMultiplier,
    };
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
   * Overlays persistent procedural overrides (PATCH-12) over seed-generated base cells.
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
          let cell = this.noiseGen.generateCell(key, this.topology);
          const mod = this.persistentModifications.get(key);
          if (mod) {
            cell = this.applyModification(cell, mod);
          }
          cells[key] = cell;
        }
      }
    }

    // LRU eviction when memory budget is exceeded
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
    const activePieceChunkIds = new Set<string>();
    const entityKeys = Object.keys(state.boardEntities) as EntityId[];

    for (const eid of entityKeys) {
      const ent = state.boardEntities[eid];
      if (ent && ent.type === 'PIECE' && !ent.isCaptured) {
        activePieceCoords.push(ent.position);
        const cCoord = this.getChunkCoordinate(ent.position);
        activePieceChunkIds.add(this.getChunkId(cCoord.chunkX, cCoord.chunkY));
      }
    }

    const requiredChunkIds = this.getRequiredChunksForPieces(activePieceCoords);
    const newEntities: Record<EntityId, IEntity> = {};
    const now = Date.now();

    // Fast O(1) spatial presence lookup (PATCH-16 Defeito A)
    // Avoids repeated Object.values(state.boardEntities).some(...) inside cell loops
    const legacyTerrainSet: Set<CoordinateKey> | null = state.terrain
      ? null
      : new Set(
          Object.values(state.boardEntities)
            .filter((e) => e && (e.type === 'TERRAIN' || e.type === 'OBSTACLE'))
            .map((e) => e.position)
        );

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
        const hasExistingTerrain = state.terrain
          ? Boolean(state.terrain[cKey])
          : legacyTerrainSet!.has(cKey);

        const eid = asEntityId(`terr_${cell.biome.toLowerCase()}_${cKey.replace(/,/g, '_')}`);
        if (!hasExistingTerrain && !state.boardEntities[eid]) {
          if (cell.biome === 'CHASM') {
            const obs: IObstacleEntity = {
              id: eid,
              type: 'OBSTACLE',
              destructible: false,
              position: cKey,
              metadata: {
                biome: 'CHASM',
                elevation: cell.elevation,
                isObstacle: true,
                costMultiplier: 999.0,
              },
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
                isObstacle: cell.isObstacle,
                isWalkable: !cell.isObstacle,
              },
            };
            newEntities[eid] = terr;
          }
        }
      }
    }

    // 2. Garbage Collection: identify chunks eligible for unloading (PATCH-16 Defeito B)
    const unloadedEntityIds: EntityId[] = [];
    const totalEntitiesCount =
      Object.keys(state.boardEntities).length + Object.keys(newEntities).length;
    const originChunkId = this.getChunkId(0, 0);

    for (const [cid, chunk] of this.loadedChunks.entries()) {
      if (!requiredChunkIds.has(cid)) {
        const isStale = now - chunk.lastAccessedTimestamp > this.unloadTimeoutMs;
        const isOverEntityLimit = totalEntitiesCount > this.maxLoadedEntities;
        const isOverChunkBudget =
          this.maxChunksInMemory !== null && this.loadedChunks.size > this.maxChunksInMemory;

        if (isStale || isOverEntityLimit || isOverChunkBudget) {
          // Never unload chunks containing active pieces or the origin chunk
          const hasActivePiece = activePieceChunkIds.has(cid) || cid === originChunkId;

          if (!hasActivePiece) {
            // Unload non-piece entities belonging to this chunk
            for (const cellCoord of Object.keys(chunk.cells)) {
              const cKey = cellCoord as CoordinateKey;
              const terrainId = state.terrain?.[cKey];
              if (terrainId) {
                unloadedEntityIds.push(terrainId);
              }
              const occupantId = state.occupancy[cKey];
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

  /**
   * Synchronizes streaming chunk state transactionally with a gameStore instance.
   * Protects against stale asynchronous overwrites using the domain revision counter.
   */
  public syncWithStore(store: {
    getState: () => {
      domain: IDomainState;
      applyChunkStreamingDelta: (delta: IChunkStreamingDelta, revision?: number) => boolean;
    };
  }): { applied: boolean; delta: IChunkStreamingDelta } {
    const state = store.getState().domain;
    const revision = state.revision;
    const delta = this.updateStreaming(state);
    const applied = store.getState().applyChunkStreamingDelta(delta, revision);
    return { applied, delta };
  }

  public clear(): void {
    this.loadedChunks.clear();
  }
}

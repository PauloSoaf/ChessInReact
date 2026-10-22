import { asCoordinateKey, asEntityId, CoordinateKey, EntityId } from '../coordinates';
import { IEntity, IObstacleEntity, ITerrainEntity } from '../entities/types';
import { IDomainState } from '../state/gameState';
import { ITopology } from '../topology/types';
import { NoiseGenerator } from './NoiseGenerator';
import { clonePersistentMetadata, validatePersistentTileModification } from './persistentModification';
import {
  BiomeType,
  IChunkCoordinate,
  IChunkData,
  IChunkStreamingDelta,
  IChunkTerrainUpdate,
  IPersistentTileModification,
  IProceduralConfig,
  ITerrainCell,
} from './types';

export type { IChunkStreamingDelta, IChunkTerrainUpdate };

export interface IChunkManagerOptions {
  readonly chunkSize?: number; // Macro-chunk size (default 16x16)
  readonly renderDistance?: number; // Ring distance in units (default 8)
  readonly viewRadiusChunks?: number; // Distance in macro-chunks (default 1)
  readonly maxChunksInMemory?: number; // Maximum loaded chunks before LRU eviction (default 50)
  readonly unloadTimeoutMs?: number; // Default 30,000 ms (30s)
  readonly maxLoadedEntities?: number; // Default 15,000 (well below 20,000 cap)
  readonly persistentModifications?: Record<CoordinateKey, IPersistentTileModification>;
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

  /**
   * Chunks that must survive LRU eviction: those hosting active pieces plus the chunks required
   * by the streaming pass in progress. Refreshed on every updateStreaming() call.
   * The memory budget may therefore be exceeded only when this protected set is itself larger.
   */
  private protectedChunkIds = new Set<string>();

  /**
   * Chunks removed from the cache by LRU outside of updateStreaming(). Their already-streamed
   * entities must still be reported to the store as unloaded on the next streaming pass,
   * otherwise terrain entities accumulate in the domain while the cache stays within budget.
   */
  private pendingEvictedChunks = new Map<string, IChunkCoordinate>();

  /**
   * Coordinates whose persistent modification may not yet be reflected by the entities in the
   * store. Entries are dropped only once the store state is verified to match the cell.
   */
  private dirtyTerrainCoords = new Set<CoordinateKey>();

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
    validatePersistentTileModification(coord, mod);
    const clonedMod: IPersistentTileModification = {
      ...(mod.biome !== undefined ? { biome: mod.biome } : {}),
      ...(mod.elevation !== undefined ? { elevation: mod.elevation } : {}),
      ...(mod.isObstacle !== undefined ? { isObstacle: Boolean(mod.isObstacle) } : {}),
      ...(mod.metadata !== undefined
        ? { metadata: clonePersistentMetadata(mod.metadata, `persistentModification["${coord}"].metadata`) }
        : {}),
    };
    this.persistentModifications.set(coord, clonedMod);
    // Entities already streamed into the store must be refreshed on the next streaming pass.
    this.dirtyTerrainCoords.add(coord);

    const chunkCoords = this.getChunkCoordinate(coord);
    const chunkId = this.getChunkId(chunkCoords.chunkX, chunkCoords.chunkY);
    const loaded = this.loadedChunks.get(chunkId);
    if (loaded && loaded.cells[coord]) {
      // Re-derive from the pure seed cell so successive modifications replace (not stack on) each other.
      const base = this.noiseGen.generateCell(coord, this.topology);
      loaded.cells[coord] = this.applyModification(base, clonedMod);
      loaded.isDirty = true;
    }
  }

  public getPersistentModifications(): Record<CoordinateKey, IPersistentTileModification> {
    const result: Record<CoordinateKey, IPersistentTileModification> = {};
    for (const [k, v] of this.persistentModifications.entries()) {
      result[k] = {
        ...v,
        metadata: clonePersistentMetadata(v.metadata, `getPersistentModifications["${k}"].metadata`),
      };
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

    const baseMeta = clonePersistentMetadata(baseCell.metadata);
    const modMeta = clonePersistentMetadata(mod.metadata);
    const metadata =
      modMeta !== undefined
        ? { ...(baseMeta ?? {}), ...modMeta }
        : baseMeta;

    return {
      ...baseCell,
      biome,
      elevation,
      isObstacle,
      costMultiplier,
      ...(metadata !== undefined ? { metadata } : {}),
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
   * Enumerates every valid coordinate key belonging to a macro-chunk.
   */
  private getChunkCellKeys(chunkCoords: IChunkCoordinate): CoordinateKey[] {
    const keys: CoordinateKey[] = [];
    const startU = chunkCoords.chunkX * this.chunkSize;
    const startV = chunkCoords.chunkY * this.chunkSize;

    for (let du = 0; du < this.chunkSize; du++) {
      for (let dv = 0; dv < this.chunkSize; dv++) {
        const u = startU + du;
        const v = startV + dv;

        const key =
          this.topology.type === 'HEXAGONAL'
            ? asCoordinateKey(`${u},${v},${-u - v}`)
            : asCoordinateKey(`${u},${v}`);

        if (this.topology.isValidCoordinate(key)) {
          keys.push(key);
        }
      }
    }
    return keys;
  }

  /**
   * Removes the least-recently-used chunk that is NOT protected (no active piece, not part of the
   * streaming pass in progress). The eviction is recorded so the next streaming delta can unload
   * the corresponding entities from the store.
   * Returns false when every loaded chunk is protected (budget is then allowed to overflow).
   */
  private evictOldestUnprotectedChunk(): boolean {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [k, v] of this.loadedChunks.entries()) {
      if (this.protectedChunkIds.has(k)) continue;
      if (v.lastAccessedTimestamp < oldestTime) {
        oldestTime = v.lastAccessedTimestamp;
        oldestKey = k;
      }
    }

    if (oldestKey === null) return false;

    const evicted = this.loadedChunks.get(oldestKey)!;
    this.loadedChunks.delete(oldestKey);
    this.pendingEvictedChunks.set(oldestKey, evicted.coords);
    return true;
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
    for (const key of this.getChunkCellKeys(chunkCoords)) {
      let cell = this.noiseGen.generateCell(key, this.topology);
      const mod = this.persistentModifications.get(key);
      if (mod) {
        cell = this.applyModification(cell, mod);
      }
      cells[key] = cell;
    }

    // LRU eviction when memory budget is exceeded (never evicts protected chunks)
    if (this.maxChunksInMemory !== null && this.loadedChunks.size >= this.maxChunksInMemory) {
      this.evictOldestUnprotectedChunk();
    }

    const chunkData: IChunkData = {
      chunkId,
      coords: chunkCoords,
      cells,
      boundingRadius: Math.sqrt(2) * (this.chunkSize / 2),
      lastAccessedTimestamp: Date.now(),
    };

    this.loadedChunks.set(chunkId, chunkData);
    // A chunk that is back in the cache no longer needs to be reported as evicted.
    this.pendingEvictedChunks.delete(chunkId);
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
    const cell = chunk.cells[coord];
    if (!cell) return null;
    if (!cell.metadata) return cell;
    return {
      ...cell,
      metadata: clonePersistentMetadata(cell.metadata, `getCell["${coord}"].metadata`),
    };
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
   * Looks up the procedural terrain/obstacle entity currently representing a cell in the domain state.
   * O(1): terrain index first, then an obstacle (procedural CHASM) registered in occupancy.
   */
  private findExistingTerrainEntity(state: IDomainState, cKey: CoordinateKey): IEntity | undefined {
    const terrainId = state.terrain?.[cKey];
    if (terrainId) {
      const ent = state.boardEntities[terrainId];
      if (ent) return ent;
    }
    const occupantId = state.occupancy[cKey];
    if (occupantId) {
      const ent = state.boardEntities[occupantId];
      // Only procedurally generated obstacles carry a biome marker; gameplay obstacles are never touched.
      if (ent && ent.type === 'OBSTACLE' && ent.metadata?.biome !== undefined) return ent;
    }
    return undefined;
  }

  /**
   * Builds the domain entity that represents a generated cell.
   * A CHASM becomes an OBSTACLE (registered in occupancy) only when the coordinate is free.
   * When something already stands there (e.g. an active piece) it is represented as impassable
   * TERRAIN instead, so the occupancy index can never be hijacked by a procedural obstacle.
   */
  private buildCellEntity(cKey: CoordinateKey, cell: ITerrainCell, occupied: boolean): IEntity {
    const eid = asEntityId(`terr_${cell.biome.toLowerCase()}_${cKey.replace(/,/g, '_')}`);
    const custom = clonePersistentMetadata(cell.metadata) ?? {};

    if (cell.biome === 'CHASM' && !occupied) {
      const obs: IObstacleEntity = {
        id: eid,
        type: 'OBSTACLE',
        provenance: 'PROCEDURAL',
        destructible: false,
        position: cKey,
        metadata: {
          ...custom,
          biome: 'CHASM',
          elevation: cell.elevation,
          isObstacle: true,
          costMultiplier: 999.0,
        },
      };
      return obs;
    }

    const terr: ITerrainEntity = {
      id: eid,
      type: 'TERRAIN',
      provenance: 'PROCEDURAL',
      variantId: cell.biome,
      position: cKey,
      elevation: cell.elevation,
      metadata: {
        ...custom,
        biome: cell.biome,
        colorIndex: cell.colorIndex,
        costMultiplier: cell.costMultiplier,
        isObstacle: cell.isObstacle,
        isWalkable: !cell.isObstacle,
      },
    };
    return terr;
  }

  private static metadataEquals(
    a: Readonly<Record<string, unknown>> | undefined,
    b: Readonly<Record<string, unknown>> | undefined
  ): boolean {
    const ka = a ? Object.keys(a) : [];
    const kb = b ? Object.keys(b) : [];
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!b || !(k in b)) return false;
      if (JSON.stringify(a![k]) !== JSON.stringify(b[k])) return false;
    }
    return true;
  }

  private static entitiesEquivalent(a: IEntity, b: IEntity): boolean {
    if (a.type !== b.type || a.id !== b.id || a.position !== b.position) return false;
    if (a.type === 'TERRAIN' && b.type === 'TERRAIN') {
      if (a.variantId !== b.variantId || a.elevation !== b.elevation) return false;
    }
    return ChunkManager.metadataEquals(a.metadata, b.metadata);
  }

  /**
   * Evaluates the current state, dynamically generates missing chunks around pieces,
   * unloads distant stale chunks, refreshes terrain affected by persistent modifications,
   * and returns an atomic delta for the state.
   */
  public updateStreaming(state: IDomainState): IChunkStreamingDelta {
    const activePieceCoords: CoordinateKey[] = [];
    const activePieceChunkIds = new Set<string>();
    const occupantIds = state.occupancy ? Object.values(state.occupancy) : [];
    const candidateIds = occupantIds.length > 0 ? occupantIds : (Object.keys(state.boardEntities) as EntityId[]);

    for (const eid of candidateIds) {
      const ent = state.boardEntities[eid];
      if (ent && ent.type === 'PIECE' && !ent.isCaptured) {
        activePieceCoords.push(ent.position);
        const cCoord = this.getChunkCoordinate(ent.position);
        activePieceChunkIds.add(this.getChunkId(cCoord.chunkX, cCoord.chunkY));
      }
    }

    const requiredChunkIds = this.getRequiredChunksForPieces(activePieceCoords);
    const originChunkId = this.getChunkId(0, 0);
    const newEntities: Record<EntityId, IEntity> = {};
    const now = Date.now();

    // Chunks hosting active pieces and chunks needed by this very pass can never be LRU-evicted,
    // not even by getOrGenerateChunk() calls triggered below (PATCH-17).
    this.protectedChunkIds = new Set<string>([
      ...activePieceChunkIds,
      ...requiredChunkIds,
      originChunkId,
    ]);

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
          ? this.findExistingTerrainEntity(state, cKey) !== undefined
          : legacyTerrainSet!.has(cKey);
        if (hasExistingTerrain) continue;

        const entity = this.buildCellEntity(cKey, cell, state.occupancy[cKey] !== undefined);
        if (!state.boardEntities[entity.id]) {
          newEntities[entity.id] = entity;
        }
      }
    }

    // 2. Garbage Collection: evict chunks eligible for unloading (PATCH-16 Defeito B).
    //    Evicted chunks are queued; their entities are unloaded in step 3.
    const totalEntitiesCount =
      Object.keys(state.boardEntities).length + Object.keys(newEntities).length;

    for (const [cid, chunk] of Array.from(this.loadedChunks.entries())) {
      if (!requiredChunkIds.has(cid)) {
        const isStale = now - chunk.lastAccessedTimestamp > this.unloadTimeoutMs;
        const isOverEntityLimit = totalEntitiesCount > this.maxLoadedEntities;
        const isOverChunkBudget =
          this.maxChunksInMemory !== null && this.loadedChunks.size > this.maxChunksInMemory;

        if (isStale || isOverEntityLimit || isOverChunkBudget) {
          // Never unload chunks containing active pieces or the origin chunk
          const hasActivePiece = activePieceChunkIds.has(cid) || cid === originChunkId;

          if (!hasActivePiece) {
            this.loadedChunks.delete(cid);
            this.pendingEvictedChunks.set(cid, chunk.coords);
          }
        }
      }
    }

    // 3. Unload entities of every chunk that left the cache (GC above or LRU eviction elsewhere).
    //    Self-healing: an entry stays queued until the store no longer holds any of its entities,
    //    so a rejected (stale) delta is simply re-emitted on the next pass.
    const unloadIds = new Set<EntityId>();
    for (const [cid, coords] of Array.from(this.pendingEvictedChunks.entries())) {
      if (this.loadedChunks.has(cid) || activePieceChunkIds.has(cid) || cid === originChunkId) {
        this.pendingEvictedChunks.delete(cid);
        continue;
      }

      let remaining = false;
      for (const cKey of this.getChunkCellKeys(coords)) {
        const terrainId = state.terrain?.[cKey];
        if (terrainId && state.boardEntities[terrainId]) {
          unloadIds.add(terrainId);
          remaining = true;
        }
        const occupantId = state.occupancy[cKey];
        if (occupantId) {
          const ent = state.boardEntities[occupantId];
          if (ent && ent.type !== 'PIECE') {
            unloadIds.add(occupantId);
            remaining = true;
          }
        }
      }
      if (!remaining) {
        this.pendingEvictedChunks.delete(cid);
      }
    }

    // 4. Persistent modifications on cells whose entities are already loaded in the store.
    //    Compared against the real store state, so the check is idempotent and survives rejected deltas.
    const updatedTerrain: IChunkTerrainUpdate[] = [];
    for (const cKey of Array.from(this.dirtyTerrainCoords)) {
      const existing = this.findExistingTerrainEntity(state, cKey);
      if (!existing || unloadIds.has(existing.id)) {
        // Nothing loaded to refresh: fresh entities are always built from the current cell.
        this.dirtyTerrainCoords.delete(cKey);
        continue;
      }

      const cell = this.getCell(cKey);
      if (!cell) {
        this.dirtyTerrainCoords.delete(cKey);
        continue;
      }

      const occupantId = state.occupancy[cKey];
      const desired = this.buildCellEntity(
        cKey,
        cell,
        occupantId !== undefined && occupantId !== existing.id
      );
      if (ChunkManager.entitiesEquivalent(existing, desired)) {
        this.dirtyTerrainCoords.delete(cKey);
        continue;
      }
      updatedTerrain.push({ previousId: existing.id, entity: desired });
    }

    return {
      newEntities,
      unloadedEntityIds: Array.from(unloadIds),
      updatedTerrain,
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
    // Cached chunks are queued so their already-streamed entities get unloaded from the store
    // on the next pass (chunks that are still required are simply regenerated).
    for (const [cid, chunk] of this.loadedChunks.entries()) {
      this.pendingEvictedChunks.set(cid, chunk.coords);
    }
    this.loadedChunks.clear();
    this.protectedChunkIds.clear();
  }


}

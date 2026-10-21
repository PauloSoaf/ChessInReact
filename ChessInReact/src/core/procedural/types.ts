import { CoordinateKey, EntityId } from '../coordinates';
import { IEntity } from '../entities/types';
import { TopologyType } from '../topology/types';

export type BiomeType = 'PLAINS' | 'MOUNTAIN' | 'WATER' | 'FOREST' | 'CHASM';

/**
 * Closed list of biomes understood by the generator, the entity layer and the serializers.
 * Persistent modifications MUST use one of these values (validated at runtime).
 */
export const BIOME_TYPES: readonly BiomeType[] = ['PLAINS', 'MOUNTAIN', 'WATER', 'FOREST', 'CHASM'];

export function isBiomeType(value: unknown): value is BiomeType {
  return typeof value === 'string' && (BIOME_TYPES as readonly string[]).includes(value);
}

export interface IPersistentTileModification {
  readonly elevation?: number;
  readonly biome?: BiomeType;
  readonly isObstacle?: boolean;
  /**
   * Custom JSON-serializable metadata merged into the resulting terrain cell/entity.
   * Reserved keys (biome, colorIndex, costMultiplier, isObstacle, isWalkable, elevation) are rejected.
   */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ITerrainCell {
  readonly coord: CoordinateKey;
  readonly topology: TopologyType;
  readonly colorIndex: 0 | 1 | 2;
  readonly elevation: number; // Continuous 0.0 to 3.0
  readonly biome: BiomeType;
  readonly isObstacle: boolean; // Impassable by ground chess pieces
  readonly costMultiplier: number; // Movement cost multiplier for A*
  /** Custom metadata coming from persistent modifications (absent for pure seed-generated cells). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Replacement of an already-loaded terrain/obstacle entity (e.g. after a persistent modification).
 * `previousId` is removed (index entries included) and `entity` is registered atomically in its place.
 */
export interface IChunkTerrainUpdate {
  readonly previousId: EntityId;
  readonly entity: IEntity;
}

/**
 * Atomic streaming delta produced by ChunkManager and consumed by the game store.
 */
export interface IChunkStreamingDelta {
  readonly newEntities: Record<EntityId, IEntity>;
  readonly unloadedEntityIds: readonly EntityId[];
  readonly updatedTerrain?: readonly IChunkTerrainUpdate[];
}

export interface IChunkCoordinate {
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface IChunkData {
  readonly chunkId: string; // Formato: "chunk_X_Y"
  readonly coords: IChunkCoordinate;
  readonly cells: Record<CoordinateKey, ITerrainCell>;
  readonly boundingRadius: number;
  lastAccessedTimestamp: number;
  isDirty?: boolean;
}

export interface IProceduralConfig {
  readonly seed: string;
  readonly noiseOctaves?: number; // Default 2
  readonly noisePersistence?: number; // Default 0.5
  readonly noiseScale?: number; // Default 0.05
  readonly obstacleThreshold?: number; // Default 0.65
  readonly waterThreshold?: number; // Default -0.3
  readonly mountainThreshold?: number; // Default 0.5
  readonly spawnRadius?: number; // Default 4 (Flattened spawn area - Island Guarantee)
  readonly chunkSize?: number; // Default 16
  readonly viewRadiusChunks?: number;
  readonly maxChunksInMemory?: number;
}

import { CoordinateKey } from '../coordinates';
import { TopologyType } from '../topology/types';

export type BiomeType = 'PLAINS' | 'MOUNTAIN' | 'WATER' | 'FOREST' | 'CHASM';

export interface ITerrainCell {
  readonly coord: CoordinateKey;
  readonly topology: TopologyType;
  readonly colorIndex: 0 | 1 | 2;
  readonly elevation: number; // Continuous 0.0 to 3.0
  readonly biome: BiomeType;
  readonly isObstacle: boolean; // Impassable by ground chess pieces
  readonly costMultiplier: number; // Movement cost multiplier for A*
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

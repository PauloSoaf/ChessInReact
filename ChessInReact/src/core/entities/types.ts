import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';

export type EntityType = 'PIECE' | 'TERRAIN' | 'OBSTACLE';
export type EntityProvenance = 'PROCEDURAL' | 'GAMEPLAY';

/**
 * Base Entity contract.
 */
export interface IBaseEntity {
  readonly id: EntityId;
  readonly type: EntityType;
  readonly position: CoordinateKey;
  readonly provenance?: EntityProvenance;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Piece Entity (Chess piece, fairy piece, champion, etc.).
 */
export interface IPieceEntity extends IBaseEntity {
  readonly type: 'PIECE';
  readonly ownerId: PlayerId;
  readonly variantId: string; // e.g. "PAWN", "KNIGHT", "QUEEN", "AMAZON"
  readonly hasMoved: boolean;
  readonly isCaptured: boolean;
}

/**
 * Terrain Entity (Special hex tile, water, mountain, portal).
 */
export interface ITerrainEntity extends IBaseEntity {
  readonly type: 'TERRAIN';
  readonly variantId: string;
  readonly elevation?: number;
}

/**
 * Obstacle Entity (Destroyable pillar, wall, fog-generator).
 */
export interface IObstacleEntity extends IBaseEntity {
  readonly type: 'OBSTACLE';
  readonly destructible: boolean;
  readonly hp?: number;
}

/**
 * Discriminated union of all entities in the game.
 */
export type IEntity = IPieceEntity | ITerrainEntity | IObstacleEntity;

/**
 * Dual index spatial storage structure.
 */
export interface IEntityStorage {
  readonly entityById: Readonly<Record<EntityId, IEntity>>;
  readonly occupancyByCoordinate: Readonly<Record<CoordinateKey, EntityId>>;
}

/**
 * Single source of truth for entity provenance (shared by ChunkManager lookup/GC and the
 * Zustand streaming validators). Evaluation order is significant:
 *  1. PIECE is always GAMEPLAY, overriding any contradictory provenance/metadata marker.
 *  2. Explicit `provenance: 'GAMEPLAY'` is always GAMEPLAY, regardless of metadata (e.g. metadata.biome).
 *  3. Explicit `provenance: 'PROCEDURAL'` is PROCEDURAL (TERRAIN and OBSTACLE only; PIECE was handled in 1).
 *  4. Any other defined `provenance` value is unrecognized/ambiguous and is NOT procedural.
 *  5. TERRAIN without provenance is PROCEDURAL (legacy terrain policy, unchanged).
 *  6. OBSTACLE without provenance is GAMEPLAY unless there is positive evidence of procedural origin:
 *     the historical generator signature of a natural CHASM, i.e. `destructible === false` AND
 *     `metadata.biome === 'CHASM'` (pre-provenance `ChunkManager.buildCellEntity` contract).
 *     `destructible === false` alone is NOT evidence: walls and other gameplay obstacles can be indestructible.
 *     Entity ids/prefixes are never used as evidence.
 *
 * Rule of thumb: when origin is ambiguous the entity is preserved as GAMEPLAY and is never unloaded
 * or replaced by procedural streaming.
 */
export function isProceduralEntity(entity: IEntity): boolean {
  if (entity.type === 'PIECE') return false;
  if (entity.provenance === 'GAMEPLAY') return false;
  if (entity.provenance === 'PROCEDURAL') return true;
  if (entity.provenance !== undefined) return false;
  if (entity.type === 'TERRAIN') return true;
  if (entity.type === 'OBSTACLE') {
    return entity.destructible === false && entity.metadata?.biome === 'CHASM';
  }
  return false;
}


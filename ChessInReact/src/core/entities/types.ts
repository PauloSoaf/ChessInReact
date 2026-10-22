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
 * Distinguishes procedural generation/streaming entities from gameplay entities.
 * - PIECE is always GAMEPLAY.
 * - TERRAIN is always PROCEDURAL.
 * - OBSTACLE evaluates explicit provenance, falling back to PROCEDURAL only for
 *   CHASM indestructible obstacles with biome metadata, otherwise GAMEPLAY.
 */
export function isProceduralEntity(entity: IEntity): boolean {
  if (entity.provenance === 'PROCEDURAL') return true;
  if (entity.provenance === 'GAMEPLAY') return false;
  if (entity.type === 'TERRAIN') return true;
  if (entity.type === 'PIECE') return false;
  if (entity.type === 'OBSTACLE') {
    return entity.metadata?.biome === 'CHASM' && entity.destructible === false;
  }
  return false;
}


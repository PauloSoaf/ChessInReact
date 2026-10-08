import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from './types';

export interface InvariantValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * EntityManager manages game entities with bidirectional index consistency:
 * - entityById: Lookup by EntityId in expected O(1)
 * - occupancyByCoordinate: Spatial lookup by CoordinateKey in expected O(1)
 *
 * Invariant:
 * occupancyByCoordinate[coord] === id <=> entityById[id].position === coord
 */
export class EntityManager {
  private entityById: Map<EntityId, IEntity> = new Map();
  private occupancyByCoordinate: Map<CoordinateKey, EntityId> = new Map();

  constructor(initialEntities?: readonly IEntity[]) {
    if (initialEntities) {
      this.addEntities(initialEntities);
    }
  }

  /**
   * Clone or initialize from another storage snapshot.
   */
  public static fromSnapshot(snapshot: {
    entityById: Record<string, IEntity>;
    occupancyByCoordinate?: Record<string, string>;
  }): EntityManager {
    const manager = new EntityManager();
    for (const entity of Object.values(snapshot.entityById)) {
      manager.addEntity(entity);
    }
    return manager;
  }

  /**
   * Add a single entity, registering both by ID and coordinate occupancy.
   * Throws if entity with same ID exists or target coordinate is already occupied.
   */
  public addEntity(entity: IEntity): void {
    if (this.entityById.has(entity.id)) {
      throw new Error(`Entity already exists with ID: ${entity.id}`);
    }

    // Uncaptured pieces or other entities require coordinate occupancy
    const isCapturedPiece = entity.type === 'PIECE' && entity.isCaptured;
    if (!isCapturedPiece) {
      const occupant = this.occupancyByCoordinate.get(entity.position);
      if (occupant) {
        throw new Error(
          `Coordinate ${entity.position} is already occupied by entity ${occupant}. Cannot add ${entity.id}`
        );
      }
      this.occupancyByCoordinate.set(entity.position, entity.id);
    }

    this.entityById.set(entity.id, entity);
  }

  /**
   * Batch add entities atomically. If any fails, rollback added ones.
   */
  public addEntities(entities: readonly IEntity[]): void {
    const added: EntityId[] = [];
    try {
      for (const entity of entities) {
        this.addEntity(entity);
        added.push(entity.id);
      }
    } catch (err) {
      // Rollback on failure
      for (const id of added) {
        this.removeEntity(id);
      }
      throw err;
    }
  }

  /**
   * Get entity by ID.
   */
  public getEntity(id: EntityId): IEntity | undefined {
    return this.entityById.get(id);
  }

  /**
   * Get entity currently occupying a specific coordinate.
   */
  public getOccupant(coord: CoordinateKey): IEntity | undefined {
    const entityId = this.occupancyByCoordinate.get(coord);
    if (!entityId) return undefined;
    return this.entityById.get(entityId);
  }

  /**
   * Atomically move an entity to a new coordinate.
   * Updates entity.position, removes old occupancy, sets new occupancy.
   */
  public moveEntity(id: EntityId, to: CoordinateKey): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot move non-existent entity with ID: ${id}`);
    }

    if (entity.type === 'PIECE' && entity.isCaptured) {
      throw new Error(`Cannot move captured piece with ID: ${id}`);
    }

    if (entity.position === to) {
      return; // No-op if target position is identical
    }

    const occupantId = this.occupancyByCoordinate.get(to);
    if (occupantId && occupantId !== id) {
      throw new Error(`Target coordinate ${to} is already occupied by entity: ${occupantId}`);
    }

    // Atomic update
    this.occupancyByCoordinate.delete(entity.position);
    this.occupancyByCoordinate.set(to, id);

    const updatedEntity = {
      ...entity,
      position: to,
      ...(entity.type === 'PIECE' ? { hasMoved: true } : {}),
    } as IEntity;

    this.entityById.set(id, updatedEntity);
  }

  /**
   * Updates properties of an existing entity.
   */
  public updateEntity(id: EntityId, patch: Partial<IEntity>): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot update non-existent entity with ID: ${id}`);
    }

    if (patch.position && patch.position !== entity.position) {
      this.moveEntity(id, patch.position);
      // Re-fetch updated entity
      const fresh = this.entityById.get(id)!;
      const combined = { ...fresh, ...patch, position: patch.position } as IEntity;
      this.entityById.set(id, combined);
    } else {
      const combined = { ...entity, ...patch } as IEntity;
      this.entityById.set(id, combined);
    }
  }

  /**
   * Mark piece as captured: sets isCaptured to true and removes from spatial occupancy.
   */
  public capturePiece(id: EntityId): void {
    const entity = this.entityById.get(id);
    if (!entity || entity.type !== 'PIECE') {
      throw new Error(`Cannot capture non-piece entity: ${id}`);
    }

    this.occupancyByCoordinate.delete(entity.position);
    const updatedPiece: IPieceEntity = {
      ...entity,
      isCaptured: true,
    };
    this.entityById.set(id, updatedPiece);
  }

  /**
   * Remove entity completely from both indices.
   */
  public removeEntity(id: EntityId): IEntity | undefined {
    const entity = this.entityById.get(id);
    if (!entity) return undefined;

    if (this.occupancyByCoordinate.get(entity.position) === id) {
      this.occupancyByCoordinate.delete(entity.position);
    }
    this.entityById.delete(id);
    return entity;
  }

  /**
   * Query all entities of a specific type.
   */
  public getEntitiesByType<T extends IEntity['type']>(
    type: T
  ): readonly Extract<IEntity, { type: T }>[] {
    const result: Extract<IEntity, { type: T }>[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === type) {
        result.push(entity as Extract<IEntity, { type: T }>);
      }
    }
    return result;
  }

  /**
   * Query all piece entities owned by a specific player.
   */
  public getEntitiesByOwner(ownerId: PlayerId): readonly IPieceEntity[] {
    const result: IPieceEntity[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === 'PIECE' && entity.ownerId === ownerId) {
        result.push(entity);
      }
    }
    return result;
  }

  /**
   * Get all active (non-captured) pieces.
   */
  public getActivePieces(): readonly IPieceEntity[] {
    const result: IPieceEntity[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === 'PIECE' && !entity.isCaptured) {
        result.push(entity);
      }
    }
    return result;
  }

  /**
   * Total entity count.
   */
  public count(): number {
    return this.entityById.size;
  }

  /**
   * Total occupied coordinate count.
   */
  public occupancyCount(): number {
    return this.occupancyByCoordinate.size;
  }

  /**
   * Clear all entities.
   */
  public clear(): void {
    this.entityById.clear;
    this.entityById.clear();
    this.occupancyByCoordinate.clear();
  }

  /**
   * Validate dual-index invariants:
   * 1. Every occupant in occupancyByCoordinate must exist in entityById.
   * 2. The occupant's position must match the coordinate key.
   * 3. Every non-captured entity in entityById must be recorded in occupancyByCoordinate.
   */
  public validateInvariants(): InvariantValidationResult {
    const errors: string[] = [];

    // Check occupancy -> entity direction
    for (const [coord, id] of this.occupancyByCoordinate.entries()) {
      const entity = this.entityById.get(id);
      if (!entity) {
        errors.push(`Orphan occupancy index: coordinate ${coord} references missing entity ${id}`);
        continue;
      }
      if (entity.position !== coord) {
        errors.push(
          `Position mismatch: occupancy has ${coord} -> ${id}, but entity position is ${entity.position}`
        );
      }
      if (entity.type === 'PIECE' && entity.isCaptured) {
        errors.push(`Captured piece ${id} is erroneously present in occupancy at ${coord}`);
      }
    }

    // Check entity -> occupancy direction
    for (const [id, entity] of this.entityById.entries()) {
      const isCaptured = entity.type === 'PIECE' && entity.isCaptured;
      if (!isCaptured) {
        const occupant = this.occupancyByCoordinate.get(entity.position);
        if (occupant !== id) {
          errors.push(
            `Missing or mismatched spatial index for active entity ${id} at ${entity.position}. Occupant is: ${occupant}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export plain record snapshot.
   */
  public toSnapshot(): {
    entityById: Record<EntityId, IEntity>;
    occupancyByCoordinate: Record<CoordinateKey, EntityId>;
  } {
    const entityById: Record<EntityId, IEntity> = {} as Record<EntityId, IEntity>;
    for (const [k, v] of this.entityById.entries()) {
      entityById[k] = v;
    }
    const occupancyByCoordinate: Record<CoordinateKey, EntityId> = {} as Record<CoordinateKey, EntityId>;
    for (const [k, v] of this.occupancyByCoordinate.entries()) {
      occupancyByCoordinate[k] = v;
    }
    return { entityById, occupancyByCoordinate };
  }
}

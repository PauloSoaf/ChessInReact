import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity } from './types';

export interface InvariantValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Restricted patch type for safe entity updates (AUDIT-01 & FASE 3).
 * Strictly forbids structural mutations (id, position, type, isCaptured).
 * Position changes MUST use moveEntity(id, newCoord).
 * Capture changes MUST use captureEntity(id) or restoreEntity(id, coord).
 */
export interface EntityUpdatePatch {
  readonly hasMoved?: boolean;
  readonly variantId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly elevation?: number;
  readonly destructible?: boolean;
  readonly hp?: number;
  readonly id?: never;
  readonly type?: never;
  readonly position?: never;
  readonly isCaptured?: never;
}

/**
 * Clones an entity object defensively to prevent external mutations
 * from compromising internal store and spatial indices (AUDIT-01 & FASE 2).
 */
function cloneEntity<T extends IEntity>(entity: T): T {
  return {
    ...entity,
    metadata: entity.metadata ? JSON.parse(JSON.stringify(entity.metadata)) : undefined,
  };
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
   * Defensive: stores a cloned copy to prevent external mutation leaks.
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

    this.entityById.set(entity.id, cloneEntity(entity));
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
   * Get entity by ID (returns defensive copy to protect internal integrity).
   */
  public getEntity(id: EntityId): IEntity | undefined {
    const entity = this.entityById.get(id);
    return entity ? cloneEntity(entity) : undefined;
  }

  /**
   * Get entity currently occupying a specific coordinate (returns defensive copy).
   */
  public getOccupant(coord: CoordinateKey): IEntity | undefined {
    const entityId = this.occupancyByCoordinate.get(coord);
    if (!entityId) return undefined;
    const entity = this.entityById.get(entityId);
    return entity ? cloneEntity(entity) : undefined;
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
   * Updates non-structural properties of an existing entity.
   * Strictly forbids altering identity, type, or capture flags directly,
   * preserving index consistency (AUDIT-01).
   */
  public updateEntity(id: EntityId, patch: EntityUpdatePatch): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot update non-existent entity with ID: ${id}`);
    }

    if ('id' in patch && patch.id !== undefined && patch.id !== id) {
      throw new Error(`Forbidden: Entity ID is immutable. Cannot change ID from "${id}" to "${patch.id}".`);
    }

    if ('type' in patch && patch.type !== undefined && patch.type !== entity.type) {
      throw new Error(`Forbidden: Entity type is immutable. Cannot change type from "${entity.type}" to "${patch.type}".`);
    }

    if ('position' in patch && (patch as { position?: unknown }).position !== undefined) {
      throw new Error(
        'Forbidden: Direct mutation of position is not allowed via updateEntity. Use moveEntity() to maintain spatial index consistency.'
      );
    }

    if ('isCaptured' in patch && patch.isCaptured !== undefined) {
      throw new Error(
        'Forbidden: Direct mutation of isCaptured is not allowed via updateEntity. Use captureEntity() or restoreEntity() to guarantee spatial index consistency.'
      );
    }

    const combined = { ...entity, ...patch } as IEntity;
    this.entityById.set(id, cloneEntity(combined));
  }

  /**
   * Safely updates domain metadata on an entity without touching spatial indices.
   */
  public updateEntityMetadata(id: EntityId, metadataPatch: Readonly<Record<string, unknown>>): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot update metadata for non-existent entity with ID: ${id}`);
    }
    const updated = {
      ...entity,
      metadata: { ...(entity.metadata ?? {}), ...metadataPatch },
    } as IEntity;
    this.entityById.set(id, updated);
  }

  /**
   * Mark piece as captured: sets isCaptured to true and atomically removes from spatial occupancy.
   */
  public captureEntity(id: EntityId): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot capture non-existent entity with ID: ${id}`);
    }
    if (entity.type !== 'PIECE') {
      throw new Error(`Cannot capture non-piece entity with ID: ${id} (type: ${entity.type})`);
    }
    if (entity.isCaptured) {
      throw new Error(`Cannot capture entity with ID: ${id} because it is already captured.`);
    }

    this.occupancyByCoordinate.delete(entity.position);
    const updatedPiece: IPieceEntity = {
      ...entity,
      isCaptured: true,
    };
    this.entityById.set(id, updatedPiece);
  }

  /**
   * Backward-compatible alias for captureEntity.
   */
  public capturePiece(id: EntityId): void {
    this.captureEntity(id);
  }

  /**
   * Restores a previously captured piece to an unoccupied coordinate.
   * Atomically updates isCaptured to false and sets occupancy index.
   */
  public restoreEntity(id: EntityId, toCoordinate: CoordinateKey): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot restore non-existent entity with ID: ${id}`);
    }
    if (entity.type !== 'PIECE') {
      throw new Error(`Cannot restore non-piece entity with ID: ${id}`);
    }
    if (!entity.isCaptured) {
      throw new Error(`Cannot restore entity with ID: ${id} because it is not captured.`);
    }

    const currentOccupant = this.occupancyByCoordinate.get(toCoordinate);
    if (currentOccupant && currentOccupant !== id) {
      throw new Error(
        `Cannot restore entity "${id}" to coordinate "${toCoordinate}": already occupied by "${currentOccupant}".`
      );
    }

    const updatedPiece: IPieceEntity = {
      ...entity,
      position: toCoordinate,
      isCaptured: false,
    };
    this.occupancyByCoordinate.set(toCoordinate, id);
    this.entityById.set(id, updatedPiece);
  }

  /**
   * Atomically replaces an entity with a new entity definition (AUDIT-01).
   * Validates ALL pre-conditions BEFORE altering any index so failure never leaves
   * half-applied or lost state.
   */
  public replaceEntity(oldId: EntityId, newEntity: IEntity): void {
    const existing = this.entityById.get(oldId);
    if (!existing) {
      throw new Error(`Cannot replace non-existent entity with ID: ${oldId}`);
    }

    // 1. If replacing with a different ID, ensure target ID is not already used
    if (newEntity.id !== oldId && this.entityById.has(newEntity.id)) {
      throw new Error(
        `Cannot replace entity "${oldId}": target entity ID "${newEntity.id}" already exists.`
      );
    }

    // 2. If new entity is active (uncaptured), ensure target coordinate is not occupied by another entity
    const isNewCaptured = newEntity.type === 'PIECE' && newEntity.isCaptured;
    if (!isNewCaptured) {
      const occupant = this.occupancyByCoordinate.get(newEntity.position);
      if (occupant && occupant !== oldId) {
        throw new Error(
          `Cannot replace entity "${oldId}": target coordinate "${newEntity.position}" is already occupied by "${occupant}".`
        );
      }
    }

    // All pre-conditions passed! Apply atomic mutations:
    // Remove old coordinate occupancy if position changed or new entity is captured
    if (existing.position !== newEntity.position || isNewCaptured) {
      if (this.occupancyByCoordinate.get(existing.position) === oldId) {
        this.occupancyByCoordinate.delete(existing.position);
      }
    }

    // Set new coordinate occupancy if active
    if (!isNewCaptured) {
      this.occupancyByCoordinate.set(newEntity.position, newEntity.id);
    }

    // Update entity map
    if (newEntity.id !== oldId) {
      this.entityById.delete(oldId);
    }
    this.entityById.set(newEntity.id, cloneEntity(newEntity));
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
    return cloneEntity(entity);
  }

  /**
   * Query all entities of a specific type (returns defensive copies).
   */
  public getEntitiesByType<T extends IEntity['type']>(
    type: T
  ): readonly Extract<IEntity, { type: T }>[] {
    const result: Extract<IEntity, { type: T }>[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === type) {
        result.push(cloneEntity(entity) as Extract<IEntity, { type: T }>);
      }
    }
    return result;
  }

  /**
   * Query all piece entities owned by a specific player (returns defensive copies).
   */
  public getEntitiesByOwner(ownerId: PlayerId): readonly IPieceEntity[] {
    const result: IPieceEntity[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === 'PIECE' && entity.ownerId === ownerId) {
        result.push(cloneEntity(entity) as IPieceEntity);
      }
    }
    return result;
  }

  /**
   * Get all active (non-captured) pieces (returns defensive copies).
   */
  public getActivePieces(): readonly IPieceEntity[] {
    const result: IPieceEntity[] = [];
    for (const entity of this.entityById.values()) {
      if (entity.type === 'PIECE' && !entity.isCaptured) {
        result.push(cloneEntity(entity) as IPieceEntity);
      }
    }
    return result;
  }

  /**
   * Get all registered entities (returns defensive copies).
   */
  public getAllEntities(): readonly IEntity[] {
    const result: IEntity[] = [];
    for (const entity of this.entityById.values()) {
      result.push(cloneEntity(entity));
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
   * Clear all entities (AUDIT-01: cleanly clears maps with no dead code).
   */
  public clear(): void {
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
        errors.push(`Occupancy at ${coord} references non-existent entity ${id}`);
        continue;
      }
      if (entity.position !== coord) {
        errors.push(
          `Spatial mismatch: Entity ${id} recorded at ${coord}, but entity.position is ${entity.position}`
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
   * Export plain record snapshot (returns defensive copies).
   */
  public toSnapshot(): {
    entityById: Record<EntityId, IEntity>;
    occupancyByCoordinate: Record<CoordinateKey, EntityId>;
  } {
    const entityById: Record<EntityId, IEntity> = {} as Record<EntityId, IEntity>;
    for (const [k, v] of this.entityById.entries()) {
      entityById[k] = cloneEntity(v);
    }
    const occupancyByCoordinate: Record<CoordinateKey, EntityId> = {} as Record<CoordinateKey, EntityId>;
    for (const [k, v] of this.occupancyByCoordinate.entries()) {
      occupancyByCoordinate[k] = v;
    }
    return { entityById, occupancyByCoordinate };
  }
}

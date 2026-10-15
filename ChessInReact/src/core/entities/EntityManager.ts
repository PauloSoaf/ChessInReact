import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { IEntity, IPieceEntity, ITerrainEntity } from './types';

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
 * Supported JSON-compatible primitive values for metadata.
 */
export type MetadataPrimitive = string | number | boolean | null;
export type MetadataValue =
  | MetadataPrimitive
  | { [key: string]: MetadataValue }
  | MetadataValue[];

/**
 * Validates and produces a deep defensive clone of metadata (PATCH-03).
 * Prohibits circular references, BigInt, functions, symbols, and non-finite numbers (NaN/Infinity).
 * Operates on plain objects and arrays recursively.
 */
export function validateAndDeepCloneMetadata(
  value: unknown,
  seen = new WeakSet<object>()
): MetadataValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid metadata number: "${value}" is not finite.`);
    }
    return value;
  }
  if (typeof value === 'bigint') {
    throw new Error('Unsupported metadata value: BigInt is not allowed in entity metadata.');
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') {
    throw new Error(`Unsupported metadata value: values of type "${typeof value}" are not allowed.`);
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new Error('Invalid metadata: circular reference detected.');
    }
    seen.add(value);

    if (Array.isArray(value)) {
      const clonedArr: MetadataValue[] = [];
      for (let i = 0; i < value.length; i++) {
        clonedArr.push(validateAndDeepCloneMetadata(value[i], seen));
      }
      return clonedArr;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) {
      throw new Error('Unsupported metadata object: only plain objects and arrays are permitted.');
    }

    const clonedObj: Record<string, MetadataValue> = {};
    const keys = Reflect.ownKeys(value);
    for (const key of keys) {
      if (typeof key !== 'string') {
        throw new Error('Unsupported metadata key: symbol keys are not allowed.');
      }
      clonedObj[key] = validateAndDeepCloneMetadata((value as Record<string, unknown>)[key], seen);
    }
    return clonedObj;
  }
  throw new Error(`Unsupported metadata value of type "${typeof value}".`);
}

/**
 * Validates and deeply clones an entity's metadata dictionary.
 */
export function cloneMetadataDict(
  metadata: Readonly<Record<string, unknown>> | undefined
): Record<string, unknown> | undefined {
  if (metadata === undefined) return undefined;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new Error('Metadata must be a plain object.');
  }
  return validateAndDeepCloneMetadata(metadata) as Record<string, unknown>;
}

/**
 * Clones an entity object defensively to prevent external mutations
 * from compromising internal store and spatial indices (AUDIT-01, PATCH-01, PATCH-03).
 */
function cloneEntity<T extends IEntity>(entity: T): T {
  return {
    ...entity,
    metadata: cloneMetadataDict(entity.metadata),
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
  private terrainByCoordinate: Map<CoordinateKey, EntityId> = new Map();

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
    terrainByCoordinate?: Record<string, string>;
  }): EntityManager {
    const manager = new EntityManager();
    for (const entity of Object.values(snapshot.entityById)) {
      manager.addEntity(entity);
    }
    return manager;
  }

  /**
   * Add a single entity, registering both by ID and spatial layer.
   * Defensive: stores a cloned copy to prevent external mutation leaks.
   * - TERRAIN entities are registered in terrainByCoordinate and do NOT block piece occupancy.
   * - PIECE and OBSTACLE entities are registered in occupancyByCoordinate and require exclusive occupancy.
   * Transactional: validates and clones completely before modifying internal storage.
   */
  public addEntity(entity: IEntity): void {
    // 1. Produce complete defensive copy and validate metadata contract FIRST
    const cloned = cloneEntity(entity);

    // 2. Validate identity uniqueness
    if (this.entityById.has(cloned.id)) {
      throw new Error(`Entity already exists with ID: ${cloned.id}`);
    }

    // 3. Register spatial indices depending on entity layer:
    if (cloned.type === 'TERRAIN') {
      const existingTerrainId = this.terrainByCoordinate.get(cloned.position);
      if (existingTerrainId && existingTerrainId !== cloned.id) {
        throw new Error(
          `Coordinate ${cloned.position} already has terrain entity ${existingTerrainId}. Cannot add ${cloned.id}`
        );
      }
      this.terrainByCoordinate.set(cloned.position, cloned.id);
    } else {
      const isCapturedPiece = cloned.type === 'PIECE' && cloned.isCaptured;
      if (!isCapturedPiece) {
        const occupant = this.occupancyByCoordinate.get(cloned.position);
        if (occupant) {
          throw new Error(
            `Coordinate ${cloned.position} is already occupied by entity ${occupant}. Cannot add ${cloned.id}`
          );
        }
        this.occupancyByCoordinate.set(cloned.position, cloned.id);
      }
    }

    // 4. Commit to entityById
    this.entityById.set(cloned.id, cloned);
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
   * Strictly returns physical occupants (pieces and obstacles).
   */
  public getOccupant(coord: CoordinateKey): IEntity | undefined {
    const entityId = this.occupancyByCoordinate.get(coord);
    if (!entityId) return undefined;
    const entity = this.entityById.get(entityId);
    return entity ? cloneEntity(entity) : undefined;
  }

  /**
   * Get background terrain entity at coordinate (returns defensive copy).
   */
  public getTerrain(coord: CoordinateKey): ITerrainEntity | undefined {
    const terrainId = this.terrainByCoordinate.get(coord);
    if (!terrainId) return undefined;
    const entity = this.entityById.get(terrainId);
    return entity && entity.type === 'TERRAIN' ? (cloneEntity(entity) as ITerrainEntity) : undefined;
  }

  /**
   * Get entity at coordinate: prioritizes physical occupant, falling back to background terrain.
   */
  public getEntityAt(coord: CoordinateKey): IEntity | undefined {
    return this.getOccupant(coord) ?? this.getTerrain(coord);
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
   * Updates non-structural properties of an existing entity with a strict runtime whitelist (PATCH-02).
   * Structural properties (id, position, type, isCaptured, ownerId) are strictly forbidden,
   * even if passed as undefined.
   */
  public updateEntity(id: EntityId, patch: EntityUpdatePatch): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot update non-existent entity with ID: ${id}`);
    }

    // Structural properties that must NEVER be mutated via updateEntity (PATCH-02):
    if (Reflect.has(patch, 'id')) {
      throw new Error('Forbidden: Entity ID is immutable. Property "id" is structural and cannot be modified via updateEntity (even if undefined).');
    }
    if (Reflect.has(patch, 'type')) {
      throw new Error('Forbidden: Entity type is immutable. Property "type" is structural and cannot be modified via updateEntity (even if undefined).');
    }
    if (Reflect.has(patch, 'position')) {
      throw new Error(
        'Forbidden: Direct mutation of position is not allowed via updateEntity (even if undefined). Property "position" is structural. Use moveEntity() to maintain spatial index consistency.'
      );
    }
    if (Reflect.has(patch, 'isCaptured')) {
      throw new Error(
        'Forbidden: Direct mutation of isCaptured is not allowed via updateEntity (even if undefined). Property "isCaptured" is structural. Use captureEntity() or restoreEntity() to guarantee spatial index consistency.'
      );
    }
    if (Reflect.has(patch, 'ownerId')) {
      throw new Error('Forbidden: Property "ownerId" is structural and cannot be modified via updateEntity (even if undefined).');
    }

    // Whitelist per entity type:
    const patchKeys = Reflect.ownKeys(patch);
    const allowedKeysByType: Record<IEntity['type'], string[]> = {
      PIECE: ['hasMoved', 'variantId', 'metadata'],
      TERRAIN: ['elevation', 'metadata'],
      OBSTACLE: ['destructible', 'hp', 'metadata'],
    };

    const allowedKeys = new Set(allowedKeysByType[entity.type]);
    for (const key of patchKeys) {
      if (typeof key !== 'string' || !allowedKeys.has(key)) {
        throw new Error(
          `Forbidden: Unknown or disallowed property "${String(key)}" for entity type "${entity.type}" in updateEntity.`
        );
      }
    }

    // Validate allowed values
    if (Reflect.has(patch, 'variantId')) {
      if (typeof patch.variantId !== 'string' || patch.variantId.trim() === '') {
        throw new Error('Validation error: variantId must be a non-empty string.');
      }
    }
    if (Reflect.has(patch, 'hasMoved')) {
      if (typeof patch.hasMoved !== 'boolean') {
        throw new Error('Validation error: hasMoved must be a boolean.');
      }
    }
    if (Reflect.has(patch, 'elevation')) {
      if (typeof patch.elevation !== 'number' || !Number.isFinite(patch.elevation)) {
        throw new Error('Validation error: elevation must be a finite number.');
      }
    }
    if (Reflect.has(patch, 'destructible')) {
      if (typeof patch.destructible !== 'boolean') {
        throw new Error('Validation error: destructible must be a boolean.');
      }
    }
    if (Reflect.has(patch, 'hp')) {
      if (typeof patch.hp !== 'number' || !Number.isFinite(patch.hp) || patch.hp < 0) {
        throw new Error('Validation error: hp must be a finite non-negative number.');
      }
    }

    // Validate and deep clone metadata if present
    let clonedMetadata = entity.metadata ? cloneMetadataDict(entity.metadata) : undefined;
    if (Reflect.has(patch, 'metadata')) {
      clonedMetadata = cloneMetadataDict(patch.metadata);
    }

    const updated = {
      ...entity,
      ...patch,
      metadata: clonedMetadata,
    } as IEntity;

    this.entityById.set(id, updated);
  }

  /**
   * Safely updates domain metadata on an entity without touching spatial indices.
   * Guarantees deep isolation of nested metadata objects (PATCH-03).
   */
  public updateEntityMetadata(id: EntityId, metadataPatch: Readonly<Record<string, unknown>>): void {
    const entity = this.entityById.get(id);
    if (!entity) {
      throw new Error(`Cannot update metadata for non-existent entity with ID: ${id}`);
    }

    // Validate and deep clone patch FIRST
    const clonedPatch = cloneMetadataDict(metadataPatch) ?? {};
    const existingCloned = entity.metadata ? cloneMetadataDict(entity.metadata) ?? {} : {};

    const updated = {
      ...entity,
      metadata: { ...existingCloned, ...clonedPatch },
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

    // 2. Validate target coordinate occupancy based on layer
    if (newEntity.type === 'TERRAIN') {
      const existingTerrain = this.terrainByCoordinate.get(newEntity.position);
      if (existingTerrain && existingTerrain !== oldId) {
        throw new Error(
          `Cannot replace entity "${oldId}": target coordinate "${newEntity.position}" already has terrain "${existingTerrain}".`
        );
      }
    } else {
      const isNewCaptured = newEntity.type === 'PIECE' && newEntity.isCaptured;
      if (!isNewCaptured) {
        const occupant = this.occupancyByCoordinate.get(newEntity.position);
        if (occupant && occupant !== oldId) {
          throw new Error(
            `Cannot replace entity "${oldId}": target coordinate "${newEntity.position}" is already occupied by "${occupant}".`
          );
        }
      }
    }

    // 4. Produce complete defensive copy and validate metadata BEFORE modifying internal storage (PATCH-01)
    const cloned = cloneEntity(newEntity);

    // 5. Apply atomic mutations:
    if (existing.type === 'TERRAIN') {
      if (this.terrainByCoordinate.get(existing.position) === oldId) {
        this.terrainByCoordinate.delete(existing.position);
      }
    } else {
      const isExistingCaptured = existing.type === 'PIECE' && existing.isCaptured;
      const isNewCaptured = cloned.type === 'PIECE' && cloned.isCaptured;
      if (!isExistingCaptured && (existing.position !== cloned.position || isNewCaptured)) {
        if (this.occupancyByCoordinate.get(existing.position) === oldId) {
          this.occupancyByCoordinate.delete(existing.position);
        }
      }
    }

    if (cloned.type === 'TERRAIN') {
      this.terrainByCoordinate.set(cloned.position, cloned.id);
    } else {
      const isNewCaptured = cloned.type === 'PIECE' && cloned.isCaptured;
      if (!isNewCaptured) {
        this.occupancyByCoordinate.set(cloned.position, cloned.id);
      }
    }

    if (cloned.id !== oldId) {
      this.entityById.delete(oldId);
    }
    this.entityById.set(cloned.id, cloned);
  }

  /**
   * Remove entity completely from corresponding indices.
   */
  public removeEntity(id: EntityId): IEntity | undefined {
    const entity = this.entityById.get(id);
    if (!entity) return undefined;

    if (entity.type === 'TERRAIN') {
      if (this.terrainByCoordinate.get(entity.position) === id) {
        this.terrainByCoordinate.delete(entity.position);
      }
    } else {
      if (this.occupancyByCoordinate.get(entity.position) === id) {
        this.occupancyByCoordinate.delete(entity.position);
      }
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
   * Total terrain coordinate count.
   */
  public terrainCount(): number {
    return this.terrainByCoordinate.size;
  }

  /**
   * Clear all entities.
   */
  public clear(): void {
    this.entityById.clear();
    this.occupancyByCoordinate.clear();
    this.terrainByCoordinate.clear();
  }

  /**
   * Validate dual-index invariants:
   * 1. Every occupant in occupancyByCoordinate must exist in entityById.
   * 2. The occupant's position must match the coordinate key.
   * 3. Every non-captured entity in entityById must be recorded in occupancyByCoordinate.
   */
  public validateInvariants(): InvariantValidationResult {
    const errors: string[] = [];

    // Check physical occupancy -> entity direction
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
      if (entity.type === 'TERRAIN') {
        errors.push(`Terrain entity ${id} is erroneously present in piece occupancy at ${coord}`);
      }
    }

    // Check terrain layer -> entity direction
    for (const [coord, id] of this.terrainByCoordinate.entries()) {
      const entity = this.entityById.get(id);
      if (!entity) {
        errors.push(`Terrain at ${coord} references non-existent entity ${id}`);
        continue;
      }
      if (entity.position !== coord) {
        errors.push(
          `Spatial mismatch: Terrain ${id} recorded at ${coord}, but entity.position is ${entity.position}`
        );
      }
      if (entity.type !== 'TERRAIN') {
        errors.push(`Non-terrain entity ${id} is erroneously present in terrainByCoordinate at ${coord}`);
      }
    }

    // Check entity -> spatial direction
    for (const [id, entity] of this.entityById.entries()) {
      if (entity.type === 'TERRAIN') {
        const terr = this.terrainByCoordinate.get(entity.position);
        if (terr !== id) {
          errors.push(
            `Missing or mismatched terrain index for entity ${id} at ${entity.position}. Found: ${terr}`
          );
        }
      } else {
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
    terrainByCoordinate: Record<CoordinateKey, EntityId>;
  } {
    const entityById: Record<EntityId, IEntity> = {} as Record<EntityId, IEntity>;
    for (const [k, v] of this.entityById.entries()) {
      entityById[k] = cloneEntity(v);
    }
    const occupancyByCoordinate: Record<CoordinateKey, EntityId> = {} as Record<CoordinateKey, EntityId>;
    for (const [k, v] of this.occupancyByCoordinate.entries()) {
      occupancyByCoordinate[k] = v;
    }
    const terrainByCoordinate: Record<CoordinateKey, EntityId> = {} as Record<CoordinateKey, EntityId>;
    for (const [k, v] of this.terrainByCoordinate.entries()) {
      terrainByCoordinate[k] = v;
    }
    return { entityById, occupancyByCoordinate, terrainByCoordinate };
  }
}

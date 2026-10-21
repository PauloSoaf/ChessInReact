import { isBiomeType, IPersistentTileModification, BIOME_TYPES } from './types';

/**
 * Metadata keys owned by the terrain pipeline. Custom metadata must never shadow them,
 * otherwise a modification could silently contradict the authoritative biome / obstacle fields.
 */
export const RESERVED_TERRAIN_METADATA_KEYS: readonly string[] = [
  'biome',
  'colorIndex',
  'costMultiplier',
  'isObstacle',
  'isWalkable',
  'elevation',
];

/**
 * Dangerous object prototype keys rejected to prevent prototype pollution attacks.
 */
export const FORBIDDEN_METADATA_KEYS: readonly string[] = [
  '__proto__',
  'constructor',
  'prototype',
];

const MAX_METADATA_DEPTH = 8;

/**
 * Deep-clones and strictly validates JSON-serializable values.
 * Rejects non-finite numbers, circular references, prototype-pollution keys,
 * functions, symbols, BigInt, and class instances.
 */
export function cloneAndValidateJsonValue<T>(
  value: T,
  path = 'metadata',
  depth = 0,
  seen: WeakSet<object> = new WeakSet()
): T {
  if (depth > MAX_METADATA_DEPTH) {
    throw new Error(`Invalid metadata at "${path}": nesting depth exceeds limit of ${MAX_METADATA_DEPTH}.`);
  }

  if (value === null) {
    return null as unknown as T;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid metadata at "${path}": numeric value "${String(value)}" is not a finite number.`);
      }
      return value;
    case 'object': {
      if (seen.has(value as object)) {
        throw new Error(`Invalid metadata at "${path}": circular reference detected.`);
      }
      seen.add(value as object);

      if (Array.isArray(value)) {
        const clonedArr = value.map((item, index) =>
          cloneAndValidateJsonValue(item, `${path}[${index}]`, depth + 1, seen)
        );
        return clonedArr as unknown as T;
      }

      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        throw new Error(`Invalid metadata at "${path}": complex class instances are not JSON-serializable.`);
      }

      const clonedObj: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (FORBIDDEN_METADATA_KEYS.includes(key)) {
          throw new Error(`Invalid metadata key "${key}" at "${path}": forbidden object prototype key.`);
        }
        if (depth === 0 && RESERVED_TERRAIN_METADATA_KEYS.includes(key)) {
          throw new Error(
            `Invalid metadata key "${key}" in persistent modification at "${path}": reserved by the terrain pipeline.`
          );
        }
        clonedObj[key] = cloneAndValidateJsonValue(
          (value as Record<string, unknown>)[key],
          `${path}.${key}`,
          depth + 1,
          seen
        );
      }
      return clonedObj as unknown as T;
    }
    default:
      throw new Error(`Invalid metadata at "${path}": values of type "${typeof value}" are not JSON-serializable.`);
  }
}

/**
 * Creates an independent, deep-cloned copy of validated metadata.
 */
export function clonePersistentMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
  label = 'metadata'
): Readonly<Record<string, unknown>> | undefined {
  if (metadata === undefined) return undefined;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`Invalid metadata at "${label}": expected a plain object.`);
  }
  return cloneAndValidateJsonValue(metadata, label);
}

/**
 * Validates a persistent tile modification (runtime guard for data that may come from JSON layouts).
 * Throws a descriptive error instead of letting invalid biomes / metadata reach serializers.
 */
export function validatePersistentTileModification(
  coord: string,
  mod: IPersistentTileModification
): void {
  if (mod === null || typeof mod !== 'object') {
    throw new Error(`Invalid persistent modification at "${coord}": expected an object.`);
  }

  if (mod.biome !== undefined && !isBiomeType(mod.biome)) {
    throw new Error(
      `Invalid biome "${String(mod.biome)}" in persistent modification at "${coord}". Expected one of: ${BIOME_TYPES.join(', ')}.`
    );
  }

  if (mod.elevation !== undefined) {
    if (
      typeof mod.elevation !== 'number' ||
      !Number.isFinite(mod.elevation) ||
      mod.elevation < 0 ||
      mod.elevation > 3.0
    ) {
      throw new Error(
        `Invalid elevation override: "${String(mod.elevation)}". Must be a finite number between 0.0 and 3.0.`
      );
    }
  }

  if (mod.isObstacle !== undefined && typeof mod.isObstacle !== 'boolean') {
    throw new Error(`Invalid isObstacle flag in persistent modification at "${coord}": expected boolean.`);
  }

  if (mod.metadata !== undefined) {
    if (mod.metadata === null || typeof mod.metadata !== 'object' || Array.isArray(mod.metadata)) {
      throw new Error(`Invalid metadata in persistent modification at "${coord}": expected a plain object.`);
    }
    cloneAndValidateJsonValue(mod.metadata, coord);
  }
}

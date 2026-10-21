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

const MAX_METADATA_DEPTH = 8;

function isJsonValue(value: unknown, depth: number): boolean {
  if (depth > MAX_METADATA_DEPTH) return false;
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object': {
      if (Array.isArray(value)) {
        return value.every((v) => isJsonValue(v, depth + 1));
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) return false;
      return Object.values(value as Record<string, unknown>).every((v) => isJsonValue(v, depth + 1));
    }
    default:
      return false;
  }
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
    for (const key of Object.keys(mod.metadata)) {
      if (RESERVED_TERRAIN_METADATA_KEYS.includes(key)) {
        throw new Error(
          `Invalid metadata key "${key}" in persistent modification at "${coord}": reserved by the terrain pipeline.`
        );
      }
    }
    if (!isJsonValue(mod.metadata, 0)) {
      throw new Error(
        `Invalid metadata in persistent modification at "${coord}": values must be JSON-serializable.`
      );
    }
  }
}

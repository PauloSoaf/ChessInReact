import { CoordinateKey, EntityId } from '../coordinates/types';
import { IDomainState } from '../state/gameState';

/**
 * Domain snapshot representation suitable for persistence, replays, and network sync.
 * Strips UI state, callbacks, and transient variables.
 * Enforces dual-layer spatial integrity (terrain vs occupancy) and structural invariant validation (PATCH-11).
 */
export class SnapshotSerializer {
  public static readonly SNAPSHOT_VERSION = 2;
  public static readonly SUPPORTED_VERSIONS: readonly number[] = [1, 2];

  public static serialize(state: IDomainState, options?: { timestamp?: number }): string {
    const payload = {
      version: this.SNAPSHOT_VERSION,
      timestamp: options?.timestamp ?? 0,
      state: {
        matchId: state.matchId,
        variantId: state.variantId,
        isGameOver: state.isGameOver,
        winnerId: state.winnerId,
        activePlayer: state.activePlayer,
        turnNumber: state.turnNumber,
        revision: state.revision,
        boardEntities: state.boardEntities,
        occupancy: state.occupancy,
        terrain: state.terrain ?? {},
        capturedInventory: state.capturedInventory,
        turnState: state.turnState,
      },
    };
    return JSON.stringify(payload);
  }

  public static deserialize(jsonString: string): IDomainState {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid snapshot payload: expected JSON object.');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid snapshot payload: expected JSON object.');
    }

    const { version, state } = parsed as { version: number; state: Partial<IDomainState> };

    if (!SnapshotSerializer.SUPPORTED_VERSIONS.includes(version)) {
      throw new Error(
        `Unsupported snapshot version: ${version}. Supported versions are: ${SnapshotSerializer.SUPPORTED_VERSIONS.join(', ')}.`
      );
    }

    if (!state || typeof state !== 'object' || !state.boardEntities || !state.occupancy) {
      throw new Error('Malformed snapshot: missing domain state or required spatial records.');
    }

    // Version 1 Migration (Spec 01 legacy snapshots without explicit terrain layer)
    let terrain: Record<CoordinateKey, EntityId>;
    if (version === 1 && !state.terrain) {
      terrain = {};
      for (const [id, entity] of Object.entries(state.boardEntities)) {
        if (entity && entity.type === 'TERRAIN') {
          const coord = entity.position;
          if (terrain[coord] && terrain[coord] !== id) {
            throw new Error(
              `Malformed legacy snapshot: conflicting terrain entities at coordinate "${coord}": "${terrain[coord]}" vs "${id}".`
            );
          }
          terrain[coord] = id as EntityId;
        }
      }
    } else {
      if (!state.terrain || typeof state.terrain !== 'object') {
        throw new Error('Malformed snapshot: missing or invalid terrain spatial index.');
      }
      terrain = { ...state.terrain };
    }

    // Strict structural invariant validation (PATCH-11)
    // 1. Validate terrain index integrity
    for (const [coord, id] of Object.entries(terrain)) {
      const entity = state.boardEntities[id as EntityId];
      if (!entity) {
        throw new Error(`Corrupted snapshot: terrain index at "${coord}" references non-existent entity "${id}".`);
      }
      if (entity.type !== 'TERRAIN') {
        throw new Error(
          `Corrupted snapshot: terrain index at "${coord}" references non-terrain entity "${id}" of type "${entity.type}".`
        );
      }
      if (entity.position !== coord) {
        throw new Error(
          `Corrupted snapshot: spatial mismatch for terrain entity "${id}". Indexed at "${coord}", but entity.position is "${entity.position}".`
        );
      }
    }

    // 2. Validate physical occupancy index integrity
    for (const [coord, id] of Object.entries(state.occupancy)) {
      const entity = state.boardEntities[id as EntityId];
      if (!entity) {
        throw new Error(`Corrupted snapshot: occupancy at "${coord}" references non-existent entity "${id}".`);
      }
      if (entity.type === 'TERRAIN') {
        throw new Error(
          `Corrupted snapshot: terrain entity "${id}" is erroneously present in physical occupancy at "${coord}".`
        );
      }
      if (entity.position !== coord) {
        throw new Error(
          `Corrupted snapshot: spatial mismatch for occupant entity "${id}". Indexed at "${coord}", but entity.position is "${entity.position}".`
        );
      }
      if (entity.type === 'PIECE' && entity.isCaptured) {
        throw new Error(
          `Corrupted snapshot: captured piece "${id}" is erroneously recorded in active occupancy at "${coord}".`
        );
      }
    }

    // 3. Validate entity-to-spatial completeness
    for (const [id, entity] of Object.entries(state.boardEntities)) {
      if (!entity) continue;
      if (entity.type === 'TERRAIN') {
        const indexedId = terrain[entity.position];
        if (indexedId !== id) {
          throw new Error(
            `Corrupted snapshot: terrain entity "${id}" at "${entity.position}" is missing or mismatched in terrain index (found: "${indexedId}").`
          );
        }
      } else if (entity.type === 'OBSTACLE') {
        const occupantId = state.occupancy[entity.position];
        if (occupantId !== id) {
          throw new Error(
            `Corrupted snapshot: obstacle entity "${id}" at "${entity.position}" is missing or mismatched in occupancy index.`
          );
        }
      } else if (entity.type === 'PIECE' && !entity.isCaptured) {
        const occupantId = state.occupancy[entity.position];
        if (occupantId !== id) {
          throw new Error(
            `Corrupted snapshot: active piece "${id}" at "${entity.position}" is missing or mismatched in occupancy index.`
          );
        }
      }
    }

    const migratedState: IDomainState = {
      ...(state as IDomainState),
      terrain,
    };

    return migratedState;
  }
}


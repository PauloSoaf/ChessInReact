import { createStore } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import { produce } from 'immer';
import { CoordinateKey, EntityId, PlayerId } from '../coordinates/types';
import { HistoryManager } from '../history/HistoryManager';
import { ICommand } from '../commands/types';
import {
  IDomainState,
  IGameStore,
  IPresentationUIState,
  IStoreCommand,
} from './gameState';
import { createDefaultDomainState, createDefaultUIState } from './initialState';
import { IEntity, isProceduralEntity } from '../entities/types';
import { IChunkStreamingDelta, IChunkTerrainUpdate } from '../procedural/types';

const ALLOWED_STREAMING_ENTITY_TYPES: readonly string[] = ['TERRAIN', 'OBSTACLE'];

function validateStreamedEntity(entity: unknown, label: string, expectedId?: string): IEntity {
  const e = entity as Partial<IEntity> | null | undefined;
  if (
    !e ||
    typeof e !== 'object' ||
    typeof e.id !== 'string' ||
    typeof e.position !== 'string' ||
    typeof e.type !== 'string'
  ) {
    throw new Error(`Invalid streaming delta: malformed entity at ${label}.`);
  }
  if (!ALLOWED_STREAMING_ENTITY_TYPES.includes(e.type)) {
    throw new Error(
      `Invalid streaming delta: forbidden entity type "${e.type}" at ${label}. Streaming deltas can only contain procedural TERRAIN or OBSTACLE entities.`
    );
  }
  if (expectedId !== undefined && e.id !== expectedId) {
    throw new Error(
      `Invalid streaming delta: entity id "${e.id}" does not match its key "${expectedId}" at ${label}.`
    );
  }

  // Provenance validation (PATCH-27C):
  if (e.provenance !== undefined) {
    if (e.provenance !== 'PROCEDURAL' && e.provenance !== 'GAMEPLAY') {
      throw new Error(
        `Invalid streaming delta: entity "${e.id}" at ${label} has invalid provenance "${e.provenance}". Expected 'PROCEDURAL' or 'GAMEPLAY'.`
      );
    }
    if (e.provenance === 'GAMEPLAY') {
      throw new Error(
        `Invalid streaming delta: entity "${e.id}" at ${label} has GAMEPLAY provenance. Streaming deltas are reserved for procedural entities.`
      );
    }
  }

  // Type and provenance contradiction validation:
  if (e.type === 'TERRAIN' && e.provenance !== undefined && e.provenance !== 'PROCEDURAL') {
    throw new Error(
      `Invalid streaming delta: TERRAIN entity "${e.id}" at ${label} has contradictory provenance "${e.provenance}".`
    );
  }

  // Authoritative procedural validation via unified isProceduralEntity predicate
  if (!isProceduralEntity(e as IEntity)) {
    throw new Error(
      `Invalid streaming delta: entity "${e.id}" at ${label} is not a valid procedural entity.`
    );
  }

  return e as IEntity;
}

/**
 * Complete semantic and structural validation executed against the current domain state
 * before ANY mutation is committed. A delta violating invariants is rejected with zero partial mutation.
 */
function validateStreamingDeltaSemantic(
  delta: IChunkStreamingDelta,
  currentDomain: IDomainState
): void {
  if (!delta || typeof delta !== 'object') {
    throw new Error('Invalid streaming delta: expected an object.');
  }
  if (!delta.newEntities || typeof delta.newEntities !== 'object') {
    throw new Error('Invalid streaming delta: missing newEntities record.');
  }
  if (!Array.isArray(delta.unloadedEntityIds)) {
    throw new Error('Invalid streaming delta: unloadedEntityIds must be an array.');
  }

  const newEntityIds = new Set<string>();
  const allDeltaTargetCoords = new Set<string>();
  const unloadedIds = new Set<string>();
  const updatedEntityIds = new Set<string>();
  const updatedPreviousIds = new Set<string>();

  // 1. Validate unloadedEntityIds: must not target any gameplay piece or gameplay obstacle
  for (const uid of delta.unloadedEntityIds) {
    if (typeof uid !== 'string') {
      throw new Error('Invalid streaming delta: unloadedEntityIds must contain string IDs.');
    }
    const existing = currentDomain.boardEntities[uid as EntityId];
    if (existing) {
      if (existing.type === 'PIECE') {
        throw new Error(
          `Invalid streaming delta: cannot unload gameplay entity "${uid}" of type "${existing.type}".`
        );
      }
      if (existing.type === 'OBSTACLE' && !isProceduralEntity(existing)) {
        throw new Error(
          `Invalid streaming delta: cannot unload gameplay OBSTACLE "${uid}".`
        );
      }
    }
    unloadedIds.add(uid);
  }

  // 2. Validate updatedTerrain (if present)
  if (delta.updatedTerrain !== undefined) {
    if (!Array.isArray(delta.updatedTerrain)) {
      throw new Error('Invalid streaming delta: updatedTerrain must be an array.');
    }
    for (let i = 0; i < delta.updatedTerrain.length; i++) {
      const update: IChunkTerrainUpdate | undefined = delta.updatedTerrain[i];
      if (!update || typeof update.previousId !== 'string') {
        throw new Error(`Invalid streaming delta: malformed updatedTerrain[${i}].`);
      }
      const updateEntity = validateStreamedEntity(update.entity, `updatedTerrain[${i}].entity`);
      if (updateEntity.type !== 'TERRAIN' && updateEntity.type !== 'OBSTACLE') {
        throw new Error(
          `Invalid streaming delta: updatedTerrain replacement "${updateEntity.id}" must be of type TERRAIN or OBSTACLE.`
        );
      }

      // previousId must exist in the domain
      const prev: IEntity | undefined = currentDomain.boardEntities[update.previousId as EntityId];
      if (!prev) {
        throw new Error(
          `Invalid streaming delta: updatedTerrain references non-existent previousId "${update.previousId}".`
        );
      }
      if (prev.type === 'PIECE') {
        throw new Error(
          `Invalid streaming delta: updatedTerrain cannot replace gameplay PIECE "${update.previousId}".`
        );
      }
      if (prev.type === 'OBSTACLE' && !isProceduralEntity(prev)) {
        throw new Error(
          `Invalid streaming delta: updatedTerrain cannot replace gameplay OBSTACLE "${update.previousId}".`
        );
      }

      // previousId cannot be simultaneously scheduled for unloading in the same delta
      if (unloadedIds.has(update.previousId)) {
        throw new Error(
          `Invalid streaming delta: entity "${update.previousId}" cannot be in both updatedTerrain.previousId and unloadedEntityIds.`
        );
      }

      // Coordinate consistency
      if (prev.position !== updateEntity.position) {
        throw new Error(
          `Invalid streaming delta: updatedTerrain coordinate mismatch. Previous entity "${update.previousId}" is at "${prev.position}", but replacement "${updateEntity.id}" is at "${updateEntity.position}".`
        );
      }

      // ID Identity Validation (PATCH-26A):
      // An updatedTerrain replacement entity cannot reuse an ID belonging to a different existing entity
      const existingWithSameId = currentDomain.boardEntities[updateEntity.id as EntityId];
      if (existingWithSameId) {
        if (existingWithSameId.type === 'PIECE') {
          throw new Error(
            `Invalid streaming delta: updatedTerrain replacement "${updateEntity.id}" attempts to reuse ID of an existing gameplay PIECE.`
          );
        }
        if (existingWithSameId.type === 'OBSTACLE' && !isProceduralEntity(existingWithSameId)) {
          throw new Error(
            `Invalid streaming delta: updatedTerrain replacement "${updateEntity.id}" attempts to reuse ID of an existing gameplay OBSTACLE.`
          );
        }
        if (existingWithSameId.id !== update.previousId) {
          throw new Error(
            `Invalid streaming delta: updatedTerrain replacement "${updateEntity.id}" reuses ID of existing entity "${existingWithSameId.id}" at coordinate "${existingWithSameId.position}" for coordinate "${updateEntity.position}".`
          );
        }
      }

      // Collision check: OBSTACLE cannot be updated onto a tile occupied by a PIECE or gameplay OBSTACLE
      if (updateEntity.type === 'OBSTACLE') {
        const occupantId = currentDomain.occupancy[updateEntity.position];
        if (occupantId && occupantId !== update.previousId) {
          const occupant = currentDomain.boardEntities[occupantId];
          if (occupant && occupant.type === 'PIECE') {
            throw new Error(
              `Invalid streaming delta: updatedTerrain OBSTACLE "${updateEntity.id}" collides with active PIECE "${occupantId}" at "${updateEntity.position}".`
            );
          }
          if (occupant && occupant.type === 'OBSTACLE' && !isProceduralEntity(occupant)) {
            throw new Error(
              `Invalid streaming delta: updatedTerrain OBSTACLE "${updateEntity.id}" collides with gameplay OBSTACLE "${occupantId}" at "${updateEntity.position}".`
            );
          }
        }
      }

      // Check duplicate ID conflicts
      if (unloadedIds.has(updateEntity.id)) {
        throw new Error(
          `Invalid streaming delta: duplicate ID "${updateEntity.id}" present in both updatedTerrain and unloadedEntityIds.`
        );
      }
      if (updatedEntityIds.has(updateEntity.id)) {
        throw new Error(
          `Invalid streaming delta: duplicate replacement ID "${updateEntity.id}" in updatedTerrain.`
        );
      }
      if (updatedPreviousIds.has(update.previousId)) {
        throw new Error(
          `Invalid streaming delta: duplicate previousId "${update.previousId}" in updatedTerrain.`
        );
      }
      updatedEntityIds.add(updateEntity.id);
      updatedPreviousIds.add(update.previousId);

      // Check coordinate uniqueness in the batch
      if (allDeltaTargetCoords.has(updateEntity.position)) {
        throw new Error(
          `Invalid streaming delta: multiple entities targeting the same coordinate "${updateEntity.position}".`
        );
      }
      allDeltaTargetCoords.add(updateEntity.position);
    }
  }

  // 3. Validate newEntities
  for (const [key, rawEntity] of Object.entries(delta.newEntities)) {
    const entity = validateStreamedEntity(rawEntity, `newEntities["${key}"]`, key);

    // Cannot replace or alias any existing entity in domain state
    const existing = currentDomain.boardEntities[entity.id as EntityId];
    if (existing) {
      if (existing.type === 'PIECE') {
        throw new Error(
          `Invalid streaming delta: entity "${entity.id}" attempts to replace an existing gameplay PIECE entity.`
        );
      }
      if (existing.type === 'OBSTACLE' && !isProceduralEntity(existing)) {
        throw new Error(
          `Invalid streaming delta: entity "${entity.id}" attempts to replace an existing gameplay OBSTACLE.`
        );
      }
      if (existing.position !== entity.position) {
        throw new Error(
          `Invalid streaming delta: entity "${entity.id}" reuses ID of existing entity at coordinate "${existing.position}" for coordinate "${entity.position}".`
        );
      }
      throw new Error(
        `Invalid streaming delta: entity "${entity.id}" already exists in domain state at "${existing.position}". Use updatedTerrain for modifications.`
      );
    }

    // Check duplicate ID conflicts
    if (unloadedIds.has(entity.id)) {
      throw new Error(
        `Invalid streaming delta: duplicate ID "${entity.id}" present in both newEntities and unloadedEntityIds.`
      );
    }
    if (updatedEntityIds.has(entity.id)) {
      throw new Error(
        `Invalid streaming delta: duplicate ID "${entity.id}" present in both newEntities and updatedTerrain.`
      );
    }
    if (newEntityIds.has(entity.id)) {
      throw new Error(
        `Invalid streaming delta: duplicate ID "${entity.id}" in newEntities.`
      );
    }
    newEntityIds.add(entity.id);

    // Coordinate uniqueness in the batch
    if (allDeltaTargetCoords.has(entity.position)) {
      throw new Error(
        `Invalid streaming delta: multiple entities targeting the same coordinate "${entity.position}".`
      );
    }
    allDeltaTargetCoords.add(entity.position);

    // Collision check: procedural OBSTACLE cannot be placed over an active PIECE or gameplay OBSTACLE
    if (entity.type === 'OBSTACLE') {
      const occupantId = currentDomain.occupancy[entity.position];
      if (occupantId) {
        const occupant = currentDomain.boardEntities[occupantId];
        if (occupant && occupant.type === 'PIECE') {
          throw new Error(
            `Invalid streaming delta: procedural OBSTACLE "${entity.id}" collides with active PIECE "${occupantId}" at "${entity.position}".`
          );
        }
        if (occupant && occupant.type === 'OBSTACLE' && !isProceduralEntity(occupant)) {
          throw new Error(
            `Invalid streaming delta: procedural OBSTACLE "${entity.id}" collides with gameplay OBSTACLE "${occupantId}" at "${entity.position}".`
          );
        }
      }
    }
  }
}

/**
 * Creates an isolated, headless Vanilla Zustand Game Store.
 * Does NOT import React, DOM, or Three.js, satisfying RNF-05 and US01-D09.
 */
export function createGameStore(
  initialDomain?: IDomainState,
  initialUI?: IPresentationUIState,
  historyManager?: HistoryManager
) {
  const history = historyManager ?? new HistoryManager();

  const store = createStore<IGameStore>()(
    subscribeWithSelector((set, get) => ({
      domain: initialDomain ?? createDefaultDomainState(),
      ui: initialUI ?? createDefaultUIState(),

      executeCommand: (command: IStoreCommand) => {
        set((state) => ({
          domain: produce(state.domain, (draft) => {
            history.execute(command as ICommand, draft as IDomainState);
            (draft as { revision: number }).revision += 1;
            (draft as { turnState: { lastActionTimestamp: number } }).turnState.lastActionTimestamp =
              Date.now();
          }),
        }));
      },

      undo: () => {
        let success = false;
        set((state) => ({
          domain: produce(state.domain, (draft) => {
            success = history.undo(draft as IDomainState);
            if (success) {
              (draft as { revision: number }).revision += 1;
              (draft as { turnState: { lastActionTimestamp: number } }).turnState.lastActionTimestamp =
                Date.now();
            }
          }),
        }));
        return success;
      },

      redo: () => {
        let success = false;
        set((state) => ({
          domain: produce(state.domain, (draft) => {
            success = history.redo(draft as IDomainState);
            if (success) {
              (draft as { revision: number }).revision += 1;
              (draft as { turnState: { lastActionTimestamp: number } }).turnState.lastActionTimestamp =
                Date.now();
            }
          }),
        }));
        return success;
      },

      syncDomainState: (newDomainState: IDomainState) => {
        set(() => ({
          domain: newDomainState,
        }));
      },

      resetDomainState: (newDomain: IDomainState) => {
        history.clear();
        set(() => ({
          domain: newDomain,
          ui: createDefaultUIState(),
        }));
      },

      setGameStatus: (isGameOver: boolean, winnerId?: PlayerId | null) => {
        set((state) => ({
          domain: produce(state.domain, (draft) => {
            (draft as { isGameOver: boolean }).isGameOver = isGameOver;
            (draft as { winnerId: PlayerId | null }).winnerId = winnerId ?? null;
            (draft as { revision: number }).revision += 1;
          }),
        }));
      },

      setActivePlayer: (player: PlayerId) => {
        set((state) => ({
          domain: produce(state.domain, (draft) => {
            (draft as { activePlayer: PlayerId }).activePlayer = player;
            (draft as { revision: number }).revision += 1;
          }),
        }));
      },

      applyChunkStreamingDelta: (
        delta: IChunkStreamingDelta,
        expectedRevision?: number
      ): boolean => {
        const currentDomain = get().domain;

        // 1. Stale delta rejection: do not overwrite newer state
        if (expectedRevision !== undefined && currentDomain.revision !== expectedRevision) {
          return false;
        }

        // 2. Validate complete semantics against current state BEFORE mutating anything:
        // A semantically or structurally invalid delta throws and leaves the store 100% untouched.
        validateStreamingDeltaSemantic(delta, currentDomain);

        let applied = false;
        set((state) => {
          if (expectedRevision !== undefined && state.domain.revision !== expectedRevision) {
            return state;
          }
          applied = true;
          return {
            domain: produce(state.domain, (draft) => {
              if (!draft.terrain) {
                draft.terrain = {};
              }
              const terrainMap = draft.terrain;

              const removeEntity = (id: EntityId): void => {
                const ent = draft.boardEntities[id];
                if (!ent) return;
                // Never remove active pieces
                if (ent.type === 'PIECE' && !ent.isCaptured) return;
                // Never remove gameplay obstacles
                if (ent.type === 'OBSTACLE' && !isProceduralEntity(ent)) return;
                if (ent.type === 'TERRAIN' && terrainMap[ent.position] === id) {
                  delete terrainMap[ent.position];
                }
                if (ent.type === 'OBSTACLE' && draft.occupancy[ent.position] === id) {
                  delete draft.occupancy[ent.position];
                }
                delete draft.boardEntities[id];
              };

              // 1. Unload inactive non-piece entities
              for (const id of delta.unloadedEntityIds) {
                removeEntity(id);
              }

              // 2. Replace already-loaded terrain (persistent modifications)
              for (const update of delta.updatedTerrain ?? []) {
                removeEntity(update.previousId);
                const prevTerrainId = terrainMap[update.entity.position];
                if (prevTerrainId && prevTerrainId !== update.entity.id) {
                  removeEntity(prevTerrainId);
                }
                const prevOccupantId = draft.occupancy[update.entity.position];
                if (
                  prevOccupantId &&
                  prevOccupantId !== update.entity.id &&
                  prevOccupantId === update.previousId
                ) {
                  removeEntity(prevOccupantId);
                }
                draft.boardEntities[update.entity.id] = update.entity;
                if (update.entity.type === 'TERRAIN') {
                  terrainMap[update.entity.position] = update.entity.id;
                  if (draft.occupancy[update.entity.position] === update.previousId) {
                    delete draft.occupancy[update.entity.position];
                  }
                } else if (update.entity.type === 'OBSTACLE') {
                  draft.occupancy[update.entity.position] = update.entity.id;
                  delete terrainMap[update.entity.position];
                }
              }

              // 3. Apply newly streamed entities
              for (const entity of Object.values(delta.newEntities)) {
                if (entity.type === 'TERRAIN') {
                  const prevId = terrainMap[entity.position];
                  if (prevId && prevId !== entity.id) {
                    removeEntity(prevId);
                  }
                  draft.boardEntities[entity.id] = entity;
                  terrainMap[entity.position] = entity.id;
                } else if (entity.type === 'OBSTACLE') {
                  const occupantId = draft.occupancy[entity.position];
                  if (occupantId && occupantId !== entity.id) {
                    removeEntity(occupantId);
                  }
                  draft.boardEntities[entity.id] = entity;
                  draft.occupancy[entity.position] = entity.id;
                }
              }

              (draft as { revision: number }).revision += 1;
            }),
          };
        });
        return applied;
      },


      // Presentation UI actions - fully decoupled from domain snapshots
      selectPiece: (pieceId: EntityId | null) => {
        set((state) => ({
          ui: { ...state.ui, selectedPieceId: pieceId },
        }));
      },

      setHighlights: (coords: readonly CoordinateKey[]) => {
        set((state) => ({
          ui: { ...state.ui, highlightedCoords: coords },
        }));
      },

      setHoveredCoord: (coord: CoordinateKey | null) => {
        set((state) => ({
          ui: { ...state.ui, hoveredCoord: coord },
        }));
      },

      setVisibilityWindow: (window: IPresentationUIState['visibilityWindow']) => {
        set((state) => ({
          ui: { ...state.ui, visibilityWindow: window },
        }));
      },

      resetUIState: () => {
        set(() => ({
          ui: createDefaultUIState(),
        }));
      },
    }))
  );

  // Ensure SSR / headless renderers (e.g. React 18 useSyncExternalStore getServerSnapshot)
  // always read the active, live domain state rather than a stale module-load snapshot.
  (store as unknown as { getInitialState: () => IGameStore }).getInitialState = () => store.getState();

  return store;
}

/**
 * Singleton vanilla game store instance.
 */
export const gameStore = createGameStore();
export type GameStoreInstance = ReturnType<typeof createGameStore>;

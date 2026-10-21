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
import { IEntity } from '../entities/types';
import { IChunkStreamingDelta } from '../procedural/types';

const ENTITY_TYPES: readonly string[] = ['PIECE', 'TERRAIN', 'OBSTACLE'];

function validateStreamedEntity(entity: unknown, label: string, expectedId?: string): void {
  const e = entity as Partial<IEntity> | null | undefined;
  if (
    !e ||
    typeof e !== 'object' ||
    typeof e.id !== 'string' ||
    typeof e.position !== 'string' ||
    typeof e.type !== 'string' ||
    !ENTITY_TYPES.includes(e.type)
  ) {
    throw new Error(`Invalid streaming delta: malformed entity at ${label}.`);
  }
  if (expectedId !== undefined && e.id !== expectedId) {
    throw new Error(
      `Invalid streaming delta: entity id "${e.id}" does not match its key "${expectedId}" at ${label}.`
    );
  }
}

/**
 * Structural validation executed before any mutation so that a malformed delta can never leave
 * the domain state partially updated.
 */
function validateStreamingDelta(delta: IChunkStreamingDelta): void {
  if (!delta || typeof delta !== 'object') {
    throw new Error('Invalid streaming delta: expected an object.');
  }
  if (!delta.newEntities || typeof delta.newEntities !== 'object') {
    throw new Error('Invalid streaming delta: missing newEntities record.');
  }
  if (!Array.isArray(delta.unloadedEntityIds)) {
    throw new Error('Invalid streaming delta: unloadedEntityIds must be an array.');
  }
  for (const [key, entity] of Object.entries(delta.newEntities)) {
    validateStreamedEntity(entity, `newEntities["${key}"]`, key);
  }
  if (delta.updatedTerrain !== undefined) {
    if (!Array.isArray(delta.updatedTerrain)) {
      throw new Error('Invalid streaming delta: updatedTerrain must be an array.');
    }
    delta.updatedTerrain.forEach((update, index) => {
      if (!update || typeof update.previousId !== 'string') {
        throw new Error(`Invalid streaming delta: malformed updatedTerrain[${index}].`);
      }
      validateStreamedEntity(update.entity, `updatedTerrain[${index}].entity`);
    });
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
    subscribeWithSelector((set) => ({
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
        // Validate BEFORE mutating anything: a malformed delta must leave the store untouched.
        validateStreamingDelta(delta);

        let applied = false;
        set((state) => {
          if (expectedRevision !== undefined && state.domain.revision !== expectedRevision) {
            return state; // Stale delta rejection: do not overwrite newer state
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
                if (ent.type === 'TERRAIN' && terrainMap[ent.position] === id) {
                  delete terrainMap[ent.position];
                }
                if (ent.type === 'OBSTACLE' && draft.occupancy[ent.position] === id) {
                  delete draft.occupancy[ent.position];
                }
                delete draft.boardEntities[id];
              };

              const insertEntity = (entity: IEntity): void => {
                if (entity.type === 'TERRAIN') {
                  // Keep the terrain index 1:1 with TERRAIN entities (no orphans on replacement)
                  const previousId = terrainMap[entity.position];
                  if (previousId && previousId !== entity.id) {
                    removeEntity(previousId);
                  }
                  draft.boardEntities[entity.id] = entity;
                  terrainMap[entity.position] = entity.id;
                } else if (entity.type === 'OBSTACLE') {
                  const occupantId = draft.occupancy[entity.position];
                  if (occupantId && occupantId !== entity.id) {
                    const occupant = draft.boardEntities[occupantId];
                    if (occupant && occupant.type !== 'OBSTACLE') {
                      // A procedural obstacle must never hijack the occupancy of a piece (or any
                      // other occupant): skip it so boardEntities and occupancy stay consistent.
                      return;
                    }
                    removeEntity(occupantId);
                  }
                  draft.boardEntities[entity.id] = entity;
                  draft.occupancy[entity.position] = entity.id;
                } else {
                  draft.boardEntities[entity.id] = entity;
                }
              };

              // 1. Unload inactive non-piece entities
              for (const id of delta.unloadedEntityIds) {
                removeEntity(id);
              }

              // 2. Replace already-loaded terrain (persistent modifications)
              for (const update of delta.updatedTerrain ?? []) {
                removeEntity(update.previousId);
                insertEntity(update.entity);
              }

              // 3. Apply newly streamed entities
              for (const entity of Object.values(delta.newEntities)) {
                insertEntity(entity);
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

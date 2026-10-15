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
        delta: {
          readonly newEntities: Record<EntityId, import('../entities/types').IEntity>;
          readonly unloadedEntityIds: readonly EntityId[];
        },
        expectedRevision?: number
      ): boolean => {
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

              // Apply newly streamed entities
              for (const [id, entity] of Object.entries(delta.newEntities)) {
                draft.boardEntities[id as EntityId] = entity;
                if (entity.type === 'TERRAIN') {
                  terrainMap[entity.position] = id as EntityId;
                } else if (entity.type === 'OBSTACLE') {
                  draft.occupancy[entity.position] = id as EntityId;
                }
              }

              // Unload inactive non-piece entities
              for (const id of delta.unloadedEntityIds) {
                const ent = draft.boardEntities[id];
                if (ent) {
                  // Never unload active pieces
                  if (ent.type === 'PIECE' && !ent.isCaptured) {
                    continue;
                  }
                  if (ent.type === 'TERRAIN' && terrainMap[ent.position] === id) {
                    delete terrainMap[ent.position];
                  }
                  if (ent.type === 'OBSTACLE' && draft.occupancy[ent.position] === id) {
                    delete draft.occupancy[ent.position];
                  }
                  delete draft.boardEntities[id];
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

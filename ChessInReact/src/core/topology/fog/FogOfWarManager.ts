import { CoordinateKey, PlayerId } from '../../coordinates/types';
import { IPieceEntity } from '../../entities/types';
import { ITopology } from '../types';

export type FogState = 'FOG_HIDDEN' | 'FOG_EXPLORED' | 'VISIBLE';

export interface IFogVisibilityOptions {
  readonly defaultVisionRadius?: number;
  readonly getPieceVisionRadius?: (piece: IPieceEntity) => number;
  readonly isOccluding?: (coord: CoordinateKey) => boolean;
}

export type FogExportSnapshot = Record<PlayerId, Record<CoordinateKey, FogState>>;

/**
 * Headless Fog of War Manager (Spec 02 RF-13, Section 19.3).
 * Tracks FOG_HIDDEN, FOG_EXPLORED, and VISIBLE states deterministically per player.
 */
export class FogOfWarManager {
  private fogByPlayer = new Map<PlayerId, Map<CoordinateKey, FogState>>();

  constructor(initialSnapshot?: FogExportSnapshot) {
    if (initialSnapshot) {
      this.importState(initialSnapshot);
    }
  }

  /**
   * Updates player's field of view based on active pieces, vision radius, and terrain occlusions.
   */
  public updateVisibility(
    player: PlayerId,
    pieces: readonly IPieceEntity[],
    topology: ITopology,
    options?: IFogVisibilityOptions
  ): void {
    let playerMap = this.fogByPlayer.get(player);
    if (!playerMap) {
      playerMap = new Map<CoordinateKey, FogState>();
      this.fogByPlayer.set(player, playerMap);
    }

    // 1. Demote current VISIBLE tiles to FOG_EXPLORED
    for (const [coord, state] of playerMap.entries()) {
      if (state === 'VISIBLE') {
        playerMap.set(coord, 'FOG_EXPLORED');
      }
    }

    const defaultRadius = options?.defaultVisionRadius ?? 2;
    const getRadius = options?.getPieceVisionRadius ?? (() => defaultRadius);
    const isOccluding = options?.isOccluding ?? (() => false);

    // 2. Compute field of view for each active piece owned by this player
    for (const piece of pieces) {
      if (piece.ownerId !== player || piece.isCaptured) {
        continue;
      }

      const center = piece.position;
      const radius = getRadius(piece);

      // Expansion respecting line-of-sight raycasting and occlusion
      const queue: [CoordinateKey, number][] = [[center, 0]];
      const visitedInPieceFov = new Set<CoordinateKey>([center]);
      playerMap.set(center, 'VISIBLE');

      while (queue.length > 0) {
        const [curr, dist] = queue.shift()!;
        if (dist >= radius) continue;

        for (const neighbor of topology.getAllNeighbors(curr)) {
          if (!visitedInPieceFov.has(neighbor)) {
            visitedInPieceFov.add(neighbor);

            // Check if line of sight from center to neighbor is blocked by any intermediate obstacle
            const los = topology.getLineOfSight(center, neighbor);
            let blocked = false;
            for (let i = 1; i < los.length - 1; i++) {
              if (isOccluding(los[i])) {
                blocked = true;
                break;
              }
            }

            if (!blocked) {
              playerMap.set(neighbor, 'VISIBLE');
              // Only continue expanding outward if this cell itself is not occluding
              if (!isOccluding(neighbor)) {
                queue.push([neighbor, dist + 1]);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get fog of war state for player at specific coordinate.
   */
  public getVisibility(player: PlayerId, coord: CoordinateKey): FogState {
    const playerMap = this.fogByPlayer.get(player);
    return playerMap?.get(coord) ?? 'FOG_HIDDEN';
  }

  /**
   * Whether coordinate is currently VISIBLE to player.
   */
  public isCellVisible(player: PlayerId, coord: CoordinateKey): boolean {
    return this.getVisibility(player, coord) === 'VISIBLE';
  }

  /**
   * Prevents leaking hidden opponent entities to client.
   * Player can only see entities that are either their own or situated on VISIBLE coordinates.
   */
  public filterVisibleEntities<T extends { position: CoordinateKey; ownerId?: PlayerId }>(
    player: PlayerId,
    entities: readonly T[]
  ): T[] {
    return entities.filter((e) => {
      if (e.ownerId === player) return true;
      return this.isCellVisible(player, e.position);
    });
  }

  /**
   * Serializes current fog of war state for persistence or network synchronization.
   */
  public exportState(): FogExportSnapshot {
    const result: FogExportSnapshot = {} as FogExportSnapshot;
    for (const [player, map] of this.fogByPlayer.entries()) {
      result[player] = {};
      for (const [coord, state] of map.entries()) {
        result[player][coord] = state;
      }
    }
    return result;
  }

  /**
   * Imports fog of war state from snapshot.
   */
  public importState(snapshot: FogExportSnapshot): void {
    this.fogByPlayer.clear();
    for (const [player, record] of Object.entries(snapshot)) {
      const p = player as PlayerId;
      const map = new Map<CoordinateKey, FogState>();
      for (const [coord, state] of Object.entries(record)) {
        map.set(coord as CoordinateKey, state as FogState);
      }
      this.fogByPlayer.set(p, map);
    }
  }

  public clear(): void {
    this.fogByPlayer.clear();
  }
}

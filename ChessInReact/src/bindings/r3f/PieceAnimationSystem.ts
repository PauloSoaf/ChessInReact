import { CoordinateKey, EntityId } from '../../core/coordinates';
import { GameStoreInstance } from '../../core/state/gameStore';
import { IGameStore } from '../../core/state/gameState';

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
  set?(x: number, y: number, z: number): void;
}

export interface TransformableObject3D {
  position: Vector3Like;
}

export type WorldPositionResolver = (coord: CoordinateKey) => { x: number; y: number; z: number };

interface RegisteredPieceTarget {
  readonly object3D: TransformableObject3D;
  readonly resolver: WorldPositionResolver;
  targetX: number;
  targetY: number;
  targetZ: number;
}

/**
 * PieceAnimationSystem: centralized transient animation coordinator for React Three Fiber.
 * Avoids creating thousands of individual useFrame hooks (Section Y).
 * Mutates Object3D matrices directly outside the React render reconciliation cycle.
 */
export class PieceAnimationSystem {
  private targets: Map<EntityId, RegisteredPieceTarget> = new Map();
  private unsubscribeStore: (() => void) | null = null;
  private store: GameStoreInstance;

  constructor(store: GameStoreInstance) {
    this.store = store;

    // Listen to changes in boardEntities imperatively without triggering React re-renders
    this.unsubscribeStore = this.store.subscribe(
      (state: IGameStore) => state.domain.boardEntities,
      (boardEntities) => {
        for (const [id, targetRecord] of this.targets.entries()) {
          const entity = boardEntities[id];
          if (entity && !('isCaptured' in entity && entity.isCaptured)) {
            const worldPos = targetRecord.resolver(entity.position);
            targetRecord.targetX = worldPos.x;
            targetRecord.targetY = worldPos.y;
            targetRecord.targetZ = worldPos.z;
          }
        }
      }
    );
  }

  /**
   * Registers a 3D Object transform to be animated imperatively.
   * Returns a teardown callback for cleanup.
   */
  public register(
    pieceId: EntityId,
    object3D: TransformableObject3D,
    resolver: WorldPositionResolver
  ): () => void {
    const currentEntity = this.store.getState().domain.boardEntities[pieceId];
    const initialPos = currentEntity
      ? resolver(currentEntity.position)
      : { x: 0, y: 0, z: 0 };

    this.targets.set(pieceId, {
      object3D,
      resolver,
      targetX: initialPos.x,
      targetY: initialPos.y,
      targetZ: initialPos.z,
    });

    // Snap to initial position immediately
    object3D.position.x = initialPos.x;
    object3D.position.y = initialPos.y;
    object3D.position.z = initialPos.z;

    return () => {
      this.unregister(pieceId);
    };
  }

  public unregister(pieceId: EntityId): void {
    this.targets.delete(pieceId);
  }

  /**
   * Called once per frame in R3F useFrame loop.
   * Smoothly interpolates (LERP) positions of all active pieces in a single loop.
   */
  public update(lerpFactor = 0.15): void {
    for (const record of this.targets.values()) {
      const pos = record.object3D.position;
      pos.x += (record.targetX - pos.x) * lerpFactor;
      pos.y += (record.targetY - pos.y) * lerpFactor;
      pos.z += (record.targetZ - pos.z) * lerpFactor;
    }
  }

  public getRegisteredCount(): number {
    return this.targets.size;
  }

  public dispose(): void {
    if (this.unsubscribeStore) {
      this.unsubscribeStore();
      this.unsubscribeStore = null;
    }
    this.targets.clear();
  }
}

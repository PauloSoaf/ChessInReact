import { CoordinateKey } from '../../coordinates';
import { IDomainState } from '../../state/gameState';
import { ITopology } from '../types';

export type ProjectileType = 'FLAT' | 'PARABOLIC';

/**
 * Line-of-sight validation with topological interception (Spec 02 Section 9.1).
 * Sliders (Rooks, Queens, Bishops) use FLAT trajectory; parabolic or jumping attacks use PARABOLIC.
 */
export function validateLineOfSight(
  state: IDomainState,
  topology: ITopology,
  start: CoordinateKey,
  target: CoordinateKey,
  projectileType: ProjectileType = 'FLAT'
): boolean {
  const path = topology.getLineOfSight(start, target);
  if (path.length <= 2) {
    return true; // Adjacent or same cell
  }

  // Iterate strictly intermediate cells: path[1] to path[path.length - 2]
  for (let i = 1; i < path.length - 1; i++) {
    const coord = path[i];
    const entityId = state.occupancy[coord];
    const entity = entityId ? state.boardEntities[entityId] : undefined;

    if (!entity) continue;

    // 1. Piece obstruction
    if (entity.type === 'PIECE' && !entity.isCaptured) {
      if (projectileType === 'FLAT') {
        return false; // Intercepted by piece
      }
    }

    // 2. Obstacle obstruction
    if (entity.type === 'OBSTACLE') {
      if (projectileType === 'FLAT') {
        return false; // Intercepted by impassable wall/pillar
      }
    }

    // 3. High elevation terrain (Mountains with elevation > 0.5 block flat rays)
    if (entity.type === 'TERRAIN') {
      const elevation =
        entity.elevation ??
        (entity.metadata && typeof entity.metadata.elevation === 'number'
          ? (entity.metadata.elevation as number)
          : 0);

      if (projectileType === 'FLAT' && elevation > 0.5) {
        return false; // Flat projectile collides with mountain peak
      }
    }
  }

  return true;
}

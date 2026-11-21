import { CoordinateKey } from '../../../core/coordinates/types';
import { DirectionIndex, ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { IMoveBehavior } from './IMoveBehavior';

export type SliderAxisType = 'ORTHOGONAL' | 'DIAGONAL';

export interface ISliderOptions {
  readonly canMove?: boolean; // default true
  readonly canCapture?: boolean; // default true
  readonly forwardOnly?: boolean;
  readonly backwardOnly?: boolean;
}

export class SliderBehavior implements IMoveBehavior {
  public readonly name: string;

  constructor(
    private readonly axes: readonly SliderAxisType[],
    private readonly maxDistance: number = 64,
    private readonly options: ISliderOptions = {}
  ) {
    this.name = `Slider(${axes.join('+')},${maxDistance})`;
  }

  /**
   * Resolves direction indices according to topology type and requested axes.
   */
  private resolveDirections(topology: ITopology, isWhite: boolean): number[] {
    const directions: number[] = [];

    if (topology.type === 'SQUARE') {
      const includeOrthogonal = this.axes.includes('ORTHOGONAL');
      const includeDiagonal = this.axes.includes('DIAGONAL');

      if (includeOrthogonal) {
        // [NORTH=0, EAST=2, SOUTH=4, WEST=6]
        if (!this.options.forwardOnly && !this.options.backwardOnly) {
          directions.push(DirectionIndex.NORTH, DirectionIndex.EAST, DirectionIndex.SOUTH, DirectionIndex.WEST);
        } else if (this.options.forwardOnly) {
          directions.push(isWhite ? DirectionIndex.NORTH : DirectionIndex.SOUTH);
        } else if (this.options.backwardOnly) {
          directions.push(isWhite ? DirectionIndex.SOUTH : DirectionIndex.NORTH);
        }
      }

      if (includeDiagonal) {
        // [NORTHEAST=1, SOUTHEAST=3, SOUTHWEST=5, NORTHWEST=7]
        if (!this.options.forwardOnly && !this.options.backwardOnly) {
          directions.push(
            DirectionIndex.NORTHEAST,
            DirectionIndex.SOUTHEAST,
            DirectionIndex.SOUTHWEST,
            DirectionIndex.NORTHWEST
          );
        } else if (this.options.forwardOnly) {
          directions.push(
            isWhite ? DirectionIndex.NORTHEAST : DirectionIndex.SOUTHEAST,
            isWhite ? DirectionIndex.NORTHWEST : DirectionIndex.SOUTHWEST
          );
        } else if (this.options.backwardOnly) {
          directions.push(
            isWhite ? DirectionIndex.SOUTHEAST : DirectionIndex.NORTHEAST,
            isWhite ? DirectionIndex.SOUTHWEST : DirectionIndex.NORTHWEST
          );
        }
      }
    } else if (topology.type === 'HEXAGONAL') {
      // Hexagonal has 6 edge-sharing directions (HEX_EAST=0 .. HEX_SOUTHEAST=5)
      for (let d = 0; d < 6; d++) {
        directions.push(d);
      }
    } else {
      // Generic fallback: all directions 0..7
      for (let d = 0; d < 8; d++) {
        directions.push(d);
      }
    }

    return directions;
  }

  public generatePseudoLegalMoves(
    startCoord: CoordinateKey,
    topology: ITopology,
    state: IDomainState,
    piece: IPieceEntity,
    isWhite: boolean
  ): CoordinateKey[] {
    const pseudoLegals: CoordinateKey[] = [];
    const directions = this.resolveDirections(topology, isWhite);
    const canMove = this.options.canMove ?? true;
    const canCapture = this.options.canCapture ?? true;
    const canJumpOnce = Boolean(piece.metadata?.hasJump);

    const maxStepLimit = Math.min(
      this.maxDistance,
      (topology as { readonly width?: number }).width ??
      (topology as { readonly boardSize?: number }).boardSize ??
      16
    );

    for (const dir of directions) {
      let current: CoordinateKey = startCoord;
      let currentDir: number = dir;
      let dist = 0;
      let jumpedBlockers = 0;

      while (dist < maxStepLimit) {
        let next: CoordinateKey | null = null;
        const topoWithDir = topology as unknown as {
          getStepWithDirection?(coord: CoordinateKey, dir: number): { coord: CoordinateKey; dir: number } | null;
        };
        if (typeof topoWithDir.getStepWithDirection === 'function') {
          const step = topoWithDir.getStepWithDirection(current, currentDir);
          if (!step) break;
          next = step.coord;
          currentDir = step.dir;
        } else {
          next = topology.getNeighbor(current, currentDir);
        }
        if (!next) break;

        if (!topology.isValidCoordinate(next)) break;
        if (next === startCoord) break; // Reached full loop back to starting square on closed manifold

        // Check terrain passability
        const terrainId = state.terrain?.[next];
        if (terrainId) {
          const terrainEntity = state.boardEntities[terrainId];
          if (terrainEntity && terrainEntity.type === 'TERRAIN') {
            const elev =
              terrainEntity.elevation ??
              (typeof terrainEntity.metadata?.elevation === 'number'
                ? (terrainEntity.metadata.elevation as number)
                : undefined);
            if (elev !== undefined && elev > 0.5) {
              if (canJumpOnce && jumpedBlockers < 1) {
                jumpedBlockers++;
                current = next;
                dist++;
                continue;
              }
              break;
            }
          }
        }

        // Check occupancy
        const occupantId = state.occupancy[next];
        if (occupantId) {
          const rawOccupant = state.boardEntities[occupantId];
          if (rawOccupant?.type === 'OBSTACLE') {
            if (canJumpOnce && jumpedBlockers < 1) {
              jumpedBlockers++;
              current = next;
              dist++;
              continue;
            }
            break;
          }
          const occupant = rawOccupant as IPieceEntity | undefined;
          if (occupant && occupant.type === 'PIECE' && !occupant.isCaptured) {
            const isObstacleJumpable = Boolean(
              occupant.metadata?.canBeJumpedOver || occupant.metadata?.hasJump
            );
            const canLeapObstacle = (canJumpOnce && jumpedBlockers < 1) || isObstacleJumpable;

            // Friendly piece blocks sliding unless jumping over it
            if (occupant.ownerId === piece.ownerId) {
              if (canLeapObstacle && jumpedBlockers < 1) {
                jumpedBlockers++;
                current = next;
                dist++;
                continue;
              }
              break;
            }

            // Enemy piece: can capture if canCapture is true (and not shielded), then ray terminates unless jumping over it
            if (canCapture && !occupant.metadata?.isShielded) {
              pseudoLegals.push(next);
            }
            if (canLeapObstacle && jumpedBlockers < 1) {
              jumpedBlockers++;
              current = next;
              dist++;
              continue;
            }
            break;
          }
        } else {
          // Empty square: can move if canMove is true
          if (canMove) {
            pseudoLegals.push(next);
          }
        }

        current = next;
        dist++;
      }
    }

    return pseudoLegals;
  }
}

import { CoordinateKey } from '../../../core/coordinates/types';
import { DirectionIndex, ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { IMoveBehavior } from './IMoveBehavior';
import { SliderAxisType } from './SliderBehavior';

export interface IHopperOptions {
  /**
   * If true (Grasshopper), the piece only lands on the exact square immediately behind the hurdle.
   * If false, the piece can continue sliding past the hurdle.
   */
  readonly immediateLandingOnly?: boolean;
  readonly canMove?: boolean;
  readonly canCapture?: boolean;
}

export class HopperBehavior implements IMoveBehavior {
  public readonly name: string;

  constructor(
    private readonly axes: readonly SliderAxisType[],
    private readonly maxDistance: number = 64,
    private readonly options: IHopperOptions = { immediateLandingOnly: true }
  ) {
    this.name = `Hopper(${axes.join('+')},${maxDistance})`;
  }

  private resolveDirections(topology: ITopology): number[] {
    const directions: number[] = [];
    if (topology.type === 'SQUARE') {
      if (this.axes.includes('ORTHOGONAL')) {
        directions.push(DirectionIndex.NORTH, DirectionIndex.EAST, DirectionIndex.SOUTH, DirectionIndex.WEST);
      }
      if (this.axes.includes('DIAGONAL')) {
        directions.push(
          DirectionIndex.NORTHEAST,
          DirectionIndex.SOUTHEAST,
          DirectionIndex.SOUTHWEST,
          DirectionIndex.NORTHWEST
        );
      }
    } else if (topology.type === 'HEXAGONAL') {
      for (let d = 0; d < 6; d++) directions.push(d);
    } else {
      for (let d = 0; d < 8; d++) directions.push(d);
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
    void isWhite;
    const pseudoLegals: CoordinateKey[] = [];
    const directions = this.resolveDirections(topology);
    const canMove = this.options.canMove ?? true;
    const canCapture = this.options.canCapture ?? true;

    for (const dir of directions) {
      let current: CoordinateKey = startCoord;
      let hurdleFound = false;
      let dist = 0;

      while (dist < this.maxDistance) {
        const next = topology.getNeighbor(current, dir);
        if (!next || !topology.isValidCoordinate(next)) break;

        const occupantId = state.occupancy[next];
        const occupant = occupantId ? (state.boardEntities[occupantId] as IPieceEntity | undefined) : undefined;
        const isOccupiedByPiece = occupant && occupant.type === 'PIECE' && !occupant.isCaptured;

        if (!hurdleFound) {
          if (isOccupiedByPiece) {
            // First piece encountered becomes the hurdle!
            hurdleFound = true;
          }
        } else {
          // After hurdle
          if (isOccupiedByPiece) {
            // Target square is occupied
            if (occupant!.ownerId !== piece.ownerId && canCapture) {
              pseudoLegals.push(next);
            }
            break; // Cannot jump over a second piece
          } else {
            // Target square is empty
            if (canMove) {
              pseudoLegals.push(next);
            }
            if (this.options.immediateLandingOnly) {
              break; // Grasshopper stops immediately after hurdle
            }
          }
        }

        current = next;
        dist++;
      }
    }

    return pseudoLegals;
  }
}

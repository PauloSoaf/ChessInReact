import { CoordinateKey } from '../../../core/coordinates';
import { ITopology } from '../../../core/topology/types';
import { IDomainState } from '../../../core/state/gameState';
import { IPieceEntity } from '../../../core/entities/types';
import { IMoveBehavior } from './IMoveBehavior';
import { parseCoord, toCoordKey } from '../utils/CoordinateHelper';

export interface ILeaperOptions {
  readonly canMove?: boolean; // default true (false for e.g. pawn diagonal capture)
  readonly canCapture?: boolean; // default true (false for e.g. pawn forward push)
  readonly forwardOnly?: boolean;
  readonly backwardOnly?: boolean;
  readonly sidewaysOnly?: boolean;
  readonly verticalOnly?: boolean;
  readonly rightOnly?: boolean;
  readonly leftOnly?: boolean;
}

export class LeaperBehavior implements IMoveBehavior {
  public readonly name: string;
  private readonly offsets: ReadonlyArray<readonly [number, number]>;

  constructor(
    dx: number,
    dy: number,
    private readonly options: ILeaperOptions = {}
  ) {
    this.name = `Leaper(${dx},${dy})`;
    this.offsets = this.generateOffsetPermutations(dx, dy);
  }

  private generateOffsetPermutations(dx: number, dy: number): ReadonlyArray<readonly [number, number]> {
    const set = new Set<string>();
    const result: Array<[number, number]> = [];

    const candidates = [
      [dx, dy],
      [dx, -dy],
      [-dx, dy],
      [-dx, -dy],
      [dy, dx],
      [dy, -dx],
      [-dy, dx],
      [-dy, -dx],
    ];

    for (const [x, y] of candidates) {
      const key = `${x},${y}`;
      if (!set.has(key)) {
        set.add(key);
        result.push([x, y]);
      }
    }

    return result;
  }

  public generatePseudoLegalMoves(
    startCoord: CoordinateKey,
    topology: ITopology,
    state: IDomainState,
    piece: IPieceEntity,
    isWhite: boolean
  ): CoordinateKey[] {
    const parsed = parseCoord(startCoord);
    if (!parsed) return [];

    const pseudoLegals: CoordinateKey[] = [];
    const canMove = this.options.canMove ?? true;
    const canCapture = this.options.canCapture ?? true;

    for (const [rawDx, rawDy] of this.offsets) {
      const dx = rawDx;
      const dy = rawDy;

      // Filter by directional modifiers relative to player perspective
      // For White, +Y is forward, +X is right
      // For Black, -Y is forward, -X is right (flipped)
      const forwardY = isWhite ? dy : -dy;
      const rightX = isWhite ? dx : -dx;

      if (this.options.forwardOnly && forwardY <= 0) continue;
      if (this.options.backwardOnly && forwardY >= 0) continue;
      if (this.options.sidewaysOnly && dy !== 0) continue;
      if (this.options.verticalOnly && dx !== 0) continue;
      if (this.options.rightOnly && rightX <= 0) continue;
      if (this.options.leftOnly && rightX >= 0) continue;

      const targetX = parsed.x + dx;
      const targetY = parsed.y + dy;
      const targetCoord = toCoordKey(targetX, targetY);

      // Validate bounds via topology
      if (!topology.isValidCoordinate(targetCoord)) continue;

      // Check terrain passability if terrain exists
      const terrainId = state.terrain?.[targetCoord];
      if (terrainId) {
        const terrainEntity = state.boardEntities[terrainId];
        if (terrainEntity && terrainEntity.type === 'TERRAIN') {
          const elev =
            terrainEntity.elevation ??
            (typeof terrainEntity.metadata?.elevation === 'number'
              ? (terrainEntity.metadata.elevation as number)
              : undefined);
          if (elev !== undefined && elev > 0.5) continue; // Impassable wall/mountain
        }
      }

      // Check occupancy
      const occupantId = state.occupancy[targetCoord];
      if (occupantId) {
        const occupant = state.boardEntities[occupantId] as IPieceEntity | undefined;
        if (occupant && occupant.type === 'PIECE' && !occupant.isCaptured) {
          // Cannot land on friendly piece
          if (occupant.ownerId === piece.ownerId) {
            continue;
          }
          // Enemy piece: only allowed if canCapture is true
          if (canCapture) {
            pseudoLegals.push(targetCoord);
          }
        }
      } else {
        // Empty square: only allowed if canMove is true
        if (canMove) {
          pseudoLegals.push(targetCoord);
        }
      }
    }

    return pseudoLegals;
  }
}

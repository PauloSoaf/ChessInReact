import { HexTopology, IHexTopologyOptions } from './HexTopology';
import { SquareTopology } from './SquareTopology';
import { ITriangleTopologyOptions, TriangleTopology } from './TriangleTopology';
import { ITopology, TopologyType } from './types';
import { IVoronoiTopologyOptions, VoronoiTopology } from './VoronoiTopology';

export interface ITopologyFactoryOptions {
  readonly width?: number | null;
  readonly height?: number | null;
  readonly toroidal?: boolean;
  readonly cellSize?: number;
  readonly boundingRadius?: number | null;
  readonly orientation?: 'POINTY_TOP' | 'FLAT_TOP';
  readonly seed?: string;
  readonly jitterFactor?: number;
  readonly [key: string]: unknown;
}

/**
 * Centralized typed factory for ITopology instances (PATCH-13).
 * Shared across main thread procedural codecs, pathfinding, and Web Worker protocols.
 * Explicitly rejects unknown topology types without silent fallback.
 */
export function createTopology(
  type: TopologyType | string,
  options?: ITopologyFactoryOptions | Record<string, unknown>
): ITopology {
  switch (type) {
    case 'HEXAGONAL':
      return new HexTopology(options as IHexTopologyOptions);

    case 'TRIANGULAR':
      return new TriangleTopology(options as ITriangleTopologyOptions);

    case 'VORONOI_IRREGULAR':
      return new VoronoiTopology(options as IVoronoiTopologyOptions);

    case 'SQUARE':
      return new SquareTopology({
        width: options?.width !== undefined ? (options.width as number | null) : null,
        height: options?.height !== undefined ? (options.height as number | null) : null,
        cellSize: (options?.cellSize as number) ?? 1.0,
        toroidal: (options?.toroidal as boolean) ?? false,
      });

    default:
      throw new Error(
        `Unsupported or unknown topology type: "${type}". Expected SQUARE, HEXAGONAL, TRIANGULAR, or VORONOI_IRREGULAR.`
      );
  }
}

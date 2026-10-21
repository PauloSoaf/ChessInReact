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

export interface ITopologyCreationContext {
  /** Authoritative world seed (e.g. the procedural generation seed). */
  readonly seed?: string;
  /**
   * When true, seed-dependent topologies (VORONOI_IRREGULAR) must receive an explicit seed,
   * either here or in options. Prevents falling back to the built-in default seed.
   */
  readonly requireSeed?: boolean;
}

/**
 * Resolves the single effective seed of a seed-dependent topology.
 * Throws when the world seed and options.seed disagree, or when a required seed is missing.
 */
function resolveSeed(
  type: string,
  options: ITopologyFactoryOptions | Record<string, unknown> | undefined,
  context?: ITopologyCreationContext
): string | undefined {
  const optionSeed = typeof options?.seed === 'string' ? (options.seed as string) : undefined;
  const worldSeed = context?.seed;

  if (worldSeed !== undefined && optionSeed !== undefined && worldSeed !== optionSeed) {
    throw new Error(
      `Seed mismatch for ${type} topology: world seed "${worldSeed}" differs from topologyOptions.seed "${optionSeed}". ` +
        `Generation and pathfinding must share the same seed.`
    );
  }

  const effective = worldSeed ?? optionSeed;
  if (effective === undefined && context?.requireSeed) {
    throw new Error(
      `${type} topology requires an explicit seed (payload.seed or topologyOptions.seed); ` +
        `refusing to fall back to the default seed.`
    );
  }
  return effective;
}

/**
 * Centralized typed factory for ITopology instances (PATCH-13).
 * Shared across main thread procedural codecs, pathfinding, and Web Worker protocols.
 * Explicitly rejects unknown topology types without silent fallback.
 */
export function createTopology(
  type: TopologyType | string,
  options?: ITopologyFactoryOptions | Record<string, unknown>,
  context?: ITopologyCreationContext
): ITopology {
  switch (type) {
    case 'HEXAGONAL':
      return new HexTopology(options as IHexTopologyOptions);

    case 'TRIANGULAR':
      return new TriangleTopology(options as ITriangleTopologyOptions);

    case 'VORONOI_IRREGULAR': {
      const seed = resolveSeed(type, options, context);
      return new VoronoiTopology({
        ...(options as IVoronoiTopologyOptions),
        ...(seed !== undefined ? { seed } : {}),
      });
    }

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

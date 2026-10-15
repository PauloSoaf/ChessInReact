import { CoordinateKey } from '../coordinates';
import { HexTopology, SquareTopology, TriangleTopology, VoronoiTopology } from '../topology';
import { ITopology, TopologyType } from '../topology/types';
import { ChunkManager } from './ChunkManager';
import { IChunkData, IProceduralConfig } from './types';

export const CURRENT_GENERATOR_VERSION = '2.0.0';

export interface IPersistentTileModification {
  readonly elevation?: number;
  readonly biome?: string;
  readonly isObstacle?: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface IProceduralLayoutExport {
  readonly schemaVersion: 1;
  readonly generatorVersion: string;
  readonly seed: string;
  readonly topologyType: TopologyType;
  readonly topologyOptions?: Record<string, unknown>;
  readonly chunkSize: number;
  readonly config: IProceduralConfig;
  readonly persistentModifications?: Record<CoordinateKey, IPersistentTileModification>;
  readonly layoutHash: string;
}

/**
 * Deterministic Murmur-like 32-bit string hash.
 */
function computeStringHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * ProceduralLayoutCodec: versioned layout serialization and determinism roundtrip (Spec 02 RF-15).
 */
export class ProceduralLayoutCodec {
  public static computeHash(data: {
    seed: string;
    generatorVersion: string;
    topologyType: TopologyType;
    chunkSize: number;
    config: IProceduralConfig;
    topologyOptions?: Record<string, unknown>;
    persistentModifications?: Record<CoordinateKey, IPersistentTileModification>;
  }): string {
    const canonicalPayload = JSON.stringify({
      seed: data.seed,
      generatorVersion: data.generatorVersion,
      topologyType: data.topologyType,
      chunkSize: data.chunkSize,
      config: data.config,
      topologyOptions: data.topologyOptions ?? {},
      persistentModifications: data.persistentModifications ?? {},
    });
    return computeStringHash(canonicalPayload);
  }

  /**
   * Encodes layout metadata into a compact JSON string with a cryptographic/deterministic checksum.
   */
  public static encodeLayout(input: {
    seed: string;
    topologyType: TopologyType;
    chunkSize?: number;
    config?: Partial<IProceduralConfig>;
    topologyOptions?: Record<string, unknown>;
    persistentModifications?: Record<CoordinateKey, IPersistentTileModification>;
    generatorVersion?: string;
  }): string {
    const genVersion = input.generatorVersion ?? CURRENT_GENERATOR_VERSION;
    const chunkSize = input.chunkSize ?? 16;
    const fullConfig: IProceduralConfig = {
      seed: input.seed,
      noiseOctaves: input.config?.noiseOctaves ?? 4,
      noisePersistence: input.config?.noisePersistence ?? 0.5,
      noiseScale: input.config?.noiseScale ?? 0.05,
      obstacleThreshold: input.config?.obstacleThreshold ?? 0.75,
      waterThreshold: input.config?.waterThreshold ?? 0.25,
      spawnRadius: input.config?.spawnRadius ?? 3,
      chunkSize,
    };

    const hash = this.computeHash({
      seed: input.seed,
      generatorVersion: genVersion,
      topologyType: input.topologyType,
      chunkSize,
      config: fullConfig,
      topologyOptions: input.topologyOptions,
      persistentModifications: input.persistentModifications,
    });

    const exportData: IProceduralLayoutExport = {
      schemaVersion: 1,
      generatorVersion: genVersion,
      seed: input.seed,
      topologyType: input.topologyType,
      topologyOptions: input.topologyOptions,
      chunkSize,
      config: fullConfig,
      persistentModifications: input.persistentModifications,
      layoutHash: hash,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Decodes, validates schema version, and verifies layout checksum.
   */
  public static decodeLayout(jsonString: string): IProceduralLayoutExport {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error('Invalid layout JSON: Malformed JSON string.');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Invalid layout format: Root must be a JSON object.');
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.schemaVersion !== 1) {
      throw new Error(`Unsupported layout schema version: ${obj.schemaVersion}. Only version 1 is supported.`);
    }

    if (typeof obj.seed !== 'string' || obj.seed.trim() === '') {
      throw new Error('Invalid layout: missing or invalid seed.');
    }

    if (typeof obj.topologyType !== 'string') {
      throw new Error('Invalid layout: missing topologyType.');
    }

    const layout = parsed as IProceduralLayoutExport;

    // Verify hash integrity
    const expectedHash = this.computeHash({
      seed: layout.seed,
      generatorVersion: layout.generatorVersion,
      topologyType: layout.topologyType,
      chunkSize: layout.chunkSize,
      config: layout.config,
      topologyOptions: layout.topologyOptions,
      persistentModifications: layout.persistentModifications,
    });

    if (layout.layoutHash !== expectedHash) {
      throw new Error(
        `Layout checksum mismatch! Corrupted or tampered layout data. Expected ${expectedHash}, got ${layout.layoutHash}`
      );
    }

    return layout;
  }

  /**
   * Recreates the exact ITopology and ChunkManager instances from decoded layout.
   */
  public static reconstructWorld(layout: IProceduralLayoutExport): {
    topology: ITopology;
    chunkManager: ChunkManager;
  } {
    let topology: ITopology;
    switch (layout.topologyType) {
      case 'HEXAGONAL':
        topology = new HexTopology(layout.topologyOptions);
        break;
      case 'TRIANGULAR':
        topology = new TriangleTopology(layout.topologyOptions);
        break;
      case 'VORONOI_IRREGULAR':
        topology = new VoronoiTopology(layout.topologyOptions);
        break;
      case 'SQUARE':
      default:
        topology = new SquareTopology({
          width: null,
          height: null,
          ...(layout.topologyOptions || {}),
        });
        break;
    }

    const chunkManager = new ChunkManager(topology, layout.config, {
      chunkSize: layout.chunkSize,
    });

    return { topology, chunkManager };
  }

  /**
   * Computes a deterministic fingerprint of a chunk's generated cells to verify identical world generation.
   */
  public static computeChunkFingerprint(chunk: IChunkData): string {
    const keys = Object.keys(chunk.cells).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const cell = chunk.cells[key as CoordinateKey];
      parts.push(`${key}:${cell.biome}:${cell.elevation.toFixed(4)}:${cell.isObstacle}`);
    }
    return computeStringHash(parts.join('|'));
  }
}

import { CoordinateKey } from '../coordinates';
import { ITopology } from '../topology/types';
import { SimplexNoise2D } from './noise/SimplexNoise2D';
import { BiomeType, IProceduralConfig, ITerrainCell } from './types';

export class NoiseGenerator {
  public readonly config: Required<IProceduralConfig>;
  private simplex: SimplexNoise2D;

  constructor(config: IProceduralConfig) {
    this.config = {
      seed: config.seed,
      noiseOctaves: config.noiseOctaves ?? 2,
      noisePersistence: config.noisePersistence ?? 0.5,
      noiseScale: config.noiseScale ?? 0.05,
      obstacleThreshold: config.obstacleThreshold ?? 0.65,
      waterThreshold: config.waterThreshold ?? -0.3,
      mountainThreshold: config.mountainThreshold ?? 0.5,
      spawnRadius: config.spawnRadius ?? 4,
      chunkSize: config.chunkSize ?? 16,
      viewRadiusChunks: config.viewRadiusChunks ?? 1,
      maxChunksInMemory: config.maxChunksInMemory ?? 50,
    };
    this.simplex = new SimplexNoise2D(this.config.seed);
  }

  /**
   * Evaluates terrain elevation at the given coordinate.
   * Returns a continuous value from 0.0 (deep depression) to 3.0 (high peak).
   * Enforces Island Guarantee: flattens terrain within spawnRadius of the center.
   */
  public getElevation(coord: CoordinateKey, topology: ITopology): number {
    // Island Guarantee (Spec 02 Section 10.1): spawn zone is always safe and flat
    const centerCoord = topology.type === 'HEXAGONAL' ? ('0,0,0' as CoordinateKey) : ('0,0' as CoordinateKey);
    if (topology.isValidCoordinate(centerCoord)) {
      if (topology.getDistance(centerCoord, coord) <= this.config.spawnRadius) {
        return 1.0; // Flat safe spawn elevation
      }
    }

    const pos = topology.toWorldPosition(coord);
    const raw = this.simplex.fbm(
      pos.x,
      pos.z,
      this.config.noiseOctaves,
      this.config.noisePersistence,
      this.config.noiseScale
    );

    // Map [-1.0, 1.0] to [0.0, 3.0]
    return Math.max(0.0, Math.min(3.0, (raw + 1.0) * 1.5));
  }

  /**
   * Generates complete deterministic terrain cell data for the given coordinate.
   */
  public generateCell(coord: CoordinateKey, topology: ITopology): ITerrainCell {
    const pos = topology.toWorldPosition(coord);
    const centerCoord = topology.type === 'HEXAGONAL' ? '0,0,0' : '0,0';
    const isSpawnZone =
      topology.isValidCoordinate(centerCoord as CoordinateKey) &&
      topology.getDistance(centerCoord as CoordinateKey, coord) <= this.config.spawnRadius;

    const colorIndex = topology.getCellColorIndex(coord);

    if (isSpawnZone) {
      return {
        coord,
        topology: topology.type,
        colorIndex,
        elevation: 1.0,
        biome: 'PLAINS',
        isObstacle: false,
        costMultiplier: 1.0,
      };
    }

    const raw = this.simplex.fbm(
      pos.x,
      pos.z,
      this.config.noiseOctaves,
      this.config.noisePersistence,
      this.config.noiseScale
    );

    const elevation = Math.max(0.0, Math.min(3.0, (raw + 1.0) * 1.5));

    let biome: BiomeType;
    let isObstacle = false;
    let costMultiplier = 1.0;

    if (raw < this.config.waterThreshold) {
      biome = 'WATER';
      isObstacle = true;
      costMultiplier = 999.0;
    } else if (raw > this.config.obstacleThreshold) {
      biome = 'CHASM';
      isObstacle = true;
      costMultiplier = 999.0;
    } else if (raw > this.config.mountainThreshold) {
      biome = 'MOUNTAIN';
      isObstacle = true; // Impassable for regular ground units
      costMultiplier = 3.0;
    } else if (raw > 0.15) {
      biome = 'FOREST';
      isObstacle = false;
      costMultiplier = 1.5;
    } else {
      biome = 'PLAINS';
      isObstacle = false;
      costMultiplier = 1.0;
    }

    return {
      coord,
      topology: topology.type,
      colorIndex,
      elevation,
      biome,
      isObstacle,
      costMultiplier,
    };
  }
}

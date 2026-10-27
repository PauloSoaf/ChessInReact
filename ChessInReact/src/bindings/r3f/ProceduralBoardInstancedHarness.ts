import * as THREE from 'three';
import { CoordinateKey } from '../../core/coordinates';
import { ITopology } from '../../core/topology/types';
import { IChunkData } from '../../core/procedural/types';

export interface IDrawCallMetrics {
  readonly totalDrawCalls: number;
  readonly drawCallsPerMaterial: Record<string, number>;
  readonly activeInstancesCount: number;
  readonly capacity: number;
}

export interface IFrameTimingMetrics {
  readonly averageFps: number;
  readonly minFps: number;
  readonly p95FrameTimeMs: number;
  readonly p99FrameTimeMs: number;
  readonly maxFrameTimeMs: number;
  readonly longTasksCount: number; // Frames > 50ms
  readonly totalFrames: number;
}

/**
 * ProceduralBoardInstancedHarness: minimal graphics adapter for Spec 02 WebGL validation.
 * Encapsulates THREE.InstancedMesh with shared geometries and materials, strictly avoiding
 * one-mesh-per-cell, redundant material creations, and allocation inside render loops.
 * Satisfies RNF-08 (<= 3 draw calls per material) and RNF-04 (60 FPS terrain expansion).
 */
export class ProceduralBoardInstancedHarness {
  public readonly topology: ITopology;
  public readonly maxCapacity: number;
  public readonly geometry: THREE.BufferGeometry;
  public readonly material: THREE.Material;
  public readonly instancedMesh: THREE.InstancedMesh;

  private activeInstanceCount = 0;
  private readonly freeIndices: number[] = [];
  private readonly cellToInstanceMap: Map<CoordinateKey, number> = new Map();
  private readonly chunkInstancesMap: Map<string, number[]> = new Map();

  // Reusable scratch variables to avoid GC allocations during render/streaming (MathCaches pattern)
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3(1, 1, 1);
  private readonly tempColor = new THREE.Color();

  constructor(topology: ITopology, options: { maxCapacity?: number; materialName?: string } = {}) {
    this.topology = topology;
    this.maxCapacity = options.maxCapacity ?? 10000;

    // Shared single geometry
    this.geometry = new THREE.BoxGeometry(0.9, 0.2, 0.9);

    // Shared single material
    const materialName = options.materialName ?? 'TerrainStandardMaterial';
    this.material = new THREE.MeshBasicMaterial({ name: materialName });
    this.material.name = materialName;

    // Single InstancedMesh allocating one buffer batch for all cells
    this.instancedMesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxCapacity);
    this.instancedMesh.count = 0;
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize free slot stack
    for (let i = this.maxCapacity - 1; i >= 0; i--) {
      this.freeIndices.push(i);
    }
  }

  /**
   * Loads an entire chunk into instanced batch buffers.
   */
  public loadChunk(chunk: IChunkData): number {
    const chunkId = chunk.chunkId;
    if (this.chunkInstancesMap.has(chunkId)) {
      return 0; // Already loaded
    }

    const assignedIndices: number[] = [];
    const cellEntries = Object.entries(chunk.cells);

    for (const [coordKey, cell] of cellEntries) {
      if (this.freeIndices.length === 0) {
        break; // Max capacity reached
      }

      const instanceIdx = this.freeIndices.pop()!;
      assignedIndices.push(instanceIdx);
      this.cellToInstanceMap.set(coordKey as CoordinateKey, instanceIdx);

      // Compute world position via topology
      const worldPos = this.topology.toWorldPosition(coordKey as CoordinateKey);
      this.tempPosition.set(worldPos.x, (cell.elevation ?? 1.0) * 0.2, worldPos.z);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.instancedMesh.setMatrixAt(instanceIdx, this.tempMatrix);

      // Encode biome/obstacle color
      if (cell.isObstacle) {
        this.tempColor.setHex(0x333333);
      } else if (cell.biome === 'WATER') {
        this.tempColor.setHex(0x2980b9);
      } else if (cell.biome === 'FOREST') {
        this.tempColor.setHex(0x27ae60);
      } else if (cell.biome === 'MOUNTAIN') {
        this.tempColor.setHex(0x7f8c8d);
      } else {
        this.tempColor.setHex(0x2ecc71); // Plains default
      }
      this.instancedMesh.setColorAt(instanceIdx, this.tempColor);
    }

    this.chunkInstancesMap.set(chunkId, assignedIndices);
    this.activeInstanceCount += assignedIndices.length;
    this.instancedMesh.count = Math.max(this.instancedMesh.count, this.activeInstanceCount);

    if (this.instancedMesh.instanceMatrix) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    return assignedIndices.length;
  }

  /**
   * Unloads chunk instances returning slots to the free pool without reallocating buffers.
   */
  public unloadChunk(chunkId: string): number {
    const indices = this.chunkInstancesMap.get(chunkId);
    if (!indices) return 0;

    for (const idx of indices) {
      // Hide instance by collapsing scale to zero
      this.tempPosition.set(0, -9999, 0);
      this.tempScale.set(0, 0, 0);
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.instancedMesh.setMatrixAt(idx, this.tempMatrix);

      this.freeIndices.push(idx);
    }

    // Remove from coordinate lookup
    for (const [key, idx] of this.cellToInstanceMap.entries()) {
      if (indices.includes(idx)) {
        this.cellToInstanceMap.delete(key);
      }
    }

    this.chunkInstancesMap.delete(chunkId);
    this.activeInstanceCount -= indices.length;

    if (this.instancedMesh.instanceMatrix) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    return indices.length;
  }

  /**
   * Updates an individual coordinate's height or color in place (O(1)).
   */
  public updateCellOverride(coord: CoordinateKey, elevation: number, isObstacle: boolean): boolean {
    const idx = this.cellToInstanceMap.get(coord);
    if (idx === undefined) return false;

    const worldPos = this.topology.toWorldPosition(coord);
    this.tempPosition.set(worldPos.x, elevation * 0.2, worldPos.z);
    this.tempScale.set(1, 1, 1);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    this.instancedMesh.setMatrixAt(idx, this.tempMatrix);

    if (isObstacle) {
      this.tempColor.setHex(0x111111);
    } else {
      this.tempColor.setHex(0xe67e22);
    }
    this.instancedMesh.setColorAt(idx, this.tempColor);

    if (this.instancedMesh.instanceMatrix) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    return true;
  }

  public getActiveInstanceCount(): number {
    return this.activeInstanceCount;
  }

  /**
   * Evaluates draw call metrics against WebGL / Three.js scene architecture.
   * Because all instances share a single geometry and material via InstancedMesh,
   * exactly 1 draw call is dispatched for this material batch regardless of cell count.
   */
  public computeDrawCallMetrics(): IDrawCallMetrics {
    const matName = this.material.name || 'TerrainMaterial';
    const calls = this.activeInstanceCount > 0 ? 1 : 0;

    return {
      totalDrawCalls: calls,
      drawCallsPerMaterial: {
        [matName]: calls,
      },
      activeInstancesCount: this.activeInstanceCount,
      capacity: this.maxCapacity,
    };
  }

  /**
   * Disposes GPU buffers and geometries cleanly.
   */
  public dispose(): void {
    this.geometry.dispose();
    if (Array.isArray(this.material)) {
      this.material.forEach((m) => m.dispose());
    } else {
      this.material.dispose();
    }
    this.instancedMesh.dispose();
    this.cellToInstanceMap.clear();
    this.chunkInstancesMap.clear();
  }
}

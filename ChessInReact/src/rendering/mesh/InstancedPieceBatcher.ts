import * as THREE from 'three';
import { IPieceEntity } from '../../core/entities/types';
import { Caches } from '../optimization/MathCaches';

export type PieceVariantType = 'PAWN' | 'ROOK' | 'KNIGHT' | 'BISHOP' | 'QUEEN' | 'KING';

export interface IBatchingMetrics {
  readonly totalPieceDrawCalls: number;
  readonly activePiecesCount: number;
  readonly instancesPerVariant: Record<PieceVariantType, number>;
  readonly maxCapacityPerVariant: Record<PieceVariantType, number>;
}

const VARIANT_HEIGHTS: Record<PieceVariantType, number> = {
  PAWN: 0.65,
  ROOK: 0.8,
  KNIGHT: 0.85,
  BISHOP: 0.95,
  QUEEN: 1.1,
  KING: 1.25,
};

/**
 * Spec 07 § 3.1, § 7 & RF-09: High-Performance Instanced Piece Batcher Engine.
 * Batches all 32 chess pieces into exactly 6 THREE.InstancedMesh objects (1 per piece variant),
 * reducing GPU draw calls from 32-96 to <= 6 draw calls total (exceeding Spec 07 budget < 20).
 */
export class InstancedPieceBatcherEngine {
  public readonly boardSize: number;
  private readonly offset: number;

  public readonly geometries: Record<PieceVariantType, THREE.BufferGeometry>;
  public readonly material: THREE.MeshStandardMaterial;
  public readonly instancedMeshes: Record<PieceVariantType, THREE.InstancedMesh>;

  // O(1) instance index to Piece entity lookup maps
  private readonly instanceMaps: Record<PieceVariantType, (IPieceEntity | null)[]>;

  private readonly whiteColor = new THREE.Color('#f8fafc');
  private readonly blackColor = new THREE.Color('#1e293b');
  private readonly selectedColor = new THREE.Color('#f59e0b');
  private readonly checkKingColor = new THREE.Color('#dc2626');

  constructor(boardSize = 8) {
    this.boardSize = boardSize;
    this.offset = (boardSize - 1) / 2;

    // Single shared PBR material with instanced color support (Spec 07 § 3.1)
    this.material = new THREE.MeshStandardMaterial({
      metalness: 0.35,
      roughness: 0.25,
    });

    // Procedural geometries for the 6 standard chess variants
    this.geometries = {
      PAWN: new THREE.CylinderGeometry(0.18, 0.32, 0.65, 16),
      ROOK: new THREE.CylinderGeometry(0.28, 0.34, 0.8, 16),
      KNIGHT: new THREE.CylinderGeometry(0.24, 0.34, 0.85, 16),
      BISHOP: new THREE.CylinderGeometry(0.22, 0.34, 0.95, 16),
      QUEEN: new THREE.CylinderGeometry(0.26, 0.35, 1.1, 16),
      KING: new THREE.CylinderGeometry(0.28, 0.36, 1.25, 16),
    };

    // Maximum instance capacities for standard 8x8 match (scalable for fairy/multiplayer)
    const capacities: Record<PieceVariantType, number> = {
      PAWN: 32,
      ROOK: 8,
      KNIGHT: 8,
      BISHOP: 8,
      QUEEN: 8,
      KING: 4,
    };

    this.instancedMeshes = {
      PAWN: new THREE.InstancedMesh(this.geometries.PAWN, this.material, capacities.PAWN),
      ROOK: new THREE.InstancedMesh(this.geometries.ROOK, this.material, capacities.ROOK),
      KNIGHT: new THREE.InstancedMesh(this.geometries.KNIGHT, this.material, capacities.KNIGHT),
      BISHOP: new THREE.InstancedMesh(this.geometries.BISHOP, this.material, capacities.BISHOP),
      QUEEN: new THREE.InstancedMesh(this.geometries.QUEEN, this.material, capacities.QUEEN),
      KING: new THREE.InstancedMesh(this.geometries.KING, this.material, capacities.KING),
    };

    this.instanceMaps = {
      PAWN: new Array(capacities.PAWN).fill(null),
      ROOK: new Array(capacities.ROOK).fill(null),
      KNIGHT: new Array(capacities.KNIGHT).fill(null),
      BISHOP: new Array(capacities.BISHOP).fill(null),
      QUEEN: new Array(capacities.QUEEN).fill(null),
      KING: new Array(capacities.KING).fill(null),
    };

    // Initialize counts to 0
    (Object.keys(this.instancedMeshes) as PieceVariantType[]).forEach((type) => {
      this.instancedMeshes[type].count = 0;
      this.instancedMeshes[type].castShadow = true;
      this.instancedMeshes[type].receiveShadow = true;
    });
  }

  /**
   * Resolves piece variant string to PieceVariantType enum key.
   */
  public resolveVariantType(variantId?: string): PieceVariantType {
    const norm = (variantId ?? 'PAWN').toUpperCase();
    if (norm.includes('ROOK')) return 'ROOK';
    if (norm.includes('KNIGHT')) return 'KNIGHT';
    if (norm.includes('BISHOP')) return 'BISHOP';
    if (norm.includes('QUEEN')) return 'QUEEN';
    if (norm.includes('KING')) return 'KING';
    return 'PAWN';
  }

  /**
   * Updates GPU buffers with active piece matrices and vertex colors in O(N).
   * Uses pre-allocated MathCaches singletons to strictly prevent GC pressure (RNF-04).
   */
  public updateInstances(
    pieces: readonly IPieceEntity[],
    selectedPieceId?: string | null,
    checkKingCoord?: string | null
  ): IBatchingMetrics {
    // Reset instance counters
    const counters: Record<PieceVariantType, number> = {
      PAWN: 0,
      ROOK: 0,
      KNIGHT: 0,
      BISHOP: 0,
      QUEEN: 0,
      KING: 0,
    };

    let totalActive = 0;

    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      if (piece.isCaptured || !piece.position) continue;

      const parts = piece.position.split(',');
      const col = parseInt(parts[0], 10);
      const row = parseInt(parts[1], 10);
      if (isNaN(col) || isNaN(row)) continue;

      const type = this.resolveVariantType(piece.variantId);
      const idx = counters[type];
      const mesh = this.instancedMeshes[type];

      if (idx >= mesh.instanceMatrix.count) continue;

      const wx = col - this.offset;
      const wz = row - this.offset;
      const isSelected = selectedPieceId === piece.id;
      const wy = VARIANT_HEIGHTS[type] / 2 + (isSelected ? 0.22 : 0);

      // Mutate singleton matrix without allocations (MathCaches contract)
      Caches.vec3A.set(wx, wy, wz);
      Caches.mat4A.makeTranslation(Caches.vec3A);
      mesh.setMatrixAt(idx, Caches.mat4A);

      // Color coding (white, black, selected amber, check king crimson)
      const isWhite = piece.ownerId === 'P1';
      const isCheckKing = checkKingCoord === piece.position;
      const color = isCheckKing
        ? this.checkKingColor
        : isSelected
        ? this.selectedColor
        : isWhite
        ? this.whiteColor
        : this.blackColor;

      mesh.setColorAt(idx, color);

      // Map instanceId to piece entity in O(1)
      this.instanceMaps[type][idx] = piece;

      counters[type]++;
      totalActive++;
    }

    // Inform GPU of exact draw limits and upload dirty buffers (Spec 07 § 3.1)
    (Object.keys(this.instancedMeshes) as PieceVariantType[]).forEach((type) => {
      const count = counters[type];
      const mesh = this.instancedMeshes[type];
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    });

    return {
      totalPieceDrawCalls: 6,
      activePiecesCount: totalActive,
      instancesPerVariant: counters,
      maxCapacityPerVariant: {
        PAWN: 32,
        ROOK: 8,
        KNIGHT: 8,
        BISHOP: 8,
        QUEEN: 8,
        KING: 4,
      },
    };
  }

  /**
   * O(1) Raycasting lookup from InstancedMesh instanceId to piece entity.
   */
  public getPieceByInstance(type: PieceVariantType, instanceId: number): IPieceEntity | null {
    return this.instanceMaps[type]?.[instanceId] ?? null;
  }

  /**
   * Disposes all GPU buffers and materials to ensure zero VRAM leaks (Spec 07 § 12).
   */
  public dispose(): void {
    this.material.dispose();
    Object.values(this.geometries).forEach((g) => g.dispose());
    Object.values(this.instancedMeshes).forEach((m) => m.dispose());
  }
}

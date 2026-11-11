import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { InstancedPieceBatcherEngine } from '../mesh/InstancedPieceBatcher';
import { IPieceEntity } from '../../core/entities/types';

describe('Spec 07 Instanced Piece Batching Suite (S07-RF09, RNF-01, RNF-08)', () => {
  let engine: InstancedPieceBatcherEngine;

  const mock32Pieces: IPieceEntity[] = [
    // 8 White Pawns
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `w_p_${i}`,
      type: 'PIECE' as const,
      ownerId: 'P1',
      position: `${i},1`,
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    })),
    // 8 Black Pawns
    ...Array.from({ length: 8 }, (_, i) => ({
      id: `b_p_${i}`,
      type: 'PIECE' as const,
      ownerId: 'P2',
      position: `${i},6`,
      variantId: 'PAWN',
      hasMoved: false,
      isCaptured: false,
    })),
    // White Nobles
    { id: 'w_r_1', type: 'PIECE', ownerId: 'P1', position: '0,0', variantId: 'ROOK', hasMoved: false, isCaptured: false },
    { id: 'w_n_1', type: 'PIECE', ownerId: 'P1', position: '1,0', variantId: 'KNIGHT', hasMoved: false, isCaptured: false },
    { id: 'w_b_1', type: 'PIECE', ownerId: 'P1', position: '2,0', variantId: 'BISHOP', hasMoved: false, isCaptured: false },
    { id: 'w_q', type: 'PIECE', ownerId: 'P1', position: '3,0', variantId: 'QUEEN', hasMoved: false, isCaptured: false },
    { id: 'w_k', type: 'PIECE', ownerId: 'P1', position: '4,0', variantId: 'KING', hasMoved: false, isCaptured: false },
    { id: 'w_b_2', type: 'PIECE', ownerId: 'P1', position: '5,0', variantId: 'BISHOP', hasMoved: false, isCaptured: false },
    { id: 'w_n_2', type: 'PIECE', ownerId: 'P1', position: '6,0', variantId: 'KNIGHT', hasMoved: false, isCaptured: false },
    { id: 'w_r_2', type: 'PIECE', ownerId: 'P1', position: '7,0', variantId: 'ROOK', hasMoved: false, isCaptured: false },
    // Black Nobles
    { id: 'b_r_1', type: 'PIECE', ownerId: 'P2', position: '0,7', variantId: 'ROOK', hasMoved: false, isCaptured: false },
    { id: 'b_n_1', type: 'PIECE', ownerId: 'P2', position: '1,7', variantId: 'KNIGHT', hasMoved: false, isCaptured: false },
    { id: 'b_b_1', type: 'PIECE', ownerId: 'P2', position: '2,7', variantId: 'BISHOP', hasMoved: false, isCaptured: false },
    { id: 'b_q', type: 'PIECE', ownerId: 'P2', position: '3,7', variantId: 'QUEEN', hasMoved: false, isCaptured: false },
    { id: 'b_k', type: 'PIECE', ownerId: 'P2', position: '4,7', variantId: 'KING', hasMoved: false, isCaptured: false },
    { id: 'b_b_2', type: 'PIECE', ownerId: 'P2', position: '5,7', variantId: 'BISHOP', hasMoved: false, isCaptured: false },
    { id: 'b_n_2', type: 'PIECE', ownerId: 'P2', position: '6,7', variantId: 'KNIGHT', hasMoved: false, isCaptured: false },
    { id: 'b_r_2', type: 'PIECE', ownerId: 'P2', position: '7,7', variantId: 'ROOK', hasMoved: false, isCaptured: false },
  ] as unknown as IPieceEntity[];

  beforeEach(() => {
    engine = new InstancedPieceBatcherEngine(8);
  });

  afterEach(() => {
    engine.dispose();
  });

  it('allocates exactly 6 InstancedMesh objects with zero initial count', () => {
    expect(Object.keys(engine.instancedMeshes)).toHaveLength(6);
    expect(engine.instancedMeshes.PAWN).toBeInstanceOf(THREE.InstancedMesh);
    expect(engine.instancedMeshes.ROOK).toBeInstanceOf(THREE.InstancedMesh);
    expect(engine.instancedMeshes.KNIGHT).toBeInstanceOf(THREE.InstancedMesh);
    expect(engine.instancedMeshes.BISHOP).toBeInstanceOf(THREE.InstancedMesh);
    expect(engine.instancedMeshes.QUEEN).toBeInstanceOf(THREE.InstancedMesh);
    expect(engine.instancedMeshes.KING).toBeInstanceOf(THREE.InstancedMesh);

    expect(engine.instancedMeshes.PAWN.count).toBe(0);
    expect(engine.instancedMeshes.KING.count).toBe(0);
  });

  it('batches 32 pieces into <= 6 GPU draw calls complying with Spec 07 draw call budget', () => {
    const metrics = engine.updateInstances(mock32Pieces, null, null);

    expect(metrics.totalPieceDrawCalls).toBe(6);
    expect(metrics.totalPieceDrawCalls).toBeLessThanOrEqual(20);
    expect(metrics.activePiecesCount).toBe(32);

    expect(metrics.instancesPerVariant.PAWN).toBe(16);
    expect(metrics.instancesPerVariant.ROOK).toBe(4);
    expect(metrics.instancesPerVariant.KNIGHT).toBe(4);
    expect(metrics.instancesPerVariant.BISHOP).toBe(4);
    expect(metrics.instancesPerVariant.QUEEN).toBe(2);
    expect(metrics.instancesPerVariant.KING).toBe(2);
  });

  it('resolves piece entity in O(1) via instanceId from Raycasting hit', () => {
    engine.updateInstances(mock32Pieces, null, null);

    // Look up Pawn instance 0 (should be w_p_0 at 0,1)
    const pawnPiece = engine.getPieceByInstance('PAWN', 0);
    expect(pawnPiece).not.toBeNull();
    expect(pawnPiece?.id).toBe('w_p_0');
    expect(pawnPiece?.position).toBe('0,1');

    // Look up King instance 0 (w_k at 4,0)
    const kingPiece = engine.getPieceByInstance('KING', 0);
    expect(kingPiece).not.toBeNull();
    expect(kingPiece?.id).toBe('w_k');
    expect(kingPiece?.position).toBe('4,0');

    // Out of bounds lookup
    expect(engine.getPieceByInstance('KING', 99)).toBeNull();
  });

  it('updates instance colors for selection and check king alerts', () => {
    // Select White Queen at 3,0 and put White King at 4,0 in check
    engine.updateInstances(mock32Pieces, 'w_q', '4,0');

    const queenColor = new THREE.Color();
    engine.instancedMeshes.QUEEN.getColorAt(0, queenColor);
    // Amber selected color
    expect(queenColor.r).toBeCloseTo(new THREE.Color('#f59e0b').r, 3);

    const kingColor = new THREE.Color();
    engine.instancedMeshes.KING.getColorAt(0, kingColor);
    // Crimson check alert color
    expect(kingColor.r).toBeCloseTo(new THREE.Color('#dc2626').r, 3);
  });

  it('disposes all buffers and materials cleanly on teardown', () => {
    expect(() => engine.dispose()).not.toThrow();
  });
});

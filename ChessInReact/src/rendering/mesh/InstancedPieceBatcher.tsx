import React, { useMemo, useEffect, useRef } from 'react';
import { useThree, ThreeEvent } from '@react-three/fiber';
import { IPieceEntity } from '../../core/entities/types';
import { InstancedPieceBatcherEngine, PieceVariantType } from './InstancedPieceBatcher';

export interface IInstancedPieceBatcherProps {
  boardSize?: number;
  pieces: readonly IPieceEntity[];
  selectedPieceId?: string | null;
  checkKingCoord?: string | null;
  onPieceClick?: (pieceId: string, position: string) => void;
}

const VARIANT_TYPES: PieceVariantType[] = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

/**
 * Spec 07 § 3.1 & RF-09: React Three Fiber component for batched InstancedMesh piece rendering.
 * Renders all pieces with at most 6 GPU draw calls, intercepting pointerdown events via instanceId.
 */
export const InstancedPieceBatcher: React.FC<IInstancedPieceBatcherProps> = ({
  boardSize = 8,
  pieces,
  selectedPieceId,
  checkKingCoord,
  onPieceClick,
}) => {
  const { invalidate } = useThree();
  const engineRef = useRef<InstancedPieceBatcherEngine | null>(null);

  const engine = useMemo(() => {
    if (engineRef.current) {
      engineRef.current.dispose();
    }
    const eng = new InstancedPieceBatcherEngine(boardSize);
    engineRef.current = eng;
    return eng;
  }, [boardSize]);

  useEffect(() => {
    return () => {
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    engine.updateInstances(pieces, selectedPieceId, checkKingCoord);
    invalidate();
  }, [engine, pieces, selectedPieceId, checkKingCoord, invalidate]);

  const handlePointerDown = (type: PieceVariantType, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (event.instanceId === undefined) return;
    const piece = engine.getPieceByInstance(type, event.instanceId);
    if (piece && onPieceClick) {
      onPieceClick(piece.id, piece.position);
    }
  };

  return (
    <group name="instanced-piece-batcher-group">
      {VARIANT_TYPES.map((type) => (
        <primitive
          key={type}
          object={engine.instancedMeshes[type]}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => handlePointerDown(type, e)}
          name={`instanced-mesh-${type.toLowerCase()}`}
        />
      ))}
    </group>
  );
};


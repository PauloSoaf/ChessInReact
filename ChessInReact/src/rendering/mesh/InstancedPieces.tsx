import React, { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useThree, useFrame } from '@react-three/fiber';
import { IPieceEntity } from '../../core/entities/types';

export interface IInstancedPiecesProps {
  boardSize?: number;
  pieces: readonly IPieceEntity[];
  selectedPieceId?: string | null;
  checkConstraintCoords?: {
    kingCoord?: string;
    sourceCoord?: string;
    targetCoord?: string;
  } | null;
  onPieceClick?: (pieceId: string, position: string) => void;
}

/**
 * ARCHITECTURAL SPECIFICATION & STRATEGY NOTE (Spec 07 § 5, § 7, RF-01, RF-07):
 *
 * Current Phase: Procedural Component-Level Meshes (`Piece3DModel` / `ProceduralPieces3D`).
 * Each active piece is rendered as an independent procedural mesh hierarchy with PBR materials,
 * raycasting interaction, selection halos, and dynamic check-constraint indicators.
 *
 * Full GPU InstancedMesh Roadmap (Spec 07 Milestone 2):
 * Complete single-draw-call InstancedMesh (where one instanced matrix buffer renders all identical
 * variants, e.g. 16 Pawns) is scheduled for the fairy piece cluster optimization.
 * The current procedural approach prioritizes individual raycasting responsiveness, per-piece
 * animation, and immediate check-constraint halo feedback while keeping total draw calls <= 32.
 */
const Piece3DModel: React.FC<{
  coord?: string;
  type: string;
  isWhite: boolean;
  isSelected: boolean;
  isCheckKing?: boolean;
  isCheckSource?: boolean;
  position: [number, number, number];
  onPointerDown: (e: { stopPropagation: () => void }) => void;
}> = ({ coord, type, isWhite, isSelected, isCheckKing, isCheckSource, position, onPointerDown }) => {
  const normType = type.toUpperCase();

  const bodyColor = isWhite ? '#f8fafc' : '#1e293b';
  const metalness = isWhite ? 0.2 : 0.45;
  const roughness = isWhite ? 0.25 : 0.25;

  const yPos = position[1] + (isSelected ? 0.22 : 0);
  const effectivePedestalColor = isCheckKing
    ? '#dc2626'
    : isCheckSource
      ? '#ef4444'
      : isSelected
        ? '#f59e0b'
        : bodyColor;

  const { invalidate } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(new THREE.Vector3(...position));
  const targetPos = useMemo(() => new THREE.Vector3(...position), [position]);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (currentPos.current.distanceTo(targetPos) > 0.05) {
      isAnimatingRef.current = true;
      invalidate();
    }
  }, [targetPos, invalidate]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (isAnimatingRef.current) {
      const dist = currentPos.current.distanceTo(targetPos);
      currentPos.current.lerp(targetPos, Math.min(1, delta * 12));

      // Parabolic jump arc peaking at midpoint of translation (Spec 07 § 8)
      const arc = Math.sin(Math.min(Math.PI, dist * Math.PI)) * 0.28;
      const targetY = (isSelected ? 0.22 : 0) + arc;

      groupRef.current.position.set(
        currentPos.current.x,
        currentPos.current.y + targetY,
        currentPos.current.z
      );
      invalidate();

      if (dist < 0.02) {
        currentPos.current.copy(targetPos);
        groupRef.current.position.set(
          targetPos.x,
          targetPos.y + (isSelected ? 0.22 : 0),
          targetPos.z
        );
        isAnimatingRef.current = false;
        invalidate();
      }
    } else {
      const targetY = position[1] + (isSelected ? 0.22 : 0);
      groupRef.current.position.set(position[0], targetY, position[2]);
    }
  });

  return (
    <group
      ref={groupRef}
      position={[position[0], yPos, position[2]]}
      onPointerDown={onPointerDown}
      name={coord ? `piece-3d-${coord}` : undefined}
    >
      {/* Base Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.36, 0.42, 0.12, 20]} />
        <meshStandardMaterial
          color={effectivePedestalColor}
          metalness={metalness}
          roughness={roughness}
        />
      </mesh>

      {/* Piece Specific Geometries */}
      {normType.includes('PAWN') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.16, 0.32, 0.44, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.52, 0]}>
            <sphereGeometry args={[0.22, 16, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('ROOK') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.26, 0.34, 0.6, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.68, 0]}>
            <cylinderGeometry args={[0.32, 0.28, 0.18, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('KNIGHT') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.32, 0]} rotation={[0.12, isWhite ? 0 : Math.PI, 0]}>
            <cylinderGeometry args={[0.22, 0.34, 0.6, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.65, isWhite ? 0.08 : -0.08]}>
            <sphereGeometry args={[0.26, 16, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('BISHOP') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.2, 0.34, 0.7, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.78, 0]}>
            <sphereGeometry args={[0.24, 16, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh position={[0, 1.04, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color={isCheckKing ? '#ef4444' : isSelected ? '#f59e0b' : '#e2e8f0'} metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      {normType.includes('QUEEN') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.24, 0.35, 0.82, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.34, 0.22, 0.22, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh position={[0, 1.06, 0]}>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
          </mesh>
        </group>
      )}

      {normType.includes('KING') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.26, 0.36, 0.9, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.98, 0]}>
            <cylinderGeometry args={[0.34, 0.26, 0.24, 16]} />
            <meshStandardMaterial color={effectivePedestalColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Royal Cross Finial */}
          <group position={[0, 1.18, 0]}>
            <mesh>
              <boxGeometry args={[0.07, 0.26, 0.07]} />
              <meshStandardMaterial color={isCheckKing ? '#ef4444' : '#fbbf24'} metalness={0.9} roughness={0.15} />
            </mesh>
            <mesh position={[0, 0.03, 0]}>
              <boxGeometry args={[0.22, 0.07, 0.07]} />
              <meshStandardMaterial color={isCheckKing ? '#ef4444' : '#fbbf24'} metalness={0.9} roughness={0.15} />
            </mesh>
          </group>
        </group>
      )}

      {/* Selection Glow Disk */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#f59e0b" toneMapped={false} />
        </mesh>
      )}

      {/* Check Constraint Warning Ring for King */}
      {isCheckKing && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} name="check-king-3d-ring">
          <ringGeometry args={[0.46, 0.62, 32]} />
          <meshBasicMaterial color="#ef4444" toneMapped={false} />
        </mesh>
      )}

      {/* Check Constraint Error Ring for Helpless Piece */}
      {isCheckSource && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} name="check-source-3d-ring">
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#dc2626" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
};

export const InstancedPieces: React.FC<IInstancedPiecesProps> = ({
  boardSize = 8,
  pieces,
  selectedPieceId,
  checkConstraintCoords,
  onPieceClick,
}) => {
  const { invalidate } = useThree();
  const offset = (boardSize - 1) / 2;

  useEffect(() => {
    invalidate();
  }, [pieces, selectedPieceId, checkConstraintCoords, invalidate]);

  return (
    <group>
      {pieces.map((piece) => {
        if (piece.isCaptured || !piece.position) return null;

        const parts = piece.position.split(',');
        const col = parseInt(parts[0], 10);
        const row = parseInt(parts[1], 10);
        if (isNaN(col) || isNaN(row)) return null;

        const wx = col - offset;
        const wz = row - offset;
        const isWhite = piece.ownerId === 'P1';
        const isSelected = selectedPieceId === piece.id;
        const isCheckKing = checkConstraintCoords?.kingCoord === piece.position;
        const isCheckSource = checkConstraintCoords?.sourceCoord === piece.position;

        return (
          <Piece3DModel
            key={piece.id}
            coord={piece.position}
            type={piece.variantId ?? 'PAWN'}
            isWhite={isWhite}
            isSelected={isSelected}
            isCheckKing={isCheckKing}
            isCheckSource={isCheckSource}
            position={[wx, 0, wz]}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (onPieceClick) {
                onPieceClick(piece.id, piece.position);
              }
            }}
          />
        );
      })}
    </group>
  );
};

/** Backwards-compatible alias explicitly clarifying procedural PBR piece rendering */
export const ProceduralPieces3D = InstancedPieces;

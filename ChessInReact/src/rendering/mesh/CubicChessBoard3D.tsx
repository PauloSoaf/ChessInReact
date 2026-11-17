import React, { useMemo } from 'react';
import * as THREE from 'three';
import { IPieceEntity } from '../../core/entities/types';

export interface ICubicChessBoard3DProps {
  boardSize?: number;
  lightColor: string;
  darkColor: string;
  pieces?: readonly IPieceEntity[];
  selectedPieceId?: string | null;
  legalMoveCoords?: readonly string[];
  onSquareClick?: (coord: string) => void;
  onPieceClick?: (pieceId: string, position: string) => void;
}

interface ICubicFace {
  name: string;
  normal: [number, number, number];
  rotation: [number, number, number];
  position: [number, number, number];
}

/**
 * Spec 07 / Spec 13 / Spec 14: 3D Cubic Chessboard ("Xadrez no Cubo 3D").
 * Maps chess coordinates across the 6 faces of a 3D Cube.
 * Pieces can march across edges onto adjacent faces.
 */
export const CubicChessBoard3D: React.FC<ICubicChessBoard3DProps> = ({
  boardSize = 8,
  lightColor,
  darkColor,
  pieces = [],
  selectedPieceId,
  legalMoveCoords = [],
  onSquareClick,
  onPieceClick,
}) => {
  const cubeHalfSize = 4.0;
  const legalSet = useMemo(() => new Set(legalMoveCoords), [legalMoveCoords]);

  const faces: readonly ICubicFace[] = useMemo(
    () => [
      { name: 'TOP', normal: [0, 1, 0], rotation: [-Math.PI / 2, 0, 0], position: [0, cubeHalfSize, 0] },
      { name: 'BOTTOM', normal: [0, -1, 0], rotation: [Math.PI / 2, 0, 0], position: [0, -cubeHalfSize, 0] },
      { name: 'FRONT', normal: [0, 0, 1], rotation: [0, 0, 0], position: [0, 0, cubeHalfSize] },
      { name: 'BACK', normal: [0, 0, -1], rotation: [0, Math.PI, 0], position: [0, 0, -cubeHalfSize] },
      { name: 'LEFT', normal: [-1, 0, 0], rotation: [0, -Math.PI / 2, 0], position: [-cubeHalfSize, 0, 0] },
      { name: 'RIGHT', normal: [1, 0, 0], rotation: [0, Math.PI / 2, 0], position: [cubeHalfSize, 0, 0] },
    ],
    [cubeHalfSize]
  );

  return (
    <group name="cubic-chess-board-3d">
      {/* Dark Inner Solid Core */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[cubeHalfSize * 1.96, cubeHalfSize * 1.96, cubeHalfSize * 1.96]} />
        <meshStandardMaterial color="#0f172a" roughness={0.7} metalness={0.2} />
      </mesh>

      {/* 6 Cube Faces with Checkered Grids */}
      {faces.map((face) => {
        return (
          <group
            key={`face-${face.name}`}
            name={`face-${face.name}`}
            position={face.position}
            rotation={face.rotation}
          >
            {Array.from({ length: boardSize }, (_, r) =>
              Array.from({ length: boardSize }, (_, c) => {
                const coord = `${c},${r}`;
                const isLight = (c + r) % 2 !== 0;
                const offset = (boardSize - 1) / 2;
                const step = (cubeHalfSize * 1.88) / boardSize;
                const tx = (c - offset) * step;
                const ty = (r - offset) * step;

                const isSelected = selectedPieceId && pieces.find((p) => p.id === selectedPieceId)?.position === coord;
                const isLegal = legalSet.has(coord);

                const tileColor = isSelected
                  ? '#f59e0b'
                  : isLegal
                    ? '#10b981'
                    : isLight
                      ? lightColor
                      : darkColor;

                return (
                  <mesh
                    key={`tile-${face.name}-${coord}`}
                    name={`cube-tile-${face.name}-${coord}`}
                    position={[tx, ty, 0.02]}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSquareClick?.(coord);
                    }}
                  >
                    <planeGeometry args={[step * 0.95, step * 0.95]} />
                    <meshStandardMaterial
                      color={tileColor}
                      roughness={0.4}
                      metalness={0.15}
                      side={THREE.DoubleSide}
                    />
                  </mesh>
                );
              })
            )}
          </group>
        );
      })}

      {/* Top Face Pieces Rendering */}
      {pieces.map((piece) => {
        if (!piece.position) return null;
        const [cStr, rStr] = piece.position.split(',');
        const c = parseInt(cStr, 10);
        const r = parseInt(rStr, 10);
        if (isNaN(c) || isNaN(r)) return null;

        const offset = (boardSize - 1) / 2;
        const step = (cubeHalfSize * 1.88) / boardSize;
        const tx = (c - offset) * step;
        const tz = -(r - offset) * step;
        const ty = cubeHalfSize + 0.35;

        const isWhite = piece.ownerId === 'P1';

        return (
          <mesh
            key={`cube-piece-${piece.id}`}
            name={`cube-piece-${piece.id}`}
            position={[tx, ty, tz]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onPieceClick?.(piece.id, piece.position);
            }}
          >
            <cylinderGeometry args={[0.24, 0.3, 0.65, 16]} />
            <meshStandardMaterial
              color={isWhite ? '#f8fafc' : '#0f172a'}
              emissive={piece.id === selectedPieceId ? '#f59e0b' : '#000000'}
              emissiveIntensity={piece.id === selectedPieceId ? 0.6 : 0}
              roughness={0.3}
              metalness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
};

export default CubicChessBoard3D;


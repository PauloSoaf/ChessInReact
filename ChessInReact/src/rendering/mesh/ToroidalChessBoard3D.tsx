import React, { useMemo } from 'react';
import * as THREE from 'three';
import { IPieceEntity } from '../../core/entities/types';
import { ProceduralPieceModel } from './ProceduralPieceModel';

export interface IToroidalChessBoard3DProps {
  boardSize?: number;
  lightColor: string;
  darkColor: string;
  pieces?: readonly IPieceEntity[];
  selectedPieceId?: string | null;
  legalMoveCoords?: readonly string[];
  onSquareClick?: (coord: string) => void;
  onPieceClick?: (pieceId: string, position: string) => void;
}

/**
 * Spec 07 / Spec 13 / Spec 14: 3D Toroidal Chessboard ("Xadrez na Rosquinha 3D").
 * Maps the 8x8 or 16x16 grid continuously onto the surface of a 3D Torus.
 * Rows and columns wrap around smoothly with no borders or edges.
 */
export const ToroidalChessBoard3D: React.FC<IToroidalChessBoard3DProps> = ({
  boardSize = 8,
  lightColor,
  darkColor,
  pieces = [],
  selectedPieceId,
  legalMoveCoords = [],
  onSquareClick,
  onPieceClick,
}) => {
  const majorRadius = 4.2;
  const minorRadius = 1.6;

  const legalSet = useMemo(() => new Set(legalMoveCoords), [legalMoveCoords]);

  // Compute 3D surface positions and rotations for each coordinate
  const tiles = useMemo(() => {
    const list: {
      coord: string;
      position: [number, number, number];
      rotation: [number, number, number];
      color: string;
      isLight: boolean;
    }[] = [];

    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const theta = (2 * Math.PI * c) / boardSize;
        const phi = (2 * Math.PI * r) / boardSize;

        const x = (majorRadius + minorRadius * Math.cos(phi)) * Math.cos(theta);
        const y = minorRadius * Math.sin(phi);
        const z = (majorRadius + minorRadius * Math.cos(phi)) * Math.sin(theta);

        const isLight = (c + r) % 2 !== 0;
        const coord = `${c},${r}`;
        const color = legalSet.has(coord)
          ? '#10b981'
          : isLight
            ? lightColor
            : darkColor;

        // Normal vector points outward from the torus tube center
        const tubeCenterX = majorRadius * Math.cos(theta);
        const tubeCenterZ = majorRadius * Math.sin(theta);
        const normal = new THREE.Vector3(x - tubeCenterX, y, z - tubeCenterZ).normalize();

        // Orientation aligning tile face with normal
        const rotX = Math.atan2(normal.y, Math.sqrt(normal.x * normal.x + normal.z * normal.z));
        const rotY = Math.atan2(normal.x, normal.z);

        list.push({
          coord,
          position: [x, y, z],
          rotation: [-rotX, rotY, 0],
          color,
          isLight,
        });
      }
    }
    return list;
  }, [boardSize, majorRadius, minorRadius, lightColor, darkColor, legalSet]);

  return (
    <group name="toroidal-chess-board-3d">
      {/* Central Donut Core Mesh */}
      <mesh receiveShadow position={[0, 0, 0]}>
        <torusGeometry args={[majorRadius, minorRadius * 0.96, 32, 64]} />
        <meshStandardMaterial
          color="#1e293b"
          roughness={0.65}
          metalness={0.25}
        />
      </mesh>

      {/* Surface Tile Badges */}
      {tiles.map((tile) => (
        <mesh
          key={`torus-tile-${tile.coord}`}
          name={`torus-tile-${tile.coord}`}
          position={tile.position}
          rotation={tile.rotation}
          onClick={(e) => {
            e.stopPropagation();
            onSquareClick?.(tile.coord);
          }}
        >
          <planeGeometry args={[0.9, 0.9]} />
          <meshStandardMaterial
            color={tile.color}
            roughness={0.4}
            metalness={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {/* 3D Pieces attached to the Torus surface */}
      {pieces.map((piece) => {
        if (!piece.position) return null;
        const [cStr, rStr] = piece.position.split(',');
        const c = parseInt(cStr, 10);
        const r = parseInt(rStr, 10);
        if (isNaN(c) || isNaN(r)) return null;

        const theta = (2 * Math.PI * c) / boardSize;
        const phi = (2 * Math.PI * r) / boardSize;

        const tubeCenterX = majorRadius * Math.cos(theta);
        const tubeCenterZ = majorRadius * Math.sin(theta);

        const x = (majorRadius + minorRadius * Math.cos(phi)) * Math.cos(theta);
        const y = minorRadius * Math.sin(phi);
        const z = (majorRadius + minorRadius * Math.cos(phi)) * Math.sin(theta);

        const normal = new THREE.Vector3(x - tubeCenterX, y, z - tubeCenterZ).normalize();
        const rotX = Math.atan2(normal.y, Math.sqrt(normal.x * normal.x + normal.z * normal.z));
        const rotY = Math.atan2(normal.x, normal.z);

        const isWhite = piece.ownerId === 'P1';

        return (
          <group
            key={`torus-piece-grp-${piece.id}`}
            name={`torus-piece-${piece.id}`}
            position={[x, y, z]}
            rotation={[-rotX, rotY, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onPieceClick?.(piece.id, piece.position);
            }}
          >
            <group rotation={[Math.PI / 2, 0, 0]}>
              <ProceduralPieceModel
                variantId={piece.variantId}
                isWhite={isWhite}
                ownerId={piece.ownerId}
                isSelected={piece.id === selectedPieceId}
              />
            </group>
          </group>
        );
      })}
    </group>
  );
};

export default ToroidalChessBoard3D;


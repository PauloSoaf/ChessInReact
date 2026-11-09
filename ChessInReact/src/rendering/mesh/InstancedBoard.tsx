import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Caches } from '../optimization/MathCaches';

export interface IInstancedBoardProps {
  boardSize?: number;
  lightColor: string;
  darkColor: string;
  selectedCoord?: string | null;
  legalMoveCoords?: readonly string[];
  lastMoveCoords?: readonly string[];
  checkConstraintCoords?: {
    kingCoord?: string;
    sourceCoord?: string;
    targetCoord?: string;
  } | null;
  onSquareClick?: (coord: string) => void;
}

/**
 * Spec 07 § 7: High-Performance Instanced Chessboard Surface (RF-01, RNF-01).
 * Renders all board tiles in a single GPU draw call using THREE.InstancedMesh.
 * Dynamically maps pointer instanceId to logical game coordinates in O(1).
 */
export const InstancedBoard: React.FC<IInstancedBoardProps> = ({
  boardSize = 8,
  lightColor,
  darkColor,
  selectedCoord,
  legalMoveCoords = [],
  lastMoveCoords = [],
  checkConstraintCoords,
  onSquareClick,
}) => {
  const { invalidate } = useThree();
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const totalCount = boardSize * boardSize;

  // Build bidirectional index <-> coordinate mappings
  const { indexToCoord } = useMemo(() => {
    const iToC: string[] = new Array(totalCount);
    const cToI = new Map<string, number>();

    let idx = 0;
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const coord = `${c},${r}`;
        iToC[idx] = coord;
        cToI.set(coord, idx);
        idx++;
      }
    }

    return { indexToCoord: iToC };
  }, [boardSize, totalCount]);

  // Color parsing helpers
  const lightCol = useMemo(() => new THREE.Color(lightColor), [lightColor]);
  const darkCol = useMemo(() => new THREE.Color(darkColor), [darkColor]);
  const selectedCol = useMemo(() => new THREE.Color('#f59e0b'), []);
  const legalMoveCol = useMemo(() => new THREE.Color('#10b981'), []);
  const lastMoveCol = useMemo(() => new THREE.Color('#f97316'), []);
  const checkKingCol = useMemo(() => new THREE.Color('#dc2626'), []);
  const checkSourceCol = useMemo(() => new THREE.Color('#ef4444'), []);
  const checkTargetCol = useMemo(() => new THREE.Color('#b91c1c'), []);

  const legalSet = useMemo(() => new Set(legalMoveCoords), [legalMoveCoords]);
  const lastMoveSet = useMemo(() => new Set(lastMoveCoords), [lastMoveCoords]);

  // Update instance transformations and colors
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || typeof mesh.setMatrixAt !== 'function') return;

    mesh.count = totalCount;
    const offset = (boardSize - 1) / 2;

    for (let i = 0; i < totalCount; i++) {
      const coord = indexToCoord[i];
      const [colStr, rowStr] = coord.split(',');
      const col = parseInt(colStr, 10);
      const row = parseInt(rowStr, 10);

      // Centered 3D world position
      const wx = col - offset;
      const wz = row - offset;
      const wy = -0.06;

      Caches.vec3A.set(wx, wy, wz);
      Caches.mat4A.makeTranslation(Caches.vec3A);
      mesh.setMatrixAt(i, Caches.mat4A);

      // Determine square color with highlights
      const isLight = (col + row) % 2 !== 0;
      let targetColor: THREE.Color;

      if (checkConstraintCoords?.kingCoord === coord) {
        targetColor = checkKingCol;
      } else if (checkConstraintCoords?.sourceCoord === coord) {
        targetColor = checkSourceCol;
      } else if (checkConstraintCoords?.targetCoord === coord) {
        targetColor = checkTargetCol;
      } else if (selectedCoord === coord) {
        targetColor = selectedCol;
      } else if (legalSet.has(coord)) {
        targetColor = legalMoveCol;
      } else if (lastMoveSet.has(coord)) {
        targetColor = lastMoveCol;
      } else {
        targetColor = isLight ? lightCol : darkCol;
      }

      mesh.setColorAt(i, targetColor);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    invalidate();
  }, [
    boardSize,
    totalCount,
    indexToCoord,
    lightCol,
    darkCol,
    selectedCol,
    legalMoveCol,
    lastMoveCol,
    checkKingCol,
    checkSourceCol,
    checkTargetCol,
    selectedCoord,
    checkConstraintCoords,
    legalSet,
    lastMoveSet,
    invalidate,
  ]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, totalCount]}
      receiveShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        if (typeof e.instanceId === 'number') {
          const coord = indexToCoord[e.instanceId];
          if (coord && onSquareClick) {
            onSquareClick(coord);
          }
        }
      }}
    >
      {/* 0.96x0.12x0.96 Box Tile (Spec 07 § 7.1) */}
      <boxGeometry args={[0.96, 0.12, 0.96]} />
      <meshStandardMaterial roughness={0.35} metalness={0.15} />
    </instancedMesh>
  );
};

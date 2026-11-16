import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Caches } from '../optimization/MathCaches';
import { VariantMapConfig } from '../../engine/variants/VariantMapConfig';

export interface IInstancedBoardProps {
  boardSize?: number;
  variantId?: string | null;
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
 * Supports variable variant cutouts (Cross 14x14, Capablanca 10x8, Hex/Octagon/Ring arenas),
 * elevated special zones (King of the Hill sanctuary, Racing Kings finish line, Spell Chess conduits),
 * and dynamic O(1) pointer instanceId mapping.
 */
export const InstancedBoard: React.FC<IInstancedBoardProps> = ({
  boardSize = 8,
  variantId,
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

  const variantTheme = useMemo(
    () => VariantMapConfig.getVariantTheme(variantId),
    [variantId]
  );

  // Color parsing helpers
  const effectiveLightHex = variantTheme.themeId !== 'CLASSIC' ? variantTheme.lightSquare : lightColor;
  const effectiveDarkHex = variantTheme.themeId !== 'CLASSIC' ? variantTheme.darkSquare : darkColor;

  const lightCol = useMemo(() => new THREE.Color(effectiveLightHex), [effectiveLightHex]);
  const darkCol = useMemo(() => new THREE.Color(effectiveDarkHex), [effectiveDarkHex]);
  const selectedCol = useMemo(() => new THREE.Color('#f59e0b'), []);
  const legalMoveCol = useMemo(() => new THREE.Color('#10b981'), []);
  const lastMoveCol = useMemo(() => new THREE.Color('#f97316'), []);
  const checkKingCol = useMemo(() => new THREE.Color('#dc2626'), []);
  const checkSourceCol = useMemo(() => new THREE.Color('#ef4444'), []);
  const checkTargetCol = useMemo(() => new THREE.Color('#b91c1c'), []);
  const hillLightCol = useMemo(() => new THREE.Color('#fbbf24'), []);
  const hillDarkCol = useMemo(() => new THREE.Color('#d97706'), []);
  const finishLightCol = useMemo(() => new THREE.Color('#10b981'), []);
  const finishDarkCol = useMemo(() => new THREE.Color('#047857'), []);
  const arcaneLightCol = useMemo(() => new THREE.Color('#a855f7'), []);
  const arcaneDarkCol = useMemo(() => new THREE.Color('#38bdf8'), []);
  const citadelCol = useMemo(() => new THREE.Color('#b45309'), []);

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

      const zone = VariantMapConfig.getSquareZone(variantId, col, row, boardSize);
      if (zone === 'VOID') {
        Caches.mat4A.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, Caches.mat4A);
        mesh.setColorAt(i, darkCol);
        continue;
      }

      // Centered 3D world position (with special zone elevation)
      const wx = col - offset;
      const wz = row - offset;
      const wy = zone === 'HILL_SANCTUARY' ? -0.02 : zone === 'ARCANE_CONDUIT' ? -0.04 : -0.06;

      Caches.vec3A.set(wx, wy, wz);
      Caches.mat4A.makeTranslation(Caches.vec3A);
      mesh.setMatrixAt(i, Caches.mat4A);

      // Determine square color with highlights and special zone palettes
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
      } else if (zone === 'HILL_SANCTUARY') {
        targetColor = isLight ? hillLightCol : hillDarkCol;
      } else if (zone === 'FINISH_LINE') {
        targetColor = isLight ? finishLightCol : finishDarkCol;
      } else if (zone === 'ARCANE_CONDUIT') {
        targetColor = isLight ? arcaneLightCol : arcaneDarkCol;
      } else if (zone === 'CITADEL_RING') {
        targetColor = isLight ? hillLightCol : citadelCol;
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
    variantId,
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
    hillLightCol,
    hillDarkCol,
    finishLightCol,
    finishDarkCol,
    arcaneLightCol,
    arcaneDarkCol,
    citadelCol,
    selectedCoord,
    checkConstraintCoords,
    legalSet,
    lastMoveSet,
    invalidate,
  ]);

  return (
    <instancedMesh
      ref={meshRef}
      name="instanced-board-mesh"
      args={[undefined, undefined, totalCount]}
      receiveShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        if (typeof e.instanceId === 'number') {
          const coord = indexToCoord[e.instanceId];
          if (coord && onSquareClick) {
            const [cStr, rStr] = coord.split(',');
            const cx = parseInt(cStr, 10);
            const cy = parseInt(rStr, 10);
            if (!VariantMapConfig.isVoidSquare(variantId, cx, cy, boardSize)) {
              onSquareClick(coord);
            }
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

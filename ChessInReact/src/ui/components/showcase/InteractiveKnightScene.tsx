import React, { useRef, Suspense } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ProceduralKnight, KnightMaterialFinish } from './ProceduralKnight';
import { StudioEnvironment } from './StudioEnvironment';
import { UIThemeId } from '../../theme/types';
import { PremiumChessPiece } from '../../../rendering/mesh/PremiumChessPiece';
import { PremiumPieceErrorBoundary } from '../../../rendering/mesh/PieceRenderer3D';
import { PREMIUM_STAUNTON_SCALE } from '../../../rendering/mesh/PremiumChessAssetRegistry';
import { ShowcaseViewMode } from './types';

export interface IInteractiveKnightSceneProps {
  finish?: KnightMaterialFinish;
  viewMode?: ShowcaseViewMode;
  reducedMotion?: boolean;
  theme?: UIThemeId;
}

const ALL_PIECES_LINEUP: { type: string; x: number; rotY: number }[] = [
  { type: 'PAWN', x: -1.35, rotY: 0 },
  { type: 'ROOK', x: -0.81, rotY: 0 },
  { type: 'KNIGHT', x: -0.27, rotY: 0.35 },
  { type: 'BISHOP', x: 0.27, rotY: 0 },
  { type: 'QUEEN', x: 0.81, rotY: 0 },
  { type: 'KING', x: 1.35, rotY: 0 },
];

export const InteractiveKnightScene: React.FC<IInteractiveKnightSceneProps> = ({
  finish = 'antique-brass',
  viewMode = 'duel',
  reducedMotion = false,
  theme = 'midnight',
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { pointer, invalidate, gl } = useThree();

  // Baseline 3/4 sculptural beauty angle (~31 deg yaw, slight 3.5 deg forward pitch)
  const baseRotationY = viewMode === 'all' ? 0.08 : 0.48;
  const baseRotationX = 0.06;

  // Invalidate immediately on finish, viewMode, or theme change
  React.useEffect(() => {
    invalidate();
  }, [finish, viewMode, theme, invalidate]);

  // Connect explicit pointer activity directly to invalidate() in demand frameloop
  React.useEffect(() => {
    const domElement = gl?.domElement;
    if (!domElement) return;

    const onPointerActivity = () => {
      if (!reducedMotion) {
        invalidate();
      }
    };

    domElement.addEventListener('pointermove', onPointerActivity, { passive: true });
    domElement.addEventListener('pointerdown', onPointerActivity, { passive: true });
    domElement.addEventListener('pointerenter', onPointerActivity, { passive: true });

    return () => {
      domElement.removeEventListener('pointermove', onPointerActivity);
      domElement.removeEventListener('pointerdown', onPointerActivity);
      domElement.removeEventListener('pointerenter', onPointerActivity);
    };
  }, [gl, invalidate, reducedMotion]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (reducedMotion) {
      groupRef.current.rotation.y = baseRotationY;
      groupRef.current.rotation.x = baseRotationX;
      groupRef.current.position.y = 0.15;
      return;
    }

    // Interactive Pointer Tilt (Smooth Lerp dampened by delta)
    const targetY = baseRotationY + pointer.x * (viewMode === 'all' ? 0.22 : 0.45);
    const targetX = baseRotationX - pointer.y * 0.22;

    const lerpSpeed = Math.min(delta * 5.0, 1);
    const currentY = groupRef.current.rotation.y;
    const currentX = groupRef.current.rotation.x;

    const nextY = THREE.MathUtils.lerp(currentY, targetY, lerpSpeed);
    const nextX = THREE.MathUtils.lerp(currentX, targetX, lerpSpeed);

    groupRef.current.rotation.y = nextY;
    groupRef.current.rotation.x = nextX;
    groupRef.current.position.y = 0.15;

    // In frameloop="demand", only schedule the next frame if still converging
    const deltaY = Math.abs(nextY - targetY);
    const deltaX = Math.abs(nextX - targetX);
    if (deltaY > 0.0005 || deltaX > 0.0005) {
      state.invalidate();
    }
  });

  return (
    <>
      <StudioEnvironment theme={theme} />
      <group
        ref={groupRef}
        position={[0, 0.15, 0]}
        rotation={[baseRotationX, baseRotationY, 0]}
      >
        <Suspense fallback={<ProceduralKnight finish={finish} scale={0.72} />}>
          <PremiumPieceErrorBoundary fallback={<ProceduralKnight finish={finish} scale={0.72} />}>
            {viewMode === 'all' ? (
              // All six Staunton pieces side by side
              <group position={[0, -0.36, 0]}>
                {ALL_PIECES_LINEUP.map((p) => (
                  <PremiumChessPiece
                    key={p.type}
                    type={p.type}
                    isWhite={finish !== 'obsidian'}
                    customFinish={finish}
                    scale={PREMIUM_STAUNTON_SCALE * 0.44}
                    position={[p.x, 0, 0]}
                    rotationY={p.rotY}
                  />
                ))}
              </group>
            ) : viewMode === 'duel' ? (
              // White and Black Knights face to face in dramatic close-up
              <group position={[0, -0.38, 0]}>
                <PremiumChessPiece
                  type="KNIGHT"
                  isWhite={true}
                  customFinish={finish === 'obsidian' ? 'ivory-marble' : finish}
                  scale={PREMIUM_STAUNTON_SCALE * 0.72}
                  position={[-0.44, 0, 0]}
                  rotationY={Math.PI * 0.45}
                />
                <PremiumChessPiece
                  type="KNIGHT"
                  isWhite={false}
                  customFinish="obsidian"
                  scale={PREMIUM_STAUNTON_SCALE * 0.72}
                  position={[0.44, 0, 0]}
                  rotationY={-Math.PI * 0.45}
                />
              </group>
            ) : viewMode === 'comparison' ? (
              // Side-by-side comparison: Procedural fallback (Left) vs Poly Haven PBR (Right)
              <group position={[0, -0.38, 0]}>
                <group position={[-0.56, 0, 0]}>
                  <ProceduralKnight finish={finish} scale={0.72} />
                </group>
                <group position={[0.56, 0, 0]}>
                  <PremiumChessPiece
                    type="KNIGHT"
                    isWhite={finish !== 'obsidian'}
                    customFinish={finish}
                    scale={PREMIUM_STAUNTON_SCALE * 0.72}
                    position={[0, 0, 0]}
                    rotationY={0.35}
                  />
                </group>
              </group>
            ) : (
              // Single piece inspection
              <PremiumChessPiece
                type={viewMode.toUpperCase()}
                isWhite={finish !== 'obsidian'}
                customFinish={finish}
                scale={PREMIUM_STAUNTON_SCALE * 0.72}
                position={[0, -0.42, 0]}
              />
            )}
          </PremiumPieceErrorBoundary>
        </Suspense>
      </group>
    </>
  );
};

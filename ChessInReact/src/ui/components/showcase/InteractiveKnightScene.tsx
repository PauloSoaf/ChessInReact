import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ProceduralKnight, KnightMaterialFinish } from './ProceduralKnight';
import { StudioEnvironment } from './StudioEnvironment';

export interface IInteractiveKnightSceneProps {
  finish?: KnightMaterialFinish;
  reducedMotion?: boolean;
}

export const InteractiveKnightScene: React.FC<IInteractiveKnightSceneProps> = ({
  finish = 'antique-brass',
  reducedMotion = false,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { pointer, invalidate } = useThree();

  // Baseline 3/4 beauty profile angle (approx 35 degrees)
  const baseRotationY = 0.55;

  // Invalidate on finish change or mount
  React.useEffect(() => {
    invalidate();
  }, [finish, invalidate]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (reducedMotion) {
      groupRef.current.rotation.y = baseRotationY;
      groupRef.current.rotation.x = 0;
      groupRef.current.position.y = -0.15;
      return;
    }

    // 1. Interactive Pointer Tilt (Smooth Lerp dampened by delta)
    const targetY = baseRotationY + pointer.x * 0.45;
    const targetX = -pointer.y * 0.22;

    const lerpSpeed = Math.min(delta * 5.0, 1);
    const currentY = groupRef.current.rotation.y;
    const currentX = groupRef.current.rotation.x;

    const nextY = THREE.MathUtils.lerp(currentY, targetY, lerpSpeed);
    const nextX = THREE.MathUtils.lerp(currentX, targetX, lerpSpeed);

    groupRef.current.rotation.y = nextY;
    groupRef.current.rotation.x = nextX;
    groupRef.current.position.y = -0.15;

    // In frameloop="demand", only schedule the next frame if still converging
    const deltaY = Math.abs(nextY - targetY);
    const deltaX = Math.abs(nextX - targetX);
    if (deltaY > 0.0005 || deltaX > 0.0005) {
      state.invalidate();
    }
  });

  return (
    <>
      <StudioEnvironment />
      <group ref={groupRef} position={[0, -0.15, 0]}>
        <ProceduralKnight finish={finish} scale={0.92} />
      </group>
    </>
  );
};

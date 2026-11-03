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
  const { pointer } = useThree();

  // Baseline 3/4 beauty profile angle (approx 35 degrees)
  const baseRotationY = 0.55;

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    if (reducedMotion) {
      groupRef.current.rotation.y = baseRotationY;
      groupRef.current.rotation.x = 0;
      groupRef.current.position.y = -0.15;
      return;
    }

    // 1. Interactive Pointer Tilt (Smooth Lerp dampened by delta)
    const targetY = baseRotationY + (pointer.x * 0.45);
    const targetX = -pointer.y * 0.22;

    const lerpSpeed = Math.min(delta * 4.5, 1);
    groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetY, lerpSpeed);
    groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetX, lerpSpeed);

    // 2. Subtle Idle Breathing Float
    const elapsedTime = state.clock.getElapsedTime();
    const breathingOffset = Math.sin(elapsedTime * 1.2) * 0.035;
    groupRef.current.position.y = -0.15 + breathingOffset;
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

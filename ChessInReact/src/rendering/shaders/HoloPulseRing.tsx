import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { createHoloPulseMaterial } from './HoloPulseShader';

export interface IHoloPulseRingProps {
  color: string;
  pulseSpeed?: number;
  innerRadius?: number;
  outerRadius?: number;
  opacity?: number;
  name?: string;
  position?: [number, number, number];
}

/**
 * Spec 07 § 10 & RF-10: Cybernetic Holographic Ring with GLSL Pulse & Scanline Shader.
 * Mounts in R3F scene graph, updates `uTime` uniform via `useFrame` with demand invalidation,
 * and ensures deterministic GPU material/geometry disposal on unmount.
 */
export const HoloPulseRing: React.FC<IHoloPulseRingProps> = ({
  color,
  pulseSpeed = 3.5,
  innerRadius = 0.44,
  outerRadius = 0.58,
  opacity = 0.85,
  name,
  position = [0, 0.02, 0],
}) => {
  const { invalidate } = useThree();
  const material = useMemo(
    () => createHoloPulseMaterial(color, pulseSpeed, opacity),
    [color, pulseSpeed, opacity]
  );
  const meshRef = useRef<THREE.Mesh>(null);

  // Clean up GPU shader program and memory on unmount (Spec 07 § 12)
  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Request frames only while active (Spec 07 Zero GC & Demand frameloop)
  useFrame((_, delta) => {
    material.uniforms.uTime.value += delta;
    invalidate();
  });

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      name={name}
    >
      <ringGeometry args={[innerRadius, outerRadius, 32]} />
    </mesh>
  );
};


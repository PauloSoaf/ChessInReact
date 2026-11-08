import React, { useMemo } from 'react';
import * as THREE from 'three';
import { KnightMaterialFinish } from './types';

export type { KnightMaterialFinish };

export interface IProceduralKnightProps {
  finish?: KnightMaterialFinish;
  scale?: number;
}

export const ProceduralKnight: React.FC<IProceduralKnightProps> = ({
  finish = 'antique-brass',
  scale = 1.0,
}) => {
  // 1. Procedural PBR Physical Material tailored for luxury tactile chess pieces
  const material = useMemo(() => {
    switch (finish) {
      case 'obsidian':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#11161D'),
          roughness: 0.18,
          metalness: 0.32,
          envMapIntensity: 1.35,
        });
      case 'ivory-marble':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#F3EFE6'),
          roughness: 0.28,
          metalness: 0.08,
          envMapIntensity: 1.05,
        });
      case 'antique-brass':
      default:
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#C8AB82'),
          roughness: 0.3,
          metalness: 0.58,
          envMapIntensity: 1.6,
        });
    }
  }, [finish]);

  // Accent collar ring material for championship Staunton detailing
  const accentRingMaterial = useMemo(() => {
    switch (finish) {
      case 'obsidian':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#C4A77D'),
          roughness: 0.25,
          metalness: 0.72,
        });
      case 'ivory-marble':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#9A6B26'),
          roughness: 0.3,
          metalness: 0.65,
        });
      case 'antique-brass':
      default:
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#1A222C'),
          roughness: 0.22,
          metalness: 0.45,
        });
    }
  }, [finish]);

  // 2. Sculptural Staunton Knight Head Extrusion Shape
  const headGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Base collar neck connection
    shape.moveTo(-0.56, 0.0);
    // Arched muscular spine / mane curve
    shape.bezierCurveTo(-0.78, 0.78, -0.68, 1.52, -0.42, 2.12);
    // Mane crest & ear back
    shape.lineTo(-0.36, 2.34);
    shape.lineTo(-0.24, 2.62);
    // Ear tip & front slope
    shape.lineTo(-0.04, 2.34);
    // Forehead slope
    shape.bezierCurveTo(0.22, 2.16, 0.48, 1.96, 0.78, 1.76);
    // Muzzle / Snout bridge
    shape.lineTo(1.16, 1.46);
    // Snout tip
    shape.bezierCurveTo(1.24, 1.35, 1.22, 1.19, 1.1, 1.11);
    // Jaw / Chin undercut
    shape.lineTo(0.7, 0.99);
    // Throat curve
    shape.bezierCurveTo(0.46, 0.97, 0.34, 0.88, 0.38, 0.72);
    // Muscular chest sweep
    shape.bezierCurveTo(0.6, 0.48, 0.56, 0.2, 0.53, 0.0);
    // Close base
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.52,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 1,
      bevelSize: 0.075,
      bevelThickness: 0.075,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    geom.translate(0, 1.26, 0);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // Explicit GPU Resource Cleanup
  React.useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  React.useEffect(() => {
    return () => {
      accentRingMaterial.dispose();
    };
  }, [accentRingMaterial]);

  React.useEffect(() => {
    return () => {
      headGeometry.dispose();
    };
  }, [headGeometry]);

  return (
    <group scale={[scale, scale, scale]} position={[0, -1.02, 0]}>
      {/* 0. Studio Exhibition Plinth Ring */}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={accentRingMaterial}>
        <torusGeometry args={[1.28, 0.018, 16, 48]} />
      </mesh>

      {/* 1. Pedestal Base Tier 1 (Weighted Championship Base) */}
      <mesh position={[0, 0.1, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[1.06, 1.16, 0.2, 40]} />
      </mesh>

      {/* 2. Pedestal Base Bevel Torus */}
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <torusGeometry args={[0.98, 0.062, 16, 40]} />
      </mesh>

      {/* 2b. Championship Accent Felt/Metal Collar Trim */}
      <mesh position={[0, 0.27, 0]} rotation={[Math.PI / 2, 0, 0]} material={accentRingMaterial}>
        <torusGeometry args={[0.93, 0.024, 14, 40]} />
      </mesh>

      {/* 3. Pedestal Waist (Tapered column) */}
      <mesh position={[0, 0.39, 0]} material={material} castShadow receiveShadow>
        <cylinderGeometry args={[0.82, 0.96, 0.22, 40]} />
      </mesh>

      {/* 4. Pedestal Collar Ring */}
      <mesh position={[0, 0.53, 0]} material={material}>
        <cylinderGeometry args={[0.89, 0.82, 0.08, 40]} />
      </mesh>

      {/* 5. Sculptural Knight Head, Mane & Snout */}
      <mesh geometry={headGeometry} material={material} castShadow receiveShadow />

      {/* 6. Realistic Eyes (Inset dark accent beads) */}
      <mesh position={[0.42, 1.63, 0.29]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#0A0D11" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[0.42, 1.63, -0.29]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#0A0D11" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* 7. Subtle Floor Contact Shadow Disk */}
      <mesh position={[0, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.42, 36]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.34} />
      </mesh>
    </group>
  );
};

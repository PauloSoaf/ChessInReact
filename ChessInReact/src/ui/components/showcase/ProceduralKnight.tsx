import React, { useMemo } from 'react';
import * as THREE from 'three';

export type KnightMaterialFinish = 'antique-brass' | 'obsidian' | 'ivory-marble';

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
          color: new THREE.Color('#10151B'),
          roughness: 0.22,
          metalness: 0.25,
          envMapIntensity: 1.2,
        });
      case 'ivory-marble':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#F2EEE6'),
          roughness: 0.32,
          metalness: 0.08,
          envMapIntensity: 0.9,
        });
      case 'antique-brass':
      default:
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#C4A77D'),
          roughness: 0.36,
          metalness: 0.52,
          envMapIntensity: 1.5,
        });
    }
  }, [finish]);

  // 2. Sculptural Staunton Knight Head Extrusion Shape
  const headGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Base collar neck connection
    shape.moveTo(-0.55, 0.0);
    // Arched muscular spine / mane curve
    shape.bezierCurveTo(-0.75, 0.8, -0.65, 1.5, -0.4, 2.1);
    // Mane crest & ear back
    shape.lineTo(-0.35, 2.3);
    shape.lineTo(-0.25, 2.58);
    // Ear tip & front slope
    shape.lineTo(-0.05, 2.32);
    // Forehead slope
    shape.bezierCurveTo(0.2, 2.15, 0.45, 1.95, 0.75, 1.75);
    // Muzzle / Snout bridge
    shape.lineTo(1.15, 1.45);
    // Snout tip
    shape.bezierCurveTo(1.22, 1.35, 1.2, 1.2, 1.1, 1.12);
    // Jaw / Chin undercut
    shape.lineTo(0.72, 1.0);
    // Throat curve
    shape.bezierCurveTo(0.48, 0.98, 0.35, 0.9, 0.38, 0.75);
    // Muscular chest sweep
    shape.bezierCurveTo(0.58, 0.5, 0.55, 0.2, 0.52, 0.0);
    // Close base
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.07,
      bevelThickness: 0.07,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center extrusion along Z-axis
    geom.center();
    // Offset so head sits cleanly above collar at y=1.2
    geom.translate(0, 1.25, 0);
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
      headGeometry.dispose();
    };
  }, [headGeometry]);

  return (
    <group scale={[scale, scale, scale]} position={[0, -1.0, 0]}>
      {/* 1. Pedestal Base Tier 1 (Wide bottom rim) */}
      <mesh position={[0, 0.1, 0]} material={material}>
        <cylinderGeometry args={[1.05, 1.15, 0.2, 36]} />
      </mesh>

      {/* 2. Pedestal Base Bevel Torus */}
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} material={material}>
        <torusGeometry args={[0.98, 0.06, 16, 36]} />
      </mesh>

      {/* 3. Pedestal Waist (Tapered column) */}
      <mesh position={[0, 0.38, 0]} material={material}>
        <cylinderGeometry args={[0.82, 0.96, 0.22, 36]} />
      </mesh>

      {/* 4. Pedestal Collar Ring */}
      <mesh position={[0, 0.52, 0]} material={material}>
        <cylinderGeometry args={[0.88, 0.82, 0.08, 36]} />
      </mesh>

      {/* 5. Sculptural Knight Head, Mane & Snout */}
      <mesh geometry={headGeometry} material={material} castShadow receiveShadow />

      {/* 6. Realistic Eyes (Inset dark accent beads) */}
      <mesh position={[0.42, 1.62, 0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#0A0D11" roughness={0.1} metalness={0.9} />
      </mesh>
      <mesh position={[0.42, 1.62, -0.28]}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshStandardMaterial color="#0A0D11" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* 7. Subtle Floor Contact Shadow Disk */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
};

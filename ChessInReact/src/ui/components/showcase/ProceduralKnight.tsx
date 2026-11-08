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
  // 1. Primary PBR Physical Material tailored for luxury tactile chess pieces
  const material = useMemo(() => {
    switch (finish) {
      case 'obsidian':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#141A22'),
          roughness: 0.18,
          metalness: 0.38,
          envMapIntensity: 1.45,
        });
      case 'ivory-marble':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#F5F1E8'),
          roughness: 0.26,
          metalness: 0.06,
          envMapIntensity: 1.1,
        });
      case 'antique-brass':
      default:
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#C8AB82'),
          roughness: 0.26,
          metalness: 0.64,
          envMapIntensity: 1.65,
        });
    }
  }, [finish]);

  // 2. Contrasting Championship Collar & Plinth Trim Material
  const accentRingMaterial = useMemo(() => {
    switch (finish) {
      case 'obsidian':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#C8AB82'),
          roughness: 0.24,
          metalness: 0.76,
        });
      case 'ivory-marble':
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#9A6B26'),
          roughness: 0.28,
          metalness: 0.68,
        });
      case 'antique-brass':
      default:
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#18202A'),
          roughness: 0.22,
          metalness: 0.48,
        });
    }
  }, [finish]);

  // 3. Turned Championship Pedestal (LatheGeometry coaxially aligned at X=0, Z=0)
  const pedestalGeometry = useMemo(() => {
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.92, 0.0),
      new THREE.Vector2(0.94, 0.06),
      new THREE.Vector2(0.88, 0.14),
      new THREE.Vector2(0.82, 0.18),
      new THREE.Vector2(0.86, 0.23),
      new THREE.Vector2(0.76, 0.29),
      // Concave scotia waist curve
      new THREE.Vector2(0.64, 0.38),
      new THREE.Vector2(0.56, 0.48),
      new THREE.Vector2(0.54, 0.56),
      // Upper collar molding
      new THREE.Vector2(0.68, 0.61),
      new THREE.Vector2(0.70, 0.65),
      new THREE.Vector2(0.58, 0.69),
      new THREE.Vector2(0.0, 0.69),
    ];
    const geom = new THREE.LatheGeometry(points, 48);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 4. Coaxial Sculptural Staunton Knight Head & Neck (centered ONLY on Z so X=0 aligns with pedestal)
  const headGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Neck base centered on X=0 (from -0.48 to +0.46 at y=0.66)
    shape.moveTo(-0.48, 0.66);
    // Dorsal muscular neck sweep up to crown
    shape.bezierCurveTo(-0.66, 1.05, -0.68, 1.58, -0.44, 2.02);
    // Upper nape & crown behind ears
    shape.bezierCurveTo(-0.34, 2.20, -0.18, 2.30, -0.02, 2.28);
    // Forehead crest & nasal bridge slope
    shape.bezierCurveTo(0.18, 2.22, 0.44, 1.98, 0.72, 1.72);
    // Tapered muzzle top & nostril flare
    shape.bezierCurveTo(0.86, 1.59, 0.96, 1.48, 0.94, 1.38);
    // Muzzle tip & upper lip
    shape.bezierCurveTo(0.92, 1.28, 0.82, 1.22, 0.70, 1.23);
    // Mouth cleft & strong lower jaw
    shape.lineTo(0.56, 1.27);
    shape.bezierCurveTo(0.46, 1.21, 0.34, 1.22, 0.24, 1.30);
    // Deep Staunton throat undercut
    shape.bezierCurveTo(0.16, 1.36, 0.14, 1.24, 0.24, 1.12);
    // Proud arched stallion chest sweeping down to pedestal collar
    shape.bezierCurveTo(0.44, 0.96, 0.52, 0.80, 0.46, 0.66);
    shape.closePath();

    const depth = 0.34;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth,
      bevelEnabled: true,
      bevelSegments: 6,
      steps: 2,
      bevelSize: 0.085,
      bevelThickness: 0.095,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    // Center strictly along Z so X=0 remains coaxially locked to the turned pedestal
    geom.translate(0, 0, -depth / 2);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 5. Carved Dorsal Mane Spine (adds 3D relief along the back of the neck)
  const maneGeometry = useMemo(() => {
    const mane = new THREE.Shape();
    mane.moveTo(-0.42, 0.72);
    mane.bezierCurveTo(-0.68, 1.02, -0.78, 1.38, -0.66, 1.68);
    mane.lineTo(-0.56, 1.74);
    mane.bezierCurveTo(-0.62, 1.90, -0.52, 2.08, -0.36, 2.20);
    mane.lineTo(-0.22, 2.16);
    mane.bezierCurveTo(-0.42, 1.76, -0.44, 1.18, -0.30, 0.72);
    mane.closePath();

    const depth = 0.14;
    const geom = new THREE.ExtrudeGeometry(mane, {
      depth,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.04,
      bevelThickness: 0.045,
    });
    geom.translate(0, 0, -depth / 2);
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 6. Sculpted Ear Geometry (reused for left and right ears in 3D space)
  const earGeometry = useMemo(() => {
    const geom = new THREE.ConeGeometry(0.11, 0.34, 16);
    geom.scale(0.85, 1.0, 0.55);
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
      pedestalGeometry.dispose();
      headGeometry.dispose();
      maneGeometry.dispose();
      earGeometry.dispose();
    };
  }, [pedestalGeometry, headGeometry, maneGeometry, earGeometry]);

  return (
    <group scale={[scale, scale, scale]} position={[0, -0.92, 0]}>
      {/* 0. Studio Exhibition Plinth Outer Ring */}
      <mesh position={[0, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]} material={accentRingMaterial}>
        <torusGeometry args={[1.08, 0.016, 16, 64]} />
      </mesh>

      {/* 1. Turned Staunton Pedestal Base */}
      <mesh geometry={pedestalGeometry} material={material} castShadow receiveShadow />

      {/* 2. Championship Accent Collar Ring */}
      <mesh position={[0, 0.23, 0]} rotation={[Math.PI / 2, 0, 0]} material={accentRingMaterial}>
        <torusGeometry args={[0.85, 0.022, 16, 48]} />
      </mesh>

      {/* 2b. Upper Neck Collar Trim Ring */}
      <mesh position={[0, 0.65, 0]} rotation={[Math.PI / 2, 0, 0]} material={accentRingMaterial}>
        <torusGeometry args={[0.68, 0.018, 16, 48]} />
      </mesh>

      {/* 3. Coaxial Sculptural Knight Head & Muscular Neck */}
      <mesh geometry={headGeometry} material={material} castShadow receiveShadow />

      {/* 4. Carved Dorsal Mane Spine */}
      <mesh geometry={maneGeometry} material={material} castShadow receiveShadow />

      {/* 5. Twin 3D Sculpted Ears (Left & Right) */}
      <mesh
        geometry={earGeometry}
        material={material}
        position={[-0.08, 2.34, 0.12]}
        rotation={[0.14, 0, -0.18]}
        castShadow
      />
      <mesh
        geometry={earGeometry}
        material={material}
        position={[-0.08, 2.34, -0.12]}
        rotation={[-0.14, 0, -0.18]}
        castShadow
      />

      {/* 6. Inset Dark Onyx Eyes */}
      <mesh position={[0.32, 1.88, 0.22]}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshStandardMaterial color="#090D11" roughness={0.12} metalness={0.85} />
      </mesh>
      <mesh position={[0.32, 1.88, -0.22]}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshStandardMaterial color="#090D11" roughness={0.12} metalness={0.85} />
      </mesh>

      {/* 7. Subtle Studio Floor Contact Shadow Disk */}
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.18, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} />
      </mesh>
    </group>
  );
};

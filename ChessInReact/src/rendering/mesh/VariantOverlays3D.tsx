import React from 'react';

export interface IVariantOverlays3DProps {
  boardSize: number;
  /** Duck Chess duck square, "x,y" game coordinate key */
  duckCoordinate?: string | null;
  /** Spell Chess frozen squares, "x,y" game coordinate keys */
  frozenCoordinates?: readonly string[];
}

function toWorld(coord: string, boardSize: number): [number, number] | null {
  const parts = coord.split(',').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const offset = (boardSize - 1) / 2;
  return [parts[0] - offset, parts[1] - offset];
}

/**
 * Spec 07 / Spec 12: 3D overlays for variant mechanics.
 * - Duck Chess: neutral yellow duck blocking a square.
 * - Spell Chess: translucent ice slab on frozen squares.
 */
export const VariantOverlays3D: React.FC<IVariantOverlays3DProps> = ({
  boardSize,
  duckCoordinate,
  frozenCoordinates,
}) => {
  const duckPos = duckCoordinate ? toWorld(duckCoordinate, boardSize) : null;

  return (
    <group name="variant-overlays-3d">
      {(frozenCoordinates ?? []).map((coord) => {
        const p = toWorld(coord, boardSize);
        if (!p) return null;
        return (
          <mesh key={`frozen-${coord}`} name={`frozen-square-3d-${coord}`} position={[p[0], 0.08, p[1]]}>
            <boxGeometry args={[0.96, 0.16, 0.96]} />
            <meshStandardMaterial
              color="#67e8f9"
              transparent
              opacity={0.55}
              metalness={0.1}
              roughness={0.05}
              emissive="#06b6d4"
              emissiveIntensity={0.35}
            />
          </mesh>
        );
      })}

      {duckPos && (
        <group name="duck-3d" position={[duckPos[0], 0.12, duckPos[1]]}>
          {/* Body */}
          <mesh castShadow position={[0, 0.28, 0]} scale={[1, 0.8, 1.25]}>
            <sphereGeometry args={[0.3, 20, 16]} />
            <meshStandardMaterial color="#facc15" roughness={0.45} />
          </mesh>
          {/* Head */}
          <mesh castShadow position={[0, 0.62, 0.2]}>
            <sphereGeometry args={[0.19, 16, 14]} />
            <meshStandardMaterial color="#facc15" roughness={0.45} />
          </mesh>
          {/* Beak */}
          <mesh castShadow position={[0, 0.58, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.07, 0.16, 10]} />
            <meshStandardMaterial color="#f97316" roughness={0.5} />
          </mesh>
          {/* Eyes */}
          <mesh position={[-0.07, 0.68, 0.33]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
          <mesh position={[0.07, 0.68, 0.33]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshStandardMaterial color="#0f172a" />
          </mesh>
        </group>
      )}
    </group>
  );
};

export default VariantOverlays3D;


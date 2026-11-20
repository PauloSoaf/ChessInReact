import React from 'react';

export interface IVariantOverlays3DProps {
  boardSize: number;
  variantId?: string | null;
  /** Duck Chess duck square, "x,y" game coordinate key */
  duckCoordinate?: string | null;
  /** Spell Chess frozen squares, "x,y" game coordinate keys */
  frozenCoordinates?: readonly string[];
  /** Spell Chess active portals */
  activePortals?: ReadonlyArray<{ readonly coordA: string; readonly coordB: string }>;
  /** Spell Chess stealth traps */
  stealthTraps?: Readonly<Record<string, string>>;
}

function toWorld(coord: string, boardSize: number): [number, number] | null {
  const parts = coord.split(',').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const offset = (boardSize - 1) / 2;
  return [parts[0] - offset, parts[1] - offset];
}

/**
 * Spec 07 / Spec 12 / Spec 13: 3D overlays for variant mechanics.
 * - Duck Chess: neutral yellow duck blocking a square.
 * - Spell Chess: translucent ice slab on frozen squares, glowing violet/cyan portal rings,
 *   and crimson rune disks on stealth traps.
 * - King of the Hill: golden sanctuary crown ring on central 2x2 hill.
 */
export const VariantOverlays3D: React.FC<IVariantOverlays3DProps> = ({
  boardSize,
  variantId,
  duckCoordinate,
  frozenCoordinates,
  activePortals,
  stealthTraps,
}) => {
  const duckPos = duckCoordinate ? toWorld(duckCoordinate, boardSize) : null;
  const isKingOfTheHill = Boolean(
    variantId && (variantId.toUpperCase() === 'KING_OF_THE_HILL' || variantId.toUpperCase().includes('HILL'))
  );
  const isXiangqi = Boolean(variantId && variantId.toUpperCase().includes('XIANGQI'));
  const xiangqiPalace1Pos = isXiangqi ? toWorld('4,1', boardSize) : null;
  const xiangqiPalace2Pos = isXiangqi ? toWorld('4,8', boardSize) : null;

  const portalCoords: string[] = [];
  for (const portal of activePortals ?? []) {
    portalCoords.push(portal.coordA, portal.coordB);
  }
  const trapCoords = Object.keys(stealthTraps ?? {});

  return (
    <group name="variant-overlays-3d">
      {/* King of the Hill: Golden Sanctuary Crown Pillar Ring */}
      {isKingOfTheHill && (
        <mesh name="hill-sanctuary-3d-ring" position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.92, 1.08, 32]} />
          <meshStandardMaterial
            color="#fbbf24"
            emissive="#f59e0b"
            emissiveIntensity={0.6}
            metalness={0.8}
            roughness={0.2}
          />
        </mesh>
      )}

      {/* Xiangqi: Chu River (楚河·漢界) 3D Water Band */}
      {isXiangqi && (
        <mesh name="xiangqi-river-3d" position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[boardSize, 0.96]} />
          <meshStandardMaterial
            color="#06b6d4"
            emissive="#0891b2"
            emissiveIntensity={0.35}
            transparent
            opacity={0.38}
            roughness={0.1}
          />
        </mesh>
      )}

      {/* Xiangqi: Nine Palaces (九宮) 3D Boundaries */}
      {isXiangqi && xiangqiPalace1Pos && (
        <mesh
          name="xiangqi-palace-p1-3d"
          position={[xiangqiPalace1Pos[0], 0.03, xiangqiPalace1Pos[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[2.92, 2.92]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#dc2626"
            emissiveIntensity={0.25}
            transparent
            opacity={0.18}
          />
        </mesh>
      )}
      {isXiangqi && xiangqiPalace2Pos && (
        <mesh
          name="xiangqi-palace-p2-3d"
          position={[xiangqiPalace2Pos[0], 0.03, xiangqiPalace2Pos[1]]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[2.92, 2.92]} />
          <meshStandardMaterial
            color="#ef4444"
            emissive="#dc2626"
            emissiveIntensity={0.25}
            transparent
            opacity={0.18}
          />
        </mesh>
      )}

      {/* Spell Chess: Frozen Ice Slabs */}
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

      {/* Spell Chess: Dimensional Portal Vortex Rings */}
      {portalCoords.map((coord, idx) => {
        const p = toWorld(coord, boardSize);
        if (!p) return null;
        return (
          <group key={`portal-${coord}-${idx}`} name={`portal-3d-${coord}`} position={[p[0], 0.08, p[1]]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.36, 0.05, 12, 28]} />
              <meshStandardMaterial
                color="#c084fc"
                emissive="#a855f7"
                emissiveIntensity={0.85}
                metalness={0.6}
                roughness={0.15}
              />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.31, 24]} />
              <meshStandardMaterial
                color="#38bdf8"
                emissive="#0284c7"
                emissiveIntensity={0.55}
                transparent
                opacity={0.45}
              />
            </mesh>
          </group>
        );
      })}

      {/* Spell Chess: Stealth Trap Rune Disks */}
      {trapCoords.map((coord) => {
        const p = toWorld(coord, boardSize);
        if (!p) return null;
        return (
          <mesh
            key={`trap-${coord}`}
            name={`stealth-trap-3d-${coord}`}
            position={[p[0], 0.04, p[1]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.18, 0.34, 16]} />
            <meshStandardMaterial
              color="#f43f5e"
              emissive="#e11d48"
              emissiveIntensity={0.75}
              transparent
              opacity={0.78}
            />
          </mesh>
        );
      })}

      {/* Duck Chess: 3D Rubber Duck */}
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


import React from 'react';

export interface IProceduralPieceModelProps {
  variantId: string;
  isWhite: boolean;
  isSelected?: boolean;
  ownerId?: string;
}

const FACTION_PALETTE: Record<string, string> = {
  P1: '#f8fafc',
  P2: '#1e293b',
  P3: '#eab308',
  P4: '#22c55e',
  P5: '#a855f7',
  P6: '#f97316',
  P7: '#06b6d4',
  P8: '#ec4899',
  P9: '#14b8a6',
  P10: '#6366f1',
  P11: '#84cc16',
  P12: '#f59e0b',
};

export const ProceduralPieceModel: React.FC<IProceduralPieceModelProps> = ({
  variantId,
  isWhite,
  isSelected = false,
  ownerId,
}) => {
  const norm = variantId.toUpperCase();
  const baseColor = (ownerId && FACTION_PALETTE[ownerId]) ?? (isWhite ? '#f8fafc' : '#1e293b');
  const emissiveColor = isSelected ? '#f59e0b' : '#000000';
  const emissiveIntensity = isSelected ? 0.6 : 0;
  const metalness = isWhite ? 0.2 : 0.4;
  const roughness = 0.3;

  const matProps = {
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity,
    metalness,
    roughness,
  };

  return (
    <group castShadow receiveShadow>
      {/* Base Pedestal */}
      <mesh castShadow position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.22, 0.28, 0.1, 16]} />
        <meshStandardMaterial {...matProps} />
      </mesh>

      {/* Pawn / Soldier */}
      {(norm.includes('PAWN') || norm.includes('SOLDIER')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.12, 0.2, 0.3, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.36, 0]}>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        </group>
      )}

      {/* Rook / Chariot / Lance */}
      {(norm.includes('ROOK') || norm.includes('CHARIOT') || norm.includes('LANCE')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.18, 0.22, 0.4, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.46, 0]}>
            <cylinderGeometry args={[0.24, 0.2, 0.14, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        </group>
      )}

      {/* Knight / Horse */}
      {(norm.includes('KNIGHT') || norm.includes('HORSE')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.16, 0.22, 0.4, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.42, 0.04]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
        </group>
      )}

      {/* Bishop / Elephant / Silver / Gold */}
      {(norm.includes('BISHOP') ||
        norm.includes('ELEPHANT') ||
        norm.includes('SILVER') ||
        norm.includes('GOLD') ||
        norm.includes('ADVISOR')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.15, 0.22, 0.48, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.54, 0]}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : '#fbbf24'} metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* Queen / Amazon / Chancellor / Archbishop */}
      {(norm.includes('QUEEN') ||
        norm.includes('AMAZON') ||
        norm.includes('CHANCELLOR') ||
        norm.includes('ARCHBISHOP')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.28, 0]}>
            <cylinderGeometry args={[0.18, 0.23, 0.56, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.24, 0.16, 0.15, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh position={[0, 0.74, 0]}>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
          </mesh>
        </group>
      )}

      {/* King / General / Gyoku */}
      {(norm.includes('KING') || norm.includes('GENERAL') || norm.includes('GYOKU') || norm.includes('JIANG') || norm.includes('SHUAI')) && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.19, 0.24, 0.64, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.68, 0]}>
            <cylinderGeometry args={[0.24, 0.18, 0.16, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          {/* Royal Cross Finial */}
          <group position={[0, 0.82, 0]}>
            <mesh>
              <boxGeometry args={[0.05, 0.18, 0.05]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[0.15, 0.05, 0.05]} />
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
            </mesh>
          </group>
        </group>
      )}

      {/* Cannon */}
      {norm.includes('CANNON') && (
        <group position={[0, 0.1, 0]}>
          <mesh castShadow position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.16, 0.22, 0.36, 16]} />
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh castShadow position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.12, 0.4, 16]} />
            <meshStandardMaterial color="#475569" metalness={0.8} roughness={0.25} />
          </mesh>
        </group>
      )}
    </group>
  );
};


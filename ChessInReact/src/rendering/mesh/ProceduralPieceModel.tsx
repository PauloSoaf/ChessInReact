import React from 'react';
import { stauntonGeometries } from './StauntonPieceGeometries';

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
  const baseColor = (ownerId && FACTION_PALETTE[ownerId]) ?? (isWhite ? '#f3ede2' : '#14171f');
  const emissiveColor = isSelected ? '#f59e0b' : '#000000';
  const emissiveIntensity = isSelected ? 0.6 : 0;
  const metalness = isWhite ? 0.08 : 0.15;
  const roughness = isWhite ? 0.28 : 0.32;

  const matProps = {
    color: baseColor,
    emissive: emissiveColor,
    emissiveIntensity,
    metalness,
    roughness,
  };

  return (
    <group castShadow receiveShadow scale={[0.75, 0.75, 0.75]}>
      {/* Turned Staunton Pedestal */}
      <mesh
        castShadow
        receiveShadow
        geometry={stauntonGeometries.getBasePedestal()}
      >
        <meshStandardMaterial {...matProps} />
      </mesh>

      {/* Pawn / Soldier */}
      {(norm.includes('PAWN') || norm.includes('SOLDIER')) && (
        <mesh
          castShadow
          receiveShadow
          geometry={stauntonGeometries.getPawnStemHead()}
        >
          <meshStandardMaterial {...matProps} />
        </mesh>
      )}

      {/* Rook / Chariot / Lance */}
      {(norm.includes('ROOK') || norm.includes('CHARIOT') || norm.includes('LANCE')) && (
        <group>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getRookBody()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle, idx) => (
            <mesh
              key={idx}
              castShadow
              position={[Math.cos(angle) * 0.25, 0.85, Math.sin(angle) * 0.25]}
              rotation={[0, -angle, 0]}
              geometry={stauntonGeometries.getRookMerlon()}
            >
              <meshStandardMaterial {...matProps} />
            </mesh>
          ))}
        </group>
      )}

      {/* Knight / Horse */}
      {(norm.includes('KNIGHT') || norm.includes('HORSE')) && (
        <group rotation={[0, isWhite ? 0 : Math.PI, 0]}>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getKnightHead()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getKnightMane()}
          >
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
        <group>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getBishopMitre()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            position={[0, 1.20, 0]}
            geometry={stauntonGeometries.getBishopOrb()}
          >
            <meshStandardMaterial
              color={isSelected ? '#f59e0b' : '#fbbf24'}
              metalness={0.85}
              roughness={0.2}
            />
          </mesh>
        </group>
      )}

      {/* Queen / Amazon / Chancellor / Archbishop */}
      {(norm.includes('QUEEN') ||
        norm.includes('AMAZON') ||
        norm.includes('CHANCELLOR') ||
        norm.includes('ARCHBISHOP')) && (
        <group>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getQueenBody()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            castShadow
            position={[0, 1.05, 0]}
            geometry={stauntonGeometries.getQueenCoronet()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            position={[0, 1.16, 0]}
            geometry={stauntonGeometries.getQueenOrb()}
          >
            <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
          </mesh>
        </group>
      )}

      {/* King / General / Gyoku */}
      {(norm.includes('KING') ||
        norm.includes('GENERAL') ||
        norm.includes('GYOKU') ||
        norm.includes('JIANG') ||
        norm.includes('SHUAI')) && (
        <group>
          <mesh
            castShadow
            receiveShadow
            geometry={stauntonGeometries.getKingBody()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <mesh
            castShadow
            position={[0, 1.12, 0]}
            geometry={stauntonGeometries.getKingCrown()}
          >
            <meshStandardMaterial {...matProps} />
          </mesh>
          <group position={[0, 1.30, 0]}>
            <mesh geometry={stauntonGeometries.getKingCrossVertical()}>
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
            </mesh>
            <mesh position={[0, 0.03, 0]} geometry={stauntonGeometries.getKingCrossHorizontal()}>
              <meshStandardMaterial color="#fbbf24" metalness={0.9} roughness={0.15} />
            </mesh>
          </group>
        </group>
      )}

      {/* Cannon */}
      {norm.includes('CANNON') && (
        <mesh
          castShadow
          position={[0, 0.45, 0]}
          geometry={stauntonGeometries.getCannonBarrel()}
        >
          <meshStandardMaterial color="#78350f" metalness={0.8} roughness={0.25} />
        </mesh>
      )}

      {/* Fairy piece crystal */}
      {!norm.includes('PAWN') &&
        !norm.includes('SOLDIER') &&
        !norm.includes('ROOK') &&
        !norm.includes('CHARIOT') &&
        !norm.includes('LANCE') &&
        !norm.includes('KNIGHT') &&
        !norm.includes('HORSE') &&
        !norm.includes('BISHOP') &&
        !norm.includes('ELEPHANT') &&
        !norm.includes('SILVER') &&
        !norm.includes('GOLD') &&
        !norm.includes('ADVISOR') &&
        !norm.includes('QUEEN') &&
        !norm.includes('KING') &&
        !norm.includes('GENERAL') &&
        !norm.includes('GYOKU') &&
        !norm.includes('JIANG') &&
        !norm.includes('SHUAI') &&
        !norm.includes('CANNON') && (
          <mesh
            castShadow
            position={[0, 0.58, 0]}
            geometry={stauntonGeometries.getFairyCrystal()}
          >
            <meshStandardMaterial color="#a855f7" metalness={0.75} roughness={0.2} />
          </mesh>
        )}
    </group>
  );
};

import React from 'react';
import { IPieceEntity } from '../../core/entities/types';

export interface IInstancedPiecesProps {
  boardSize?: number;
  pieces: readonly IPieceEntity[];
  selectedPieceId?: string | null;
  onPieceClick?: (pieceId: string, position: string) => void;
}

/**
 * Procedural 3D Piece Models (Spec 07 § 15 RF-01, RF-07).
 * Renders Pawn, Rook, Knight, Bishop, Queen and King with custom PBR shading.
 */
const Piece3DModel: React.FC<{
  type: string;
  isWhite: boolean;
  isSelected: boolean;
  position: [number, number, number];
  onClick: (e: { stopPropagation: () => void }) => void;
}> = ({ type, isWhite, isSelected, position, onClick }) => {
  const normType = type.toUpperCase();

  const bodyColor = isWhite ? '#f8fafc' : '#1e293b';
  const metalness = isWhite ? 0.2 : 0.45;
  const roughness = isWhite ? 0.25 : 0.25;

  const yPos = position[1] + (isSelected ? 0.22 : 0);

  return (
    <group
      position={[position[0], yPos, position[2]]}
      onClick={onClick}
    >
      {/* Base Pedestal */}
      <mesh castShadow receiveShadow position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.36, 0.42, 0.12, 20]} />
        <meshStandardMaterial
          color={isSelected ? '#f59e0b' : bodyColor}
          metalness={metalness}
          roughness={roughness}
        />
      </mesh>

      {/* Piece Specific Geometries */}
      {normType.includes('PAWN') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.16, 0.32, 0.44, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.54, 0]}>
            <sphereGeometry args={[0.2, 16, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('ROOK') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.3, 0.35, 0.68, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.76, 0]}>
            <cylinderGeometry args={[0.34, 0.28, 0.2, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('KNIGHT') && (
        <group position={[0, 0.12, 0]} rotation={[0, isWhite ? 0 : Math.PI, 0]}>
          <mesh castShadow position={[0, 0.32, 0]}>
            <cylinderGeometry args={[0.22, 0.34, 0.58, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Sculpted Equine Head */}
          <mesh castShadow position={[0, 0.68, 0.08]} rotation={[0.25, 0, 0]}>
            <boxGeometry args={[0.24, 0.32, 0.38]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Muzzle */}
          <mesh castShadow position={[0, 0.62, 0.28]} rotation={[0.45, 0, 0]}>
            <boxGeometry args={[0.18, 0.18, 0.22]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('BISHOP') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.42, 0]}>
            <cylinderGeometry args={[0.18, 0.34, 0.78, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 0.9, 0]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 1.08, 0]}>
            <sphereGeometry args={[0.06, 12, 12]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('QUEEN') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.48, 0]}>
            <cylinderGeometry args={[0.2, 0.36, 0.9, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Flared Coronet */}
          <mesh castShadow position={[0, 1.0, 0]}>
            <cylinderGeometry args={[0.32, 0.18, 0.22, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Crown Finial */}
          <mesh castShadow position={[0, 1.15, 0]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {normType.includes('KING') && (
        <group position={[0, 0.12, 0]}>
          <mesh castShadow position={[0, 0.52, 0]}>
            <cylinderGeometry args={[0.22, 0.36, 0.98, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Royal Crown Headpiece */}
          <mesh castShadow position={[0, 1.08, 0]}>
            <cylinderGeometry args={[0.3, 0.2, 0.2, 16]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          {/* Cross Finial */}
          <mesh castShadow position={[0, 1.25, 0]}>
            <boxGeometry args={[0.07, 0.18, 0.07]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
          <mesh castShadow position={[0, 1.28, 0]}>
            <boxGeometry args={[0.18, 0.06, 0.07]} />
            <meshStandardMaterial color={isSelected ? '#f59e0b' : bodyColor} metalness={metalness} roughness={roughness} />
          </mesh>
        </group>
      )}

      {/* Selection Glow Disk */}
      {isSelected && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#f59e0b" toneMapped={false} />
        </mesh>
      )}
    </group>
  );
};

export const InstancedPieces: React.FC<IInstancedPiecesProps> = ({
  boardSize = 8,
  pieces,
  selectedPieceId,
  onPieceClick,
}) => {
  const offset = (boardSize - 1) / 2;

  return (
    <group>
      {pieces.map((piece) => {
        if (piece.isCaptured || !piece.position) return null;

        const parts = piece.position.split(',');
        const col = parseInt(parts[0], 10);
        const row = parseInt(parts[1], 10);
        if (isNaN(col) || isNaN(row)) return null;

        const wx = col - offset;
        const wz = row - offset;
        const isWhite = piece.ownerId === 'P1';
        const isSelected = selectedPieceId === piece.id;

        return (
          <Piece3DModel
            key={piece.id}
            type={piece.variantId ?? 'PAWN'}
            isWhite={isWhite}
            isSelected={isSelected}
            position={[wx, 0, wz]}
            onClick={(e) => {
              e.stopPropagation();
              if (onPieceClick) {
                onPieceClick(piece.id, piece.position);
              }
            }}
          />
        );
      })}
    </group>
  );
};


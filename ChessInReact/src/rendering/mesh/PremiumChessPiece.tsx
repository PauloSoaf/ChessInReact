/**
 * ChessInReact - Premium 3D Chess Piece Component (Spec 07 § 5, § 7, RF-01, RF-07)
 *
 * Renders high-fidelity Staunton tournament pieces with authentic carved geometries
 * and studio PBR marble/alabaster/onyx materials sourced from Poly Haven (CC0, Riley Queen).
 */

import React, { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import {
  POLYHAVEN_CHESS_SET_PATH,
  IPolyHavenGLTF,
  PREMIUM_STAUNTON_SCALE,
  resolveStandardPieceType,
} from './PremiumChessAssetRegistry';

export interface IPremiumChessPieceProps {
  type: string;
  isWhite: boolean;
  ownerId?: string;
  isCheckKing?: boolean;
  isCheckSource?: boolean;
  isSelected?: boolean;
  hasJump?: boolean;
  isShielded?: boolean;
  isArcaneSkin?: boolean;
  scale?: number;
  rotationY?: number;
  position?: [number, number, number];
  customFinish?: 'antique-brass' | 'obsidian' | 'ivory-marble';
}

const FACTION_TINTS: Record<string, string> = {
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

export const PremiumChessPiece: React.FC<IPremiumChessPieceProps> = ({
  type,
  isWhite,
  ownerId,
  isCheckKing = false,
  isCheckSource = false,
  isSelected = false,
  scale = PREMIUM_STAUNTON_SCALE,
  rotationY,
  position,
  customFinish,
}) => {
  const { nodes, materials } = useGLTF(POLYHAVEN_CHESS_SET_PATH) as unknown as IPolyHavenGLTF;

  const pieceCategory = resolveStandardPieceType(type) ?? 'PAWN';

  // Extract shared geometry singleton
  const geometry = useMemo(() => {
    switch (pieceCategory) {
      case 'KING':
        return isWhite ? nodes.piece_king_white.geometry : nodes.piece_king_black.geometry;
      case 'QUEEN':
        return isWhite ? nodes.piece_queen_white.geometry : nodes.piece_queen_black.geometry;
      case 'BISHOP':
        return isWhite ? nodes.piece_bishop_white_01.geometry : nodes.piece_bishop_black_01.geometry;
      case 'KNIGHT':
        // White knight geometry faces +Z, Black knight geometry faces -Z
        return isWhite ? nodes.piece_knight_white_01.geometry : nodes.piece_knight_black_01.geometry;
      case 'ROOK':
        return isWhite ? nodes.piece_rook_white_01.geometry : nodes.piece_rook_black_01.geometry;
      case 'PAWN':
      default:
        return isWhite ? nodes.piece_pawn_white_01.geometry : nodes.piece_pawn_black_01.geometry;
    }
  }, [pieceCategory, isWhite, nodes]);

  // Extract shared PBR material with authentic colorSpace and roughness
  const material = useMemo(() => {
    // If a showroom finish is requested
    if (customFinish === 'antique-brass') {
      const brass = materials.chess_set_pieces_white.clone();
      brass.color.set('#c4a77d');
      brass.metalness = 0.85;
      brass.roughness = 0.28;
      return brass;
    }
    if (customFinish === 'obsidian') {
      return materials.chess_set_pieces_black;
    }
    if (customFinish === 'ivory-marble') {
      return materials.chess_set_pieces_white;
    }

    // Multiplayer faction tinting if beyond P1/P2
    if (ownerId && FACTION_TINTS[ownerId]) {
      const tinted = materials.chess_set_pieces_white.clone();
      tinted.color.set(FACTION_TINTS[ownerId]);
      tinted.roughness = 0.3;
      return tinted;
    }

    const base = isWhite
      ? materials.chess_set_pieces_white
      : materials.chess_set_pieces_black;

    // Check constraint or selection visual feedback (Spec 07 RF-05)
    if (isCheckKing || isCheckSource) {
      const checkMat = base.clone();
      checkMat.emissive.set('#dc2626');
      checkMat.emissiveIntensity = 0.35;
      return checkMat;
    }

    if (isSelected) {
      const selectMat = base.clone();
      selectMat.emissive.set('#f59e0b');
      selectMat.emissiveIntensity = 0.25;
      return selectMat;
    }

    return base;
  }, [
    isWhite,
    ownerId,
    materials,
    customFinish,
    isCheckKing,
    isCheckSource,
    isSelected,
  ]);

  // Rotation: If knight, default to forward orientation; otherwise respect rotationY
  const effectiveRotationY = useMemo(() => {
    if (rotationY !== undefined) return rotationY;
    return 0;
  }, [rotationY]);

  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      material={material}
      position={position}
      scale={[scale, scale, scale]}
      rotation={[0, effectiveRotationY, 0]}
    />
  );
};

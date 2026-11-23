/**
 * ChessInReact - Unified 3D Piece Renderer & Fallback Switch (Spec 07 § 5, § 7)
 *
 * Directs piece rendering to either:
 * 1. Premium Poly Haven 3D mesh with studio PBR materials (Primary)
 * 2. High-poly procedural Staunton piece model (Zero-latency fallback)
 *
 * Ensures fairy pieces (Duck, Cannon, Archbishop) and WebGL loading errors
 * degrade gracefully without dropping frames or breaking the match.
 */

import React, { Suspense } from 'react';
import { PremiumChessPiece } from './PremiumChessPiece';
import { ProceduralPieceModel } from './ProceduralPieceModel';
import { isPremiumPieceAvailable } from './PremiumChessAssetRegistry';

export interface IPieceRenderer3DProps {
  type: string;
  isWhite: boolean;
  ownerId?: string;
  isSelected?: boolean;
  isCheckKing?: boolean;
  isCheckSource?: boolean;
  hasJump?: boolean;
  isShielded?: boolean;
  isArcaneSkin?: boolean;
  scale?: number;
  rotationY?: number;
}

export class PremiumPieceErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.warn('[PieceRenderer3D] Premium model load error, falling back to procedural:', err);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const PieceRenderer3D: React.FC<IPieceRenderer3DProps> = ({
  type,
  isWhite,
  ownerId,
  isSelected = false,
  isCheckKing = false,
  isCheckSource = false,
  hasJump = false,
  isShielded = false,
  isArcaneSkin = false,
  scale,
  rotationY,
}) => {
  const isPremiumSupported = isPremiumPieceAvailable(type);

  // Procedural Fallback Component
  const proceduralFallback = (
    <ProceduralPieceModel
      variantId={type}
      isWhite={isWhite}
      isSelected={isSelected}
      isCheckKing={isCheckKing}
      isCheckSource={isCheckSource}
      hasJump={hasJump}
      isShielded={isShielded}
      scale={scale}
      rotationY={rotationY}
      ownerId={ownerId}
    />
  );

  // If piece is a fairy piece without a standard Staunton equivalent, use procedural model
  if (!isPremiumSupported) {
    return proceduralFallback;
  }

  return (
    <PremiumPieceErrorBoundary fallback={proceduralFallback}>
      <Suspense fallback={proceduralFallback}>
        <PremiumChessPiece
          type={type}
          isWhite={isWhite}
          ownerId={ownerId}
          isSelected={isSelected}
          isCheckKing={isCheckKing}
          isCheckSource={isCheckSource}
          hasJump={hasJump}
          isShielded={isShielded}
          isArcaneSkin={isArcaneSkin}
          scale={scale}
          rotationY={rotationY}
        />
      </Suspense>
    </PremiumPieceErrorBoundary>
  );
};

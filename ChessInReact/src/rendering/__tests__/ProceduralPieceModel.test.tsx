// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProceduralPieceModel } from '../mesh/ProceduralPieceModel';

describe('ProceduralPieceModel Suite (Spec 07 § 4, § 5, RF-01, RF-07, Spec 13)', () => {
  it('renders standard tournament pieces with universal pedestal', () => {
    const pieces = ['PAWN', 'ROOK', 'KNIGHT', 'BISHOP', 'QUEEN', 'KING'];

    for (const piece of pieces) {
      const { container } = render(
        <ProceduralPieceModel variantId={piece} isWhite={true} />
      );
      // Group root
      const group = container.querySelector('group');
      expect(group).not.toBeNull();
      // Meshes present
      const meshes = container.querySelectorAll('mesh');
      expect(meshes.length).toBeGreaterThanOrEqual(2); // Pedestal + piece body
    }
  });

  it('renders Capablanca Archbishop (B+N) and Chancellor (R+N) with distinctive composite geometries', () => {
    // Archbishop
    const { container: abContainer } = render(
      <ProceduralPieceModel variantId="ARCHBISHOP" isWhite={true} />
    );
    expect(abContainer.querySelector('group')).not.toBeNull();
    const abMeshes = abContainer.querySelectorAll('mesh');
    expect(abMeshes.length).toBeGreaterThanOrEqual(4); // Pedestal + Mitre + Knight Head + Knight Mane + Orb

    // Chancellor
    const { container: chContainer } = render(
      <ProceduralPieceModel variantId="CHANCELLOR" isWhite={false} />
    );
    expect(chContainer.querySelector('group')).not.toBeNull();
    const chMeshes = chContainer.querySelectorAll('mesh');
    expect(chMeshes.length).toBeGreaterThanOrEqual(7); // Pedestal + Rook Body + 4 Merlons + Knight Head + Knight Mane
  });

  it('renders Amazon (Q+N) with Queen coronet and equestrian pegasus crest', () => {
    const { container } = render(
      <ProceduralPieceModel variantId="AMAZON" isWhite={true} />
    );
    expect(container.querySelector('group')).not.toBeNull();
    const meshes = container.querySelectorAll('mesh');
    expect(meshes.length).toBeGreaterThanOrEqual(5); // Pedestal + Queen Body + Coronet + Knight Head + Orb
  });

  it('renders authentic Duck Chess Rubber Duck model', () => {
    const { container } = render(
      <ProceduralPieceModel variantId="DUCK" isWhite={false} />
    );
    const meshes = container.querySelectorAll('mesh');
    expect(meshes.length).toBe(4); // Pedestal + Duck Body + Duck Head + Duck Beak
  });

  it('renders Xiangqi Cannon bronze barrel and fallback fairy crystal', () => {
    // Cannon
    const { container: cannonContainer } = render(
      <ProceduralPieceModel variantId="CANNON" isWhite={true} />
    );
    expect(cannonContainer.querySelectorAll('mesh').length).toBe(2); // Pedestal + Barrel

    // Generic Fairy
    const { container: fairyContainer } = render(
      <ProceduralPieceModel variantId="UNICORN" isWhite={true} />
    );
    expect(fairyContainer.querySelectorAll('mesh').length).toBe(2); // Pedestal + Crystal
  });

  it('applies correct emissive shader states for checks, jumps, shields, and selection', () => {
    // Check King -> Red alert
    const { container: checkKing } = render(
      <ProceduralPieceModel variantId="KING" isWhite={true} isCheckKing={true} />
    );
    const matCheck = checkKing.querySelector('meshstandardmaterial');
    expect(matCheck?.getAttribute('emissive')).toBe('#ef4444');

    // Check Source -> Dark Red
    const { container: checkSource } = render(
      <ProceduralPieceModel variantId="QUEEN" isWhite={false} isCheckSource={true} />
    );
    const matSource = checkSource.querySelector('meshstandardmaterial');
    expect(matSource?.getAttribute('emissive')).toBe('#dc2626');

    // Jump piece -> Blue
    const { container: jumpPiece } = render(
      <ProceduralPieceModel variantId="KNIGHT" isWhite={true} hasJump={true} />
    );
    const matJump = jumpPiece.querySelector('meshstandardmaterial');
    expect(matJump?.getAttribute('emissive')).toBe('#0284c7');

    // Shielded piece -> Emerald Green
    const { container: shieldPiece } = render(
      <ProceduralPieceModel variantId="ROOK" isWhite={true} isShielded={true} />
    );
    const matShield = shieldPiece.querySelector('meshstandardmaterial');
    expect(matShield?.getAttribute('emissive')).toBe('#10b981');

    // Selected piece -> Amber
    const { container: selPiece } = render(
      <ProceduralPieceModel variantId="PAWN" isWhite={true} isSelected={true} />
    );
    const matSel = selPiece.querySelector('meshstandardmaterial');
    expect(matSel?.getAttribute('emissive')).toBe('#f59e0b');
  });

  it('correctly maps multi-faction palette P1..P12', () => {
    const { container: p3Piece } = render(
      <ProceduralPieceModel variantId="PAWN" isWhite={true} ownerId="P3" />
    );
    const matP3 = p3Piece.querySelector('meshstandardmaterial');
    expect(matP3?.getAttribute('color')).toBe('#eab308');

    const { container: p8Piece } = render(
      <ProceduralPieceModel variantId="ROOK" isWhite={false} ownerId="P8" />
    );
    const matP8 = p8Piece.querySelector('meshstandardmaterial');
    expect(matP8?.getAttribute('color')).toBe('#ec4899');
  });
});


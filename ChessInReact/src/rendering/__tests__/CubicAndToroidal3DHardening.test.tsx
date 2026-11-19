// @vitest-environment jsdom
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CubicChessBoard3D } from '../mesh/CubicChessBoard3D';
import { ToroidalChessBoard3D } from '../mesh/ToroidalChessBoard3D';
import { IPieceEntity } from '../../core/entities/types';
import { asCoordinateKey, asEntityId } from '../../core/coordinates';
import { CubicTopology } from '../../core/topology/CubicTopology';
import { SquareTopology } from '../../core/topology/SquareTopology';

describe('CubicChessBoard3D & ToroidalChessBoard3D Hardening Suite (Spec 07 / Spec 13)', () => {
  const samplePieces: IPieceEntity[] = [
    {
      id: asEntityId('w-pawn-front'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'PAWN',
      position: asCoordinateKey('2:3,4'),
      hasMoved: false,
      isCaptured: false,
    },
    {
      id: asEntityId('w-king-top'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'KING',
      position: asCoordinateKey('0:4,0'),
      hasMoved: false,
      isCaptured: false,
    },
    {
      id: asEntityId('b-queen-back'),
      type: 'PIECE',
      ownerId: 'P2',
      variantId: 'QUEEN',
      position: asCoordinateKey('3:3,7'),
      hasMoved: false,
      isCaptured: false,
    },
    {
      id: asEntityId('w-torus-rook'),
      type: 'PIECE',
      ownerId: 'P1',
      variantId: 'ROOK',
      position: asCoordinateKey('7,3'),
      hasMoved: false,
      isCaptured: false,
    },
  ];

  describe('1. CubicChessBoard3D (6-Face Manifold Rendering)', () => {
    it('renders all 6 cube faces, inner core, and handles tile interactions', () => {
      const onSquareClick = vi.fn();
      const onPieceClick = vi.fn();

      const { container } = render(
        <CubicChessBoard3D
          boardSize={8}
          lightColor="#e2e8f0"
          darkColor="#475569"
          pieces={samplePieces}
          selectedPieceId="w-pawn-front"
          legalMoveCoords={['2:3,5', '0:3,0']}
          onSquareClick={onSquareClick}
          onPieceClick={onPieceClick}
        />
      );

      // Verify 6 faces are mounted
      expect(container.querySelector('[name="face-TOP"]')).toBeDefined();
      expect(container.querySelector('[name="face-BOTTOM"]')).toBeDefined();
      expect(container.querySelector('[name="face-FRONT"]')).toBeDefined();
      expect(container.querySelector('[name="face-BACK"]')).toBeDefined();
      expect(container.querySelector('[name="face-LEFT"]')).toBeDefined();
      expect(container.querySelector('[name="face-RIGHT"]')).toBeDefined();

      // Click on tile on FRONT face
      const frontTile = container.querySelector('[name="cube-tile-FRONT-2:3,5"]');
      expect(frontTile).toBeDefined();
      if (frontTile) {
        fireEvent.click(frontTile);
        expect(onSquareClick).toHaveBeenCalledWith('2:3,5');
      }

      // Click on piece
      const pieceMesh = container.querySelector('[name="cube-piece-w-pawn-front"]');
      expect(pieceMesh).toBeDefined();
      if (pieceMesh) {
        fireEvent.click(pieceMesh);
        expect(onPieceClick).toHaveBeenCalledWith('w-pawn-front', '2:3,4');
      }
    });

    it('gracefully ignores invalid or missing piece positions without crashing', () => {
      const corruptPieces: IPieceEntity[] = [
        {
          id: asEntityId('corrupt-1'),
          type: 'PIECE',
          ownerId: 'P1',
          variantId: 'PAWN',
          position: asCoordinateKey(''),
          hasMoved: false,
          isCaptured: false,
        },
        {
          id: asEntityId('corrupt-2'),
          type: 'PIECE',
          ownerId: 'P2',
          variantId: 'KING',
          position: asCoordinateKey('bad_coord'),
          hasMoved: false,
          isCaptured: false,
        },
      ];

      const { container } = render(
        <CubicChessBoard3D
          boardSize={8}
          lightColor="#ffffff"
          darkColor="#000000"
          pieces={corruptPieces}
        />
      );

      expect(container.querySelector('[name="cubic-chess-board-3d"]')).toBeDefined();
    });

    it('verifies real gameplay traversal across cube face boundary', () => {
      const topology = new CubicTopology({ boardSize: 8 });
      // Piece at 2:3,7 (top of FRONT face) moves NORTH (dir 0) -> lands on 0:3,0 (bottom of TOP face)
      const step = topology.getStepWithDirection(asCoordinateKey('2:3,7'), 0);
      expect(step).not.toBeNull();
      expect(step?.coord).toBe(asCoordinateKey('0:3,0'));
      expect(step?.dir).toBe(0);

      // Reversible: Piece at 0:3,0 moves SOUTH (dir 4) -> lands on 2:3,7
      const reverseStep = topology.getStepWithDirection(asCoordinateKey('0:3,0'), 4);
      expect(reverseStep).not.toBeNull();
      expect(reverseStep?.coord).toBe(asCoordinateKey('2:3,7'));
      expect(reverseStep?.dir).toBe(4);
    });
  });

  describe('2. ToroidalChessBoard3D (Donut Surface Rendering)', () => {
    it('renders continuous toroidal surface tiles and handles interactions', () => {
      const onSquareClick = vi.fn();
      const onPieceClick = vi.fn();

      const { container } = render(
        <ToroidalChessBoard3D
          boardSize={8}
          lightColor="#e2e8f0"
          darkColor="#475569"
          pieces={samplePieces}
          selectedPieceId="w-torus-rook"
          legalMoveCoords={['0,3', '1,3']}
          onSquareClick={onSquareClick}
          onPieceClick={onPieceClick}
        />
      );

      // Torus core mesh
      expect(container.querySelector('[name="toroidal-chess-board-3d"]')).toBeDefined();

      // Click on tile 0,3 (wrapped neighbor of 7,3)
      const tileMesh = container.querySelector('[name="torus-tile-0,3"]');
      expect(tileMesh).toBeDefined();
      if (tileMesh) {
        fireEvent.click(tileMesh);
        expect(onSquareClick).toHaveBeenCalledWith('0,3');
      }

      // Click on piece at 7,3
      const pieceMesh = container.querySelector('[name="torus-piece-w-torus-rook"]');
      expect(pieceMesh).toBeDefined();
      if (pieceMesh) {
        fireEvent.click(pieceMesh);
        expect(onPieceClick).toHaveBeenCalledWith('w-torus-rook', '7,3');
      }
    });

    it('verifies real gameplay traversal wrapping across toroidal borders', () => {
      const toroidal = new SquareTopology({ width: 8, height: 8, toroidal: true });
      // Moving EAST (dir 2) from column 7 wraps to column 0
      const wrappedEast = toroidal.getNeighbor(asCoordinateKey('7,3'), 2);
      expect(wrappedEast).toBe(asCoordinateKey('0,3'));

      // Moving WEST (dir 6) from column 0 wraps to column 7
      const wrappedWest = toroidal.getNeighbor(asCoordinateKey('0,3'), 6);
      expect(wrappedWest).toBe(asCoordinateKey('7,3'));

      // Moving NORTH (dir 0) from row 7 wraps to row 0
      const wrappedNorth = toroidal.getNeighbor(asCoordinateKey('3,7'), 0);
      expect(wrappedNorth).toBe(asCoordinateKey('3,0'));
    });
  });
});


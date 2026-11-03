import React from 'react';
import { PieceSetId } from '../../theme/types';
import { PlayerId } from '../../../core/coordinates/types';

export interface IPieceRendererProps {
  variantId: string;
  ownerId: PlayerId;
  pieceSet: PieceSetId;
  size?: number | string;
}

// Classical Unicode glyphs
const UNICODE_GLYPHS: Record<string, string> = {
  KING: '♚',
  QUEEN: '♛',
  ROOK: '♜',
  BISHOP: '♝',
  KNIGHT: '♞',
  PAWN: '♟',
};

// SVG Vector Paths for Tournament Vector Set
const SVG_PIECE_PATHS: Record<string, string> = {
  KING: 'M12 2v3m-2-2h4m-2 4c-3.5 0-6 2.5-6 6 0 2.5 1.5 4.5 3 6h6c1.5-1.5 3-3.5 3-6 0-3.5-2.5-6-6-6zm-4 13h8m-9 3h10',
  QUEEN: 'M6 8l3 4 3-6 3 6 3-4v9H6V8zm-1 11h14m-12 2h10',
  ROOK: 'M5 5h3v2h2V5h4v2h2V5h3v4l-2 3v5H7v-5L5 9V5zm0 14h14',
  BISHOP: 'M12 4c-2.5 0-5 2.5-5 6 0 3 2 5.5 5 7 3-1.5 5-4 5-7 0-3.5-2.5-6-5-6zm-2 15h4m-4-7h4m-2-2v4',
  KNIGHT: 'M8 18h8v-2c0-2-1-3-2-4l1-3c.5-1.5-.5-3.5-2.5-3.5H9c-2 0-3 2-2 4l1 1-2 1c-1 1-1 3.5 1 4.5v1z',
  PAWN: 'M12 5a3 3 0 100 6 3 3 0 000-6zm-3 8l-1 5h8l-1-5H9zm-2 7h10',
};

export const PieceRenderer: React.FC<IPieceRendererProps> = ({
  variantId,
  ownerId,
  pieceSet,
  size = '100%',
}) => {
  const normVariant = variantId.toUpperCase();
  const isWhite = ownerId === 'P1';

  // 1. Vector SVG rendering
  if (pieceSet === 'tournament-vector') {
    const path = SVG_PIECE_PATHS[normVariant] ?? SVG_PIECE_PATHS.PAWN;
    const fillColor = isWhite ? '#ffffff' : '#1e1b2e';
    const strokeColor = isWhite ? '#38bdf8' : '#f43f5e';

    return (
      <svg
        viewBox="0 0 24 24"
        style={{
          width: size,
          height: size,
          maxWidth: '85%',
          maxHeight: '85%',
          filter: isWhite
            ? 'drop-shadow(0 2px 4px rgba(56, 189, 248, 0.4))'
            : 'drop-shadow(0 2px 4px rgba(244, 63, 94, 0.4))',
          transition: 'transform 150ms ease-out',
        }}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    );
  }

  // 2. Pixel Art stylized
  if (pieceSet === 'pixel-art') {
    const glyph = UNICODE_GLYPHS[normVariant] ?? '♟';
    return (
      <span
        style={{
          fontSize: '110%',
          fontFamily: '"Courier New", Courier, monospace',
          fontWeight: 900,
          color: isWhite ? '#e0f2fe' : '#ffe4e6',
          textShadow: isWhite
            ? '1px 1px 0 #0284c7, -1px -1px 0 #0369a1'
            : '1px 1px 0 #be123c, -1px -1px 0 #881337',
          imageRendering: 'pixelated',
          userSelect: 'none',
        }}
      >
        {glyph}
      </span>
    );
  }

  // 3. Default: Neo Classic Unicode
  const glyph = UNICODE_GLYPHS[normVariant] ?? '♟';
  return (
    <span
      style={{
        fontSize: '130%',
        color: isWhite ? '#ffffff' : '#fda4af',
        textShadow: isWhite
          ? '0 2px 6px rgba(56, 189, 248, 0.6), 0 1px 2px rgba(0,0,0,0.8)'
          : '0 2px 6px rgba(244, 63, 94, 0.7), 0 1px 2px rgba(0,0,0,0.9)',
        userSelect: 'none',
        lineHeight: 1,
        transition: 'transform 150ms ease-out',
      }}
    >
      {glyph}
    </span>
  );
};

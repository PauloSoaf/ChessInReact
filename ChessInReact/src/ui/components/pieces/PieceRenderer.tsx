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

// Authentic 16x16 Pixel Art Sprites (Crisp edges geometry)
interface IPixelSprite {
  outline: string;
  fill: string;
  accent?: string;
}

const PIXEL_ART_SPRITES: Record<string, IPixelSprite> = {
  PAWN: {
    outline: 'M6 2h4v1h1v4h-1v1h2v1h1v4h-1v1h2v1H2v-1h2v-1H3V9h1V8h2V7H5V3h1V2z',
    fill: 'M7 3h2v1H7V3zm-1 2h4v1H6V5zm0 3h4v1H6V8zm-1 2h6v2H5v-2zm-1 3h8v1H4v-1z',
    accent: 'M7 5h2v1H7V5z',
  },
  KNIGHT: {
    outline: 'M5 2h3v1h1v1h1v1h1v1h1v4h-1v2h1v1h1v1H3v-1h1v-2h-1v-2h1V7h-1V5h1V4h1V2z',
    fill: 'M6 3h2v1h2v2H9v1h2v3h-1v2h-1v-1H5v-1h1V9H5V8h2V7H4V6h1V5h1V3zm2 4h1v1H8V7z',
    accent: 'M6 4h1v1H6V4zm3 4h1v1H9V8z',
  },
  BISHOP: {
    outline: 'M7 1h2v1h1v1h1v5h-1v1h1v1h1v3h-1v1h2v1H2v-1h2v-1H3V10h1V9h1V8H4V3h1V2h1V1h1z',
    fill: 'M7 2h2v1H7V2zm-1 2h3v1h-1v1h2v2H8v1h2v1H6v-1h1V8H5V5h1V4zm-1 7h6v2H5v-2zm-1 3h8v1H4v-1z',
    accent: 'M8 4h1v2H8V4z',
  },
  ROOK: {
    outline: 'M2 2h3v2h2V2h2v2h2V2h3v5h-1v1h1v4h-1v1h2v1H1v-1h2v-1H2V8h1V7H2V2z',
    fill: 'M3 3h1v2h2V4h4v1h2V3h1v4h-1v2h-1v2h2v1H3v-1h2V9H4V7H3V3z',
    accent: 'M6 6h4v1H6V6z',
  },
  QUEEN: {
    outline: 'M2 2h2v1h1v2h1V3h1V1h2v2h1v2h1V3h1V2h2v5h-1v1h1v4h-1v1h2v1H1v-1h2v-1H2V8h1V7H2V2z',
    fill: 'M3 3h1v2h2V4h1V3h2v1h1v1h2V4h1v3h-1v2h-1v2h2v1H4v-1h2V9H5V7H4V3zm4 4h2v1H7V7z',
    accent: 'M7 3h2v1H7V3zm-4 4h1v1H3V7zm10 0h1v1h-1V7z',
  },
  KING: {
    outline: 'M7 1h2v1h1v1H9v1h3v4h-1v1h1v4h-1v1h2v1H2v-1h2v-1H3V9h1V8H3V4h3V3H5V2h1V1h1z',
    fill: 'M7 2h2v1h1v1H6V3h1V2zm-2 3h6v3h-1v1h-1v1h2v2H5v-2h2V9H6V8H5V5zm2 5h2v1H7v-1z',
    accent: 'M7 2h2v1H7V2zm0 6h2v1H7V8z',
  },
};

export const PieceRenderer: React.FC<IPieceRendererProps> = ({
  variantId,
  ownerId,
  pieceSet,
  size = '100%',
}) => {
  const normVariant = variantId.toUpperCase();
  const isWhite = ownerId === 'P1';

  // 1. Vector SVG rendering (Tournament Vector Set)
  if (pieceSet === 'tournament-vector') {
    const path = SVG_PIECE_PATHS[normVariant] ?? SVG_PIECE_PATHS.PAWN;
    const fillColor = isWhite ? '#FAF8F5' : '#18202A';
    const strokeColor = isWhite ? '#1E293B' : '#D6C3A5';

    return (
      <svg
        viewBox="0 0 24 24"
        data-testid="tournament-vector-piece"
        style={{
          width: size,
          height: size,
          maxWidth: '78%',
          maxHeight: '78%',
          filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.38))',
          transition: 'transform 150ms ease-out',
        }}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    );
  }

  // 2. Authentic 16x16 Pixel Art rendering (8-Bit Retro Arcade)
  if (pieceSet === 'pixel-art') {
    const sprite = PIXEL_ART_SPRITES[normVariant] ?? PIXEL_ART_SPRITES.PAWN;
    const outlineColor = isWhite ? '#1E293B' : '#090D11';
    const fillColor = isWhite ? '#F8FAFC' : '#334155';
    const accentColor = isWhite ? '#CBD5E1' : '#C4A77D';

    return (
      <svg
        viewBox="0 0 16 16"
        data-testid="pixel-art-piece"
        shapeRendering="crispEdges"
        style={{
          width: size,
          height: size,
          maxWidth: '78%',
          maxHeight: '78%',
          shapeRendering: 'crispEdges',
          filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45))',
          transition: 'transform 150ms ease-out',
        }}
      >
        <path d={sprite.outline} fill={outlineColor} />
        <path d={sprite.fill} fill={fillColor} />
        {sprite.accent && <path d={sprite.accent} fill={accentColor} />}
      </svg>
    );
  }

  // 3. Default: Neo Classic Unicode (Weighted Staunton Alabaster & Ebony)
  const glyph = UNICODE_GLYPHS[normVariant] ?? '♟';
  return (
    <span
      data-testid="neo-classic-piece"
      style={{
        fontSize: '115%',
        color: isWhite ? '#FAF8F5' : '#161D26',
        WebkitTextStroke: isWhite ? '0.6px #141A20' : '0.5px rgba(244, 241, 235, 0.65)',
        textShadow: isWhite
          ? '0 2px 4px rgba(0, 0, 0, 0.65), 0 0 1px rgba(0, 0, 0, 0.9)'
          : '0 2px 4px rgba(0, 0, 0, 0.55), 0 0 2px rgba(244, 241, 235, 0.35)',
        userSelect: 'none',
        lineHeight: 1,
        transition: 'transform 150ms ease-out',
      }}
    >
      {glyph}
    </span>
  );
};

import React from 'react';
import { PieceSetId } from '../../theme/types';
import { PlayerId } from '../../../core/coordinates/types';

export interface IPieceRendererProps {
  variantId: string;
  ownerId: PlayerId;
  pieceSet: PieceSetId;
  size?: number | string;
}

// Classical Unicode glyphs (preserved for screen readers and text serialization)
const UNICODE_GLYPHS: Record<string, string> = {
  KING: '♚',
  QUEEN: '♛',
  ROOK: '♜',
  BISHOP: '♝',
  KNIGHT: '♞',
  PAWN: '♟',
};

interface IStauntonVectorSpec {
  body: string;
  collar: string;
  detail?: string;
}

// Bespoke Staunton Atelier SVG Geometries (45x45 coordinate space)
const STAUNTON_ATELIER_PIECES: Record<string, IStauntonVectorSpec> = {
  PAWN: {
    body: 'M 22.5,9 C 19.2,9 16.5,11.7 16.5,15 C 16.5,17.4 17.9,19.4 20,20.4 C 17.6,21.8 16,24.2 16,27 C 16,29 17.5,30.5 17.5,30.5 L 13.5,35.5 L 31.5,35.5 L 27.5,30.5 C 27.5,30.5 29,29 29,27 C 29,24.2 27.4,21.8 25,20.4 C 27.1,19.4 28.5,17.4 28.5,15 C 28.5,11.7 25.8,9 22.5,9 z M 11.5,36 L 33.5,36 L 33.5,39.5 L 11.5,39.5 L 11.5,36 z',
    collar: 'M 17.5,21 L 27.5,21 M 14.5,35.5 L 30.5,35.5',
    detail: 'M 20.5,12.5 A 2.5,2.5 0 0 1 23,11',
  },
  ROOK: {
    body: 'M 11,39.5 L 34,39.5 L 34,36 L 11,36 L 11,39.5 z M 13,36 L 13,32 L 32,32 L 32,36 L 13,36 z M 14,14 L 14,9.5 L 18,9.5 L 18,12 L 20.5,12 L 20.5,9.5 L 24.5,9.5 L 24.5,12 L 27,12 L 27,9.5 L 31,9.5 L 31,14 L 28.5,17 L 28.5,29.5 L 31,32 L 14,32 L 16.5,29.5 L 16.5,17 L 14,14 z',
    collar: 'M 14,14 L 31,14 M 16.5,17 L 28.5,17 M 16.5,29.5 L 28.5,29.5 M 13,32 L 32,32',
    detail: 'M 19,19.5 L 19,27',
  },
  KNIGHT: {
    body: 'M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18 C 23,18 20.8,19.8 18,21 C 16,21.8 13.5,21.5 12.5,19.5 C 11.5,17.5 13.5,14.5 16,12.5 C 17.5,11.2 19,9.5 19,9.5 L 20.5,11.5 C 20.5,11.5 21.2,10 22,10 z M 11.5,36 L 34.5,36 L 34.5,39.5 L 11.5,39.5 L 11.5,36 z',
    collar: 'M 14,35.8 L 32.5,35.8',
    detail: 'M 16.5,15.5 A 1,1 0 1 1 15.5,15.5 M 25.5,14 C 30.5,16 33.5,22 33.5,33.5',
  },
  BISHOP: {
    body: 'M 9,36 C 12.4,35 19.1,36.4 22.5,34 C 25.9,36.4 32.6,35 36,36 C 36,36 37.6,36.5 39,38 C 38.3,39 37.3,39 36,38.5 C 32.6,37.5 25.9,39 22.5,37.5 C 19.1,39 12.4,37.5 9,38.5 C 7.7,39 6.7,39 6,38 C 7.4,36.5 9,36 9,36 z M 15,32 C 17.5,34.5 27.5,34.5 30,32 C 30.5,30.5 30,30 30,30 C 30,27.5 27.5,26 27.5,26 C 33,24.5 33.5,14.5 22.5,10.5 C 11.5,14.5 12,24.5 17.5,26 C 17.5,26 15,27.5 15,30 C 15,30 14.5,30.5 15,32 z M 22.5,6.5 A 2.2,2.2 0 1 1 22.49,6.5',
    collar: 'M 17.5,26 L 27.5,26 M 15,30 L 30,30',
    detail: 'M 22.5,15.5 L 22.5,20.5 M 20,18 L 25,18',
  },
  QUEEN: {
    body: 'M 9,26 C 17.5,24.5 30,24.5 36,26 L 38.5,13.5 L 31,25 L 30.7,10.9 L 25.5,24.5 L 22.5,10 L 19.5,24.5 L 14.3,10.9 L 14,25 L 6.5,13.5 L 9,26 z M 9,26 C 9,28 10.5,28 11.5,30 C 12.5,31.5 12.5,31 12,33.5 C 10.5,34.5 11,36 11,36 C 9.5,37.5 11,38.5 11,38.5 C 17.5,39.5 27.5,39.5 34,38.5 C 34,38.5 35.5,37.5 34,36 C 34,36 34.5,34.5 33,33.5 C 32.5,31 32.5,31.5 33.5,30 C 34.5,28 36,28 36,26 C 27.5,24.5 17.5,24.5 9,26 z',
    collar: 'M 11.5,30 C 15,29 30,29 33.5,30 M 12,33.5 C 18,32.5 27,32.5 33,33.5',
    detail: 'M 6,12 A 1.6,1.6 0 1 1 5.99,12 M 14,9 A 1.6,1.6 0 1 1 13.99,9 M 22.5,8 A 1.6,1.6 0 1 1 22.49,8 M 31,9 A 1.6,1.6 0 1 1 30.99,9 M 39,12 A 1.6,1.6 0 1 1 38.99,12',
  },
  KING: {
    body: 'M 22.5,11.63 L 22.5,6 M 20,8 L 25,8 M 22.5,25 C 22.5,25 27,17.5 25.5,14.5 C 25.5,14.5 24.5,12 22.5,12 C 20.5,12 19.5,14.5 19.5,14.5 C 18,17.5 22.5,25 22.5,25 M 11.5,37 C 17,40.5 27,40.5 32.5,37 L 32.5,30 C 32.5,30 41.5,25.5 38.5,19.5 C 34.5,13 25,16 22.5,23.5 L 22.5,27 L 22.5,23.5 C 19,16 9.5,13 6.5,19.5 C 3.5,25.5 11.5,29.5 11.5,29.5 L 11.5,37 z',
    collar: 'M 11.5,30 C 17,27 27,27 32.5,30 M 11.5,33.5 C 17,30.5 27,30.5 32.5,33.5 M 11.5,37 C 17,34 27,34 32.5,37',
    detail: 'M 22.5,6 L 22.5,11.5 M 19.8,8.2 L 25.2,8.2',
  },
};

// Modern Championship Geometric Vector Set (24x24 coordinate space)
const TOURNAMENT_VECTOR_PATHS: Record<string, { body: string; accent: string }> = {
  KING: {
    body: 'M12 2v3.5M9.8 3.8h4.4M12 6.5c-3.8 0-6.5 2.6-6.5 6.2 0 2.6 1.6 4.6 3.2 6.3h6.6c1.6-1.7 3.2-3.7 3.2-6.3 0-3.6-2.7-6.2-6.5-6.2zM7.5 19h9v2.2h-9V19z',
    accent: 'M8.5 16.5h7M12 9.5v4.5M10 11.5h4',
  },
  QUEEN: {
    body: 'M4.5 8.5l3.8 4.5 3.7-6.5 3.7 6.5 3.8-4.5-1.8 9.5H6.3L4.5 8.5zM6 18.5h12v2.5H6v-2.5z',
    accent: 'M7 15.8h10M12 6.5a1 1 0 100-2 1 1 0 000 2z',
  },
  ROOK: {
    body: 'M5.5 5h3v2.2h2V5h3v2.2h2V5h3v4.2l-2 2.6v5.7h-9v-5.7l-2-2.6V5zM5 18h14v2.8H5V18z',
    accent: 'M7.5 11.8h9M7.5 15.5h9',
  },
  BISHOP: {
    body: 'M12 3.2a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8zM12 6c-3 0-5.5 2.8-5.5 6.4 0 2.8 1.8 5 4.2 6.1h2.6c2.4-1.1 4.2-3.3 4.2-6.1C17.5 8.8 15 6 12 6zM6.5 18.8h11v2.2h-11v-2.2z',
    accent: 'M10 11.2h4M12 9.2v4M8 16.5h8',
  },
  KNIGHT: {
    body: 'M7 18.5h10.5v-2.2c0-2.4-1.2-3.8-2.4-5l1.2-3.2c.6-1.8-.6-3.8-2.8-3.8H9.2c-2.2 0-3.4 2.2-2.2 4.2l1.2 1.2-2.2 1.2c-1.2 1.2-1 3.6 1 4.8v2.8zM6 18.8h12v2.2H6v-2.2z',
    accent: 'M10.5 8.2a.8.8 0 100 1.6.8.8 0 000-1.6zM8 16.2h8.5',
  },
  PAWN: {
    body: 'M12 5a3.4 3.4 0 100 6.8A3.4 3.4 0 0012 5zm-3.2 7.5L7.2 18h9.6l-1.6-5.5H8.8zM6.2 18.5h11.6V21H6.2v-2.5z',
    accent: 'M8.8 12.5h6.4M7.5 16.2h9',
  },
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
  const glyph = UNICODE_GLYPHS[normVariant] ?? '♟';

  // 1. Modern Championship Vector Set
  if (pieceSet === 'tournament-vector') {
    const spec = TOURNAMENT_VECTOR_PATHS[normVariant] ?? TOURNAMENT_VECTOR_PATHS.PAWN;
    const fillColor = isWhite ? '#FAF8F5' : '#161E29';
    const strokeColor = isWhite ? '#141B24' : '#DECBA8';
    const innerColor = isWhite ? '#334155' : '#C8AB82';

    return (
      <svg
        viewBox="0 0 24 24"
        data-testid="tournament-vector-piece"
        style={{
          width: size,
          height: size,
          maxWidth: '76%',
          maxHeight: '76%',
          filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.42))',
          transition: 'transform 150ms ease-out',
        }}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>{glyph}</title>
        <path d={spec.body} />
        <path d={spec.accent} fill="none" stroke={innerColor} strokeWidth="1.2" />
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
          maxWidth: '76%',
          maxHeight: '76%',
          shapeRendering: 'crispEdges',
          filter: 'drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45))',
          transition: 'transform 150ms ease-out',
        }}
      >
        <title>{glyph}</title>
        <path d={sprite.outline} fill={outlineColor} />
        <path d={sprite.fill} fill={fillColor} />
        {sprite.accent && <path d={sprite.accent} fill={accentColor} />}
      </svg>
    );
  }

  // 3. Default: Neo Classic Staunton Atelier (Sculpted Staunton Vector + Semantic Glyph)
  const staunton = STAUNTON_ATELIER_PIECES[normVariant] ?? STAUNTON_ATELIER_PIECES.PAWN;
  const bodyFill = isWhite ? '#FAF8F4' : '#141B24';
  const bodyStroke = isWhite ? '#18202A' : '#DFC9A6';
  const collarStroke = isWhite ? '#475569' : '#C8AB82';

  return (
    <span
      data-testid="neo-classic-piece"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        maxWidth: '78%',
        maxHeight: '78%',
        userSelect: 'none',
        lineHeight: 1,
        transition: 'transform 150ms ease-out',
      }}
    >
      <svg
        viewBox="0 0 45 45"
        style={{
          width: '100%',
          height: '100%',
          filter: isWhite
            ? 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.45))'
            : 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.55))',
          overflow: 'visible',
        }}
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>{glyph}</title>
        <path d={staunton.body} />
        <path d={staunton.collar} fill="none" stroke={collarStroke} strokeWidth="1.4" />
        {staunton.detail && (
          <path d={staunton.detail} fill="none" stroke={collarStroke} strokeWidth="1.45" />
        )}
      </svg>
    </span>
  );
};

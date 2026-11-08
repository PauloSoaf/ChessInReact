import React from 'react';
import { KnightMaterialFinish } from './types';

export interface IShowcaseFallbackProps {
  finish?: KnightMaterialFinish;
}

/**
 * Editorial SVG Studio Fallback for the Staunton Knight Showcase.
 * Provides zero-WebGL vector sculpture with calibrated studio gradients and pedestal framing
 * matching the coaxial 3D Lathe/Extrude Staunton Knight.
 */
export const ShowcaseFallback: React.FC<IShowcaseFallbackProps> = ({
  finish = 'antique-brass',
}) => {
  const getStopColors = () => {
    switch (finish) {
      case 'obsidian':
        return {
          start: '#2D3744',
          mid: '#161C24',
          end: '#090D11',
          stroke: '#C8AB82',
          collar: '#C8AB82',
          rim: 'rgba(200, 171, 130, 0.24)',
        };
      case 'ivory-marble':
        return {
          start: '#FFFFFF',
          mid: '#F3EFE6',
          end: '#D5CFC2',
          stroke: '#9A6B26',
          collar: '#9A6B26',
          rim: 'rgba(154, 107, 38, 0.2)',
        };
      case 'antique-brass':
      default:
        return {
          start: '#E6CFA8',
          mid: '#C8AB82',
          end: '#7A613E',
          stroke: '#F4F1EB',
          collar: '#18202A',
          rim: 'rgba(200, 171, 130, 0.28)',
        };
    }
  };

  const colors = getStopColors();

  return (
    <div
      data-testid="showcase-fallback-vector"
      data-finish={finish}
      role="img"
      aria-label={`Mostruário da peça Cavalo Staunton em 2D (${finish})`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '220px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Subtle Studio Spotlight Glow */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: '220px',
          height: '220px',
          borderRadius: '50%',
          background: `radial-gradient(circle, ${colors.rim} 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      <svg
        id="chess-piece-fallback-svg"
        viewBox="0 0 140 160"
        width="162"
        height="185"
        style={{
          filter: 'drop-shadow(0 18px 28px rgba(0, 0, 0, 0.48))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <title>{`Cavalo Staunton - ${finish}`}</title>
        <defs>
          <linearGradient id={`knight-grad-${finish}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="52%" stopColor={colors.mid} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>

        {/* Studio Orbital Ring */}
        <circle
          cx="70"
          cy="78"
          r="58"
          fill="none"
          stroke={colors.stroke}
          strokeOpacity="0.14"
          strokeWidth="1"
        />

        {/* Studio Plinth Shadow & Outer Ring */}
        <ellipse cx="70" cy="142" rx="46" ry="7" fill="rgba(0,0,0,0.38)" />
        <ellipse
          cx="70"
          cy="141"
          rx="42"
          ry="5.5"
          fill="none"
          stroke={colors.collar}
          strokeOpacity="0.65"
          strokeWidth="1.2"
        />

        {/* Turned Pedestal Base & Championship Collars */}
        <rect
          x="33"
          y="129"
          width="74"
          height="10"
          rx="5"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="0.9"
        />
        <rect
          x="38"
          y="125"
          width="64"
          height="4"
          rx="2"
          fill={colors.collar}
          stroke={colors.stroke}
          strokeWidth="0.6"
        />
        <path
          d="M41 125 C43 116, 97 116, 99 125 Z"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="0.9"
        />
        <rect
          x="44"
          y="112"
          width="52"
          height="4.5"
          rx="2.2"
          fill={colors.collar}
          stroke={colors.stroke}
          strokeWidth="0.7"
        />

        {/* Twin Ears (Back & Front) */}
        <path
          d="M60 30 L64 17 L69 29 Z"
          fill={colors.end}
          stroke={colors.stroke}
          strokeWidth="0.8"
        />
        <path
          d="M55 32 L60 18 L66 30 Z"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="0.9"
        />

        {/* Staunton Knight Coaxial Sculptural Silhouette */}
        <path
          d="M47 112
             C38 90, 39 62, 51 39
             C55 31, 61 27, 68 28
             C79 31, 92 43, 102 55
             C108 61, 111 66, 109 71
             C107 75, 101 77, 94 76
             L87 74
             C82 77, 77 77, 73 72
             C69 69, 67 74, 72 80
             C83 89, 88 99, 86 112
             Z"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Carved Dorsal Mane Spine & Eye Detail */}
        <path
          d="M52 44 C44 64, 44 86, 51 107"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="1.1"
          strokeOpacity="0.5"
          strokeLinecap="round"
        />
        <circle cx="80" cy="48" r="2.4" fill="#090D11" stroke={colors.stroke} strokeWidth="0.6" />
      </svg>
    </div>
  );
};

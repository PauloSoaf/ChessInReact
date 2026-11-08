import React from 'react';
import { KnightMaterialFinish } from './types';

export interface IShowcaseFallbackProps {
  finish?: KnightMaterialFinish;
}

/**
 * Editorial SVG Studio Fallback for the Staunton Knight Showcase.
 * Provides zero-WebGL vector sculpture with calibrated studio gradients and pedestal framing.
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
          stroke: '#C4A77D',
          rim: 'rgba(196, 167, 125, 0.25)',
        };
      case 'ivory-marble':
        return {
          start: '#FFFFFF',
          mid: '#EFECE4',
          end: '#D5CFC2',
          stroke: '#9A6B26',
          rim: 'rgba(154, 107, 38, 0.22)',
        };
      case 'antique-brass':
      default:
        return {
          start: '#E6CFA8',
          mid: '#C4A77D',
          end: '#7A613E',
          stroke: '#F4F1EB',
          rim: 'rgba(196, 167, 125, 0.28)',
        };
    }
  };

  const colors = getStopColors();

  return (
    <div
      data-testid="showcase-fallback-vector"
      role="img"
      aria-label="Mostruário da peça Cavalo Staunton em 2D"
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
        width="156"
        height="178"
        style={{
          filter: 'drop-shadow(0 18px 28px rgba(0, 0, 0, 0.48))',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <defs>
          <linearGradient id={`knight-grad-${finish}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors.start} />
            <stop offset="52%" stopColor={colors.mid} />
            <stop offset="100%" stopColor={colors.end} />
          </linearGradient>
        </defs>

        {/* Studio Plinth Shadow */}
        <ellipse cx="70" cy="144" rx="46" ry="7" fill="rgba(0,0,0,0.35)" />

        {/* Pedestal Base & Collar */}
        <rect
          x="32"
          y="130"
          width="76"
          height="11"
          rx="4"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="0.9"
        />
        <path
          d="M38 130 C38 121, 102 121, 102 130 Z"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="0.9"
        />
        <rect
          x="43"
          y="116"
          width="54"
          height="5"
          rx="2.5"
          fill={colors.stroke}
          fillOpacity="0.65"
        />

        {/* Staunton Knight Sculptural Silhouette */}
        <path
          d="M47 116
             C40 94, 41 66, 51 44
             L54 32
             L62 20
             L68 31
             C79 34, 92 43, 102 53
             L113 62
             C116 66, 114 73, 108 75
             L90 79
             C81 80, 77 85, 79 93
             C86 101, 88 109, 87 116
             Z"
          fill={`url(#knight-grad-${finish})`}
          stroke={colors.stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />

        {/* Sculptural Mane Crease & Eye Detail */}
        <path
          d="M55 44 C50 64, 50 86, 55 108"
          fill="none"
          stroke={colors.stroke}
          strokeWidth="0.8"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
        <circle cx="80" cy="49" r="2.4" fill="#090D11" stroke={colors.stroke} strokeWidth="0.6" />
      </svg>
    </div>
  );
};

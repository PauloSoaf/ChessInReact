import React, { useMemo } from 'react';
import { IEvalPoint, MoveClassification } from '../types';

export interface IAdvantageGraphProps {
  evalStream: readonly IEvalPoint[];
  currentPly?: number;
  onSelectPly?: (ply: number) => void;
  width?: string | number;
  height?: number;
}

const CLASSIFICATION_COLORS: Record<MoveClassification, string> = {
  BRILLIANT: '#06b6d4', // Cyan
  GREAT: '#3b82f6',     // Blue
  BEST: '#10b981',      // Emerald
  EXCELLENT: '#22c55e',  // Green
  GOOD: '#84cc16',      // Lime
  BOOK: '#a855f7',      // Purple
  INACCURACY: '#f59e0b',// Amber
  MISTAKE: '#f97316',   // Orange
  BLUNDER: '#ef4444',   // Red
  MISSED_WIN: '#dc2626',// Crimson
};

/**
 * Spec 12 § 1 & RF-03: Interactive Positional Advantage Evaluation Graph.
 * Pure SVG responsive area-chart mapping centipawns / win chance over game plies.
 * Highlights notable moves (Brilliant, Best, Blunders) and supports scrubbing navigation.
 */
export const AdvantageGraph: React.FC<IAdvantageGraphProps> = ({
  evalStream,
  currentPly = 0,
  onSelectPly,
  width = '100%',
  height = 140,
}) => {
  const svgWidth = 600;
  const svgHeight = 140;
  const zeroY = svgHeight / 2;

  // Compute SVG line points
  const points = useMemo(() => {
    if (evalStream.length === 0) return [];

    const stepX = svgWidth / Math.max(1, evalStream.length);

    return evalStream.map((pt, idx) => {
      const x = (idx + 0.5) * stepX;
      // Map winChance (0 to 100%) to Y (svgHeight to 0)
      // 50% -> zeroY (70), 100% -> 10, 0% -> 130
      const y = zeroY - ((pt.winChance - 50) / 50) * (zeroY - 14);
      return { x, y, pt, idx };
    });
  }, [evalStream, zeroY]);

  // Generate SVG path strings for lines and fills
  const { linePath, whiteAreaPath, blackAreaPath } = useMemo(() => {
    if (points.length === 0) {
      return { linePath: '', whiteAreaPath: '', blackAreaPath: '' };
    }

    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;

    const pathD = points.reduce(
      (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
      ''
    );

    const whiteArea = `${pathD} L ${lastX} ${zeroY} L ${firstX} ${zeroY} Z`;
    const blackArea = `${pathD} L ${lastX} ${zeroY} L ${firstX} ${zeroY} Z`;

    return { linePath: pathD, whiteAreaPath: whiteArea, blackAreaPath: blackArea };
  }, [points, zeroY]);

  const activePoint = points.find((p) => p.pt.ply === currentPly);

  return (
    <div
      style={{
        width,
        height,
        background: 'var(--bg-card, #0f172a)',
        borderRadius: 'var(--radius-md, 8px)',
        border: '1px solid var(--border-subtle, #334155)',
        position: 'relative',
        overflow: 'hidden',
      }}
      data-testid="advantage-graph-container"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'pointer' }}
        data-testid="advantage-graph-svg"
        onClick={(e) => {
          if (!onSelectPly || points.length === 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = ((e.clientX - rect.left) / rect.width) * svgWidth;
          // Find closest point
          let closest = points[0];
          let minDist = Math.abs(points[0].x - clickX);
          for (let i = 1; i < points.length; i++) {
            const dist = Math.abs(points[i].x - clickX);
            if (dist < minDist) {
              minDist = dist;
              closest = points[i];
            }
          }
          onSelectPly(closest.pt.ply);
        }}
      >
        <defs>
          <linearGradient id="whiteAdvantageGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="blackAdvantageGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#1e293b" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#1e293b" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* 50% Neutral Horizon Line */}
        <line
          x1="0"
          y1={zeroY}
          x2={svgWidth}
          y2={zeroY}
          stroke="var(--border-subtle, #475569)"
          strokeWidth="1.5"
          strokeDasharray="4 4"
        />

        {/* Advantage Area Fills */}
        {whiteAreaPath && <path d={whiteAreaPath} fill="url(#whiteAdvantageGrad)" />}
        {blackAreaPath && <path d={blackAreaPath} fill="url(#blackAdvantageGrad)" />}

        {/* Main Advantage Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent-primary, #38bdf8)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Notable Move Badges (Brilliant, Blunder, Mistake) */}
        {points.map((p) => {
          const c = p.pt.classification;
          if (c === 'BEST' || c === 'GOOD' || c === 'EXCELLENT' || c === 'BOOK') {
            return null;
          }
          const badgeColor = CLASSIFICATION_COLORS[c];
          return (
            <circle
              key={p.pt.ply}
              cx={p.x}
              cy={p.y}
              r={c === 'BRILLIANT' || c === 'BLUNDER' ? 4.5 : 3.5}
              fill={badgeColor}
              stroke="#0f172a"
              strokeWidth="1.5"
              name={`badge-${c.toLowerCase()}-ply-${p.pt.ply}`}
            />
          );
        })}

        {/* Active Scrub Cursor */}
        {activePoint && (
          <g name="active-ply-cursor">
            <line
              x1={activePoint.x}
              y1="0"
              x2={activePoint.x}
              y2={svgHeight}
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="2 2"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="5.5"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
    </div>
  );
};


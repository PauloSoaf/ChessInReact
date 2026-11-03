import React from 'react';

export interface IEvaluationBarProps {
  evalScore: number | null; // Centipawns relative to White (P1)
  height?: number | string;
}

export const EvaluationBar: React.FC<IEvaluationBarProps> = ({ evalScore, height = '100%' }) => {
  // Normalize centipawns (-1000 to +1000 CP mapped to 0% - 100% white height)
  // 0 CP -> 50%
  const cp = evalScore ?? 0;
  // Sigmoid-like smooth compression for chess eval
  const clamped = Math.max(-1000, Math.min(1000, cp));
  const whitePercent = Math.min(95, Math.max(5, 50 + (clamped / 1000) * 45));

  const formattedScore =
    evalScore !== null
      ? evalScore > 0
        ? `+${(evalScore / 100).toFixed(2)}`
        : (evalScore / 100).toFixed(2)
      : '0.00';

  return (
    <div
      style={{
        width: '28px',
        height,
        backgroundColor: '#18181b',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'var(--shadow-sm)',
      }}
      title={`Avaliação de Engine: ${formattedScore}`}
    >
      {/* White advantage fill (bottom) */}
      <div
        style={{
          width: '100%',
          height: `${whitePercent}%`,
          backgroundColor: '#f8fafc',
          transition: 'height 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Floating score badge */}
      <div
        id="bot-eval-badge"
        style={{
          position: 'absolute',
          bottom: '4px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.65rem',
          fontWeight: 800,
          fontFamily: 'monospace',
          color: whitePercent > 50 ? '#0f172a' : '#f8fafc',
          textShadow: whitePercent > 50 ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {`Eval: ${formattedScore}`}
      </div>
    </div>
  );
};

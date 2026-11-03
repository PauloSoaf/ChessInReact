import React from 'react';

export interface IEvaluationBarProps {
  evalScore: number | null; // Centipawns relative to White (P1)
  height?: number | string;
}

export const EvaluationBar: React.FC<IEvaluationBarProps> = ({ evalScore, height = '100%' }) => {
  // Normalize centipawns (-1000 to +1000 CP mapped to 0% - 100% white height)
  const cp = evalScore ?? 0;
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
      role="meter"
      aria-label="Avaliação Posicional em Centipawns"
      aria-valuenow={evalScore ?? 0}
      aria-valuemin={-1000}
      aria-valuemax={1000}
      style={{
        width: 'clamp(22px, 3.5vw, 30px)',
        height,
        backgroundColor: '#12161A',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border-prominent)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'var(--shadow-sm)',
      }}
      title={`Avaliação da Posição: ${formattedScore} pawns`}
    >
      {/* Equilibrium Center Midline */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '1px',
          backgroundColor: 'rgba(255, 255, 255, 0.25)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* White advantage fill (bottom) */}
      <div
        style={{
          width: '100%',
          height: `${whitePercent}%`,
          backgroundColor: '#F4F1EB',
          transition: 'height 400ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Floating score badge */}
      <div
        id="bot-eval-badge"
        style={{
          position: 'absolute',
          bottom: '6px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.6875rem',
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: whitePercent > 50 ? '#12161A' : '#F4F1EB',
          textShadow: whitePercent > 50 ? 'none' : '0 1px 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          zIndex: 3,
        }}
      >
        {`Eval: ${formattedScore}`}
      </div>
    </div>
  );
};

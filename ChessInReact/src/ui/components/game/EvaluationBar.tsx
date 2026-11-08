import React from 'react';

export interface IEvaluationBarProps {
  evalScore: number | null;
  height?: string | number;
}

/**
 * Centipawn Evaluation Bar (Spec 06 RF-15)
 * Converts centipawn evaluation into a smooth visual advantage gauge.
 */
export const EvaluationBar: React.FC<IEvaluationBarProps> = ({
  evalScore,
  height = '100%',
}) => {
  const clampedCp = evalScore !== null ? Math.max(-1000, Math.min(1000, evalScore)) : 0;
  const whitePercentage = 50 + (clampedCp / 1000) * 45;

  const formattedEval =
    evalScore !== null
      ? `${evalScore > 0 ? '+' : ''}${(evalScore / 100).toFixed(2)}`
      : '0.00';

  return (
    <div
      data-testid="evaluation-bar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        height,
        gap: '0.35rem',
        userSelect: 'none',
      }}
    >
      {/* Vertical Gauge Track */}
      <div
        style={{
          width: '18px',
          flex: 1,
          minHeight: '160px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: '#141A20',
          border: '1px solid var(--border-prominent)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          position: 'relative',
          boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.55)',
        }}
        title={`Avaliação MCTS: ${formattedEval}`}
      >
        {/* Equator Midline Tick */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: 0,
            right: 0,
            height: '1.5px',
            backgroundColor: 'var(--color-accent)',
            opacity: 0.7,
            zIndex: 2,
          }}
        />

        {/* White Advantage Fill (Bottom-Up) */}
        <div
          style={{
            width: '100%',
            height: `${whitePercentage}%`,
            backgroundColor: '#F4F1EB',
            transition: 'height 380ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>

      {/* Numeric Readout Badge */}
      <span
        id="bot-eval-badge"
        style={{
          fontSize: '0.62rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--bg-sunken)',
          padding: '0.14rem 0.36rem',
          borderRadius: 'var(--radius-xs)',
          border: '1px solid var(--border-subtle)',
          whiteSpace: 'nowrap',
        }}
      >
        Eval: {formattedEval}
      </span>
    </div>
  );
};

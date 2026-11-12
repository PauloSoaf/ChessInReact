import React from 'react';

export interface ISpectatorControlsBarProps {
  readonly isPaused: boolean;
  readonly speed: 1 | 2 | 5;
  readonly isThinking: boolean;
  readonly lastMoveSummary: string | null;
  readonly onTogglePause: () => void;
  readonly onSetSpeed: (speed: 1 | 2 | 5) => void;
  readonly onStepForward: () => void;
}

export const SpectatorControlsBar: React.FC<ISpectatorControlsBarProps> = ({
  isPaused,
  speed,
  isThinking,
  lastMoveSummary,
  onTogglePause,
  onSetSpeed,
  onStepForward,
}) => {
  return (
    <div
      role="toolbar"
      aria-label="Controles de Espectador de Partida Autônoma"
      data-testid="spectator-controls-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '604px',
        padding: '0.6rem 0.9rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-sunken)',
        border: '1px solid var(--accent-color, #3b82f6)',
        boxShadow: 'var(--shadow-sm)',
        gap: '0.75rem',
        flexWrap: 'wrap',
        marginBottom: '0.5rem',
      }}
    >
      {/* Status Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isThinking ? '#eab308' : isPaused ? '#ef4444' : '#22c55e',
            boxShadow: isThinking
              ? '0 0 6px #eab308'
              : isPaused
              ? '0 0 6px #ef4444'
              : '0 0 6px #22c55e',
          }}
        />
        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-prominent)' }}>
          Espectador • {isThinking ? 'IA Calculando...' : isPaused ? 'Pausado' : 'Autônomo'}
        </span>
        {lastMoveSummary && (
          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-subtle)',
              fontFamily: 'monospace',
            }}
          >
            ({lastMoveSummary})
          </span>
        )}
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {/* Play/Pause Button */}
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={isPaused ? 'Continuar simulação autônoma' : 'Pausar simulação autônoma'}
          style={{
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-prominent)',
            backgroundColor: isPaused ? '#22c55e' : 'var(--bg-elevated)',
            color: isPaused ? '#ffffff' : 'var(--text-prominent)',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {isPaused ? '▶ Continuar' : '⏸ Pausar'}
        </button>

        {/* Step Forward Button (available when paused) */}
        <button
          type="button"
          onClick={onStepForward}
          disabled={!isPaused || isThinking}
          aria-label="Avançar um lance da IA"
          style={{
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-prominent)',
            backgroundColor: 'var(--bg-elevated)',
            color: isPaused ? 'var(--text-prominent)' : 'var(--text-subtle)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: isPaused ? 'pointer' : 'not-allowed',
            opacity: isPaused ? 1 : 0.5,
          }}
        >
          ⏭ Avançar Lance
        </button>

        {/* Speed Selector */}
        <div
          role="radiogroup"
          aria-label="Velocidade da simulação"
          style={{
            display: 'flex',
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            border: '1px solid var(--border-prominent)',
          }}
        >
          {([1, 2, 5] as const).map((spd) => {
            const isSelected = speed === spd;
            return (
              <button
                key={spd}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSetSpeed(spd)}
                style={{
                  padding: '0.35rem 0.55rem',
                  border: 'none',
                  backgroundColor: isSelected ? 'var(--accent-color, #3b82f6)' : 'var(--bg-elevated)',
                  color: isSelected ? '#ffffff' : 'var(--text-subtle)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {spd}×
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { DuckTurnPhase } from '../../../analysis/minigames/DuckChessEngine';

export interface IDuckChessBannerProps {
  readonly duckCoordinate: string | null;
  readonly duckPhase: DuckTurnPhase;
  readonly activePlayerLabel: string;
}

export const DuckChessBanner: React.FC<IDuckChessBannerProps> = ({
  duckCoordinate,
  duckPhase,
  activePlayerLabel,
}) => {
  const isPhasePlaceDuck = duckPhase === 'PLACE_DUCK';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="duck-chess-banner"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '604px',
        padding: '0.55rem 0.85rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: isPhasePlaceDuck ? 'rgba(234, 179, 8, 0.15)' : 'var(--bg-sunken)',
        border: isPhasePlaceDuck ? '2px solid #eab308' : '1px solid var(--border-prominent)',
        boxShadow: isPhasePlaceDuck ? '0 0 10px rgba(234, 179, 8, 0.3)' : 'var(--shadow-sm)',
        marginBottom: '0.5rem',
        gap: '0.75rem',
        animation: isPhasePlaceDuck ? 'pulse 1.5s infinite' : 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem' }}>🦆</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-prominent)' }}>
            Duck Chess • {activePlayerLabel}
          </span>
          <span style={{ fontSize: '0.75rem', color: isPhasePlaceDuck ? '#ca8a04' : 'var(--text-subtle)' }}>
            {isPhasePlaceDuck
              ? 'Fase 2: Clique em qualquer casa vazia para posicionar o pato e passar a vez!'
              : 'Fase 1: Execute seu movimento legal de peça.'}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.25rem 0.5rem',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: 'var(--text-prominent)',
        }}
      >
        <span>Pato:</span>
        <span style={{ fontFamily: 'monospace', color: '#eab308' }}>
          {duckCoordinate ? duckCoordinate.toUpperCase() : 'Fora do Tabuleiro'}
        </span>
      </div>
    </div>
  );
};


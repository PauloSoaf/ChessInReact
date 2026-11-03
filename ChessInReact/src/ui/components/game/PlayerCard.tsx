import React from 'react';
import { PlayerId } from '../../../core/coordinates/types';

export interface IPlayerCardProps {
  playerId: PlayerId;
  displayName: string;
  isTurnActive: boolean;
  isThinking?: boolean;
  isBot?: boolean;
  difficultyLabel?: string;
  capturedMaterialCount?: number;
}

export const PlayerCard: React.FC<IPlayerCardProps> = ({
  playerId,
  displayName,
  isTurnActive,
  isThinking = false,
  isBot = false,
  difficultyLabel,
  capturedMaterialCount = 0,
}) => {
  const isWhite = playerId === 'P1';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.625rem 1rem',
        backgroundColor: isTurnActive ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: isTurnActive
          ? '1px solid var(--color-accent)'
          : '1px solid var(--border-subtle)',
        boxShadow: isTurnActive ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
        transition: 'all var(--transition-normal)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '48px',
      }}
    >
      {/* Active turn marker bar on the side */}
      {isTurnActive && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            backgroundColor: 'var(--color-accent)',
          }}
        />
      )}

      {/* Player Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Avatar / Token */}
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isWhite ? '#ffffff' : '#1e1b2e',
            color: isWhite ? '#090d16' : '#ffffff',
            border: isWhite ? '1px solid #cbd5e1' : '1px solid #475569',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 800,
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }}
        >
          {isBot ? '🤖' : isWhite ? '♔' : '♚'}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {displayName}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '0.1rem 0.4rem',
                borderRadius: '9999px',
                backgroundColor: isWhite ? 'rgba(56, 189, 248, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                color: isWhite ? '#38bdf8' : '#f43f5e',
                border: `1px solid ${isWhite ? 'rgba(56, 189, 248, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
              }}
            >
              {isWhite ? 'Brancas (P1)' : 'Pretas (P2)'}
            </span>
          </div>

          {/* Sub-label: Bot difficulty or status */}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
            {isBot && difficultyLabel ? (
              <span>IA: {difficultyLabel}</span>
            ) : (
              <span>{isTurnActive ? 'Sua vez de jogar' : 'Aguardando oponente'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Thinking / Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {capturedMaterialCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            +{capturedMaterialCount}
          </span>
        )}

        {isThinking ? (
          <span
            className="animate-pulse-turn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.4)',
            }}
          >
            <span>⚡ Calculando...</span>
          </span>
        ) : isTurnActive ? (
          <span
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            ● Turno Ativo
          </span>
        ) : null}
      </div>
    </div>
  );
};

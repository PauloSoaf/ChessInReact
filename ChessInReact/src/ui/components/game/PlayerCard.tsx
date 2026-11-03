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
      role="region"
      aria-label={`Jogador ${displayName}, ${isWhite ? 'Brancas' : 'Pretas'}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.625rem 1.125rem',
        backgroundColor: isTurnActive ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        border: isTurnActive
          ? '1.5px solid var(--border-active)'
          : '1px solid var(--border-subtle)',
        boxShadow: isTurnActive ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
        transition: 'all var(--transition-normal)',
        position: 'relative',
        overflow: 'hidden',
        minHeight: '52px',
      }}
    >
      {/* Active turn marker line */}
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

      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        {/* Token Avatar */}
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isWhite ? '#F4F1EB' : '#141A21',
            color: isWhite ? '#141A21' : '#F4F1EB',
            border: isWhite ? '1.5px solid #C4A77D' : '1.5px solid rgba(196,167,125,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            flexShrink: 0,
          }}
        >
          {isBot ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4M8 16h.01M16 16h.01" />
            </svg>
          ) : (
            <span style={{ fontSize: '1.25rem', lineHeight: 1, fontFamily: 'serif' }}>
              {isWhite ? '♔' : '♚'}
            </span>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.925rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {displayName}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '0.125rem 0.45rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: isWhite ? 'var(--color-accent-subtle)' : 'rgba(168, 66, 66, 0.16)',
                color: isWhite ? 'var(--color-accent)' : 'var(--color-danger)',
                border: `1px solid ${isWhite ? 'var(--border-prominent)' : 'rgba(168, 66, 66, 0.35)'}`,
              }}
            >
              {isWhite ? 'Brancas (P1)' : 'Pretas (P2)'}
            </span>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
            {isBot && difficultyLabel ? (
              <span>Motor IA: {difficultyLabel}</span>
            ) : (
              <span>{isTurnActive ? 'Sua vez de jogar' : 'Aguardando lance do oponente'}</span>
            )}
          </div>
        </div>
      </div>

      {/* Status indicator / Thinking State */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {capturedMaterialCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-secondary)' }}>
            +{capturedMaterialCount}
          </span>
        )}

        {isThinking ? (
          <span
            className="pulse-turn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'rgba(217, 160, 91, 0.16)',
              color: 'var(--color-warning)',
              border: '1px solid rgba(217, 160, 91, 0.35)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-warning)',
                boxShadow: '0 0 6px var(--color-warning)',
              }}
            />
            <span>Calculando...</span>
          </span>
        ) : isTurnActive ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              border: '1px solid var(--border-prominent)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent)',
                boxShadow: '0 0 6px var(--color-accent)',
              }}
            />
            <span>Turno Ativo</span>
          </span>
        ) : null}
      </div>
    </div>
  );
};

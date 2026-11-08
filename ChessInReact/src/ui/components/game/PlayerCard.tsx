import React from 'react';
import { PlayerId } from '../../../core/coordinates/types';

export interface IPlayerCardProps {
  playerId: PlayerId;
  displayName: string;
  subtitle?: string;
  isTurnActive: boolean;
  isThinking?: boolean;
  isBot?: boolean;
  difficultyLabel?: string;
  capturedPieces?: string[];
}

export const PlayerCard: React.FC<IPlayerCardProps> = ({
  playerId,
  displayName,
  subtitle,
  isTurnActive,
  isThinking = false,
  isBot = false,
  difficultyLabel,
}) => {
  const isWhite = playerId === 'P1';

  return (
    <div
      data-testid={`player-card-${playerId}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.65rem 1rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: isTurnActive ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
        border: isTurnActive ? '1.5px solid var(--border-active)' : '1px solid var(--border-subtle)',
        boxShadow: isTurnActive ? 'var(--shadow-sm), var(--shadow-glow)' : 'var(--shadow-sm)',
        transition: 'all var(--transition-normal)',
        width: '100%',
        gap: '0.75rem',
      }}
    >
      {/* Left: Player Emblem & Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isWhite ? '#F4F1EB' : '#141A20',
            color: isWhite ? '#090D11' : '#F4F1EB',
            border: isTurnActive
              ? '2px solid var(--color-accent)'
              : '1px solid var(--border-prominent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.15rem',
            fontWeight: 800,
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
          }}
        >
          {isBot ? '🤖' : isWhite ? '♔' : '♚'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: '0.9rem',
                fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </span>

            {difficultyLabel && (
              <span
                style={{
                  fontSize: '0.66rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '0.1rem 0.45rem',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--color-accent-subtle)',
                  color: 'var(--color-accent)',
                  border: '1px solid var(--border-prominent)',
                }}
              >
                {difficultyLabel}
              </span>
            )}
          </div>

          <span
            style={{
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {subtitle ?? (isWhite ? 'Peças Brancas (P1)' : 'Peças Pretas (P2)')}
          </span>
        </div>
      </div>

      {/* Right: Turn / Thinking Status Pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {isThinking ? (
          <div
            id="bot-thinking-indicator"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.28rem 0.7rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(212, 155, 75, 0.14)',
              border: '1px solid var(--color-warning)',
              color: 'var(--color-warning)',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-warning)',
                animation: 'pulseTurn 0.9s infinite',
              }}
            />
            <span>Calculando...</span>
          </div>
        ) : isTurnActive ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.42rem',
              padding: '0.28rem 0.7rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-accent-subtle)',
              border: '1px solid var(--border-prominent)',
              color: 'var(--color-accent)',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-accent)',
                boxShadow: '0 0 8px var(--color-accent)',
                animation: 'pulseTurn 1.6s infinite',
              }}
            />
            <span>Sua Vez</span>
          </div>
        ) : (
          <span
            style={{
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
              padding: '0.25rem 0.5rem',
            }}
          >
            Aguardando
          </span>
        )}
      </div>
    </div>
  );
};

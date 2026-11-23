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
  materialAdvantage?: number;
  timeLeftMs?: number;
  isInCheck?: boolean;
  isUnlimited?: boolean;
  timeControlLabel?: string;
  isRanked?: boolean;
  readonly actionSlot?: React.ReactNode;
}

const PIECE_GLYPHS: Record<string, string> = {
  PAWN: '♟',
  KNIGHT: '♞',
  BISHOP: '♝',
  ROOK: '♜',
  QUEEN: '♛',
  KING: '♚',
};

const formatClockTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (ms < 10000 && ms > 0) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export const PlayerCard: React.FC<IPlayerCardProps> = ({
  playerId,
  displayName,
  subtitle,
  isTurnActive,
  isThinking = false,
  isBot = false,
  difficultyLabel,
  capturedPieces,
  materialAdvantage,
  timeLeftMs,
  isInCheck = false,
  isUnlimited = false,
  timeControlLabel,
  isRanked,
  actionSlot,
}) => {
  const isWhite = playerId === 'P1';
  const isCriticalTime = isTurnActive && timeLeftMs !== undefined && timeLeftMs < 10000 && timeLeftMs > 0;

  // Group captured pieces for concise tray representation (Spec 06 RF-09 / Section 18)
  const capturedPieceCounts = React.useMemo(() => {
    if (!capturedPieces || capturedPieces.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const p of capturedPieces) {
      const v = p.toUpperCase();
      counts[v] = (counts[v] ?? 0) + 1;
    }
    return counts;
  }, [capturedPieces]);

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
            width: '38px',
            height: '38px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isWhite ? '#F4F1EB' : '#141A20',
            color: isWhite ? '#090D11' : '#F4F1EB',
            border: isTurnActive
              ? '2px solid var(--color-accent)'
              : '1px solid var(--border-prominent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            fontWeight: 800,
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
          }}
        >
          {isBot ? (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Bot">
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4M8 16h.01M16 16h.01" />
            </svg>
          ) : isWhite ? '♔' : '♚'}
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

          {/* Captured Pieces & Material Tray (Spec 06 RF-09 & Section 18) */}
          {capturedPieceCounts && (
            <div
              data-testid={`captured-tray-${playerId}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.22rem',
                marginTop: '0.15rem',
                flexWrap: 'wrap',
              }}
            >
              {Object.entries(capturedPieceCounts).map(([variant, count]) => (
                <span
                  key={variant}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1,
                  }}
                  title={`${count}x ${variant}`}
                >
                  {PIECE_GLYPHS[variant] ?? '♟'}
                  {count > 1 && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, marginLeft: '1px' }}>
                      {count}
                    </span>
                  )}
                </span>
              ))}
              {materialAdvantage !== undefined && materialAdvantage > 0 && (
                <span
                  data-testid={`material-advantage-${playerId}`}
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--color-accent)',
                    backgroundColor: 'var(--color-accent-subtle)',
                    padding: '0.05rem 0.3rem',
                    borderRadius: '4px',
                    marginLeft: '0.2rem',
                  }}
                >
                  +{materialAdvantage}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: Clock, Spell Action Deck & Turn Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {actionSlot}
        {/* Match Mode & Time Control Badges (Spec 06 RF-09 & Spec 16 § 4) */}
        {(timeControlLabel || isRanked !== undefined) && (
          <div
            data-testid={`match-mode-badges-${playerId}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.18rem',
            }}
          >
            {timeControlLabel && (
              <span
                data-testid={`time-control-badge-${playerId}`}
                style={{
                  fontSize: '0.64rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  padding: '0.12rem 0.42rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-sunken)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}
              >
                {timeControlLabel}
              </span>
            )}
            {isRanked !== undefined && (
              <span
                data-testid={`ranked-badge-${playerId}`}
                style={{
                  fontSize: '0.6rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 800,
                  padding: '0.08rem 0.38rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isRanked ? 'rgba(56, 189, 248, 0.12)' : 'var(--bg-sunken)',
                  color: isRanked ? 'var(--color-accent)' : 'var(--text-muted)',
                  border: isRanked ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid var(--border-subtle)',
                  whiteSpace: 'nowrap',
                }}
              >
                {isRanked ? 'Ranqueada' : 'Casual'}
              </span>
            )}
          </div>
        )}

        {/* Digital Chess Clock with Critical Time Alert (Spec 06 RF-09) */}
        {(timeLeftMs !== undefined || isUnlimited) && (
          <div
            data-testid={`player-clock-${playerId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.88rem',
              fontWeight: 800,
              backgroundColor: isCriticalTime
                ? 'var(--color-danger-bg)'
                : isTurnActive
                  ? 'var(--bg-sunken)'
                  : 'transparent',
              color: isCriticalTime
                ? 'var(--color-danger)'
                : isTurnActive
                  ? 'var(--text-primary)'
                  : 'var(--text-muted)',
              border: isCriticalTime
                ? '1.5px solid var(--color-danger)'
                : isTurnActive
                  ? '1px solid var(--border-active)'
                  : '1px solid var(--border-subtle)',
              boxShadow: isCriticalTime ? '0 0 12px rgba(239, 68, 68, 0.4)' : 'none',
              animation: isCriticalTime ? 'pulseCheck 0.8s infinite' : undefined,
              letterSpacing: '0.04em',
            }}
          >
            {isUnlimited ? '∞' : formatClockTime(timeLeftMs ?? 0)}
          </div>
        )}

        {isInCheck && (
          <div
            data-testid={`player-in-check-${playerId}`}
            className="player-card-check-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.65rem',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-danger-bg)',
              border: '1.5px solid var(--color-danger)',
              color: 'var(--color-danger)',
              fontSize: '0.72rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.35)',
              animation: 'pulseCheck 1.2s infinite',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>EM XEQUE</span>
          </div>
        )}

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

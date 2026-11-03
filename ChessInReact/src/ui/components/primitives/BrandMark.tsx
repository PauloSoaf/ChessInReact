import React from 'react';

export interface IBrandMarkProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  subtitleText?: string;
  onClick?: () => void;
}

export const BrandMark: React.FC<IBrandMarkProps> = ({
  size = 'md',
  showSubtitle = true,
  subtitleText = 'Core Engine & Hub',
  onClick,
}) => {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const iconSize = isSm ? 28 : isLg ? 44 : 36;
  const titleSize = isSm ? '0.95rem' : isLg ? '1.35rem' : '1.125rem';
  const subSize = isSm ? '0.625rem' : isLg ? '0.75rem' : '0.6875rem';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? '0.5rem' : '0.75rem',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      {/* Geometric Sculptural Knight Emblem */}
      <div
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: 'var(--radius-md)',
          background: 'linear-gradient(135deg, var(--color-accent) 0%, rgba(255,255,255,0.08) 100%)',
          border: '1px solid var(--border-prominent)',
          boxShadow: 'var(--shadow-glow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={iconSize * 0.65}
          height={iconSize * 0.65}
          fill="currentColor"
          style={{ color: 'var(--bg-app)', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}
        >
          {/* Staunton Knight Silhouette */}
          <path d="M19 22H5c0-1.5 1-2.5 2.5-3l1-1c-.5-1-.8-2-.8-3.2 0-.8.2-1.5.5-2.2L6 11c-.5-.8-.2-1.8.6-2.2l1.6-.8c-.4-1.2 0-2.5 1-3.2 1.3-.9 3-.8 4.2.2.8.7 1.4 1.7 1.6 2.8.8.4 1.5 1 2 1.8l.8 1.4c.5 1 .6 2.1.2 3.1l-.5 1.5c1 .6 1.8 1.5 2.2 2.6.4 1.1.3 2.3-.2 3.3l.5.5c.9.9 1 2.3 0 3.2z" />
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: titleSize,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            color: 'var(--text-primary)',
          }}
        >
          ChessInReact
        </span>
        {showSubtitle && (
          <span
            className="nav-brand-subtitle"
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: subSize,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginTop: '1px',
            }}
          >
            {subtitleText}
          </span>
        )}
      </div>
    </div>
  );
};

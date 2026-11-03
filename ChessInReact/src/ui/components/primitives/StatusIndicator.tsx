import React from 'react';

export interface IStatusIndicatorProps {
  status: 'active' | 'thinking' | 'idle' | 'success' | 'warning' | 'danger';
  label?: string;
  pulse?: boolean;
}

export const StatusIndicator: React.FC<IStatusIndicatorProps> = ({
  status,
  label,
  pulse = false,
}) => {
  const getColor = () => {
    switch (status) {
      case 'active':
      case 'thinking':
        return 'var(--color-accent)';
      case 'success':
        return 'var(--color-success)';
      case 'warning':
        return 'var(--color-warning)';
      case 'danger':
        return 'var(--color-danger)';
      case 'idle':
      default:
        return 'var(--text-muted)';
    }
  };

  const dotColor = getColor();

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
          animation: pulse ? 'pulseTurn 1.6s infinite' : 'none',
          flexShrink: 0,
        }}
      />
      {label && <span>{label}</span>}
    </div>
  );
};

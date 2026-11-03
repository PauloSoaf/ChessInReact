import React from 'react';

export interface ICardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'elevated' | 'glass' | 'interactive' | 'flat';
  selected?: boolean;
}

export const Card: React.FC<ICardProps> = ({
  children,
  variant = 'elevated',
  selected = false,
  style,
  ...rest
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'glass':
        return {
          backgroundColor: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: selected ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
          boxShadow: selected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
        };
      case 'interactive':
        return {
          backgroundColor: selected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
          border: selected ? '1.5px solid var(--border-active)' : '1px solid var(--border-subtle)',
          boxShadow: selected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
          cursor: 'pointer',
        };
      case 'flat':
        return {
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        };
      case 'elevated':
      default:
        return {
          backgroundColor: 'var(--bg-surface-elevated)',
          border: selected ? '1.5px solid var(--border-active)' : '1px solid var(--border-subtle)',
          boxShadow: selected ? 'var(--shadow-glow)' : 'var(--shadow-md)',
        };
    }
  };

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        padding: '1.5rem',
        transition: 'all var(--transition-fast)',
        position: 'relative',
        ...getVariantStyles(),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};

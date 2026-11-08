import React from 'react';

export interface IActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const ActionButton: React.FC<IActionButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  disabled,
  style,
  ...rest
}) => {
  const getPadding = () => {
    switch (size) {
      case 'sm':
        return '0.375rem 0.75rem';
      case 'lg':
        return '0.875rem 1.75rem';
      default:
        return '0.625rem 1.25rem';
    }
  };

  const getFontSize = () => {
    switch (size) {
      case 'sm':
        return '0.8125rem';
      case 'lg':
        return '1rem';
      default:
        return '0.875rem';
    }
  };

  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: 'var(--bg-surface-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-prominent)',
          boxShadow: 'var(--shadow-sm)',
        };
      case 'outline':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-prominent)',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          color: 'var(--text-secondary)',
          border: '1px solid transparent',
        };
      case 'danger':
        return {
          backgroundColor: 'var(--color-danger-bg)',
          color: 'var(--color-danger)',
          border: '1px solid var(--color-danger-border)',
        };
      case 'primary':
      default:
        return {
          backgroundColor: 'var(--color-accent)',
          color: 'var(--text-inverse)',
          border: '1px solid var(--color-accent)',
          boxShadow: 'var(--shadow-sm), var(--shadow-glow)',
        };
    }
  };

  const combinedClassName = ['ui-btn', `ui-btn--${variant}`, rest.className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      disabled={disabled}
      {...rest}
      className={combinedClassName}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: getPadding(),
        fontSize: getFontSize(),
        fontFamily: 'var(--font-sans)',
        fontWeight: 600,
        letterSpacing: '-0.01em',
        borderRadius: 'var(--radius-md)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: fullWidth ? '100%' : 'auto',
        userSelect: 'none',
        ...getVariantStyles(),
        ...style,
      }}
    >
      {leadingIcon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{leadingIcon}</span>}
      {children && <span>{children}</span>}
      {trailingIcon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{trailingIcon}</span>}
    </button>
  );
};

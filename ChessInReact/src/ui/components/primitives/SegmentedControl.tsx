import React from 'react';

export interface ISegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
}

export interface ISegmentedControlProps<T extends string | number> {
  options: ISegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  idPrefix?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  idPrefix = 'seg',
}: ISegmentedControlProps<T>): React.ReactElement {
  const isSm = size === 'sm';

  return (
    <div
      role="radiogroup"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px',
        backgroundColor: 'var(--bg-app)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        gap: '2px',
        userSelect: 'none',
      }}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            id={`${idPrefix}-${opt.value}`}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: isSm ? '0.3rem 0.65rem' : '0.45rem 0.875rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: isSm ? '0.75rem' : '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: isSelected ? 700 : 500,
              backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'transparent',
              color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: isSelected ? '1px solid var(--border-prominent)' : '1px solid transparent',
              boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              outline: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.icon && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.badge && <span>{opt.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

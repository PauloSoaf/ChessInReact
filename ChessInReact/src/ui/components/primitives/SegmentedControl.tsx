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
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % options.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = options.length - 1;
    }

    if (nextIndex >= 0 && nextIndex < options.length) {
      const nextOption = options[nextIndex];
      onChange(nextOption.value);
      // Synchronously move DOM focus using direct element reference
      buttonRefs.current[nextIndex]?.focus();
    }
  };

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
      {options.map((opt, index) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            id={`${idPrefix}-${opt.value}`}
            type="button"
            role="radio"
            tabIndex={isSelected ? 0 : -1}
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
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

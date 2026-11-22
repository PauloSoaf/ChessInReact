import React from 'react';
import { ICheckCountState } from '../../../engine/variants/modifiers/ThreeCheckTracker';

export interface IThreeCheckCounterBadgeProps {
  readonly state: ICheckCountState;
}

export const ThreeCheckCounterBadge: React.FC<IThreeCheckCounterBadgeProps> = ({ state }) => {
  const { whiteChecksDelivered, blackChecksDelivered, threshold } = state;

  const renderPips = (count: number, activeColor: string) => {
    return Array.from({ length: threshold }, (_, idx) => {
      const isFilled = idx < count;
      return (
        <span
          key={idx}
          style={{
            display: 'inline-block',
            width: '9px',
            height: '9px',
            borderRadius: '50%',
            backgroundColor: isFilled ? activeColor : 'rgba(255, 255, 255, 0.12)',
            border: `1.5px solid ${isFilled ? activeColor : 'rgba(255, 255, 255, 0.28)'}`,
            boxShadow: isFilled ? `0 0 6px ${activeColor}` : 'none',
            transition: 'all 200ms ease',
          }}
          aria-hidden="true"
        />
      );
    });
  };

  return (
    <div
      data-testid="three-check-badge"
      aria-label={`Xeque Triplo: Brancas ${whiteChecksDelivered} de ${threshold}, Pretas ${blackChecksDelivered} de ${threshold}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.8rem',
        padding: '0.25rem 0.65rem',
        backgroundColor: 'var(--bg-sunken, rgba(0, 0, 0, 0.25))',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: 'var(--radius-md, 6px)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-mono, monospace)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '1px solid #94a3b8',
          }}
          aria-label="Brancas"
        />
        <div style={{ display: 'flex', gap: '3px' }}>
          {renderPips(whiteChecksDelivered, '#fbbf24')}
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          ({whiteChecksDelivered}/{threshold})
        </span>
      </div>

      <span style={{ color: 'var(--border-subtle, #555)', fontSize: '0.8rem' }}>│</span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#0f172a',
            border: '1px solid #475569',
          }}
          aria-label="Pretas"
        />
        <div style={{ display: 'flex', gap: '3px' }}>
          {renderPips(blackChecksDelivered, '#ef4444')}
        </div>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          ({blackChecksDelivered}/{threshold})
        </span>
      </div>
    </div>
  );
};


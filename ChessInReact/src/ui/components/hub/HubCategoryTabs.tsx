import React from 'react';
import { HubCategoryKey, HUB_CATEGORIES } from './hubCategoryTypes';

export interface IHubCategoryTabsProps {
  readonly activeCategory: HubCategoryKey;
  readonly onSelectCategory: (category: HubCategoryKey) => void;
}

export const HubCategoryTabs: React.FC<IHubCategoryTabsProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div
      role="tablist"
      aria-label="Categorias do Game Hub Expandido"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '0.6rem',
        width: '100%',
        margin: '1rem 0',
      }}
    >
      {HUB_CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat.key;
        return (
          <button
            key={cat.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectCategory(cat.key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0.75rem 0.9rem',
              backgroundColor: isActive
                ? 'var(--color-primary-subtle, rgba(59, 130, 246, 0.15))'
                : 'var(--color-surface, #1e293b)',
              border: isActive
                ? '2px solid var(--color-primary, #3b82f6)'
                : '1px solid var(--border-subtle, #334155)',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  backgroundColor: isActive
                    ? 'var(--color-primary, #3b82f6)'
                    : 'rgba(148, 163, 184, 0.2)',
                  color: isActive ? '#ffffff' : 'var(--color-text-muted, #94a3b8)',
                }}
              >
                {cat.badge}
              </span>
            </div>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: isActive ? 'var(--color-primary, #60a5fa)' : 'var(--color-text-main, #f8fafc)',
              }}
            >
              {cat.label}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                color: 'var(--color-text-muted, #94a3b8)',
                marginTop: '0.2rem',
                lineHeight: 1.25,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {cat.summary}
            </span>
          </button>
        );
      })}
    </div>
  );
};

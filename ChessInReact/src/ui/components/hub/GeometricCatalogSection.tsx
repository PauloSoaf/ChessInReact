import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { IconBox } from '../../icons/AppIcons';
import { VariantCatalog } from '../../../engine/variants/catalog/VariantCatalog';

export interface IGeometricCatalogSectionProps {
  readonly onOpenStagingModal: (variantId: string, participants: number) => void;
}

export const GeometricCatalogSection: React.FC<IGeometricCatalogSectionProps> = ({
  onOpenStagingModal,
}) => {
  const variants = VariantCatalog.getByFamily('GEOMETRIC_FAIRY');

  return (
    <div
      id="hub-geometric-container"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        gap: '1.25rem',
        alignItems: 'stretch',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {variants.map((v) => (
        <Card
          key={v.id}
          id={`card-geom-${v.id}`}
          variant="interactive"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1.25rem',
            border: '1px solid var(--border-prominent)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconBox size={28} color="var(--color-accent)" />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--color-primary, #60a5fa)',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                }}
              >
                {v.badge}
              </span>
            </div>

            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.05rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                {v.name}
              </h3>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {v.description}
              </p>
            </div>
          </div>

          <ActionButton
            id={`hub-btn-geom-${v.id}`}
            variant="primary"
            size="sm"
            fullWidth
            onClick={() => onOpenStagingModal(v.id, 2)}
          >
            Configurar Partida
          </ActionButton>
        </Card>
      ))}
    </div>
  );
};


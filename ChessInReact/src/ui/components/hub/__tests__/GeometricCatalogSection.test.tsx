// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GeometricCatalogSection } from '../GeometricCatalogSection';
import { VariantCatalog } from '../../../../engine/variants/catalog/VariantCatalog';

describe('Spec 02/Spec 04 - GeometricCatalogSection Component', () => {
  it('renders all geometric and fairy variants from VariantCatalog', () => {
    const onOpenStagingModal = vi.fn();
    render(<GeometricCatalogSection onOpenStagingModal={onOpenStagingModal} />);

    const variants = VariantCatalog.getByFamily('GEOMETRIC_FAIRY');
    expect(variants.length).toBeGreaterThan(0);

    for (const v of variants) {
      expect(screen.getByText(v.name)).toBeDefined();
    }
  });

  it('triggers onOpenStagingModal when clicking Configurar Partida', () => {
    const onOpenStagingModal = vi.fn();
    const { container } = render(<GeometricCatalogSection onOpenStagingModal={onOpenStagingModal} />);

    const variants = VariantCatalog.getByFamily('GEOMETRIC_FAIRY');
    const firstVariant = variants[0];
    if (firstVariant) {
      const btn = container.querySelector(`#hub-btn-geom-${firstVariant.id}`) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      fireEvent.click(btn);
      expect(onOpenStagingModal).toHaveBeenCalledWith(firstVariant.id, 2);
    }
  });
});


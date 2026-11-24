// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoricalCatalogSection } from '../HistoricalCatalogSection';
import { VariantCatalog } from '../../../../engine/variants/catalog/VariantCatalog';

describe('Spec 04 - HistoricalCatalogSection Component', () => {
  it('renders all historical and regional variants from VariantCatalog', () => {
    const onOpenStagingModal = vi.fn();
    render(<HistoricalCatalogSection onOpenStagingModal={onOpenStagingModal} />);

    const variants = VariantCatalog.getByFamily('HISTORICAL_REGIONAL');
    expect(variants.length).toBeGreaterThan(0);

    for (const v of variants) {
      expect(screen.getByText(v.name)).toBeDefined();
    }
  });

  it('triggers onOpenStagingModal when clicking Configurar Partida', () => {
    const onOpenStagingModal = vi.fn();
    const { container } = render(<HistoricalCatalogSection onOpenStagingModal={onOpenStagingModal} />);

    const variants = VariantCatalog.getByFamily('HISTORICAL_REGIONAL');
    const firstVariant = variants[0];
    if (firstVariant) {
      const btn = container.querySelector(`#hub-btn-hist-${firstVariant.id}`) as HTMLButtonElement;
      expect(btn).not.toBeNull();
      fireEvent.click(btn);
      expect(onOpenStagingModal).toHaveBeenCalledWith(firstVariant.id, 2);
    }
  });
});


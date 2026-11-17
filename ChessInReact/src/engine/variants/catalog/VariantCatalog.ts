/**
 * ChessInReact - Master Variant Catalog (Spec 13 § 4, § 5, RF-13-01)
 */

import { IVariantDefinition, VariantFamily } from '../interfaces/IVariantDefinition';
import { CLASSIC_VARIANTS } from './ClassicVariantsCatalog';
import { MAGICAL_VARIANTS } from './MagicalVariantsCatalog';
import { GEOMETRIC_VARIANTS } from './GeometricVariantsCatalog';
import { HISTORICAL_VARIANTS } from './HistoricalVariantsCatalog';

export class VariantCatalog {
  private static readonly registry = new Map<string, IVariantDefinition>();
  private static initialized = false;

  private static ensureInitialized(): void {
    if (this.initialized) return;
    const all = [
      ...CLASSIC_VARIANTS,
      ...MAGICAL_VARIANTS,
      ...GEOMETRIC_VARIANTS,
      ...HISTORICAL_VARIANTS,
    ];
    for (const variant of all) {
      this.registry.set(variant.id.toUpperCase(), variant);
    }
    this.initialized = true;
  }

  public static getAll(): readonly IVariantDefinition[] {
    this.ensureInitialized();
    return Array.from(this.registry.values());
  }

  public static getById(id: string): IVariantDefinition | undefined {
    this.ensureInitialized();
    const upper = id.toUpperCase();
    if (upper === 'SPELL_CHESS') {
      return this.registry.get('SPELL_CHESS_OFFICIAL');
    }
    if (upper === 'ATOMIC') {
      return this.registry.get('ATOMIC_CHESS');
    }
    if (upper === 'FOG') {
      return this.registry.get('FOG_OF_WAR');
    }
    if (upper === 'HILL' || upper === 'KOTH') {
      return this.registry.get('KING_OF_THE_HILL');
    }
    if (upper === 'RACING') {
      return this.registry.get('RACING_KINGS');
    }
    if (upper === 'CAPA') {
      return this.registry.get('CAPABLANCA_CHESS');
    }
    return this.registry.get(upper);
  }

  public static getByFamily(family: VariantFamily): readonly IVariantDefinition[] {
    this.ensureInitialized();
    return Array.from(this.registry.values()).filter((v) => v.family === family);
  }

  public static search(query: string): readonly IVariantDefinition[] {
    this.ensureInitialized();
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();
    return Array.from(this.registry.values()).filter(
      (v) =>
        v.id.toLowerCase().includes(q) ||
        v.name.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q) ||
        v.badge.toLowerCase().includes(q)
    );
  }

  public static getTotalCount(): number {
    this.ensureInitialized();
    return this.registry.size;
  }
}


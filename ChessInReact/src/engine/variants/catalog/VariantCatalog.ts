/**
 * ChessInReact - Master Variant Catalog (Spec 13 § 4, § 5, RF-13-01)
 */

import { IVariantDefinition, VariantFamily } from '../interfaces/IVariantDefinition';
import { CLASSIC_VARIANTS } from './ClassicVariantsCatalog';
import { MAGICAL_VARIANTS } from './MagicalVariantsCatalog';
import { GEOMETRIC_VARIANTS } from './GeometricVariantsCatalog';
import { HISTORICAL_VARIANTS } from './HistoricalVariantsCatalog';
import { CompositeArenaLayouts } from '../../multiplayer/arenas/CompositeArenaLayouts';
import { ArenaModeId } from '../../multiplayer/arenas/interfaces/IArenaContracts';
import { ITopology } from '../../../core/topology/types';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { HexTopology } from '../../../core/topology/HexTopology';
import { TriangleTopology } from '../../../core/topology/TriangleTopology';
import { CubicTopology } from '../../../core/topology/CubicTopology';

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
    for (const arena of CompositeArenaLayouts.getAllLayouts()) {
      if (!this.registry.has(arena.id.toUpperCase())) {
        this.registry.set(arena.id.toUpperCase(), {
          id: arena.id,
          name: arena.name,
          family: 'GEOMETRIC_FAIRY',
          description: `Arena multijogador de ${arena.totalParticipants} participantes em topologia ${arena.boardType}. Políticas: ${arena.allowedEliminationPolicies.join(', ')}.`,
          badge: `${arena.totalParticipants}P ${arena.boardType.split('_')[0]}`,
          boardDimensions: {
            width: arena.totalParticipants > 4 ? 16 : 14,
            height: arena.totalParticipants > 4 ? 16 : 14,
          },
          topologyType: arena.boardType.includes('HEX')
            ? 'HEXAGONAL'
            : arena.boardType.includes('TRI')
              ? 'TRIANGULAR'
              : 'SQUARE',
          maxPlayers: arena.totalParticipants,
          hasDrops: false,
          hasSpells: false,
          hasDuck: false,
          hasFogOfWar: false,
          victoryConditions: ['CHECKMATE'],
          specialRules: {},
        });
      }
    }
    this.initialized = true;
  }

  /**
   * Authoritative topology resolver for any registered variant (Spec 02 § 6 & Audit remediation).
   * Guarantees that RulesEngine, UniversalMatchController, ChessBoard and ChessBoard3D
   * consume the exact identical topology instance contract without per-layer dimension drift.
   */
  public static getTopologyForVariant(variantId: string | undefined | null): ITopology {
    if (!variantId) {
      return new SquareTopology({ width: 8, height: 8 });
    }
    const v = variantId.toUpperCase();

    if (v === 'CAPABLANCA_CHESS' || v.includes('CAPABLANCA')) {
      return new SquareTopology({ width: 10, height: 8 });
    }
    if (v === 'SHOGI') {
      return new SquareTopology({ width: 9, height: 9 });
    }
    if (v === 'XIANGQI') {
      return new SquareTopology({ width: 9, height: 10 });
    }
    if (v === 'GLINSKI_HEXAGONAL' || v.includes('GLINSKI')) {
      return new HexTopology({ orientation: 'POINTY', radius: 5 });
    }
    if (v === 'TRIANGULAR_CHAOS_3P' || v.includes('TRIANGULAR')) {
      return new TriangleTopology({ boundingRadius: 6 });
    }
    if (v === 'TOROIDAL_CHESS' || v.includes('TORUS') || v.includes('TOROIDAL')) {
      return new SquareTopology({ width: 8, height: 8, toroidal: true });
    }
    if (v === 'CUBIC_CHESS' || v.includes('CUBIC')) {
      return new CubicTopology({ boardSize: 8 });
    }

    const arenaLayout = CompositeArenaLayouts.getLayout(v as ArenaModeId);
    if (arenaLayout) {
      if (arenaLayout.boardType === 'SQUARE_CROSS') {
        return new SquareTopology({ width: 14, height: 14 });
      }
      if (arenaLayout.boardType.includes('HEX')) {
        return new HexTopology({ orientation: 'FLAT', radius: 7 });
      }
      if (arenaLayout.boardType.includes('TRI')) {
        return new TriangleTopology({ boundingRadius: 8 });
      }
      return new SquareTopology({ width: 16, height: 16 });
    }

    this.ensureInitialized();
    const def = this.getById(v);
    if (def?.boardDimensions) {
      if (def.topologyType === 'HEXAGONAL') {
        return new HexTopology({ orientation: 'POINTY', radius: Math.floor(def.boardDimensions.width / 2) });
      }
      if (def.topologyType === 'TRIANGULAR') {
        return new TriangleTopology({ boundingRadius: Math.floor(def.boardDimensions.width / 2) });
      }
      return new SquareTopology({ width: def.boardDimensions.width, height: def.boardDimensions.height });
    }

    return new SquareTopology({ width: 8, height: 8 });
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
    if (upper === 'OCTAGONAL_CITADEL_8P') {
      return this.registry.get('OCTAGON_FFA');
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


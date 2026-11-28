/**
 * ChessInReact - Spell Chess Transposition Table with Compact Positional Hashing (Spec 15 § 4 Estratégia 7)
 *
 * Implements a bounded transposition table indexing:
 * - Board piece placements and owners.
 * - Active player.
 * - Spell charges and cooldowns for both players.
 * - Active frozen zones and jump coordinates.
 */

import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, EntityId } from '../../../../core/coordinates/types';
import { IPieceEntity } from '../../../../core/entities/types';
import { SpellChessTurnAction, SpellResources } from './SpellChessTurnAction';

export type TTFlag = 'EXACT' | 'LOWERBOUND' | 'UPPERBOUND';

export interface ITTEntry {
  readonly key: string;
  readonly depth: number;
  readonly flag: TTFlag;
  readonly score: number;
  readonly bestAction?: SpellChessTurnAction;
  readonly principalVariation?: SpellChessTurnAction[];
}

export class SpellChessTranspositionTable {
  private readonly table = new Map<string, ITTEntry>();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 32_768) {
    this.maxEntries = maxEntries;
  }

  public clear(): void {
    this.table.clear();
  }

  /**
   * Computes a deterministic state key including spell resources and active magical effects.
   */
  public computeKey(
    domain: IDomainState,
    actingPlayer: PlayerId,
    p1Resources: SpellResources,
    p2Resources: SpellResources,
    activeFrozenCoords: readonly string[],
    activeJumpCoords: readonly string[]
  ): string {
    const spells = domain.metadata?.officialSpellState as {
      activeFrozenPieceIds?: Record<string, number>; activeFrozenCoordinates?: Record<string, number>;
      activeJumpPieceIds?: Record<string, number>;
    } | undefined;
    const records = (value: Record<string, number> | undefined) => Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const board = Object.entries(domain.occupancy).sort(([a], [b]) => a.localeCompare(b)).map(([coord, id]) => {
      const ent = domain.boardEntities[id as EntityId];
      const piece = ent?.type === 'PIECE' ? ent as IPieceEntity : undefined;
      return [coord, id, piece?.ownerId, piece?.variantId, piece?.hasMoved,
        Boolean(ent?.metadata?.isFrozen), Boolean(ent?.metadata?.hasJump), Boolean(ent?.metadata?.canBeJumpedOver)];
    });
    const resources = (r: SpellResources) => [r.freezeRemaining, r.jumpRemaining, r.freezeCooldown, r.jumpCooldown];
    const position = this.digest(JSON.stringify([domain.variantId, actingPlayer, board, resources(p1Resources), resources(p2Resources),
      spells?.activeFrozenPieceIds !== undefined, records(spells?.activeFrozenPieceIds), records(spells?.activeFrozenCoordinates), records(spells?.activeJumpPieceIds),
      Boolean(domain.metadata?.hasCastSpellThisTurn), [...activeFrozenCoords].sort(), [...activeJumpCoords].sort(),
      domain.turnState.phase, domain.turnState.enPassantTarget]));
    // Repetition is context, not board identity. Count equivalent histories independent of order.
    const history = domain.turnState.positionHistory ?? [];
    let context = this.historyKeys.get(history);
    if (!context) {
      const counts = new Map<string, number>();
      for (const key of history) {
        let compact = this.positionDigests.get(key);
        if (!compact) {
          compact = this.digest(key);
          if (this.positionDigests.size >= 8192) this.positionDigests.clear();
          this.positionDigests.set(key, compact);
        }
        counts.set(compact, (counts.get(compact) ?? 0) + 1);
      }
      context = this.digest(JSON.stringify([...counts].sort(([a], [b]) => a.localeCompare(b))));
      this.historyKeys.set(history, context);
    }
    return `${position}:${domain.turnState.fiftyMoveCounter}:${context}`;
  }

  private readonly historyKeys = new WeakMap<readonly string[], string>();
  private readonly positionDigests = new Map<string, string>();

  /** Two independent 32-bit accumulators; bounded cached history strings avoid rehashing full logs. */
  private digest(value: string): string {
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x85ebca6b);
    }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }

  public get(key: string): ITTEntry | undefined {
    return this.table.get(key);
  }

  public set(key: string, entry: ITTEntry): void {
    if (this.maxEntries === 0) return;
    if (this.table.size >= this.maxEntries) {
      // Evict first entry
      const firstKey = this.table.keys().next().value;
      if (firstKey) this.table.delete(firstKey);
    }
    const existing = this.table.get(key);
    if (!existing || entry.depth >= existing.depth) {
      this.table.set(key, entry);
    }
  }
}

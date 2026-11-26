/**
 * ChessInReact - Spell Chess Transposition Table with Augmented Zobrist Hashing (Spec 15 § 4 Estratégia 7)
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
    // Collect occupied squares sorted deterministically
    const occEntries = Object.entries(domain.occupancy)
      .filter(([, entityId]) => Boolean(entityId))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([coord, entityId]) => {
        const ent = domain.boardEntities[entityId as EntityId];
        const piece = ent && ent.type === 'PIECE' ? (ent as IPieceEntity) : undefined;
        const isFrozen = ent?.metadata?.isFrozen ? 'F' : '';
        const hasJump = ent?.metadata?.hasJump ? 'J' : '';
        return `${coord}:${piece?.ownerId ?? ''}:${piece?.variantId ?? ''}:${piece?.hasMoved}${isFrozen}${hasJump}:${Boolean(ent?.metadata?.canBeJumpedOver)}`;
      })
      .join('|');

    const frozenStr = [...activeFrozenCoords].sort().join(',');
    const jumpStr = [...activeJumpCoords].sort().join(',');
    const p1Str = `${p1Resources.freezeRemaining},${p1Resources.jumpRemaining},${p1Resources.freezeCooldown},${p1Resources.jumpCooldown}`;
    const p2Str = `${p2Resources.freezeRemaining},${p2Resources.jumpRemaining},${p2Resources.freezeCooldown},${p2Resources.jumpCooldown}`;

    return `${JSON.stringify({ ...domain.turnState, lastActionTimestamp: 0 })}|${JSON.stringify(domain.metadata?.officialSpellState)}|${Boolean(domain.metadata?.hasCastSpellThisTurn)}|${domain.variantId}|${actingPlayer}|${occEntries}|${p1Str}|${p2Str}|${frozenStr}|${jumpStr}`;
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

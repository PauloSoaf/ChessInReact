import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, asCoordinateKey } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellAction, SpellChessTurnAction, SpellResources } from './SpellChessTurnAction';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';

export class SpellChessMoveGenerator {
  public static generateTurnActions(
    domain: IDomainState, actingPlayer: PlayerId, topology: ITopology, resources: SpellResources,
    _activeFrozenCoords: readonly string[] = [], _activeJumpCoords: readonly string[] = [],
    _fallbackLegalMoves?: readonly { from: string; to: string; pieceId: string; isCapture?: boolean; promotion?: string }[]
  ): SpellChessTurnAction[] {
    // Legacy geometric arrays and supplied move lists are not authoritative.
    void _activeFrozenCoords; void _activeJumpCoords; void _fallbackLegalMoves;
    const base = { ...domain, activePlayer: actingPlayer };
    const spells: SpellAction[] = [{ type: 'NONE' }];
    if (!base.metadata?.hasCastSpellThisTurn) {
      if (resources.jumpRemaining > 0 && resources.jumpCooldown === 0) {
        for (const piece of OfficialSpellRules.pieces(base)) {
          if (!piece.metadata?.canBeJumpedOver) spells.push({ type: 'JUMP', targetSquare: piece.position });
        }
      }
      if (resources.freezeRemaining > 0 && resources.freezeCooldown === 0) {
        // Enumerate every distinct affected piece set, including offset defensive Freezes.
        const seen = new Set<string>();
        const pieces = OfficialSpellRules.pieces(base);
        for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
          const affected = pieces.filter((p) => {
            const [px, py] = SpellChessThreatAnalyzer.parseCoord(p.position);
            return Math.abs(x - px) <= 1 && Math.abs(y - py) <= 1;
          }).map((p) => p.id).sort().join('|');
          if (!affected || seen.has(affected)) continue;
          seen.add(affected);
          const targetSquare = `${x},${y}`;
          if ((OfficialSpellRules.getState(base).activeFrozenCoordinates[targetSquare] ?? 0) === 2) continue;
          spells.push({ type: 'FREEZE', targetSquare });
        }
      }
    }
    const actions: SpellChessTurnAction[] = [];
    for (const spell of spells) {
      const next = this.cloneAndApplySpell(base, spell, actingPlayer);
      for (const move of RulesEngine.getLegalMoves(next, topology)) {
        if (spell.type === 'JUMP' && !SpellChessThreatAnalyzer.rayPassesThroughSquare(move.from, move.to, spell.targetSquare)) continue;
        const promotions = move.isPromotion ? (move.promotionOptions ?? ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT']) : [undefined];
        for (const promotion of promotions) actions.push({ spell, move: {
          pieceId: move.pieceId, from: move.from, to: move.to,
          isCapture: move.isCapture, promotion,
        } });
      }
    }
    const king = SpellChessThreatAnalyzer.findKingCoord(base, actingPlayer === 'P1' ? 'P2' : 'P1');
    return actions.sort((a, b) => this.priority(b, base, king) - this.priority(a, base, king));
  }

  public static cloneAndApplySpell(domain: IDomainState, spell: SpellAction, actingPlayer?: PlayerId): IDomainState {
    return OfficialSpellRules.cast({ ...domain, activePlayer: actingPlayer ?? domain.activePlayer }, spell, actingPlayer ?? domain.activePlayer);
  }

  /** Exhaustive immediate royal captures: direct moves and every Jump that can open a ray. */
  public static findKingCapture(domain: IDomainState, player: PlayerId, topology: ITopology): SpellChessTurnAction | undefined {
    if (domain.isGameOver) return undefined;
    const base = { ...domain, activePlayer: player };
    const king = SpellChessThreatAnalyzer.findKingCoord(base, player === 'P1' ? 'P2' : 'P1');
    if (!king) return undefined;
    const find = (state: IDomainState, spell: SpellAction): SpellChessTurnAction | undefined => {
      for (const piece of OfficialSpellRules.pieces(state)) {
        if (piece.ownerId !== player || piece.metadata?.isFrozen) continue;
        const move = RulesEngine.getLegalMovesForPiece(piece, state, topology).find((m) => m.to === king);
        if (move) return { spell, move: { pieceId: move.pieceId, from: move.from, to: move.to, isCapture: true } };
      }
    };
    const direct = find(base, { type: 'NONE' });
    if (direct) return direct;
    const state = OfficialSpellRules.getState(base);
    const charges = player === 'P1' ? state.whiteCharges : state.blackCharges;
    if (base.metadata?.hasCastSpellThisTurn || charges.jumpCharges <= 0 || charges.jumpCooldownTurns > 0) return undefined;
    const rays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(base, king, player === 'P1' ? 'P2' : 'P1');
    for (const ray of rays) {
      const spell: SpellAction = { type: 'JUMP', targetSquare: ray.obstacleCoord };
      const reply = find(OfficialSpellRules.cast(base, spell, player), spell);
      if (reply) return reply;
    }
    return undefined;
  }

  private static priority(action: SpellChessTurnAction, domain: IDomainState, king: string | null): number {
    if (action.move.to === king) return 1_000_000 - (action.spell.type === 'NONE' ? 0 : 1);
    const victim = domain.boardEntities[domain.occupancy[asCoordinateKey(action.move.to)]];
    const values: Record<string, number> = { QUEEN: 900, ROOK: 500, BISHOP: 330, KNIGHT: 320, PAWN: 100 };
    return (victim?.type === 'PIECE' ? values[victim.variantId] ?? 0 : 0) * 10 +
      (action.move.promotion ? 8000 : 0) - (action.spell.type === 'NONE' ? 0 : 50);
  }
}

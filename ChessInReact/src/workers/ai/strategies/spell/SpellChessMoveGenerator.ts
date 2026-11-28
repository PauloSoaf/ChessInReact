import {SpellChessSimulation} from './SpellChessSimulation';
import { SpellChessProfiler } from './SpellChessProfiler';
import { IDomainState } from '../../../../core/state/gameState';
import { PlayerId, asCoordinateKey, asEntityId } from '../../../../core/coordinates';
import { ITopology } from '../../../../core/topology/types';
import { RulesEngine } from '../../../../engine/rules/RulesEngine';
import { OfficialSpellRules } from '../../../../engine/variants/spells/OfficialSpellRules';
import { SpellAction, SpellChessTurnAction, SpellResources } from './SpellChessTurnAction';
import { SpellChessThreatAnalyzer } from './SpellChessThreatAnalyzer';
import { OfficialSpellEngine } from '../../../../engine/variants/spells/OfficialSpellEngine';
import { ILegalMove } from '../../../../engine/rules/interfaces/IRulesContracts';

export class SpellChessMoveGenerator {
  public static generateTurnActions(
    domain: IDomainState, actingPlayer: PlayerId, topology: ITopology, resources: SpellResources,
    _activeFrozenCoords: readonly string[] = [], _activeJumpCoords: readonly string[] = [],
    _fallbackLegalMoves?: readonly { from: string; to: string; pieceId: string; isCapture?: boolean; promotion?: string }[]
  ): SpellChessTurnAction[] {
    return [...this.iterateTurnActions(domain, actingPlayer, topology, resources,
      _activeFrozenCoords, _activeJumpCoords, _fallbackLegalMoves)];
  }

  /** Normal turns are available before expanding magical combinations. No legal spell layer is dropped. */
  public static *iterateTurnActions(
    domain: IDomainState, actingPlayer: PlayerId, topology: ITopology, resources: SpellResources,
    _activeFrozenCoords: readonly string[] = [], _activeJumpCoords: readonly string[] = [],
    _fallbackLegalMoves?: readonly { from: string; to: string; pieceId: string; isCapture?: boolean; promotion?: string }[],
    capturesOnly = false, targetSquare?: string,
  ): Generator<SpellChessTurnAction, void, undefined> {
    // Legacy geometric arrays and supplied move lists are not authoritative.
    void _activeFrozenCoords; void _activeJumpCoords; void _fallbackLegalMoves;
    const base = { ...domain, activePlayer: actingPlayer };
    const enemy: PlayerId = actingPlayer === 'P1' ? 'P2' : 'P1';
    const probe = OfficialSpellRules.sync({ ...base, activePlayer: enemy,
      metadata: { ...base.metadata, hasCastSpellThisTurn: false } },
      OfficialSpellEngine.advanceTurn(OfficialSpellRules.getState(base), actingPlayer === 'P1' ? 'WHITE' : 'BLACK'));
    const threats = capturesOnly ? [] : OfficialSpellRules.pieces(base).filter(p => p.ownerId === actingPlayer &&
      ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT'].includes(p.variantId)).flatMap(piece => {
      const attackers = new Set([...this.findCaptures(probe, enemy, topology, piece.position)].filter(reply => {
        const captured = SpellChessSimulation.run(probe, reply, topology);
        const recapture = this.findCapture(captured, actingPlayer, topology, reply.move.to);
        const attacker = probe.boardEntities[asEntityId(reply.move.pieceId)];
        const values: Record<string,number> = { QUEEN:900,ROOK:500,BISHOP:330,KNIGHT:320,PAWN:100,KING:100000 };
        return !recapture || attacker?.type !== 'PIECE' || (values[attacker.variantId] ?? 0) < (values[piece.variantId] ?? 0);
      }).map(reply => reply.move.from));
      return [...attackers].map(attacker => ({ piece, attacker }));
    });
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
    const defenseSpellScore = (spell: SpellAction) => spell.type !== 'FREEZE' ? 0 : threats.reduce((score,t) => {
      const [x,y] = SpellChessThreatAnalyzer.parseCoord(spell.targetSquare);
      const [ax,ay] = SpellChessThreatAnalyzer.parseCoord(t.attacker);
      return score + (Math.abs(x-ax) <= 1 && Math.abs(y-ay) <= 1 ?
        t.piece.variantId === 'QUEEN' ? 900 : t.piece.variantId === 'ROOK' ? 500 : 320 : 0);
    }, 0);
    const defensiveSpell = (spell: SpellAction) => defenseSpellScore(spell) > 0;
    spells.sort((a,b) => (a.type === 'NONE' ? -100000 : -defenseSpellScore(a)) -
      (b.type === 'NONE' ? -100000 : -defenseSpellScore(b)));
    const deferredNormal: SpellChessTurnAction[] = [];
    const deferredJump: SpellChessTurnAction[] = [];
    let normalFlushed = false;
    for (const spell of spells) {
      if (spell.type === 'FREEZE' && !defensiveSpell(spell) && !normalFlushed) {
        yield* deferredNormal; normalFlushed = true;
      }
      const next = this.cloneAndApplySpell(base, spell, actingPlayer);
      const actions: SpellChessTurnAction[] = [];
      for (const move of capturesOnly ? this.getLegalCaptures(next, topology, targetSquare) : SpellChessProfiler.measure('generation',()=>RulesEngine.getLegalMoves(next, topology))) {
        if (capturesOnly && !move.isCapture && !move.isPromotion) continue;
        if (targetSquare && move.to !== targetSquare) continue;
        if (spell.type === 'JUMP' && !SpellChessThreatAnalyzer.rayPassesThroughSquare(move.from, move.to, spell.targetSquare)) continue;
        const promotions = move.isPromotion ? (move.promotionOptions ?? ['QUEEN', 'ROOK', 'BISHOP', 'KNIGHT']) : [undefined];
        for (const promotion of promotions) actions.push({ spell, move: {
          pieceId: move.pieceId, from: move.from, to: move.to,
          isCapture: move.isCapture, promotion,
        } });
      }
      const king = SpellChessThreatAnalyzer.findKingCoord(base, actingPlayer === 'P1' ? 'P2' : 'P1');
      const defensePriority = (a: SpellChessTurnAction) => threats.reduce((score,t) => score +
        (a.move.pieceId === t.piece.id ? (t.piece.variantId === 'QUEEN' ? 90000 : t.piece.variantId === 'ROOK' ? 50000 : 32000) :
          a.move.to === t.attacker ? 60000 : SpellChessThreatAnalyzer.rayPassesThroughSquare(t.attacker,t.piece.position,a.move.to) ? 10000 : 0), 0);
      actions.sort((a, b) => defensePriority(b) - defensePriority(a) + this.priority(b, base, king) - this.priority(a, base, king));
      let normalCount = 0;
      for (const action of actions) {
        if (spell.type === 'NONE' && ((threats.length && !defensePriority(action)) ||
          (!capturesOnly && normalCount >= 2 && !action.move.isCapture))) deferredNormal.push(action);
        else if (spell.type === 'JUMP' && !capturesOnly && !action.move.isCapture && !defensePriority(action)) deferredJump.push(action);
        else { yield action; if (spell.type === 'NONE') normalCount++; }
      }
    }
    if (!normalFlushed) yield* deferredNormal;
    yield* deferredJump;
  }

  public static cloneAndApplySpell(domain: IDomainState, spell: SpellAction, actingPlayer?: PlayerId): IDomainState {
    return SpellChessProfiler.measure('generation',()=>OfficialSpellRules.cast({ ...domain, activePlayer: actingPlayer ?? domain.activePlayer }, spell, actingPlayer ?? domain.activePlayer));
  }

  /** Targeted validation avoids generating quiet moves in every exchange node. Full movegen remains the oracle. */
  public static getLegalCaptures(state: IDomainState, topology: ITopology, target?: string): ILegalMove[] {
    return SpellChessProfiler.measure('generation',()=>this.legalCapturesImpl(state,topology,target));
  }
  private static legalCapturesImpl(state: IDomainState, topology: ITopology, target?: string): ILegalMove[] {
    const dimensions = topology as {width?:number;height?:number;isToroidal?:boolean;isCubic?:boolean};
    if (dimensions.width !== 8 || dimensions.height !== 8 || dimensions.isToroidal || dimensions.isCubic) {
      return RulesEngine.getLegalMoves(state,topology).filter(m=>(m.isCapture||m.isPromotion)&&(!target||m.to===target));
    }
    const pieces = OfficialSpellRules.pieces(state);
    const targets = target ? [asCoordinateKey(target)] : pieces.filter(p=>p.ownerId!==state.activePlayer).map(p=>p.position);
    if (!target && state.turnState.enPassantTarget) targets.push(state.turnState.enPassantTarget);
    const moves: ILegalMove[] = [];
    for (const p of pieces) {
      if (p.ownerId!==state.activePlayer || p.metadata?.isFrozen) continue;
      const [px,py]=SpellChessThreatAnalyzer.parseCoord(p.position);
      if (!['PAWN','KNIGHT','BISHOP','ROOK','QUEEN','KING'].includes(p.variantId) ||
        (p.variantId==='PAWN' && py===(p.ownerId==='P1'?6:1))) {
        moves.push(...RulesEngine.getLegalMovesForPiece(p,state,topology).filter(m=>(m.isCapture||m.isPromotion)&&(!target||m.to===target))); continue;
      }
      for (const to of targets) {
        const [x,y]=SpellChessThreatAnalyzer.parseCoord(to),dx=Math.abs(x-px),dy=Math.abs(y-py);
        const plausible=p.variantId==='PAWN'?dx===1&&y-py===(p.ownerId==='P1'?1:-1):p.variantId==='KNIGHT'?dx*dy===2:
          p.variantId==='KING'?Math.max(dx,dy)===1:p.variantId==='BISHOP'?dx===dy:
            p.variantId==='ROOK'?dx===0||dy===0:dx===0||dy===0||dx===dy;
        if (!plausible) continue;
        const validation=RulesEngine.validateMove(state,{pieceId:p.id,from:p.position,to,actingPlayer:state.activePlayer},topology);
        if(validation.valid&&validation.isCapture)moves.push({pieceId:p.id,from:p.position,to,isCapture:true,
          capturedPieceId:validation.capturedPieceId,isEnPassant:validation.isEnPassant,isPromotion:validation.isPromotion});
      }
    }
    return moves;
  }

  /** Exhaustive immediate royal captures: direct moves and every Jump that can open a ray. */
  public static findKingCapture(domain: IDomainState, player: PlayerId, topology: ITopology): SpellChessTurnAction | undefined {
    if (domain.isGameOver) return undefined;
    const king = SpellChessThreatAnalyzer.findKingCoord(domain, player === 'P1' ? 'P2' : 'P1');
    if (!king) return undefined;
    return this.findCapture(domain, player, topology, king);
  }

  public static findCapture(domain: IDomainState, player: PlayerId, topology: ITopology, target: string): SpellChessTurnAction | undefined {
    for (const action of this.findCaptures(domain, player, topology, target)) return action;
    return undefined;
  }

  /** All direct/Jump attackers, for ordering multi-attacker defenses. Final safety also searches Freeze replies. */
  public static *findCaptures(domain: IDomainState, player: PlayerId, topology: ITopology,
    target: string): Generator<SpellChessTurnAction, void, undefined> {
    if (domain.isGameOver) return;
    const base = { ...domain, activePlayer: player };
    function* find(state: IDomainState, spell: SpellAction): Generator<SpellChessTurnAction, void, undefined> {
      for (const move of SpellChessMoveGenerator.getLegalCaptures(state,topology,target))
        yield { spell, move: { pieceId: move.pieceId, from: move.from, to: move.to, isCapture: true } };
    }
    yield* find(base, { type: 'NONE' });
    const state = OfficialSpellRules.getState(base);
    const charges = player === 'P1' ? state.whiteCharges : state.blackCharges;
    if (base.metadata?.hasCastSpellThisTurn || charges.jumpCharges <= 0 || charges.jumpCooldownTurns > 0) return;
    const rays = SpellChessThreatAnalyzer.detectOneObstacleJumpRays(base, target, player === 'P1' ? 'P2' : 'P1');
    for (const targetSquare of new Set(rays.map(ray => ray.obstacleCoord))) {
      const spell: SpellAction = { type: 'JUMP', targetSquare };
      yield* find(SpellChessProfiler.measure('generation',()=>OfficialSpellRules.cast(base, spell, player)), spell);
    }
  }

  private static priority(action: SpellChessTurnAction, domain: IDomainState, king: string | null): number {
    if (action.move.to === king) return 1_000_000 - (action.spell.type === 'NONE' ? 0 : 1);
    const victim = domain.boardEntities[domain.occupancy[asCoordinateKey(action.move.to)]];
    const values: Record<string, number> = { QUEEN: 900, ROOK: 500, BISHOP: 330, KNIGHT: 320, PAWN: 100 };
    const mover = domain.boardEntities[asEntityId(action.move.pieceId)];
    const attackerValue = mover?.type === 'PIECE' ? values[mover.variantId] ?? 0 : 0;
    const [fx,fy] = SpellChessThreatAnalyzer.parseCoord(action.move.from);
    const [tx,ty] = SpellChessThreatAnalyzer.parseCoord(action.move.to);
    const activity = (Math.abs(fx-3.5)+Math.abs(fy-3.5)-Math.abs(tx-3.5)-Math.abs(ty-3.5))*3 +
      (mover?.type === 'PIECE' && !mover.hasMoved && ['KNIGHT','BISHOP'].includes(mover.variantId) ? 40 : 0);
    return (victim?.type === 'PIECE' ? (values[victim.variantId] ?? 0) * 10 - attackerValue : 0) +
      (action.move.promotion ? 8000 : 0) + activity - (action.spell.type === 'NONE' ? 0 : 50);
  }
}

import { IDomainState } from '../../../core/state/gameState';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../core/coordinates';
import { IPieceEntity } from '../../../core/entities/types';
import { ITopology } from '../../../core/topology/types';
import { MovePieceCommand } from '../../../core/commands/MovePieceCommand';
import { RulesEngine } from '../../rules/RulesEngine';
import { computePositionKey } from '../../rules/utils/PositionHasher';
import { OfficialSpellEngine, IOfficialSpellState } from './OfficialSpellEngine';

export type OfficialSpellAction = { readonly type: 'NONE' } |
  { readonly type: 'FREEZE' | 'JUMP'; readonly targetSquare: string };

/** Shared by live play, search, tactical safety checks and replay. Never mutates its input. */
export class OfficialSpellRules {
  public static getState(domain: IDomainState): IOfficialSpellState {
    return (domain.metadata?.officialSpellState as IOfficialSpellState | undefined) ?? OfficialSpellEngine.createInitialState();
  }

  public static sync(domain: IDomainState, spells: IOfficialSpellState): IDomainState {
    const boardEntities = { ...domain.boardEntities };
    for (const entity of Object.values(boardEntities)) {
      if (entity.type !== 'PIECE') continue;
      const frozen = spells.activeFrozenPieceIds
        ? (spells.activeFrozenPieceIds[entity.id] ?? 0) > 0
        : (spells.activeFrozenCoordinates[entity.position] ?? 0) > 0;
      const jump = (spells.activeJumpPieceIds[entity.id] ?? 0) > 0;
      boardEntities[entity.id] = { ...entity, metadata: { ...entity.metadata,
        isFrozen: frozen, hasJump: jump, canBeJumpedOver: jump } };
    }
    return { ...domain, boardEntities, metadata: { ...domain.metadata, officialSpellState: spells } };
  }

  public static cast(domain: IDomainState, spell: OfficialSpellAction, player: PlayerId): IDomainState {
    if (spell.type === 'NONE') return domain;
    if (domain.isGameOver || domain.activePlayer !== player || domain.metadata?.hasCastSpellThisTurn) {
      throw new Error('Spell rejected: game over, wrong player or spell already cast this turn.');
    }
    const state = this.getState(domain);
    const side = player === 'P1' ? 'WHITE' : 'BLACK';
    const [file, rank] = spell.targetSquare.split(',').map(Number);
    if (!Number.isInteger(file) || !Number.isInteger(rank) || file < 0 || file > 7 || rank < 0 || rank > 7) {
      throw new Error(`Invalid spell target: ${spell.targetSquare}`);
    }
    const targetId = domain.occupancy[asCoordinateKey(spell.targetSquare)];
    if (spell.type === 'JUMP' && (!targetId || domain.boardEntities[targetId]?.type !== 'PIECE')) {
      throw new Error('Jump requires an occupied piece square.');
    }
    const result = spell.type === 'FREEZE'
      ? OfficialSpellEngine.castFreeze(state, side, { file, rank })
      : OfficialSpellEngine.castJump(state, side, targetId!);
    if (!result.success) throw new Error(result.reason);
    let next = result.state;
    if (spell.type === 'FREEZE') {
      const frozenIds = { ...state.activeFrozenPieceIds };
      // Legacy snapshots are upgraded without losing pieces already frozen.
      for (const piece of Object.values(domain.boardEntities)) {
        if (piece.type !== 'PIECE' || piece.isCaptured) continue;
        if (piece.metadata?.isFrozen) frozenIds[piece.id] = state.activeFrozenPieceIds?.[piece.id] ?? state.activeFrozenCoordinates[piece.position] ?? 1;
        const [x, y] = piece.position.split(',').map(Number);
        if (Math.abs(x - file) <= 1 && Math.abs(y - rank) <= 1) frozenIds[piece.id] = 2;
      }
      next = { ...next, activeFrozenPieceIds: frozenIds };
    }
    const synced = this.sync(domain, next);
    return { ...synced, metadata: { ...synced.metadata, hasCastSpellThisTurn: true },
      turnState: { ...synced.turnState, positionHistory: domain.turnState.positionHistory?.length
        ? domain.turnState.positionHistory : [computePositionKey(domain)] } };
  }

  public static finishTurn(domain: IDomainState, movedPieceId: string, player: PlayerId, topology: ITopology): IDomainState {
    const spells = this.getState(domain);
    const jumps = { ...spells.activeJumpPieceIds };
    delete jumps[movedPieceId];
    const next = this.sync(domain, OfficialSpellEngine.advanceTurn(
      { ...spells, activeJumpPieceIds: jumps }, player === 'P1' ? 'WHITE' : 'BLACK'));
    let completed = { ...next, metadata: { ...next.metadata, hasCastSpellThisTurn: false } };
    // MovePieceCommand appended a pre-expiration key. Store the actual next-turn state.
    const history = completed.turnState.positionHistory ?? [];
    completed = { ...completed, turnState: { ...completed.turnState,
      positionHistory: [...history.slice(0, -1), computePositionKey(completed)] } };
    if (completed.isGameOver) return completed;
    const result = RulesEngine.getGameResult(completed, topology);
    return { ...completed, isGameOver: result.isGameOver, winnerId: result.winnerId };
  }

  public static simulate(domain: IDomainState, action: { spell: OfficialSpellAction; move: {
    pieceId: string; from: string; to: string; promotion?: string;
  } }, topology: ITopology): IDomainState {
    const withSpell = this.cast(domain, action.spell, domain.activePlayer);
    // Commands also update captures, castling, en passant, promotion and repetition counters.
    const draft = JSON.parse(JSON.stringify(withSpell)) as IDomainState;
    new MovePieceCommand(asEntityId(action.move.pieceId), asCoordinateKey(action.move.from),
      asCoordinateKey(action.move.to), domain.activePlayer, undefined, true, true,
      action.move.promotion, topology).execute(draft);
    for (const piece of this.pieces(draft)) {
      if (draft.occupancy[piece.position] !== piece.id) {
        throw new Error(`Simulation occupancy mismatch after ${JSON.stringify(action)}: ${piece.id} on ${piece.position}, occupant=${draft.occupancy[piece.position]}`);
      }
    }
    return this.finishTurn(draft, action.move.pieceId, domain.activePlayer, topology);
  }

  public static pieces(domain: IDomainState): IPieceEntity[] {
    return Object.values(domain.boardEntities).filter((e): e is IPieceEntity => e.type === 'PIECE' && !e.isCaptured);
  }
}

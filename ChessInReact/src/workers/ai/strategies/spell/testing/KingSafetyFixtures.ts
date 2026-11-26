import { createDefaultDomainState } from '../../../../../core/state/initialState';
import { asCoordinateKey, asEntityId, PlayerId } from '../../../../../core/coordinates';
import { IDomainState } from '../../../../../core/state/gameState';
import { IPieceEntity } from '../../../../../core/entities/types';
import { OfficialSpellEngine } from '../../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellRules } from '../../../../../engine/variants/spells/OfficialSpellRules';

export function addPiece(domain: IDomainState, id: string, ownerId: PlayerId, variantId: string, position: string): IPieceEntity {
  const piece: IPieceEntity = { id: asEntityId(id), type: 'PIECE', ownerId, variantId,
    position: asCoordinateKey(position), hasMoved: true, isCaptured: false };
  domain.boardEntities[piece.id] = piece;
  domain.occupancy[piece.position] = piece.id;
  return piece;
}

/** Controlled partial position, NOT a reconstruction of the user's unrecorded spell history. */
export function queenTrap(options: { jump?: number; cooldown?: number; bishopFrozen?: number;
  secondBlocker?: boolean; blackFreeze?: number; beforeCapture?: boolean } = {}): IDomainState {
  const initial = createDefaultDomainState('patch12-queen-trap', 'SPELL_CHESS_KING_CAPTURE_ONLY');
  const domain = { ...initial, activePlayer: options.beforeCapture ? 'P2' as const : 'P1' as const, turnNumber: 10 };
  addPiece(domain, 'wk', 'P1', 'KING', '4,0');
  addPiece(domain, 'wb', 'P1', 'BISHOP', '2,3');
  addPiece(domain, 'bk', 'P2', 'KING', options.beforeCapture ? '4,7' : '5,6');
  addPiece(domain, 'blocker', 'P2', 'PAWN', '4,5');
  addPiece(domain, 'ap', 'P2', 'PAWN', '0,4');
  if (options.beforeCapture) addPiece(domain, 'wq', 'P1', 'QUEEN', '5,6');
  if (options.secondBlocker) addPiece(domain, 'second', 'P2', 'PAWN', '3,4');
  const spells = OfficialSpellEngine.createInitialState();
  return OfficialSpellRules.sync(domain, { ...spells,
    whiteCharges: { freezeCharges: 0, jumpCharges: options.jump ?? 1, freezeCooldownTurns: 0, jumpCooldownTurns: options.cooldown ?? 0 },
    blackCharges: { freezeCharges: options.blackFreeze ?? 0, jumpCharges: 0, freezeCooldownTurns: 0, jumpCooldownTurns: 0 },
    activeFrozenPieceIds: options.bishopFrozen ? { wb: options.bishopFrozen } : {},
  });
}

export function mirrorColors(domain: IDomainState): IDomainState {
  const result: IDomainState = { ...domain, boardEntities: {}, occupancy: {},
    activePlayer: domain.activePlayer === 'P1' ? 'P2' : 'P1' };
  for (const piece of OfficialSpellRules.pieces(domain)) {
    const [x, y] = piece.position.split(',').map(Number);
    result.boardEntities[piece.id] = { ...piece, ownerId: piece.ownerId === 'P1' ? 'P2' : 'P1',
      position: asCoordinateKey(`${7 - x},${7 - y}`) };
    result.occupancy[asCoordinateKey(`${7 - x},${7 - y}`)] = piece.id;
  }
  const spells = OfficialSpellRules.getState(domain);
  return OfficialSpellRules.sync(result, { ...spells, whiteCharges: spells.blackCharges, blackCharges: spells.whiteCharges,
    activeFrozenCoordinates: Object.fromEntries(Object.entries(spells.activeFrozenCoordinates).map(([coord, turns]) => {
      const [x, y] = coord.split(',').map(Number); return [`${7 - x},${7 - y}`, turns];
    })) });
}

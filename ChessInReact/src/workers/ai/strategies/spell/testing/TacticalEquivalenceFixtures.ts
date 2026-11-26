import { createDefaultDomainState } from '../../../../../core/state/initialState';
import { SquareTopology } from '../../../../../core/topology/SquareTopology';
import { IDomainState } from '../../../../../core/state/gameState';
import { asCoordinateKey, asEntityId } from '../../../../../core/coordinates';
import { OfficialSpellEngine } from '../../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellRules } from '../../../../../engine/variants/spells/OfficialSpellRules';
import { SpellChessTurnAction } from '../SpellChessTurnAction';
import { addPiece, mirrorColors } from './KingSafetyFixtures';

export const TACTICAL_GEOMETRIES = [
  { name: 'bishop-c4-f7', piece: 'BISHOP', blockerType: 'PAWN', blockerOwner: 'P2', attacker: '2,3', target: '5,6', blocker: '4,5', second: '3,4', king: '4,7' },
  { name: 'bishop-b2-e5', piece: 'BISHOP', blockerType: 'KNIGHT', blockerOwner: 'P2', attacker: '1,1', target: '4,4', blocker: '3,3', second: '2,2', king: '5,5' },
  { name: 'rook-c2-c6', piece: 'ROOK', blockerType: 'BISHOP', blockerOwner: 'P1', attacker: '2,1', target: '2,5', blocker: '2,3', second: '2,4', king: '3,6' },
  { name: 'rook-b4-f4', piece: 'ROOK', blockerType: 'ROOK', blockerOwner: 'P2', attacker: '1,3', target: '5,3', blocker: '3,3', second: '4,3', king: '6,4' },
  { name: 'queen-h2-d6', piece: 'QUEEN', blockerType: 'BISHOP', blockerOwner: 'P2', attacker: '7,1', target: '3,5', blocker: '5,3', second: '4,4', king: '2,6' },
  { name: 'queen-f2-f6', piece: 'QUEEN', blockerType: 'KNIGHT', blockerOwner: 'P1', attacker: '5,1', target: '5,5', blocker: '5,3', second: '5,4', king: '6,6' },
  { name: 'queen-g6-c6', piece: 'QUEEN', blockerType: 'QUEEN', blockerOwner: 'P2', attacker: '6,5', target: '2,5', blocker: '4,5', second: '3,5', king: '1,6' },
] as const;

export const TACTICAL_CONDITIONS = [
  { name: 'jump-ready', jump: 1, cooldown: 0, frozen: 0, blockers: 1, activeJump: 0, losesKing: true },
  { name: 'no-jump-charges', jump: 0, cooldown: 0, frozen: 0, blockers: 1, activeJump: 0, losesKing: false },
  { name: 'jump-in-cooldown', jump: 1, cooldown: 1, frozen: 0, blockers: 1, activeJump: 0, losesKing: false },
  { name: 'attacker-still-frozen', jump: 1, cooldown: 0, frozen: 2, blockers: 1, activeJump: 0, losesKing: false },
  { name: 'attacker-thaws-before-reply', jump: 1, cooldown: 0, frozen: 1, blockers: 1, activeJump: 0, losesKing: true },
  { name: 'two-independent-blockers', jump: 1, cooldown: 0, frozen: 0, blockers: 2, activeJump: 0, losesKing: false },
  { name: 'existing-jump-without-charges', jump: 0, cooldown: 0, frozen: 0, blockers: 1, activeJump: 2, losesKing: true },
  { name: 'jump-expires-before-reply', jump: 0, cooldown: 0, frozen: 0, blockers: 1, activeJump: 1, losesKing: false },
] as const;

export type TacticalGeometry = typeof TACTICAL_GEOMETRIES[number];
export type TacticalCondition = typeof TACTICAL_CONDITIONS[number];

const topology = new SquareTopology({ width: 8, height: 8 });

function royalBeforeSetup(domain: IDomainState): IDomainState {
  const occupancy = { ...domain.occupancy };
  delete occupancy[asCoordinateKey('7,0')];
  occupancy[asCoordinateKey('6,0')] = asEntityId('friendly-royal');
  return { ...domain, activePlayer: 'P1', occupancy, boardEntities: { ...domain.boardEntities,
    [asEntityId('friendly-royal')]: { ...domain.boardEntities[asEntityId('friendly-royal')], position: asCoordinateKey('6,0') },
  } };
}

function freezeOnlyAttacker(domain: IDomainState): string {
  const pieces = OfficialSpellRules.pieces(domain);
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
    if (pieces.every((p) => {
      const [px, py] = p.position.split(',').map(Number);
      return (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1) === (p.id === 'sliding-attacker');
    })) return `${x},${y}`;
  }
  throw new Error('Fixture needs a legal Freeze center affecting only its attacker.');
}

/** Held-out geometries and resource states. No historical spell chronology is inferred. */
export function tacticalEquivalenceFixture(geometry: TacticalGeometry, condition: TacticalCondition, mirror: boolean) {
  const initial = createDefaultDomainState(`${geometry.name}:${condition.name}:${mirror}`, 'SPELL_CHESS_KING_CAPTURE_ONLY');
  const domain = { ...initial, activePlayer: 'P2' as const, turnNumber: 40 };
  addPiece(domain, 'friendly-royal', 'P1', 'KING', '7,0');
  addPiece(domain, 'sliding-attacker', 'P1', geometry.piece, geometry.attacker);
  addPiece(domain, 'queen-bait', 'P1', 'QUEEN', geometry.target);
  addPiece(domain, 'defending-royal', 'P2', 'KING', geometry.king);
  addPiece(domain, 'primary-blocker', geometry.blockerOwner, geometry.blockerType, geometry.blocker);
  if (condition.blockers === 2) addPiece(domain, 'second-blocker', 'P2', 'PAWN', geometry.second);
  const spells = OfficialSpellEngine.createInitialState();
  let state = OfficialSpellRules.sync(domain, { ...spells,
    whiteCharges: { freezeCharges: condition.frozen === 1 ? 1 : 0,
      jumpCharges: condition.activeJump === 1 ? 1 : condition.jump,
      freezeCooldownTurns: 0, jumpCooldownTurns: condition.cooldown },
    blackCharges: { freezeCharges: condition.frozen === 2 ? 1 : 0,
      jumpCharges: condition.activeJump === 2 ? 1 : 0, freezeCooldownTurns: 0, jumpCooldownTurns: 0 },
    activeFrozenPieceIds: {}, activeJumpPieceIds: {},
  });
  // Build active fields through real casts/turns, preserving charge consumption,
  // cooldowns and the one-spell-per-turn flag. This is test setup, not user history.
  if (condition.frozen === 2) state = OfficialSpellRules.cast(state,
    { type: 'FREEZE', targetSquare: freezeOnlyAttacker(state) }, 'P2');
  else if (condition.activeJump === 2) state = OfficialSpellRules.cast(state,
    { type: 'JUMP', targetSquare: geometry.blocker }, 'P2');
  else if (condition.frozen === 1 || condition.activeJump === 1) {
    const setup = royalBeforeSetup(state);
    state = OfficialSpellRules.simulate(setup, {
      spell: condition.frozen === 1 ? { type: 'FREEZE', targetSquare: freezeOnlyAttacker(setup) }
        : { type: 'JUMP', targetSquare: geometry.blocker },
      move: { pieceId: 'friendly-royal', from: '6,0', to: '7,0' },
    }, topology);
  }
  const reflect = (coord: string) => {
    const [x, y] = coord.split(',').map(Number);
    return mirror ? `${7 - x},${7 - y}` : coord;
  };
  const poisonedCapture: SpellChessTurnAction = { spell: { type: 'NONE' }, move: {
    pieceId: 'defending-royal', from: reflect(geometry.king), to: reflect(geometry.target), isCapture: true,
  } };
  return { domain: mirror ? mirrorColors(state) : state, poisonedCapture,
    attackerSquare: reflect(geometry.attacker), blockerSquare: reflect(geometry.blocker),
    kingCaptureSquare: reflect(geometry.target) };
}

/** The king and first blocker cannot move; only freezing the attacker buys a legal reply. */
export function mandatoryFreezeFixture(geometry: TacticalGeometry, mirror: boolean) {
  const fixture = tacticalEquivalenceFixture(geometry, TACTICAL_CONDITIONS[0], false);
  const setup = { ...royalBeforeSetup(fixture.domain), activePlayer: 'P2' as const,
    matchId: `${geometry.name}:mandatory-freeze:${mirror}` };
  addPiece(setup, 'reply-pawn', 'P2', 'PAWN', '0,6');
  const spells = OfficialSpellRules.getState(setup);
  const withResources = OfficialSpellRules.sync(setup, { ...spells,
    whiteCharges: { ...spells.whiteCharges, freezeCharges: 1 },
    blackCharges: { ...spells.blackCharges, freezeCharges: 1 },
  });
  const captured = OfficialSpellRules.simulate(withResources, fixture.poisonedCapture, topology);
  const [tx, ty] = geometry.target.split(',').map(Number);
  const [bx, by] = geometry.blocker.split(',').map(Number);
  // White freezes the royal/blocker and plays Kh1. Black now genuinely has a
  // frozen king, a movable pawn and one available defensive Freeze.
  const frozen = OfficialSpellRules.simulate(captured, { spell: { type: 'FREEZE',
    targetSquare: `${Math.floor((tx + bx) / 2)},${Math.floor((ty + by) / 2)}` },
    move: { pieceId: 'friendly-royal', from: '6,0', to: '7,0' },
  }, topology);
  return mirror ? mirrorColors(frozen) : frozen;
}

import { IDomainState } from '../../../../../core/state/gameState';
import { createDefaultDomainState } from '../../../../../core/state/initialState';
import { createStandardChessPieces } from '../../../../../core/bootstrap/GameInitializer';
import { SquareTopology } from '../../../../../core/topology/SquareTopology';
import { OfficialSpellRules } from '../../../../../engine/variants/spells/OfficialSpellRules';
import { OfficialSpellEngine } from '../../../../../engine/variants/spells/OfficialSpellEngine';
import { SpellChessTurnAction } from '../SpellChessTurnAction';
import { addPiece, mirrorColors } from './KingSafetyFixtures';

export const materialTopology = new SquareTopology({ width: 8, height: 8 });
export function openingTrap(opening: 'd3' | 'e3', mirror = false): IDomainState {
  let state = createDefaultDomainState('patch13-opening', 'SPELL_CHESS_KING_CAPTURE_ONLY');
  for (const p of createStandardChessPieces()) { state.boardEntities[p.id] = p; state.occupancy[p.position] = p.id; }
  state = OfficialSpellRules.sync(state, OfficialSpellEngine.createInitialState());
  const file = opening === 'd3' ? 3 : 4;
  state = OfficialSpellRules.simulate(state, { spell: { type: 'NONE' }, move: {
    pieceId: state.occupancy[`${file},1` as keyof typeof state.occupancy], from: `${file},1`, to: `${file},2`,
  } }, materialTopology);
  if (opening === 'd3') state = OfficialSpellRules.simulate(state, { spell: { type: 'NONE' }, move: {
    pieceId: state.occupancy['1,7' as keyof typeof state.occupancy], from: '1,7', to: '2,5',
  } }, materialTopology);
  return mirror ? mirrorColors(state) : state;
}

export function materialTrap(captor: 'BISHOP' | 'KNIGHT' | 'PAWN' | 'QUEEN' | 'NONE' = 'BISHOP', mirror = false) {
  let domain = createDefaultDomainState('patch13-material', 'SPELL_CHESS_KING_CAPTURE_ONLY');
  addPiece(domain, 'own-king', 'P1', 'KING', '0,0');
  addPiece(domain, 'enemy-king', 'P2', 'KING', '7,7');
  addPiece(domain, 'own-queen', 'P1', 'QUEEN', '3,0');
  addPiece(domain, 'obstacle', 'P1', 'PAWN', '3,2');
  addPiece(domain, 'bait', 'P2', 'PAWN', '3,6');
  const squares = { BISHOP: '2,7', KNIGHT: '1,7', PAWN: '4,7', QUEEN: '3,7', NONE: '0,6' };
  addPiece(domain, 'captor', 'P2', captor === 'NONE' ? 'PAWN' : captor, squares[captor]);
  const spells = OfficialSpellEngine.createInitialState();
  domain = OfficialSpellRules.sync(domain, { ...spells,
    whiteCharges: { ...spells.whiteCharges, freezeCharges: 0 },
    blackCharges: { ...spells.blackCharges, freezeCharges: 0, jumpCharges: 0 } });
  if (mirror) domain = mirrorColors(domain);
  const transform = (square: string) => { const [x,y] = square.split(',').map(Number); return mirror ? `${7-x},${7-y}` : square; };
  const poisonedCapture: SpellChessTurnAction = { spell: { type: 'JUMP', targetSquare: transform('3,2') },
    move: { pieceId: 'own-queen', from: transform('3,0'), to: transform('3,6'), isCapture: true } };
  return { domain, poisonedCapture, transform };
}

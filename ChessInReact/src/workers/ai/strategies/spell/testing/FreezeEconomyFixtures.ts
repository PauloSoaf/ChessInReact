import { createDefaultDomainState } from '../../../../../core/state/initialState';
import { createStandardChessPieces } from '../../../../../core/bootstrap/GameInitializer';
import { OfficialSpellEngine } from '../../../../../engine/variants/spells/OfficialSpellEngine';
import { OfficialSpellRules } from '../../../../../engine/variants/spells/OfficialSpellRules';
import { IDomainState } from '../../../../../core/state/gameState';
import { SpellChessTurnAction } from '../SpellChessTurnAction';
import { materialTopology } from './MaterialSafetyFixtures';
import { addPiece, mirrorColors } from './KingSafetyFixtures';

/** Hypothetical image reconstruction. No claim about the user's missing original spell chronology. */
export function freezeEconomyImage(mirror = false): IDomainState {
 let state = createDefaultDomainState('patch14-image-hypothesis', 'SPELL_CHESS_KING_CAPTURE_ONLY');
 for (const piece of createStandardChessPieces()) { state.boardEntities[piece.id] = piece; state.occupancy[piece.position] = piece.id; }
 state = OfficialSpellRules.sync(state, OfficialSpellEngine.createInitialState());
 for (const [from,to] of [['4,1','4,2'],['1,7','2,5'],['5,0','1,4']]) state = OfficialSpellRules.simulate(state,
  { spell: { type: 'NONE' }, move: { pieceId: state.occupancy[from as keyof typeof state.occupancy], from,to } }, materialTopology);
 return mirror ? mirrorColors(state) : state;
}
export function imageAction(domain: IDomainState, from: string, to: string,
 spell: SpellChessTurnAction['spell'] = { type: 'NONE' }, mirror = false): SpellChessTurnAction {
 const coord = (square: string) => { const [x,y] = square.split(',').map(Number); return mirror ? `${7-x},${7-y}` : square; };
 return { spell: spell.type === 'NONE' ? spell : { ...spell, targetSquare: coord(spell.targetSquare) },
  move: { pieceId: domain.occupancy[coord(from) as keyof typeof domain.occupancy], from: coord(from), to: coord(to) } };
}

export function offensiveFreezeFixture(options:{counterFreeze?:number;counterCooldown?:number;lastCharge?:boolean;blocker?:boolean}={},mirror=false):IDomainState {
 let d=createDefaultDomainState('patch14-offensive','SPELL_CHESS_KING_CAPTURE_ONLY');
 addPiece(d,'wk','P1','KING','7,0');addPiece(d,'wr','P1','ROOK','0,0');
 addPiece(d,'bk','P2','KING','0,7');addPiece(d,'br','P2','ROOK','0,6');addPiece(d,'bp','P2','PAWN','7,6');
 if(options.blocker)addPiece(d,'bait','P2','PAWN','0,3');
 const s=OfficialSpellEngine.createInitialState();
 d=OfficialSpellRules.sync(d,{...s,whiteCharges:{...s.whiteCharges,freezeCharges:options.lastCharge?1:5,jumpCharges:0},
  blackCharges:{freezeCharges:options.counterFreeze??0,jumpCharges:0,freezeCooldownTurns:options.counterCooldown??0,jumpCooldownTurns:0}});
 return mirror?mirrorColors(d):d;
}

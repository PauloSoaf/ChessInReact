/**
 * ChessInReact - Expanded Spell Chess Engine (Spec 13 § 4.1 Família B.2, RF-13-03)
 *
 * Re-exports and binds the rich 7-spell mana card system (Spec 12 / Spec 13):
 * - 7 Spells: FREEZE, JUMP, INVISIBILITY, PORTAL, STEALTH_TRAP, RESURRECTION, MIRROR_SHIELD.
 * - Dynamic Mana Economy: 2 starting mana, +1 per turn up to max 6 mana.
 * - Interactive hand cards with deck.
 */

export {
  SpellChessEngine as ExpandedSpellEngine,
  SPELL_CATALOG,
  MAX_MANA_CAP,
  INITIAL_MANA,
  MANA_PER_TURN,
} from '../../../analysis/minigames/SpellChessEngine';

export type {
  SpellType,
  ISpellCard,
  ISpellGameState,
} from '../../../analysis/minigames/SpellChessEngine';


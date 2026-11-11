import React from 'react';
import { ISpellCard, ISpellGameState, SPELL_CATALOG, SpellType } from './SpellChessEngine';

export interface ISpellCardHandProps {
  readonly state: ISpellGameState;
  readonly activePlayer: 'WHITE' | 'BLACK';
  readonly onSelectSpell?: (spell: ISpellCard) => void;
  readonly selectedSpellType?: SpellType | null;
}

export const SpellCardHand: React.FC<ISpellCardHandProps> = ({
  state,
  activePlayer,
  onSelectSpell,
  selectedSpellType,
}) => {
  const currentMana = activePlayer === 'WHITE' ? state.whiteMana : state.blackMana;
  const maxMana = state.maxMana;

  return (
    <div
      role="region"
      aria-label="Mão de Feitiços - Spell Chess"
      className="p-3 bg-neutral-900/90 border border-neutral-700 rounded-xl shadow-lg backdrop-blur-md max-w-full"
    >
      {/* Mana Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-bold tracking-wider text-neutral-400">
            Reserva de Mana ({activePlayer === 'WHITE' ? 'Brancas' : 'Pretas'})
          </span>
          <span className="text-sm font-extrabold text-cyan-400">
            {currentMana} / {maxMana}
          </span>
        </div>
        {/* Mana Orbs */}
        <div className="flex gap-1">
          {Array.from({ length: maxMana }).map((_, idx) => {
            const isFilled = idx < currentMana;
            return (
              <span
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border transition-all duration-300 ${
                  isFilled
                    ? 'bg-cyan-400 border-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-100'
                    : 'bg-neutral-800 border-neutral-700 opacity-40 scale-90'
                }`}
                title={isFilled ? 'Mana Ativo' : 'Mana Vazio'}
              />
            );
          })}
        </div>
      </div>

      {/* Spells Grid / Scroll */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {SPELL_CATALOG.map((spell) => {
          const canAfford = currentMana >= spell.manaCost;
          const isSelected = selectedSpellType === spell.type;

          return (
            <button
              key={spell.id}
              type="button"
              disabled={!canAfford}
              onClick={() => canAfford && onSelectSpell?.(spell)}
              className={`flex-shrink-0 w-28 p-2 rounded-lg border text-left transition-all duration-200 ${
                isSelected
                  ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/50 scale-[1.02]'
                  : canAfford
                  ? 'bg-neutral-800/80 border-neutral-600 hover:border-cyan-400 hover:bg-neutral-750'
                  : 'bg-neutral-800/30 border-neutral-800 opacity-50 cursor-not-allowed'
              }`}
              aria-label={`${spell.displayName} - Custo: ${spell.manaCost} Mana`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-black uppercase text-amber-400 truncate">
                  {spell.type}
                </span>
                <span
                  className={`text-xs font-black px-1.5 py-0.2 rounded-full ${
                    canAfford ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-500/40' : 'bg-neutral-700 text-neutral-400'
                  }`}
                >
                  {spell.manaCost} ✦
                </span>
              </div>
              <h4 className="text-xs font-bold text-neutral-200 truncate">{spell.displayName.split(' ')[0]}</h4>
              <p className="text-[10px] text-neutral-400 leading-tight mt-1 line-clamp-2">
                {spell.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};


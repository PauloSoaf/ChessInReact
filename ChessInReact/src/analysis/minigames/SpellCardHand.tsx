import React from 'react';
import { ISpellCard, ISpellGameState, SPELL_CATALOG, SpellType } from './SpellChessEngine';

export interface ISpellCardHandProps {
  readonly state: ISpellGameState;
  readonly activePlayer: 'WHITE' | 'BLACK';
  readonly onSelectSpell?: (spell: ISpellCard | null) => void;
  readonly onCancelSpell?: () => void;
  readonly selectedSpellType?: SpellType | null;
  readonly hasCastSpellThisTurn?: boolean;
}

export const SpellCardHand: React.FC<ISpellCardHandProps> = ({
  state,
  activePlayer,
  onSelectSpell,
  onCancelSpell,
  selectedSpellType,
  hasCastSpellThisTurn = false,
}) => {
  const isWhite = activePlayer === 'WHITE';
  const currentMana = isWhite ? state.whiteMana : state.blackMana;
  const opponentMana = isWhite ? state.blackMana : state.whiteMana;
  const maxMana = state.maxMana;

  // Global Keyboard Shortcuts (Spec 06 & Spec 12): Keys 1 to 7 for Spells, Escape to Cancel
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (selectedSpellType) {
          e.preventDefault();
          onCancelSpell?.();
          onSelectSpell?.(null);
        }
        return;
      }

      if (hasCastSpellThisTurn) {
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= SPELL_CATALOG.length) {
        const spell = SPELL_CATALOG[num - 1];
        if (spell && currentMana >= spell.manaCost) {
          e.preventDefault();
          onSelectSpell?.(spell);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSpellType, hasCastSpellThisTurn, currentMana, onCancelSpell, onSelectSpell]);

  return (
    <div
      role="region"
      aria-label="Mão de Feitiços - Spell Chess"
      data-testid="spell-card-hand"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.65rem 0.85rem',
        borderRadius: 'var(--radius-lg, 12px)',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(12px)',
        border: selectedSpellType ? '1.5px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: selectedSpellType
          ? '0 0 18px rgba(6, 182, 212, 0.35)'
          : 'var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4))',
        transition: 'all 0.2s ease',
        maxWidth: '100%',
      }}
    >
      {/* Header: Title, Active Mana, Opponent Indicator & Cancel CTA */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#38bdf8',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Reserva de Mana ({isWhite ? 'Brancas' : 'Pretas'}):
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 900,
              color: '#06b6d4',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {currentMana} / {maxMana}
          </span>

          {/* Opponent Mana Indicator */}
          <span
            style={{
              fontSize: '0.66rem',
              color: 'var(--text-muted, #94a3b8)',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              padding: '0.15rem 0.45rem',
              borderRadius: 'var(--radius-sm, 4px)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            Oponente ({isWhite ? 'Pretas' : 'Brancas'}): {opponentMana}/{maxMana} Mana
          </span>

          {hasCastSpellThisTurn && (
            <span
              data-testid="spell-already-cast-badge"
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#f59e0b',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                padding: '0.15rem 0.45rem',
                borderRadius: 'var(--radius-sm, 4px)',
              }}
            >
              Feitiço lançado nesta rodada • Mova uma peça
            </span>
          )}

          {selectedSpellType && (
            <button
              id="btn-cancel-expanded-spell"
              data-testid="btn-cancel-expanded-spell"
              type="button"
              onClick={() => {
                onCancelSpell?.();
                onSelectSpell?.(null);
              }}
              style={{
                padding: '0.2rem 0.6rem',
                fontSize: '0.68rem',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm, 4px)',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                cursor: 'pointer',
              }}
            >
              Cancelar Feitiço (Esc)
            </button>
          )}
        </div>

        {/* Mana Orbs */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          {Array.from({ length: maxMana }).map((_, idx) => {
            const isFilled = idx < currentMana;
            return (
              <span
                key={idx}
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  border: isFilled ? '1px solid #67e8f9' : '1px solid #334155',
                  backgroundColor: isFilled ? '#06b6d4' : '#1e293b',
                  boxShadow: isFilled ? '0 0 8px rgba(6, 182, 212, 0.8)' : 'none',
                  opacity: isFilled ? 1 : 0.4,
                  transition: 'all 0.2s ease',
                }}
                title={isFilled ? 'Mana Ativo' : 'Mana Vazio'}
              />
            );
          })}
        </div>
      </div>

      {/* Spells Cards Reel */}
      <div
        style={{
          display: 'flex',
          gap: '0.45rem',
          overflowX: 'auto',
          paddingBottom: '0.25rem',
        }}
      >
        {SPELL_CATALOG.map((spell, index) => {
          const hotkey = index + 1;
          const canAfford = !hasCastSpellThisTurn && currentMana >= spell.manaCost;
          const isSelected = selectedSpellType === spell.type;

          return (
            <button
              key={spell.id}
              data-testid={`spell-card-${spell.type.toLowerCase()}`}
              type="button"
              disabled={!canAfford}
              onClick={() => canAfford && onSelectSpell?.(spell)}
              style={{
                flexShrink: 0,
                width: '118px',
                padding: '0.45rem',
                borderRadius: 'var(--radius-md, 8px)',
                textAlign: 'left',
                cursor: canAfford ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
                backgroundColor: isSelected
                  ? 'rgba(6, 182, 212, 0.22)'
                  : canAfford
                  ? 'rgba(30, 41, 59, 0.85)'
                  : 'rgba(15, 23, 42, 0.45)',
                border: isSelected
                  ? '1.5px solid #06b6d4'
                  : canAfford
                  ? '1px solid rgba(255, 255, 255, 0.14)'
                  : '1px solid rgba(255, 255, 255, 0.05)',
                opacity: canAfford ? 1 : 0.45,
                transform: isSelected ? 'scale(1.02)' : 'none',
              }}
              aria-label={`${spell.displayName} - Custo: ${spell.manaCost} Mana`}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.25rem',
                }}
              >
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: isSelected ? '#38bdf8' : '#fbbf24',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  [{hotkey}] {spell.type}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '0.1rem 0.35rem',
                    borderRadius: '4px',
                    backgroundColor: canAfford ? 'rgba(6, 182, 212, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                    color: canAfford ? '#67e8f9' : '#64748b',
                    border: canAfford ? '1px solid rgba(6, 182, 212, 0.4)' : 'none',
                  }}
                >
                  {spell.manaCost} Mana
                </span>
              </div>
              <h4
                style={{
                  margin: '0 0 0.15rem 0',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: isSelected ? '#fff' : 'var(--text-prominent, #f8fafc)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {spell.displayName.split(' ')[0]}
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.62rem',
                  lineHeight: '1.25',
                  color: 'var(--text-muted, #94a3b8)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {spell.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

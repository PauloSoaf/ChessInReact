import React from 'react';
import { IOfficialSpellState } from '../../../engine/variants/spells/OfficialSpellEngine';
import { PlayerId } from '../../../core/coordinates/types';

export interface IOfficialSpellBarProps {
  readonly state: IOfficialSpellState;
  readonly activePlayer: PlayerId;
  readonly onCastSpell?: (spellType: 'FREEZE' | 'JUMP') => void;
  readonly selectedSpellType?: 'FREEZE' | 'JUMP' | null;
}

export const OfficialSpellBar: React.FC<IOfficialSpellBarProps> = ({
  state,
  activePlayer,
  onCastSpell,
  selectedSpellType,
}) => {
  const isWhite = activePlayer === 'P1';
  const charges = isWhite ? state.whiteCharges : state.blackCharges;

  return (
    <div
      role="region"
      aria-label="Feitiços Oficiais - Spell Chess (Chess.com)"
      data-testid="official-spell-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '604px',
        padding: '0.55rem 0.85rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-sunken)',
        border: '1px solid #06b6d4',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '0.5rem',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.15rem' }}>❄️</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#06b6d4' }}>
            Spell Chess Oficial (Chess.com)
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
            Turno de {isWhite ? 'Brancas' : 'Pretas'} • 2 Freezes e 2 Jumps por jogo
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* Freeze Button */}
        <button
          type="button"
          onClick={() => onCastSpell?.('FREEZE')}
          disabled={charges.freezeCharges <= 0 || charges.freezeCooldownTurns > 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: selectedSpellType === 'FREEZE' ? '2px solid #06b6d4' : '1px solid var(--border-prominent)',
            backgroundColor: selectedSpellType === 'FREEZE' ? 'rgba(6, 182, 212, 0.2)' : 'var(--bg-elevated)',
            color: 'var(--text-prominent)',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor:
              charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0
                ? 'pointer'
                : 'not-allowed',
            opacity: charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0 ? 1 : 0.45,
          }}
        >
          <span>❄️ Congelar 3×3</span>
          <span style={{ fontSize: '0.7rem', color: '#06b6d4' }}>
            ({charges.freezeCharges}/2
            {charges.freezeCooldownTurns > 0 ? ` • CD: ${charges.freezeCooldownTurns}` : ''})
          </span>
        </button>

        {/* Jump Button */}
        <button
          type="button"
          onClick={() => onCastSpell?.('JUMP')}
          disabled={charges.jumpCharges <= 0 || charges.jumpCooldownTurns > 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.35rem 0.65rem',
            borderRadius: 'var(--radius-sm)',
            border: selectedSpellType === 'JUMP' ? '2px solid #a855f7' : '1px solid var(--border-prominent)',
            backgroundColor: selectedSpellType === 'JUMP' ? 'rgba(168, 85, 247, 0.2)' : 'var(--bg-elevated)',
            color: 'var(--text-prominent)',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor:
              charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0
                ? 'pointer'
                : 'not-allowed',
            opacity: charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0 ? 1 : 0.45,
          }}
        >
          <span>⚡ Salto (Jump)</span>
          <span style={{ fontSize: '0.7rem', color: '#a855f7' }}>
            ({charges.jumpCharges}/2
            {charges.jumpCooldownTurns > 0 ? ` • CD: ${charges.jumpCooldownTurns}` : ''})
          </span>
        </button>
      </div>
    </div>
  );
};

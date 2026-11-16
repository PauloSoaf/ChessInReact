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
      id="official-spell-bar"
      role="region"
      aria-label="Feitiços Oficiais - Spell Chess (Chess.com)"
      data-testid="official-spell-bar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '604px',
        padding: '0.65rem 0.95rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-sunken)',
        border: '2px solid #06b6d4',
        boxShadow: selectedSpellType ? '0 0 12px rgba(6, 182, 212, 0.4)' : 'var(--shadow-sm)',
        marginBottom: '0.5rem',
        gap: '0.5rem',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🧙‍♂️</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#06b6d4', letterSpacing: '0.02em' }}>
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
            id="btn-cast-freeze"
            data-testid="btn-cast-freeze"
            type="button"
            onClick={() => onCastSpell?.('FREEZE')}
            disabled={charges.freezeCharges <= 0 || charges.freezeCooldownTurns > 0}
            title={
              charges.freezeCharges <= 0
                ? 'Sem cargas de Congelamento'
                : charges.freezeCooldownTurns > 0
                  ? `Recarga em andamento: ${charges.freezeCooldownTurns} turno(s)`
                  : 'Clique para selecionar e depois clique na casa central 3×3 no tabuleiro'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: selectedSpellType === 'FREEZE' ? '2px solid #06b6d4' : '1px solid var(--border-prominent)',
              backgroundColor: selectedSpellType === 'FREEZE' ? 'rgba(6, 182, 212, 0.25)' : 'var(--bg-elevated)',
              color: 'var(--text-prominent)',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor:
                charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0
                  ? 'pointer'
                  : 'not-allowed',
              opacity: charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0 ? 1 : 0.45,
              boxShadow: selectedSpellType === 'FREEZE' ? '0 0 8px #06b6d4' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>❄️ Freeze (3×3)</span>
            <span style={{ fontSize: '0.72rem', color: '#06b6d4', fontWeight: 700 }}>
              [{charges.freezeCharges}/2
              {charges.freezeCooldownTurns > 0 ? ` • CD: ${charges.freezeCooldownTurns}` : ''}]
            </span>
          </button>

          {/* Jump Button */}
          <button
            id="btn-cast-jump"
            data-testid="btn-cast-jump"
            type="button"
            onClick={() => onCastSpell?.('JUMP')}
            disabled={charges.jumpCharges <= 0 || charges.jumpCooldownTurns > 0}
            title={
              charges.jumpCharges <= 0
                ? 'Sem cargas de Salto'
                : charges.jumpCooldownTurns > 0
                  ? `Recarga em andamento: ${charges.jumpCooldownTurns} turno(s)`
                  : 'Clique para selecionar e depois clique na sua peça aliada no tabuleiro'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.8rem',
              borderRadius: 'var(--radius-sm)',
              border: selectedSpellType === 'JUMP' ? '2px solid #a855f7' : '1px solid var(--border-prominent)',
              backgroundColor: selectedSpellType === 'JUMP' ? 'rgba(168, 85, 247, 0.25)' : 'var(--bg-elevated)',
              color: 'var(--text-prominent)',
              fontSize: '0.8rem',
              fontWeight: 800,
              cursor:
                charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0
                  ? 'pointer'
                  : 'not-allowed',
              opacity: charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0 ? 1 : 0.45,
              boxShadow: selectedSpellType === 'JUMP' ? '0 0 8px #a855f7' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span>⚡ Jump (Salto)</span>
            <span style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 700 }}>
              [{charges.jumpCharges}/2
              {charges.jumpCooldownTurns > 0 ? ` • CD: ${charges.jumpCooldownTurns}` : ''}]
            </span>
          </button>
        </div>
      </div>

      {selectedSpellType && (
        <div
          data-testid="official-spell-instruction"
          style={{
            fontSize: '0.72rem',
            color: selectedSpellType === 'FREEZE' ? '#06b6d4' : '#a855f7',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            padding: '0.25rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
            textAlign: 'center',
            fontWeight: 600,
          }}
        >
          {selectedSpellType === 'FREEZE'
            ? '🎯 Alvo de Freeze ativado: Clique no tabuleiro para congelar a área 3×3 (ou clique no botão novamente).'
            : '🎯 Alvo de Jump ativado: Clique em uma peça sua no tabuleiro para conceder salto de cavalo.'}
        </div>
      )}
    </div>
  );
};


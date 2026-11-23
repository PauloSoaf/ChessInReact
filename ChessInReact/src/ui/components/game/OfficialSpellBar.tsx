import React from 'react';
import { IOfficialSpellState } from '../../../engine/variants/spells/OfficialSpellEngine';
import { PlayerId } from '../../../core/coordinates/types';
import { globalAudioSynthesizer } from '../../../audio/WebAudioSynthesizer';
import { IconClock } from '../../icons/AppIcons';

export interface IOfficialSpellBarProps {
  readonly state: IOfficialSpellState;
  readonly activePlayer: PlayerId;
  readonly onCastSpell?: (spellType: 'FREEZE' | 'JUMP') => void;
  readonly onCancelSpell?: () => void;
  readonly selectedSpellType?: 'FREEZE' | 'JUMP' | null;
  readonly compact?: boolean;
  readonly hasCastSpellThisTurn?: boolean;
}

export const OfficialSpellBar: React.FC<IOfficialSpellBarProps> = ({
  state,
  activePlayer,
  onCastSpell,
  onCancelSpell,
  selectedSpellType,
  compact = false,
  hasCastSpellThisTurn = false,
}) => {
  const isWhite = activePlayer === 'P1' || (activePlayer as string) === 'WHITE';
  const charges = isWhite ? state.whiteCharges : state.blackCharges;
  const oppCharges = isWhite ? state.blackCharges : state.whiteCharges;

  // Global Keyboard Shortcuts (Spec 06 & Spec 12): 1 for Freeze, 2 for Jump, Esc to Cancel
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (hasCastSpellThisTurn) {
        return;
      }

      if (e.key === '1') {
        if (charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0) {
          e.preventDefault();
          onCastSpell?.('FREEZE');
        }
      } else if (e.key === '2') {
        if (charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0) {
          e.preventDefault();
          onCastSpell?.('JUMP');
        }
      } else if (e.key === 'Escape') {
        if (selectedSpellType) {
          e.preventDefault();
          onCancelSpell?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    charges.freezeCharges,
    charges.freezeCooldownTurns,
    charges.jumpCharges,
    charges.jumpCooldownTurns,
    selectedSpellType,
    hasCastSpellThisTurn,
    onCastSpell,
    onCancelSpell,
  ]);

  const isFreezeAvailable = !hasCastSpellThisTurn && charges.freezeCharges > 0 && charges.freezeCooldownTurns === 0;
  const isJumpAvailable = !hasCastSpellThisTurn && charges.jumpCharges > 0 && charges.jumpCooldownTurns === 0;

  return (
    <div
      id="official-spell-bar"
      role="region"
      aria-label="Feitiços Oficiais - Spell Chess"
      data-testid="official-spell-bar"
      style={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        width: compact ? 'auto' : '100%',
        maxWidth: compact ? 'none' : '548px',
        padding: compact ? '0' : '0.45rem 0.75rem',
        borderRadius: 'var(--radius-md, 8px)',
        backgroundColor: compact ? 'transparent' : 'rgba(15, 23, 42, 0.92)',
        backdropFilter: compact ? 'none' : 'blur(10px)',
        border: compact ? 'none' : (selectedSpellType ? '1.5px solid #06b6d4' : '1px solid rgba(255, 255, 255, 0.1)'),
        boxShadow: compact ? 'none' : (selectedSpellType ? '0 0 16px rgba(6, 182, 212, 0.35)' : 'var(--shadow-sm, 0 2px 4px rgba(0,0,0,0.3))'),
        gap: '0.4rem',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header: Title and Opponent Inventory preview */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: '#38bdf8',
                fontFamily: 'var(--font-sans, Inter, sans-serif)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Spell Chess
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono, monospace)',
                color: 'var(--text-muted, #94a3b8)',
                backgroundColor: 'rgba(255,255,255,0.06)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              Vez: {isWhite ? 'Brancas' : 'Pretas'}
            </span>
          </div>

          {/* Opponent Potion Inventory Pill (small corner badges like Chess.com) */}
          <div
            title={`Oponente (${isWhite ? 'Pretas' : 'Brancas'}): ${oppCharges.jumpCharges} Salto(s), ${oppCharges.freezeCharges} Congelamento(s)`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.68rem',
              color: 'var(--text-muted, #94a3b8)',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '2px 8px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Oponente:
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#4ade80' }}>
              Salto x{oppCharges.jumpCharges}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#38bdf8' }}>
              Freeze x{oppCharges.freezeCharges}
            </span>
          </div>
        </div>
      )}

      {/* Main Spell Deck: Sleek Compact Potion Cards matching Chess.com */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '0.65rem',
          flexWrap: 'wrap',
        }}
      >
        {/* GREEN JUMP POTION CARD (Atalho: 2) */}
        <button
          id="btn-cast-jump"
          data-testid="btn-cast-jump"
          type="button"
          onClick={() => {
            globalAudioSynthesizer.playTactileClick();
            onCastSpell?.('JUMP');
          }}
          disabled={!isJumpAvailable}
          title={
            hasCastSpellThisTurn
              ? 'Você já lançou um feitiço nesta rodada. Mova uma peça no tabuleiro para concluir o turno.'
              : charges.jumpCharges <= 0
                ? 'Sem cargas restantes de Salto (Jump)'
                : charges.jumpCooldownTurns > 0
                  ? `Salto em recarga (${charges.jumpCooldownTurns} turno(s) restante(s))`
                  : 'Salto (Jump): Concede permissão para saltar por cima de uma peça no tabuleiro (Atalho: tecla 2)'
          }
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: compact ? '48px' : '64px',
            height: compact ? '44px' : '58px',
            padding: '3px',
            borderRadius: '8px',
            border:
              selectedSpellType === 'JUMP'
                ? '2px solid #22c55e'
                : isJumpAvailable
                  ? '1.5px solid rgba(34, 197, 94, 0.45)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor:
              selectedSpellType === 'JUMP'
                ? 'rgba(34, 197, 94, 0.28)'
                : isJumpAvailable
                  ? 'rgba(20, 83, 45, 0.35)'
                  : 'rgba(15, 23, 42, 0.6)',
            boxShadow:
              selectedSpellType === 'JUMP'
                ? '0 0 14px rgba(34, 197, 94, 0.6), inset 0 0 8px rgba(34, 197, 94, 0.3)'
                : isJumpAvailable
                  ? '0 2px 6px rgba(0, 0, 0, 0.35)'
                  : 'none',
            cursor: isJumpAvailable ? 'pointer' : 'not-allowed',
            opacity: isJumpAvailable ? 1 : 0.4,
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: selectedSpellType === 'JUMP' ? 'scale(1.04)' : 'scale(1)',
            userSelect: 'none',
          }}
        >
          {/* Green Magic Flask SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M10 2H14M12 2V8M8.5 20H15.5C17.5 20 18.5 18.5 17.5 16.5L14 9.5C13.6 8.7 13.5 8 13.5 7.5V4H10.5V7.5C10.5 8 10.4 8.7 10 9.5L6.5 16.5C5.5 18.5 6.5 20 8.5 20Z"
              stroke="#22c55e"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7.8 17.5L9.5 14C10.5 14.5 13.5 14.5 14.5 14L16.2 17.5C16.8 18.8 16 19.5 15 19.5H9C8 19.5 7.2 18.8 7.8 17.5Z"
              fill="#22c55e"
              fillOpacity="0.75"
            />
            <circle cx="11" cy="16.5" r="1" fill="#bbf7d0" />
            <circle cx="13.5" cy="17.5" r="0.75" fill="#bbf7d0" />
          </svg>

          {/* Spell Name & Shortcut */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
            <kbd
              style={{
                fontSize: '0.58rem',
                padding: '0 3px',
                borderRadius: '2px',
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#86efac',
                fontFamily: 'monospace',
              }}
            >
              2
            </kbd>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#86efac' }}>Salto</span>
          </div>

          {/* Charge Badge (Top-Right, matching Chess.com `x2`) */}
          <div
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#15803d',
              color: '#f0fdf4',
              fontSize: '0.62rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '8px',
              border: '1.5px solid #22c55e',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              letterSpacing: '0.02em',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            x{charges.jumpCharges}
          </div>

          {/* Cooldown Overlay or Cast Status */}
          {charges.jumpCooldownTurns > 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(3px)',
                border: '1.5px solid rgba(251, 191, 36, 0.7)',
                zIndex: 4,
              }}
            >
              <span
                style={{
                  fontSize: compact ? '0.66rem' : '0.74rem',
                  color: '#fef08a',
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono, monospace)',
                  lineHeight: 1.1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <IconClock size={compact ? 10 : 12} color="#fef08a" />
                {charges.jumpCooldownTurns}{compact ? 'T' : ' rodadas'}
              </span>
              <span
                style={{
                  fontSize: compact ? '0.50rem' : '0.58rem',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Espera
              </span>
            </div>
          ) : hasCastSpellThisTurn ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '8px',
                backgroundColor: 'rgba(5, 46, 22, 0.82)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(2px)',
                border: '1.5px solid rgba(34, 197, 94, 0.6)',
                zIndex: 4,
              }}
            >
              <span
                style={{
                  fontSize: compact ? '0.58rem' : '0.66rem',
                  color: '#86efac',
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                ✓ Ativo
              </span>
              <span
                style={{
                  fontSize: compact ? '0.48rem' : '0.54rem',
                  color: '#bbf7d0',
                }}
              >
                mova
              </span>
            </div>
          ) : null}
        </button>

        {/* BLUE FREEZE FLASK CARD (Atalho: 1) */}
        <button
          id="btn-cast-freeze"
          data-testid="btn-cast-freeze"
          type="button"
          onClick={() => {
            globalAudioSynthesizer.playTactileClick();
            onCastSpell?.('FREEZE');
          }}
          disabled={!isFreezeAvailable}
          title={
            hasCastSpellThisTurn
              ? 'Você já lançou um feitiço nesta rodada. Mova uma peça no tabuleiro para concluir o turno.'
              : charges.freezeCharges <= 0
                ? 'Sem cargas restantes de Congelamento (Freeze)'
                : charges.freezeCooldownTurns > 0
                  ? `Congelamento em recarga (${charges.freezeCooldownTurns} turno(s) restante(s))`
                  : 'Congelamento (Freeze): Congela uma área 3×3 impedindo o movimento por 1 turno (Atalho: tecla 1)'
          }
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: compact ? '48px' : '64px',
            height: compact ? '44px' : '58px',
            padding: '3px',
            borderRadius: '8px',
            border:
              selectedSpellType === 'FREEZE'
                ? '2px solid #06b6d4'
                : isFreezeAvailable
                  ? '1.5px solid rgba(6, 182, 212, 0.45)'
                  : '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor:
              selectedSpellType === 'FREEZE'
                ? 'rgba(6, 182, 212, 0.28)'
                : isFreezeAvailable
                  ? 'rgba(8, 51, 68, 0.35)'
                  : 'rgba(15, 23, 42, 0.6)',
            boxShadow:
              selectedSpellType === 'FREEZE'
                ? '0 0 14px rgba(6, 182, 212, 0.6), inset 0 0 8px rgba(6, 182, 212, 0.3)'
                : isFreezeAvailable
                  ? '0 2px 6px rgba(0, 0, 0, 0.35)'
                  : 'none',
            cursor: isFreezeAvailable ? 'pointer' : 'not-allowed',
            opacity: isFreezeAvailable ? 1 : 0.4,
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: selectedSpellType === 'FREEZE' ? 'scale(1.04)' : 'scale(1)',
            userSelect: 'none',
          }}
        >
          {/* Icy Crystal Flask SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 2H15M10.5 2V5H13.5V2M9.5 5H14.5L17.5 9.5V18.5C17.5 19.5 16.5 20.5 15.5 20.5H8.5C7.5 20.5 6.5 19.5 6.5 18.5V9.5L9.5 5Z"
              stroke="#06b6d4"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7.5 12H16.5V18.5C16.5 19.5 15.5 20.5 14.5 20.5H9.5C8.5 20.5 7.5 19.5 7.5 18.5V12Z"
              fill="#06b6d4"
              fillOpacity="0.75"
            />
            <line x1="12" y1="13.5" x2="12" y2="18.5" stroke="#e0f2fe" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="9.5" y1="16" x2="14.5" y2="16" stroke="#e0f2fe" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="10.2" y1="14.2" x2="13.8" y2="17.8" stroke="#e0f2fe" strokeWidth="1" strokeLinecap="round" />
            <line x1="13.8" y1="14.2" x2="10.2" y2="17.8" stroke="#e0f2fe" strokeWidth="1" strokeLinecap="round" />
          </svg>

          {/* Spell Name & Shortcut */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
            <kbd
              style={{
                fontSize: '0.58rem',
                padding: '0 3px',
                borderRadius: '2px',
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#67e8f9',
                fontFamily: 'monospace',
              }}
            >
              1
            </kbd>
            <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#67e8f9' }}>Freeze</span>
          </div>

          {/* Charge Badge (Top-Right, matching Chess.com `x5`) */}
          <div
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              backgroundColor: '#0e7490',
              color: '#ecfeff',
              fontSize: '0.62rem',
              fontWeight: 800,
              padding: '1px 5px',
              borderRadius: '8px',
              border: '1.5px solid #06b6d4',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              letterSpacing: '0.02em',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            x{charges.freezeCharges}
          </div>

          {/* Cooldown Overlay or Cast Status */}
          {charges.freezeCooldownTurns > 0 ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '8px',
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(3px)',
                border: '1.5px solid rgba(251, 191, 36, 0.7)',
                zIndex: 4,
              }}
            >
              <span
                style={{
                  fontSize: compact ? '0.66rem' : '0.74rem',
                  color: '#fef08a',
                  fontWeight: 900,
                  fontFamily: 'var(--font-mono, monospace)',
                  lineHeight: 1.1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                }}
              >
                <IconClock size={compact ? 10 : 12} color="#fef08a" />
                {charges.freezeCooldownTurns}{compact ? 'T' : ' rodadas'}
              </span>
              <span
                style={{
                  fontSize: compact ? '0.50rem' : '0.58rem',
                  color: '#cbd5e1',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Espera
              </span>
            </div>
          ) : hasCastSpellThisTurn ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '8px',
                backgroundColor: 'rgba(5, 46, 22, 0.82)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(2px)',
                border: '1.5px solid rgba(34, 197, 94, 0.6)',
                zIndex: 4,
              }}
            >
              <span
                style={{
                  fontSize: compact ? '0.58rem' : '0.66rem',
                  color: '#86efac',
                  fontWeight: 800,
                  lineHeight: 1.1,
                }}
              >
                ✓ Ativo
              </span>
              <span
                style={{
                  fontSize: compact ? '0.48rem' : '0.54rem',
                  color: '#bbf7d0',
                }}
              >
                mova
              </span>
            </div>
          ) : null}
        </button>

        {/* Selected Spell Targeting Details & Cancel Button */}
        {selectedSpellType && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              minWidth: '200px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              padding: '0.35rem 0.6rem',
              borderRadius: '6px',
              border: '1px dashed rgba(255,255,255,0.18)',
            }}
          >
            <div
              data-testid="official-spell-instruction"
              style={{
                fontSize: '0.72rem',
                color: selectedSpellType === 'FREEZE' ? '#38bdf8' : '#4ade80',
                fontWeight: 600,
                flex: 1,
              }}
            >
              {selectedSpellType === 'FREEZE'
                ? 'Freeze ativado: Clique na casa central 3×3 no tabuleiro.'
                : 'Salto ativado: Clique na peça que você deseja pular.'}
            </div>

            <button
              id="btn-cancel-official-spell"
              data-testid="btn-cancel-official-spell"
              type="button"
              onClick={onCancelSpell}
              title="Cancelar feitiço (Esc)"
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                color: '#fca5a5',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              ✕ Cancelar (Esc)
            </button>
          </div>
        )}

        {/* Has Cast Spell This Turn Status Chip */}
        {hasCastSpellThisTurn && (
          <div
            data-testid="spell-turn-completed-chip"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '0.25rem 0.6rem',
              borderRadius: '6px',
              fontSize: '0.68rem',
              color: '#7dd3fc',
              fontWeight: 500,
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
          >
            <span>Feitiço conjurado nesta rodada. Faça seu lance no tabuleiro para passar a vez.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export interface IOpponentSpellDeckProps {
  readonly state: IOfficialSpellState;
  readonly activePlayer: PlayerId;
}

export const OpponentSpellDeck: React.FC<IOpponentSpellDeckProps> = ({ state, activePlayer }) => {
  const isWhite = activePlayer === 'P1' || (activePlayer as string) === 'WHITE';
  const oppCharges = isWhite ? state.blackCharges : state.whiteCharges;

  return (
    <div
      aria-label="Feitiços do Oponente"
      data-testid="opponent-spell-deck"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 6px',
        borderRadius: '8px',
        backgroundColor: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        userSelect: 'none',
      }}
    >
      {/* Jump flask preview */}
      <div
        title={
          oppCharges.jumpCooldownTurns > 0
            ? `Oponente: Salto em recarga (${oppCharges.jumpCooldownTurns} rodadas restantes)`
            : `Oponente: ${oppCharges.jumpCharges} Salto(s)`
        }
        style={{
          position: 'relative',
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          backgroundColor: 'rgba(20, 83, 45, 0.35)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M10 2H14M12 2V8M8.5 20H15.5C17.5 20 18.5 18.5 17.5 16.5L14 9.5C13.6 8.7 13.5 8 13.5 7.5V4H10.5V7.5C10.5 8 10.4 8.7 10 9.5L6.5 16.5C5.5 18.5 6.5 20 8.5 20Z"
            stroke="#22c55e"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            backgroundColor: oppCharges.jumpCooldownTurns > 0 ? '#b45309' : '#15803d',
            color: '#f0fdf4',
            fontSize: '0.58rem',
            fontWeight: 800,
            padding: '0 3px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '1px',
          }}
        >
          {oppCharges.jumpCooldownTurns > 0 ? (
            <>
              <IconClock size={8} color="#fef08a" />
              {oppCharges.jumpCooldownTurns}T
            </>
          ) : (
            `x${oppCharges.jumpCharges}`
          )}
        </span>
      </div>

      {/* Freeze flask preview */}
      <div
        title={
          oppCharges.freezeCooldownTurns > 0
            ? `Oponente: Congelamento em recarga (${oppCharges.freezeCooldownTurns} rodadas restantes)`
            : `Oponente: ${oppCharges.freezeCharges} Congelamento(s)`
        }
        style={{
          position: 'relative',
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          backgroundColor: 'rgba(8, 51, 68, 0.35)',
          border: '1px solid rgba(6, 182, 212, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d="M9 2H15M10.5 2V5H13.5V2M9.5 5H14.5L17.5 9.5V18.5C17.5 19.5 16.5 20.5 15.5 20.5H8.5C7.5 20.5 6.5 19.5 6.5 18.5V9.5L9.5 5Z"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            backgroundColor: oppCharges.freezeCooldownTurns > 0 ? '#b45309' : '#0e7490',
            color: '#ecfeff',
            fontSize: '0.58rem',
            fontWeight: 800,
            padding: '0 3px',
            borderRadius: '6px',
            fontFamily: 'monospace',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '1px',
          }}
        >
          {oppCharges.freezeCooldownTurns > 0 ? (
            <>
              <IconClock size={8} color="#fef08a" />
              {oppCharges.freezeCooldownTurns}T
            </>
          ) : (
            `x${oppCharges.freezeCharges}`
          )}
        </span>
      </div>
    </div>
  );
};

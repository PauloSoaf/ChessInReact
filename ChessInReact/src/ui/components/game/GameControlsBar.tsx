import React from 'react';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';
import { ActionButton } from '../primitives/ActionButton';
import { Card } from '../primitives/Card';

export interface IGameControlsBarProps {
  isBotEnabled: boolean;
  difficulty: AIDifficultyLevel;
  isThinking: boolean;
  lastEval: number | null;
  boardSize: number;
  onToggleBot: (enabled: boolean) => void;
  onSetDifficulty: (level: AIDifficultyLevel) => void;
  onBoardSizeChange: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onOpenThemeModal: () => void;
  onFlipBoard?: () => void;
  isBoardFlipped?: boolean;
  boardViewMode?: '2D' | '3D';
  onToggleBoardViewMode?: (mode: '2D' | '3D') => void;
}

export const GameControlsBar: React.FC<IGameControlsBarProps> = ({
  isBotEnabled,
  difficulty,
  lastEval,
  boardSize,
  onToggleBot,
  onSetDifficulty,
  onBoardSizeChange,
  onUndo,
  onRedo,
  onReset,
  onOpenThemeModal,
  onFlipBoard,
  isBoardFlipped = false,
  boardViewMode = '2D',
  onToggleBoardViewMode,
}) => {
  const formattedEval =
    lastEval !== null ? `${lastEval > 0 ? '+' : ''}${(lastEval / 100).toFixed(2)}` : '0.00';

  return (
    <Card
      id="bot-controls"
      variant="elevated"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.15rem 1.25rem',
        border: '1px solid var(--border-prominent)',
      }}
    >
      {/* Section 1: Move History & Flow Controls (Undo / Redo) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--text-muted)',
            }}
          >
            Histórico de Lances
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            Atalhos: Z / Y
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <ActionButton
            id="bot-undo-button"
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Desfazer"
            onClick={onUndo}
            leadingIcon={
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 6L3 10l4 4M3 10h10a4 4 0 014 4v1" />
              </svg>
            }
          >
            Desfazer
          </ActionButton>

          <ActionButton
            id="bot-redo-button"
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Refazer"
            onClick={onRedo}
            leadingIcon={
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 6l4 4-4 4M17 10H7a4 4 0 00-4 4v1" />
              </svg>
            }
          >
            Refazer
          </ActionButton>
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Section 2: AI Opponent Configuration */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.7rem',
          backgroundColor: 'var(--bg-sunken)',
          padding: '0.85rem 0.95rem',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.55rem',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.84rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-primary)',
              userSelect: 'none',
            }}
          >
            <input
              id="bot-toggle-checkbox"
              type="checkbox"
              checked={isBotEnabled}
              onChange={(e) => onToggleBot(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                cursor: 'pointer',
                accentColor: 'var(--color-accent)',
                borderRadius: 'var(--radius-xs)',
              }}
            />
            <span>Oponente IA (Pretas)</span>
          </label>

          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: isBotEnabled ? 'var(--color-accent)' : 'var(--text-muted)',
              padding: '0.15rem 0.45rem',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: isBotEnabled ? 'var(--color-accent-subtle)' : 'transparent',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {isBotEnabled ? `Aval: ${formattedEval}` : '2 Jogadores'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <label
            htmlFor="bot-difficulty-select"
            style={{
              fontSize: '0.76rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              color: 'var(--text-secondary)',
            }}
          >
            Nível:
          </label>
          <select
            id="bot-difficulty-select"
            value={difficulty}
            disabled={!isBotEnabled}
            onChange={(e) => onSetDifficulty(Number(e.target.value) as AIDifficultyLevel)}
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              color: isBotEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--border-prominent)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.34rem 0.6rem',
              fontSize: '0.76rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              cursor: isBotEnabled ? 'pointer' : 'not-allowed',
              opacity: isBotEnabled ? 1 : 0.6,
              outline: 'none',
            }}
          >
            <option value={1}>N1 — Iniciante</option>
            <option value={2}>N2 — Casual</option>
            <option value={3}>N3 — Tático</option>
            <option value={4}>N4 — Forte</option>
            <option value={5}>N5 — Mestre</option>
          </select>
        </div>
      </div>

      {/* Section 3: Board Orientation, Grid Dimension & Visual Themes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              backgroundColor: 'var(--bg-sunken)',
              padding: '0.3rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <label
              htmlFor="board-size-input"
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
              }}
            >
              Grade:
            </label>
            <input
              id="board-size-input"
              type="number"
              min={4}
              max={16}
              value={boardSize}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  onBoardSizeChange(val);
                }
              }}
              style={{
                width: '46px',
                backgroundColor: 'var(--bg-surface-elevated)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.2rem 0.35rem',
                fontSize: '0.76rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            {onToggleBoardViewMode && (
              <div
                style={{
                  display: 'inline-flex',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  id="board-view-mode-2d"
                  type="button"
                  onClick={() => onToggleBoardViewMode('2D')}
                  title="Modo 2D Clássico / Vetorial (Spec 06)"
                  style={{
                    padding: '0.36rem 0.62rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: boardViewMode === '2D' ? 'var(--color-accent)' : 'var(--bg-card)',
                    color: boardViewMode === '2D' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  2D
                </button>
                <button
                  id="board-view-mode-3d"
                  type="button"
                  onClick={() => onToggleBoardViewMode('3D')}
                  title="Modo 3D WebGL / Three.js (Spec 07)"
                  style={{
                    padding: '0.36rem 0.62rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    backgroundColor: boardViewMode === '3D' ? 'var(--color-accent)' : 'var(--bg-card)',
                    color: boardViewMode === '3D' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    borderLeft: '1px solid var(--border-subtle)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  3D WebGL
                </button>
              </div>
            )}

            {onFlipBoard && (
              <button
                id="bot-flip-board-button"
                type="button"
                className="ui-btn ui-btn--secondary"
                onClick={onFlipBoard}
                title="Inverter perspectiva do tabuleiro"
                style={{
                  padding: '0.38rem 0.68rem',
                  fontSize: '0.76rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: isBoardFlipped ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                  color: isBoardFlipped ? 'var(--color-accent)' : 'var(--text-secondary)',
                  border: isBoardFlipped ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10a6 6 0 0110.24-4.24L16 7M16 3v4h-4M16 10a6 6 0 01-10.24 4.24L4 13M4 17v-4h4" />
                </svg>
                <span>Inverter</span>
              </button>
            )}

            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={onOpenThemeModal}
              title="Abrir personalização de temas, tabuleiros e peças"
              style={{
                padding: '0.38rem 0.68rem',
                fontSize: '0.76rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="7.5" r="1.5" />
                <circle cx="12.5" cy="7.5" r="1.5" />
                <circle cx="10" cy="12.5" r="1.5" />
                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
              <span>Temas</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Section 4: Separated Cautionary Reset Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          Reiniciar posição inicial
        </span>
        <ActionButton
          id="bot-reset-button"
          type="button"
          variant="danger"
          size="sm"
          aria-label="Reiniciar Partida"
          onClick={onReset}
          leadingIcon={
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        >
          Reiniciar Partida
        </ActionButton>
      </div>
    </Card>
  );
};

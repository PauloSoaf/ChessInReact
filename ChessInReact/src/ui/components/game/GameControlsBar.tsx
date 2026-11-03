import React from 'react';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';

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
}

export const GameControlsBar: React.FC<IGameControlsBarProps> = ({
  isBotEnabled,
  difficulty,
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
}) => {
  return (
    <div
      id="bot-controls"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        backgroundColor: 'var(--bg-surface-elevated)',
        padding: '1rem 1.5rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-prominent)',
        boxShadow: 'var(--shadow-md)',
        transition: 'all var(--transition-normal)',
      }}
    >
      {/* Top Row: AI Engine Controls & Quick Toggles */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          {/* Bot Toggle Checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
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
                width: '17px',
                height: '17px',
                cursor: 'pointer',
                accentColor: 'var(--color-accent)',
                borderRadius: 'var(--radius-xs)',
              }}
            />
            <span>Oponente IA (Pretas - P2)</span>
          </label>

          {/* Difficulty Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <label
              htmlFor="bot-difficulty-select"
              style={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                color: 'var(--text-muted)',
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
                backgroundColor: 'var(--bg-app)',
                color: isBotEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.65rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                cursor: isBotEnabled ? 'pointer' : 'not-allowed',
                opacity: isBotEnabled ? 1 : 0.6,
                outline: 'none',
              }}
            >
              <option value={1}>D1 — Iniciante (1 ply)</option>
              <option value={2}>D2 — Casual (2 plies)</option>
              <option value={3}>D3 — Intermediário (3 plies)</option>
              <option value={4}>D4 — Avançado (4 plies)</option>
              <option value={5}>D5 — Mestre (5+ plies)</option>
            </select>
          </div>

          {/* Board Topology Size Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <label
              htmlFor="board-size-input"
              style={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                color: 'var(--text-muted)',
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
                if (!isNaN(val) && val >= 4 && val <= 16) {
                  onBoardSizeChange(val);
                }
              }}
              style={{
                width: '54px',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.35rem 0.5rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textAlign: 'center',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tactical Quick Toggles: Flip & Themes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {onFlipBoard && (
            <button
              type="button"
              onClick={onFlipBoard}
              title="Girar perspectiva do tabuleiro em 180°"
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: isBoardFlipped ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                color: isBoardFlipped ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: isBoardFlipped ? '1px solid var(--border-active)' : '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10a6 6 0 0110.24-4.24L16 7M16 3v4h-4M16 10a6 6 0 01-10.24 4.24L4 13M4 17v-4h4" />
              </svg>
              <span>Inverter Visão</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenThemeModal}
            title="Abrir personalização de temas, tabuleiros e peças"
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-fast)',
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
            <span>Temas & Visual</span>
          </button>
        </div>
      </div>

      {/* Bottom Command Buttons: Undo, Redo, Reset */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.75rem',
          paddingTop: '0.25rem',
        }}
      >
        <button
          id="bot-undo-button"
          type="button"
          aria-label="Undo"
          onClick={onUndo}
          style={{
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 6L3 10l4 4M3 10h10a4 4 0 014 4v1" />
          </svg>
          <span>Undo</span>
        </button>

        <button
          id="bot-redo-button"
          type="button"
          aria-label="Redo"
          onClick={onRedo}
          style={{
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 6l4 4-4 4M17 10H7a4 4 0 00-4 4v1" />
          </svg>
          <span>Redo</span>
        </button>

        <button
          id="bot-reset-button"
          type="button"
          aria-label="Reset Match"
          onClick={onReset}
          style={{
            padding: '0.625rem 1rem',
            fontSize: '0.875rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: 'var(--color-accent)',
            color: 'var(--text-inverse)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Reset Match</span>
        </button>
      </div>
    </div>
  );
};

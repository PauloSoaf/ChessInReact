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
  isThinking,
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
}) => {
  return (
    <div
      id="bot-controls"
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        backgroundColor: 'var(--bg-surface-elevated)',
        padding: '0.875rem 1.25rem',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all var(--transition-normal)',
      }}
    >
      {/* Top Row: AI Opponent, Difficulty, Engine Status Badge */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Bot Toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.875rem',
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
              }}
            />
            <span>Oponente IA (Pretas - P2)</span>
          </label>

          {/* Difficulty Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <label htmlFor="bot-difficulty-select" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Nível:
            </label>
            <select
              id="bot-difficulty-select"
              value={difficulty}
              disabled={!isBotEnabled}
              onChange={(e) => onSetDifficulty(Number(e.target.value) as AIDifficultyLevel)}
              style={{
                backgroundColor: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: isBotEnabled ? 'pointer' : 'not-allowed',
                opacity: isBotEnabled ? 1 : 0.6,
              }}
            >
              <option value={1}>1 - Novato (D1)</option>
              <option value={2}>2 - Casual (D2)</option>
              <option value={3}>3 - Intermediário (D3)</option>
              <option value={4}>4 - Avançado (D4)</option>
              <option value={5}>5 - Mestre (D5)</option>
            </select>
          </div>
        </div>

        {/* Engine Status Badge & Eval */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span
            id="bot-status-badge"
            className={isThinking ? 'animate-pulse-turn' : ''}
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: isThinking ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-card)',
              color: isThinking ? '#f59e0b' : 'var(--text-secondary)',
              border: `1px solid ${isThinking ? 'rgba(245, 158, 11, 0.4)' : 'var(--border-subtle)'}`,
            }}
          >
            {isThinking ? '⚡ 🤖 Calculando...' : 'Pronto (Ocioso)'}
          </span>

          {lastEval !== null && (
            <span
              id="bot-eval-badge"
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-accent)',
                fontFamily: 'monospace',
                fontWeight: 700,
                padding: '0.2rem 0.5rem',
                backgroundColor: 'var(--color-accent-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Eval: {lastEval > 0 ? `+${(lastEval / 100).toFixed(2)}` : (lastEval / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Middle Row: Dimension Selector & Visual Settings Quick Access */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingTop: '0.5rem',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="board-size-input" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Dimensão do Tabuleiro:
          </label>
          <input
            id="board-size-input"
            type="number"
            min={4}
            max={16}
            value={boardSize}
            onChange={(e) => onBoardSizeChange(Number(e.target.value) || 8)}
            style={{
              width: '4rem',
              height: '1.85rem',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              textAlign: 'center',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            ({boardSize}×{boardSize})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {onFlipBoard && (
            <button
              type="button"
              onClick={onFlipBoard}
              title="Girar perspectiva do tabuleiro em 180°"
              style={{
                padding: '0.3rem 0.75rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: isBoardFlipped ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                color: isBoardFlipped ? 'var(--color-accent)' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                transition: 'all var(--transition-fast)',
              }}
            >
              🔄 Inverter Visão
            </button>
          )}

          <button
            type="button"
            onClick={onOpenThemeModal}
            title="Abrir personalização de temas, tabuleiros e peças"
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              transition: 'all var(--transition-fast)',
            }}
          >
            🎨 Temas & Visual
          </button>
        </div>
      </div>

      {/* Bottom Action Buttons: Undo, Redo, Reset */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.5rem',
          paddingTop: '0.5rem',
        }}
      >
        <button
          id="bot-undo-button"
          type="button"
          aria-label="Undo"
          onClick={onUndo}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
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
            gap: '0.4rem',
          }}
        >
          <span>↶</span>
          <span>Undo</span>
        </button>

        <button
          id="bot-redo-button"
          type="button"
          aria-label="Redo"
          onClick={onRedo}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
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
            gap: '0.4rem',
          }}
        >
          <span>↷</span>
          <span>Redo</span>
        </button>

        <button
          id="bot-reset-button"
          type="button"
          aria-label="Reset Match"
          onClick={onReset}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: 'var(--color-accent)',
            color: '#ffffff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all var(--transition-fast)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
          }}
        >
          <span>↻</span>
          <span>Reset Match</span>
        </button>
      </div>
    </div>
  );
};

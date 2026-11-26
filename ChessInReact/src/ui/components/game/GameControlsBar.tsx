import React from 'react';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';
import { ActionButton } from '../primitives/ActionButton';
import { Card } from '../primitives/Card';
import { PlayerId } from '../../../core/coordinates/types';
import { MoveHistoryList, IMoveItem } from './MoveHistoryList';
import { useTheme } from '../../theme/ThemeContext';

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
  onForceBotMove?: () => void;
  onOfferDraw?: () => void;
  onResign?: () => void;
  isGameOver?: boolean;
  canClaimDraw?: boolean;
  pendingDrawOffer?: PlayerId | null;
  activePlayer?: string;
  moves?: IMoveItem[];
  onExportPGN?: () => string;
  onSelectMoveIndex?: (moveIndex: number) => void;
  activeMoveIndex?: number;
  onOpenGameReview?: () => void;
  onOpenOpeningExplorer?: () => void;
}

export const GameControlsBar: React.FC<IGameControlsBarProps> = ({
  isBotEnabled,
  difficulty,
  isThinking,
  onExportPGN,
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
  onForceBotMove,
  onOfferDraw,
  onResign,
  isGameOver = false,
  canClaimDraw = false,
  pendingDrawOffer = null,
  activePlayer = 'P1',
  moves = [],
  onSelectMoveIndex,
  activeMoveIndex,
  onOpenGameReview,
  onOpenOpeningExplorer,
}) => {
  const { preferences, updatePreferences } = useTheme();
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
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
            trailingIcon={<span className="hotkey-pill">Z</span>}
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
            trailingIcon={<span className="hotkey-pill">Y</span>}
          >
            Refazer
          </ActionButton>
        </div>

        {/* Scrollable Algebraic Notation Table (Spec 06 Section 18.1 & Spec 09) */}
        <MoveHistoryList
          moves={moves}
          onExportPGN={onExportPGN}
          onSelectMoveIndex={onSelectMoveIndex}
          activeMoveIndex={activeMoveIndex}
          maxHeight="160px"
        />

        {/* Spec 12: Interactive Post-Game Review Trigger Button */}
        {isGameOver && onOpenGameReview && (
          <ActionButton
            id="btn-controls-game-review"
            data-testid="btn-controls-game-review"
            type="button"
            variant="primary"
            size="sm"
            onClick={onOpenGameReview}
            leadingIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 20V10M12 20V4M6 20v-6" />
              </svg>
            }
            style={{ width: '100%', marginTop: '0.45rem', justifyContent: 'center' }}
          >
            Revisão de Partida (Game Review & CAPS2)
          </ActionButton>
        )}

        {/* Spec 17: Interactive Opening Explorer & Repertoire Trigger Button */}
        {onOpenOpeningExplorer && (
          <ActionButton
            id="btn-controls-opening-explorer"
            data-testid="btn-controls-opening-explorer"
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenOpeningExplorer}
            leadingIcon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            }
            style={{ width: '100%', marginTop: '0.35rem', justifyContent: 'center' }}
          >
            Explorador de Aberturas (ECO)
          </ActionButton>
        )}
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

        {isBotEnabled && onForceBotMove && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
            <button
              id="bot-force-move-button"
              type="button"
              disabled={isThinking}
              onClick={onForceBotMove}
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '0.3rem 0.65rem',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-prominent)',
                color: 'var(--text-secondary)',
                cursor: isThinking ? 'not-allowed' : 'pointer',
                opacity: isThinking ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all var(--transition-fast)',
              }}
              title="Forçar lance imediato da IA para o turno ativo"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
              <span>{isThinking ? 'Calculando...' : 'Forçar Lance IA'}</span>
            </button>
          </div>
        )}
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
                title="Inverter perspectiva do tabuleiro (Atalho: F)"
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
                <span className="hotkey-pill" style={{ marginLeft: '2px' }}>F</span>
              </button>
            )}

            <button
              id="quick-sound-toggle-button"
              data-testid="quick-sound-toggle"
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
              title={preferences.soundEnabled ? 'Silenciar efeitos sonoros (WebAudio)' : 'Ativar efeitos sonoros (WebAudio)'}
              aria-label={preferences.soundEnabled ? 'Silenciar som' : 'Ativar som'}
              style={{
                padding: '0.38rem 0.68rem',
                fontSize: '0.76rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: preferences.soundEnabled ? 'var(--bg-card)' : 'rgba(239, 68, 68, 0.12)',
                color: preferences.soundEnabled ? 'var(--text-secondary)' : 'var(--color-danger, #ef4444)',
                border: preferences.soundEnabled ? '1px solid var(--border-subtle)' : '1px solid rgba(239, 68, 68, 0.35)',
                borderRadius: 'var(--radius-sm)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              {preferences.soundEnabled ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              )}
              <span>{preferences.soundEnabled ? 'Som' : 'Mudo'}</span>
            </button>

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

      {/* Section 4: Match Progression Actions (Draw / Resign) */}
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
            Ações da Partida
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'var(--font-mono)',
              color: canClaimDraw ? 'var(--color-accent)' : 'var(--text-muted)',
              fontWeight: canClaimDraw ? 700 : 400,
            }}
          >
            {canClaimDraw ? 'Empate Reivindicável' : 'Desfecho Formal'}
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
          <ActionButton
            id="bot-draw-button"
            type="button"
            variant={pendingDrawOffer ? 'primary' : 'secondary'}
            size="sm"
            aria-label={
              canClaimDraw
                ? 'Reivindicar Empate'
                : pendingDrawOffer
                ? pendingDrawOffer !== activePlayer
                  ? 'Aceitar Empate'
                  : 'Cancelar Oferta'
                : 'Propor Empate'
            }
            title={
              canClaimDraw
                ? 'Reivindicar empate formal por repetição ou regra dos 50 lances'
                : pendingDrawOffer
                ? pendingDrawOffer !== activePlayer
                  ? 'Aceitar oferta de empate do adversário'
                  : 'Cancelar oferta de empate pendente'
                : 'Propor empate mútuo'
            }
            disabled={isGameOver || !onOfferDraw}
            onClick={() => onOfferDraw?.()}
            leadingIcon={
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10h12M4 6h12M4 14h12" />
              </svg>
            }
          >
            {canClaimDraw
              ? 'Reivindicar Empate'
              : pendingDrawOffer
              ? pendingDrawOffer !== activePlayer
                ? 'Aceitar Empate'
                : 'Cancelar Oferta'
              : 'Propor Empate'}
          </ActionButton>

          <ActionButton
            id="bot-resign-button"
            type="button"
            variant="danger"
            size="sm"
            aria-label="Abandonar Partida"
            title="Abandonar partida e conceder a vitória ao oponente"
            disabled={isGameOver || !onResign}
            onClick={() => onResign?.()}
            leadingIcon={
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v16M4 4h10l-2 4 2 4H4" />
              </svg>
            }
          >
            Abandonar
          </ActionButton>
        </div>
      </div>

      <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

      {/* Section 5: Separated Cautionary Reset Action */}
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

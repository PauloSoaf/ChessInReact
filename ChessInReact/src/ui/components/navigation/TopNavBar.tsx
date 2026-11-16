import React from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { BrandMark } from '../primitives/BrandMark';

export type AppView = 'HUB' | 'GAME' | 'PUZZLE_RUSH' | 'BUGHOUSE';

export interface ITopNavBarProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  onOpenThemeModal: () => void;
  isMatchActive?: boolean;
  turnNumber?: number;
  activePlayer?: string;
  isGameOver?: boolean;
}

const THEME_LABELS: Record<string, string> = {
  midnight: 'Midnight',
  ivory: 'Ivory',
  synthwave: 'Synthwave',
};

export const TopNavBar: React.FC<ITopNavBarProps> = ({
  currentView,
  onNavigate,
  onOpenThemeModal,
  isMatchActive = false,
  turnNumber = 1,
  activePlayer = 'P1',
  isGameOver = false,
}) => {
  const { uiTheme, setUITheme, boardViewMode, setBoardViewMode } = useTheme();

  const toggleQuickTheme = () => {
    if (uiTheme === 'midnight') setUITheme('ivory');
    else if (uiTheme === 'ivory') setUITheme('synthwave');
    else setUITheme('midnight');
  };

  return (
    <header
      id="top-nav-bar"
      data-testid="top-nav-bar"
      className="top-nav-bar"
    >
      <div className="top-nav-inner">
        {/* Brand & Match Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
          <BrandMark
            size="md"
            subtitleText="Ateliê de Xadrez"
            onClick={() => onNavigate('HUB')}
          />

          {/* Live Match Status Pill */}
          {isMatchActive && (
            <div
              className="nav-status-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: 'var(--bg-sunken)',
                border: '1px solid var(--border-prominent)',
                borderRadius: 'var(--radius-full)',
                padding: '0.3rem 0.85rem',
                fontSize: '0.73rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: isGameOver ? 'var(--color-danger)' : 'var(--color-success)',
                  boxShadow: isGameOver
                    ? '0 0 8px var(--color-danger)'
                    : '0 0 8px var(--color-success)',
                  flexShrink: 0,
                  animation: isGameOver ? 'none' : 'pulseTurn 2s infinite',
                }}
              />
              <span style={{ color: 'var(--text-primary)' }}>Turno #{turnNumber}</span>
              <span style={{ opacity: 0.45 }}>•</span>
              <span
                style={{
                  color: activePlayer === 'P1' ? 'var(--color-player-white)' : 'var(--color-player-black)',
                  fontWeight: 700,
                }}
              >
                {activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Controls */}
        <nav aria-label="Navegação principal" style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          {/* View Switcher: Hub vs Game */}
          <div className="nav-view-switcher" role="group" aria-label="Alternador de tela">
            <button
              id="nav-btn-hub"
              type="button"
              className="nav-view-btn ui-control"
              aria-pressed={currentView === 'HUB'}
              onClick={() => onNavigate('HUB')}
              style={{
                border: currentView === 'HUB' ? '1px solid var(--border-prominent)' : '1px solid transparent',
                backgroundColor: currentView === 'HUB' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: currentView === 'HUB' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: currentView === 'HUB' ? 'var(--shadow-sm)' : 'none',
                fontWeight: currentView === 'HUB' ? 700 : 500,
              }}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8.5L10 3l7 5.5V17a1 1 0 0 1-1 1h-4v-5h-4v5H4a1 1 0 0 1-1-1V8.5z" />
              </svg>
              <span className="nav-btn-text">Game Hub</span>
              {currentView === 'HUB' && (
                <span
                  aria-hidden="true"
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
              )}
            </button>

            <button
              id="nav-btn-game"
              type="button"
              className="nav-view-btn ui-control"
              aria-pressed={currentView === 'GAME'}
              onClick={() => onNavigate('GAME')}
              style={{
                border: currentView === 'GAME' ? '1px solid var(--border-prominent)' : '1px solid transparent',
                backgroundColor: currentView === 'GAME' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: currentView === 'GAME' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: currentView === 'GAME' ? 'var(--shadow-sm)' : 'none',
                fontWeight: currentView === 'GAME' ? 700 : 500,
              }}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="14" height="14" rx="2" />
                <path d="M10 3v14M3 10h14" />
              </svg>
              <span className="nav-btn-text">Tabuleiro</span>
              {currentView === 'GAME' && (
                <span
                  aria-hidden="true"
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--color-accent)',
                  }}
                />
              )}
            </button>
          </div>

          {/* Quick 2D / 3D Board View Mode Toggle */}
          <button
            id="nav-quick-view-mode-toggle"
            type="button"
            className="ui-btn"
            onClick={() => setBoardViewMode(boardViewMode === '3D' ? '2D' : '3D')}
            title={`Modo do tabuleiro: ${boardViewMode}. Clique para alternar para ${boardViewMode === '3D' ? '2D Clássico' : '3D WebGL'}.`}
            aria-label={`Modo do tabuleiro: ${boardViewMode}`}
            style={{
              padding: '0.45rem 0.65rem',
              backgroundColor: boardViewMode === '3D' ? 'var(--color-accent)' : 'var(--bg-card)',
              color: boardViewMode === '3D' ? '#ffffff' : 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              outline: 'none',
              boxShadow: boardViewMode === '3D' ? '0 0 10px var(--color-accent-subtle)' : 'none',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span style={{ fontSize: '0.85rem' }}>{boardViewMode === '3D' ? '🎲' : '📐'}</span>
            <span className="nav-view-mode-badge" style={{ fontWeight: 800 }}>{boardViewMode}</span>
            <span className="nav-btn-text">{boardViewMode === '3D' ? 'WebGL' : 'Vetorial'}</span>
          </button>

          {/* Quick Theme Toggle */}
          <button
            id="nav-quick-theme-toggle"
            type="button"
            className="ui-btn ui-btn--secondary"
            onClick={toggleQuickTheme}
            title={`Tema atual: ${THEME_LABELS[uiTheme] ?? uiTheme}. Clique para alternar.`}
            aria-label={`Alternar tema. Atual: ${uiTheme}`}
            style={{
              padding: '0.45rem 0.65rem',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              outline: 'none',
            }}
          >
            {uiTheme === 'midnight' ? (
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            ) : uiTheme === 'ivory' ? (
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-8.486a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" style={{ color: 'var(--color-accent)' }}>
                <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
              </svg>
            )}
            <span className="nav-brand-subtitle">{THEME_LABELS[uiTheme]}</span>
          </button>

          {/* Theme Customizer Modal Trigger */}
          <button
            id="nav-open-theme-customizer"
            type="button"
            className="ui-btn ui-btn--outline"
            onClick={onOpenThemeModal}
            style={{
              padding: '0.45rem 0.85rem',
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              border: '1px solid var(--border-prominent)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              outline: 'none',
            }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="7.5" r="1.5" />
              <circle cx="12.5" cy="7.5" r="1.5" />
              <circle cx="10" cy="12.5" r="1.5" />
              <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0z" />
            </svg>
            <span className="nav-btn-text">Personalizar</span>
          </button>
        </nav>
      </div>
    </header>
  );
};

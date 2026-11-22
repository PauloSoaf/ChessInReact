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
  const { uiTheme, setUITheme, boardViewMode, setBoardViewMode, preferences, updatePreferences } = useTheme();

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
            {boardViewMode === '3D' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
              </svg>
            )}
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

          {/* Quick Sound Mute/Unmute Toggle (Spec 06 & Spec 12 RNF-13) */}
          <button
            id="nav-quick-sound-toggle"
            type="button"
            className="ui-btn"
            onClick={() => updatePreferences({ soundEnabled: !preferences.soundEnabled })}
            title={preferences.soundEnabled ? 'Sons ativados (Web Audio). Clique para silenciar.' : 'Sons silenciados. Clique para ativar.'}
            aria-label={preferences.soundEnabled ? 'Silenciar áudio' : 'Ativar áudio'}
            style={{
              padding: '0.45rem 0.65rem',
              backgroundColor: preferences.soundEnabled ? 'var(--bg-card)' : 'var(--bg-surface-elevated)',
              color: preferences.soundEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
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
              opacity: preferences.soundEnabled ? 1 : 0.7,
              transition: 'all var(--transition-fast)',
            }}
          >
            {preferences.soundEnabled ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
            <span className="nav-btn-text">{preferences.soundEnabled ? 'Som' : 'Mudo'}</span>
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

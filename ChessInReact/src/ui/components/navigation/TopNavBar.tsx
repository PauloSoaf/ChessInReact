import React from 'react';
import { useTheme } from '../../theme/ThemeContext';

export interface ITopNavBarProps {
  currentView: 'HUB' | 'GAME';
  onNavigate: (view: 'HUB' | 'GAME') => void;
  onOpenThemeModal: () => void;
  isMatchActive?: boolean;
  turnNumber?: number;
  activePlayer?: string;
  isGameOver?: boolean;
}

export const TopNavBar: React.FC<ITopNavBarProps> = ({
  currentView,
  onNavigate,
  onOpenThemeModal,
  isMatchActive = false,
  turnNumber = 1,
  activePlayer = 'P1',
  isGameOver = false,
}) => {
  const { uiTheme, setUITheme } = useTheme();

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
      style={{
        width: '100%',
        backgroundColor: 'var(--bg-surface-glass)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: 'var(--shadow-sm)',
        transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
      }}
    >
      {/* Brand & Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div
          onClick={() => onNavigate('HUB')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.625rem',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, var(--color-accent), #818cf8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              color: '#ffffff',
              fontSize: '1.25rem',
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            ♞
          </div>
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              ChessInReact
            </div>
            <div
              className="nav-brand-subtitle"
              style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Core Engine & Hub
            </div>
          </div>
        </div>

        {/* Status Pill in Match */}
        {isMatchActive && (
          <div
            className="nav-status-pill"
            style={{
              marginLeft: '0.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '9999px',
              padding: '0.25rem 0.75rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isGameOver ? 'var(--color-danger)' : 'var(--color-success)',
                boxShadow: isGameOver ? '0 0 8px var(--color-danger)' : '0 0 8px var(--color-success)',
              }}
            />
            <span>Turn #{turnNumber}</span>
            <span>•</span>
            <span style={{ color: activePlayer === 'P1' ? 'var(--color-player-white)' : 'var(--color-player-black)' }}>
              {activePlayer === 'P1' ? 'White' : 'Black'}
            </span>
          </div>
        )}
      </div>

      {/* Nav Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {/* View Switcher: Hub vs Live Match */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-app)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            id="nav-btn-hub"
            onClick={() => onNavigate('HUB')}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: currentView === 'HUB' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: currentView === 'HUB' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: currentView === 'HUB' ? 'var(--shadow-sm)' : 'none',
              fontSize: '0.8125rem',
              fontWeight: currentView === 'HUB' ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span>🏠</span>
            <span className="nav-btn-text">Game Hub</span>
          </button>
          <button
            id="nav-btn-game"
            onClick={() => onNavigate('GAME')}
            style={{
              padding: '0.375rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: currentView === 'GAME' ? 'var(--bg-surface-elevated)' : 'transparent',
              color: currentView === 'GAME' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: currentView === 'GAME' ? 'var(--shadow-sm)' : 'none',
              fontSize: '0.8125rem',
              fontWeight: currentView === 'GAME' ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span>♟</span>
            <span className="nav-btn-text">Tabuleiro</span>
          </button>
        </div>

        {/* Quick Theme Toggle Button */}
        <button
          id="nav-quick-theme-toggle"
          onClick={toggleQuickTheme}
          title={`Tema atual: ${uiTheme}. Clique para alternar.`}
          style={{
            padding: '0.45rem 0.65rem',
            backgroundColor: 'var(--bg-card)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
          }}
        >
          <span>{uiTheme === 'midnight' ? '🌙' : uiTheme === 'ivory' ? '☀️' : '⚡'}</span>
        </button>

        {/* Theme Customizer Modal Trigger */}
        <button
          id="nav-open-theme-customizer"
          onClick={onOpenThemeModal}
          style={{
            padding: '0.45rem 0.75rem',
            backgroundColor: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            transition: 'all var(--transition-fast)',
          }}
        >
          <span>🎨</span>
          <span className="nav-btn-text">Personalizar</span>
        </button>
      </div>
    </header>
  );
};

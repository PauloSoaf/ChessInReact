/**
 * AppSidebar.tsx
 *
 * Professional, compact, board-first sidebar navigation matching Chess.com / Lichess ergonomics.
 * Conforms to SPEC06-MINIMAL-PRODUCT-DESIGN-REDESIGN-01:
 * - Desktop: sleek left sidebar (60px-180px) with essential navigation actions.
 * - Mobile: compact bottom navigation strip with zero horizontal overflow.
 * - Replaces bulky headers, eliminates decorative emojis, prioritizes board space.
 */

import React, { useState } from 'react';
import {
  IconPlay,
  IconGrid,
  IconPuzzle,
  IconBookOpen,
  IconBarChart,
  IconSettings,
  IconVolume2,
  IconVolumeX,
} from '../../icons/AppIcons';
import { useTheme } from '../../theme/ThemeContext';

export type NavDestination = 'PLAY' | 'VARIANTS' | 'PUZZLES' | 'LEARN' | 'ANALYZE' | 'SETTINGS';

export interface IAppSidebarProps {
  currentDestination: NavDestination;
  onSelectDestination: (dest: NavDestination) => void;
  onOpenSettings: () => void;
  onOpenAnalysis?: () => void;
  isMatchActive?: boolean;
}

export const AppSidebar: React.FC<IAppSidebarProps> = ({
  currentDestination,
  onSelectDestination,
  onOpenSettings,
  onOpenAnalysis,
}) => {
  const { preferences, updatePreferences } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleSound = () => {
    updatePreferences({ soundEnabled: !preferences.soundEnabled });
  };

  const navItems: Array<{
    id: NavDestination;
    label: string;
    icon: React.ReactNode;
    action: () => void;
  }> = [
    {
      id: 'PLAY',
      label: 'Jogar',
      icon: <IconPlay size={20} />,
      action: () => onSelectDestination('PLAY'),
    },
    {
      id: 'VARIANTS',
      label: 'Variantes',
      icon: <IconGrid size={20} />,
      action: () => onSelectDestination('VARIANTS'),
    },
    {
      id: 'PUZZLES',
      label: 'Puzzles',
      icon: <IconPuzzle size={20} />,
      action: () => onSelectDestination('PUZZLES'),
    },
    {
      id: 'LEARN',
      label: 'Aprender',
      icon: <IconBookOpen size={20} />,
      action: () => onSelectDestination('LEARN'),
    },
    {
      id: 'ANALYZE',
      label: 'Analisar',
      icon: <IconBarChart size={20} />,
      action: () => {
        if (onOpenAnalysis) {
          onOpenAnalysis();
        } else {
          onSelectDestination('ANALYZE');
        }
      },
    },
  ];

  return (
    <>
      {/* DESKTOP SIDEBAR (Left Rail) */}
      <aside
        id="app-sidebar-desktop"
        className="app-sidebar-desktop"
        aria-label="Navegação Principal"
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        style={{
          width: isExpanded ? '180px' : '64px',
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 40,
          backgroundColor: 'var(--bg-sunken, #121415)',
          borderRight: '1px solid var(--border-subtle, rgba(243, 242, 237, 0.08))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          padding: '0.75rem 0.5rem',
          transition: 'width 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
          boxShadow: isExpanded ? '4px 0 20px rgba(0, 0, 0, 0.45)' : 'none',
          userSelect: 'none',
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.5rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-accent, #638A75)',
              color: '#F3F2ED',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.05rem',
              fontFamily: 'var(--font-sans)',
              flexShrink: 0,
            }}
          >
            ♟
          </div>
          {isExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                ChessInReact
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                Ateliê de Xadrez
              </span>
            </div>
          )}
        </div>

        {/* Primary Destination List */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', flex: 1 }}>
          {navItems.map((item) => {
            const isActive = currentDestination === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-nav-${item.id.toLowerCase()}`}
                type="button"
                onClick={item.action}
                title={item.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  width: '100%',
                  padding: '0.55rem 0.65rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--bg-surface, #25292B)' : 'transparent',
                  color: isActive ? 'var(--text-primary, #F3F2ED)' : 'var(--text-secondary, #C5C9BF)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.85rem',
                  textAlign: 'left',
                  transition: 'background-color 0.12s ease, color 0.12s ease',
                  borderLeft: isActive ? '3px solid var(--color-accent, #638A75)' : '3px solid transparent',
                }}
              >
                <div style={{ color: isActive ? 'var(--color-accent, #638A75)' : 'currentColor', display: 'flex', flexShrink: 0 }}>
                  {item.icon}
                </div>
                {isExpanded && (
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.label}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Utility Controls (Audio, Theme, Settings) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            id="sidebar-btn-audio"
            onClick={toggleSound}
            title={preferences.soundEnabled ? 'Silenciar Áudio' : 'Ativar Áudio'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.45rem 0.65rem',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            {preferences.soundEnabled ? <IconVolume2 size={18} /> : <IconVolumeX size={18} />}
            {isExpanded && <span>{preferences.soundEnabled ? 'Som Ativo' : 'Mudo'}</span>}
          </button>

          <button
            type="button"
            id="sidebar-btn-settings"
            onClick={onOpenSettings}
            title="Configurações e Temas"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              width: '100%',
              padding: '0.45rem 0.65rem',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            <IconSettings size={18} />
            {isExpanded && <span>Configurações</span>}
          </button>
        </div>
      </aside>

      {/* MOBILE BOTTOM NAVIGATION BAR (Fixed bottom, 0% overflow) */}
      <nav
        id="app-bottom-nav-mobile"
        className="app-bottom-nav-mobile"
        aria-label="Navegação Móvel"
        style={{
          display: 'none', // Controlled by media query in theme.css
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '56px',
          zIndex: 40,
          backgroundColor: 'var(--bg-sunken, #121415)',
          borderTop: '1px solid var(--border-subtle)',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 0.5rem',
          userSelect: 'none',
        }}
      >
        {navItems.slice(0, 4).map((item) => {
          const isActive = currentDestination === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.action}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '2px',
                background: 'none',
                border: 'none',
                color: isActive ? 'var(--color-accent, #638A75)' : 'var(--text-muted)',
                fontSize: '0.68rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.68rem',
            cursor: 'pointer',
            padding: '4px 8px',
          }}
        >
          <IconSettings size={20} />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
};

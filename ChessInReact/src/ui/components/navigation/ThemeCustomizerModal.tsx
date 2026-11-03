import React from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { BOARD_THEMES, PIECE_SETS, UI_THEMES } from '../../theme/themeRegistry';
import { BoardThemeId, PieceSetId, UIThemeId } from '../../theme/types';
import { PieceRenderer } from '../pieces/PieceRenderer';

export interface IThemeCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<IThemeCustomizerModalProps> = ({ isOpen, onClose }) => {
  const { preferences, setUITheme, setBoardTheme, setPieceSet, updatePreferences } = useTheme();

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-scale-up"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-surface-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-prominent)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎨</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>Personalização & Temas</h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Selecione independentemente o tema da interface, cores do tabuleiro e peças.
              </p>
            </div>
          </div>
          <button
            id="close-theme-customizer-btn"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
          {/* Category 1: UI Theme */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
              1. Tema da Interface (UI Mode)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {(Object.keys(UI_THEMES) as UIThemeId[]).map((themeId) => {
                const t = UI_THEMES[themeId];
                const isSelected = preferences.uiTheme === themeId;
                return (
                  <div
                    key={themeId}
                    id={`theme-card-ui-${themeId}`}
                    onClick={() => setUITheme(themeId)}
                    style={{
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-card)',
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                      boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '0.625rem' }}>
                      {t.previewColors.map((c, i) => (
                        <div
                          key={i}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            backgroundColor: c,
                            border: '1px solid rgba(255,255,255,0.2)',
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{t.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category 2: Board Theme */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
              2. Cores do Tabuleiro (Board Appearance)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((boardId) => {
                const b = BOARD_THEMES[boardId];
                const isSelected = preferences.boardTheme === boardId;
                return (
                  <div
                    key={boardId}
                    id={`theme-card-board-${boardId}`}
                    onClick={() => setBoardTheme(boardId)}
                    style={{
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-card)',
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                      boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {/* 2x2 Mini Checkerboard Preview */}
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid var(--border-prominent)',
                        marginBottom: '0.625rem',
                      }}
                    >
                      <div style={{ backgroundColor: b.lightSquare }} />
                      <div style={{ backgroundColor: b.darkSquare }} />
                      <div style={{ backgroundColor: b.darkSquare }} />
                      <div style={{ backgroundColor: b.lightSquare }} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{b.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{b.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category 3: Piece Set */}
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
              3. Conjunto de Peças (Piece Style)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {(Object.keys(PIECE_SETS) as PieceSetId[]).map((setId) => {
                const p = PIECE_SETS[setId];
                const isSelected = preferences.pieceSet === setId;
                return (
                  <div
                    key={setId}
                    id={`theme-card-piece-${setId}`}
                    onClick={() => setPieceSet(setId)}
                    style={{
                      padding: '0.875rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-card)',
                      border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                      boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    {/* Sample Pieces Preview */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.5rem', marginBottom: '0.625rem' }}>
                      <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PieceRenderer variantId="KING" ownerId="P1" pieceSet={setId} size={26} />
                      </div>
                      <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PieceRenderer variantId="QUEEN" ownerId="P2" pieceSet={setId} size={26} />
                      </div>
                      <div style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PieceRenderer variantId="KNIGHT" ownerId="P1" pieceSet={setId} size={26} />
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>{p.description}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gameplay Presentation Toggles */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.25rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-accent)', marginBottom: '0.75rem' }}>
              Opções de Auxílio Visual
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={preferences.showLegalMoves}
                  onChange={(e) => updatePreferences({ showLegalMoves: e.target.checked })}
                />
                <span>Destacar movimentos legais</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={preferences.showCoordinates}
                  onChange={(e) => updatePreferences({ showCoordinates: e.target.checked })}
                />
                <span>Exibir coordenadas (a-h, 1-8)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.875rem' }}>
                <input
                  type="checkbox"
                  checked={preferences.flipBoard}
                  onChange={(e) => updatePreferences({ flipBoard: e.target.checked })}
                />
                <span>Girar tabuleiro (visão das Pretas)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: 'var(--color-accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};

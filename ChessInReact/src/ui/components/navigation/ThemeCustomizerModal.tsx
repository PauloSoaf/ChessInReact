import React from 'react';
import { useTheme } from '../../theme/ThemeContext';
import { BOARD_THEMES, PIECE_SETS, UI_THEMES } from '../../theme/themeRegistry';
import { BoardThemeId, PieceSetId, UIThemeId } from '../../theme/types';
import { PieceRenderer } from '../pieces/PieceRenderer';
import { ModalShell } from '../primitives/ModalShell';

export interface IThemeCustomizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ThemeCustomizerModal: React.FC<IThemeCustomizerModalProps> = ({ isOpen, onClose }) => {
  const { preferences, setUITheme, setBoardTheme, setPieceSet, updatePreferences } = useTheme();

  return (
    <ModalShell
      id="theme-customizer"
      isOpen={isOpen}
      onClose={onClose}
      title="Personalização & Temas"
      description="Configure a atmosfera visual da plataforma: temas de interface, paleta do tabuleiro, conjuntos de peças e preferências táteis."
      maxWidth="720px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {/* Category 1: UI Theme */}
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>1. Tema da Interface</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.875rem',
            }}
          >
            {(Object.keys(UI_THEMES) as UIThemeId[]).map((themeId) => {
              const t = UI_THEMES[themeId];
              const isSelected = preferences.uiTheme === themeId;

              return (
                <button
                  key={themeId}
                  id={`theme-card-${themeId}`}
                  type="button"
                  onClick={() => setUITheme(themeId)}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--border-active)' : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
                    boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                      {t.name}
                    </span>
                    {isSelected && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-accent)',
                          fontWeight: 800,
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Color Swatch Dots */}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {t.previewColors.map((color, idx) => (
                      <span
                        key={idx}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          backgroundColor: color,
                          border: '1px solid rgba(0, 0, 0, 0.25)',
                          boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.1)',
                        }}
                      />
                    ))}
                  </div>

                  <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category 2: Board Palette */}
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>2. Paleta do Tabuleiro</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.875rem',
            }}
          >
            {(Object.keys(BOARD_THEMES) as BoardThemeId[]).map((themeId) => {
              const b = BOARD_THEMES[themeId];
              const isSelected = preferences.boardTheme === themeId;

              return (
                <button
                  key={themeId}
                  id={`board-theme-card-${themeId}`}
                  type="button"
                  onClick={() => setBoardTheme(themeId)}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--border-active)' : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
                    boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                      {b.name}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 800 }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {/* 2x2 Miniature Chessboard Swatch */}
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gridTemplateRows: '1fr 1fr',
                      borderRadius: 'var(--radius-xs)',
                      overflow: 'hidden',
                      border: '1px solid var(--border-subtle)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <div style={{ backgroundColor: b.lightSquare }} />
                    <div style={{ backgroundColor: b.darkSquare }} />
                    <div style={{ backgroundColor: b.darkSquare }} />
                    <div style={{ backgroundColor: b.lightSquare }} />
                  </div>

                  <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {b.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category 3: Piece Set */}
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              marginBottom: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>3. Conjunto de Peças</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.875rem',
            }}
          >
            {(Object.keys(PIECE_SETS) as PieceSetId[]).map((setId) => {
              const p = PIECE_SETS[setId];
              const isSelected = preferences.pieceSet === setId;

              return (
                <button
                  key={setId}
                  id={`piece-set-card-${setId}`}
                  type="button"
                  onClick={() => setPieceSet(setId)}
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--border-active)' : '1px solid var(--border-subtle)',
                    backgroundColor: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-card)',
                    boxShadow: isSelected ? 'var(--shadow-glow)' : 'var(--shadow-sm)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)',
                    outline: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                      {p.name}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-accent)', fontWeight: 800 }}>
                        ✓
                      </span>
                    )}
                  </div>

                  {/* Sample Piece Pair Preview (King & Knight) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      height: '36px',
                      padding: '0 0.5rem',
                      backgroundColor: 'var(--bg-app)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <PieceRenderer variantId="KING" ownerId="P1" pieceSet={setId} size={28} />
                    <PieceRenderer variantId="KNIGHT" ownerId="P2" pieceSet={setId} size={28} />
                  </div>

                  <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category 4: Gameplay Assist & Board Preferences */}
        <div>
          <div
            style={{
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-accent)',
              marginBottom: '0.875rem',
            }}
          >
            4. Assistência Tática & Orientação
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Destacar Movimentos Legais
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                  Exibe pontos nos destinos livres e anéis de alvo nas capturas possíveis.
                </div>
              </div>
              <input
                id="toggle-legal-moves"
                type="checkbox"
                checked={preferences.showLegalMoves}
                onChange={(e) => updatePreferences({ showLegalMoves: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
            </label>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Coordenadas do Tabuleiro
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                  Exibe as letras (a–h) e números (1–8) nas bordas das casas.
                </div>
              </div>
              <input
                id="toggle-coordinates"
                type="checkbox"
                checked={preferences.showCoordinates}
                onChange={(e) => updatePreferences({ showCoordinates: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
            </label>

            <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)' }} />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Girar Tabuleiro (Flip)
                </div>
                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                  Inverte a perspectiva visual mantendo a orientação vertical das peças.
                </div>
              </div>
              <input
                id="toggle-flip-board"
                type="checkbox"
                checked={preferences.flipBoard}
                onChange={(e) => updatePreferences({ flipBoard: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--color-accent)' }}
              />
            </label>
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

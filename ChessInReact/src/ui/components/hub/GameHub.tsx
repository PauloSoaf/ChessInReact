import React from 'react';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';
import { ChessPieceShowcase } from '../showcase/ChessPieceShowcase';
import { Card } from '../primitives/Card';

export interface IGameHubProps {
  onStartBotMatch: (difficulty: AIDifficultyLevel) => void;
  onStartLocalMatch: () => void;
  onResumeMatch: () => void;
  hasActiveMatch: boolean;
  turnNumber: number;
  activePlayer?: string;
  isGameOver?: boolean;
  botEnabled: boolean;
  botDifficulty: AIDifficultyLevel;
  onSelectDifficulty: (level: AIDifficultyLevel) => void;
  onOpenThemeModal: () => void;
}

const DIFFICULTY_CONFIG: Record<
  AIDifficultyLevel,
  { title: string; desc: string; label: string; depth: string }
> = {
  1: { title: 'Iniciante (Nível 1)', label: 'D1 Iniciante', desc: 'Movimentos relaxados, ideal para aprendizado.', depth: '1 ply' },
  2: { title: 'Casual (Nível 2)', label: 'D2 Casual', desc: 'Jogo tático humano sem cálculo profundo.', depth: '2 plies' },
  3: { title: 'Intermediário (Nível 3)', label: 'D3 Intermediário', desc: 'Visão tática consistente e defesa sólida.', depth: '3 plies' },
  4: { title: 'Avançado (Nível 4)', label: 'D4 Avançado', desc: 'Alpha-Beta profundo e controle territorial.', depth: '4 plies' },
  5: { title: 'Mestre (Nível 5)', label: 'D5 Mestre', desc: 'Máximo poder de cálculo e busca de quietude.', depth: '5+ plies' },
};

export const GameHub: React.FC<IGameHubProps> = ({
  onStartBotMatch,
  onStartLocalMatch,
  onResumeMatch,
  hasActiveMatch,
  turnNumber,
  isGameOver = false,
  botEnabled,
  botDifficulty,
  onSelectDifficulty,
  onOpenThemeModal,
}) => {
  const isMatchInProgress = hasActiveMatch && !isGameOver;
  const isMatchConcluded = hasActiveMatch && isGameOver;

  return (
    <div
      className="animate-fade-in"
      style={{
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        padding: 'clamp(1.25rem, 3vw, 2.5rem) clamp(1rem, 2.5vw, 2rem) clamp(2rem, 4vw, 4rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(1.5rem, 3vw, 3rem)',
      }}
    >
      {/* 1. Asymmetric Editorial Hero: Headline on Left, 3D Showcase on Right */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: 'clamp(1.5rem, 3vw, 2.5rem)',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-prominent)',
          borderRadius: 'var(--radius-xl)',
          padding: 'clamp(1.25rem, 3vw, 2.5rem)',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
        }}
      >
        {/* Subtle Watermark Silhouette */}
        <div
          style={{
            position: 'absolute',
            left: '-20px',
            bottom: '-40px',
            fontSize: '14rem',
            opacity: 0.03,
            pointerEvents: 'none',
            userSelect: 'none',
            fontFamily: 'serif',
          }}
        >
          ♚
        </div>

        {/* Left Column: Editorial Headline & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem' }}>
            <span
              style={{
                backgroundColor: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                padding: '0.25rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                border: '1px solid var(--border-prominent)',
              }}
            >
              Chess Editorial Atelier
            </span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>•</span>
            <span
              style={{
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              Motor MCTS em Worker
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.15,
              color: 'var(--text-primary)',
            }}
          >
            Plataforma de Xadrez Editorial & Motor de Análise
          </h1>

          <p
            style={{
              margin: 0,
              fontSize: 'clamp(0.875rem, 2vw, 1rem)',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              maxWidth: '560px',
            }}
          >
            Experiência de Xadrez Avançada: dispute partidas táticas contra o motor de cálculo autoral em thread dedicada ou jogue presencialmente no mesmo dispositivo. Explore temas curados, precisão milimétrica e análise contínua.
          </p>

          {/* Call to Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', marginTop: '0.75rem' }}>
            {isMatchInProgress && (
              <button
                id="hub-btn-resume-match"
                onClick={onResumeMatch}
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--text-inverse)',
                  border: 'none',
                  padding: '0.75rem 1.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.925rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                <span>Retomar Partida (Turno #{turnNumber})</span>
              </button>
            )}

            {!isMatchInProgress && (
              <button
                id="hub-btn-play-bot"
                onClick={() => onStartBotMatch(botDifficulty)}
                style={{
                  backgroundColor: 'var(--color-accent)',
                  color: 'var(--text-inverse)',
                  border: 'none',
                  padding: '0.75rem 1.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.925rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
                  <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm-1.5 5.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm4.5 7h-6v-1a3 3 0 016 0v1z" />
                </svg>
                <span>{isMatchConcluded ? 'Iniciar Nova Partida contra Bot' : 'Jogar contra Robô'}</span>
              </button>
            )}

            {isMatchConcluded && (
              <button
                id="hub-btn-view-board"
                onClick={onResumeMatch}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  padding: '0.75rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span>Ver Posição Final (Fim de Jogo)</span>
              </button>
            )}

            <button
              id="hub-btn-customize-hero"
              onClick={onOpenThemeModal}
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-prominent)',
                padding: '0.75rem 1.5rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.925rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="7.5" r="1.5" />
                <circle cx="12.5" cy="7.5" r="1.5" />
                <circle cx="10" cy="12.5" r="1.5" />
                <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0z" />
              </svg>
              <span>Personalizar Tabuleiro & Peças</span>
            </button>
          </div>
        </div>

        {/* Right Column: Interactive 3D Piece Showcase */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1, width: '100%', minHeight: '260px' }}>
          <ChessPieceShowcase initialFinish="antique-brass" />
        </div>
      </section>

      {/* 2. Game Modes Section */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 700,
              margin: '0 0 0.35rem',
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Modos de Jogo
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Selecione uma modalidade para iniciar ou continuar seus estudos táticos.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
            gap: '1.5rem',
            width: '100%',
          }}
        >
          {/* Card 1: Bot Match (AI) */}
          <Card
            id="card-mode-bot"
            variant="elevated"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-accent-subtle)',
                    border: '1px solid var(--border-prominent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-accent)',
                  }}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="10" rx="2" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4M8 16h.01M16 16h.01" />
                  </svg>
                </div>

                <span
                  style={{
                    backgroundColor: 'rgba(113, 133, 117, 0.16)',
                    color: 'var(--color-success)',
                    padding: '0.2rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    border: '1px solid rgba(113, 133, 117, 0.3)',
                  }}
                >
                  IA em Web Worker
                </span>
              </div>

              <h3
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                Partida contra Robô (IA)
              </h3>

              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Enfrente o motor de IA em thread dedicada com busca minimax, poda Alpha-Beta e avaliação dinâmica em centipawns.
              </p>

              {/* Difficulty Selector */}
              <div style={{ marginTop: '0.5rem' }}>
                <label
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    display: 'block',
                    marginBottom: '0.45rem',
                  }}
                >
                  Nível de Dificuldade:
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
                  {([1, 2, 3, 4, 5] as AIDifficultyLevel[]).map((lvl) => {
                    const isSelected = botDifficulty === lvl;
                    return (
                      <button
                        key={lvl}
                        id={`hub-difficulty-btn-${lvl}`}
                        type="button"
                        onClick={() => onSelectDifficulty(lvl)}
                        style={{
                          padding: '0.45rem 0',
                          backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--bg-app)',
                          color: isSelected ? 'var(--text-inverse)' : 'var(--text-secondary)',
                          border: isSelected ? '1px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8125rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: isSelected ? 800 : 500,
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                          outline: 'none',
                        }}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--text-muted)',
                    marginTop: '0.45rem',
                  }}
                >
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {DIFFICULTY_CONFIG[botDifficulty].label}
                  </strong>
                  : {DIFFICULTY_CONFIG[botDifficulty].desc}
                </div>
              </div>
            </div>

            {/* Actions for Bot Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              {botEnabled && isMatchInProgress ? (
                <>
                  <button
                    id="hub-btn-play-bot"
                    onClick={onResumeMatch}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--text-inverse)',
                      border: 'none',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.925rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span>Continuar contra Bot (Turno #{turnNumber})</span>
                  </button>

                  <button
                    id="hub-btn-new-bot"
                    onClick={() => onStartBotMatch(botDifficulty)}
                    style={{
                      width: '100%',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.55rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span>Iniciar Nova Partida contra Bot</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    id="hub-btn-play-bot"
                    onClick={() => onStartBotMatch(botDifficulty)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--color-accent)',
                      color: 'var(--text-inverse)',
                      border: 'none',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.925rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span>{isMatchConcluded && botEnabled ? 'Iniciar Nova Partida contra Bot' : 'Jogar contra Robô'}</span>
                  </button>

                  {hasActiveMatch && !isMatchConcluded && (
                    <button
                      id="hub-btn-new-bot"
                      onClick={() => onStartBotMatch(botDifficulty)}
                      style={{
                        width: '100%',
                        backgroundColor: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                        padding: '0.55rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      <span>Iniciar Nova Partida contra Bot</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Card 2: Pass & Play (Local) */}
          <Card
            id="card-mode-local"
            variant="elevated"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.5rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-primary)',
                  }}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </div>

                <span
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    color: 'var(--text-muted)',
                    padding: '0.2rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Offline Local
                </span>
              </div>

              <h3
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                Pass & Play (Local)
              </h3>

              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Jogue presencialmente com outro humano no mesmo dispositivo. Alterne o controle a cada turno com suporte completo ao histórico de Undo/Redo e regras estritas.
              </p>

              <div
                style={{
                  backgroundColor: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                }}
              >
                Ideal para análise compartilhada, treinamento de aberturas e partidas amistosas.
              </div>
            </div>

            {/* Actions for Local Card */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              {!botEnabled && isMatchInProgress ? (
                <>
                  <button
                    id="hub-btn-play-local"
                    onClick={onResumeMatch}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-prominent)',
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.925rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span>Continuar Partida Local (Turno #{turnNumber})</span>
                  </button>

                  <button
                    id="hub-btn-new-local"
                    onClick={onStartLocalMatch}
                    style={{
                      width: '100%',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      padding: '0.55rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      transition: 'all var(--transition-fast)',
                    }}
                  >
                    <span>Iniciar Nova Partida Local</span>
                  </button>
                </>
              ) : (
                <button
                  id="hub-btn-play-local"
                  onClick={onStartLocalMatch}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-prominent)',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.925rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <span>Jogar Partida Local</span>
                </button>
              )}
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
};

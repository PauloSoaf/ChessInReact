import React from 'react';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';

export interface IGameHubProps {
  onStartBotMatch: (difficulty: AIDifficultyLevel) => void;
  onStartLocalMatch: () => void;
  onResumeMatch: () => void;
  hasActiveMatch: boolean;
  turnNumber: number;
  activePlayer: string;
  isGameOver: boolean;
  botEnabled: boolean;
  botDifficulty: AIDifficultyLevel;
  onSelectDifficulty: (level: AIDifficultyLevel) => void;
  onOpenThemeModal: () => void;
}

const DIFFICULTY_NAMES: Record<AIDifficultyLevel, { title: string; desc: string; icon: string }> = {
  1: { title: 'Iniciante (Nível 1)', desc: 'Movimentos relaxados, ideal para aprendizado.', icon: '🌱' },
  2: { title: 'Casual (Nível 2)', desc: 'Jogo tático humano sem cálculo profundo.', icon: '♟' },
  3: { title: 'Intermediário (Nível 3)', desc: 'Visão tática consistente e defesa sólida.', icon: '⚔️' },
  4: { title: 'Avançado (Nível 4)', desc: 'Alpha-Beta profundo e controle territorial.', icon: '🛡️' },
  5: { title: 'Mestre (Nível 5)', desc: 'Máximo poder de cálculo e busca de quietude.', icon: '👑' },
};

export const GameHub: React.FC<IGameHubProps> = ({
  onStartBotMatch,
  onStartLocalMatch,
  onResumeMatch,
  hasActiveMatch,
  turnNumber,
  activePlayer,
  isGameOver,
  botEnabled,
  botDifficulty,
  onSelectDifficulty,
  onOpenThemeModal,
}) => {
  return (
    <div
      className="animate-fade-in"
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '2rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
      }}
    >
      {/* Hero Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--bg-surface-elevated) 0%, var(--bg-card) 100%)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-prominent)',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: '-20px',
            bottom: '-30px',
            fontSize: '12rem',
            opacity: 0.05,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ♞
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
          <span
            style={{
              backgroundColor: 'var(--color-accent-subtle)',
              color: 'var(--color-accent)',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Spec 06 UI/UX Design System
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>•</span>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>MCTS & Alpha-Beta Engine</span>
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.15,
            maxWidth: '700px',
          }}
        >
          Experiência de Xadrez Avançada, Multitópica e com Inteligência Artificial
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: '1rem',
            color: 'var(--text-secondary)',
            maxWidth: '650px',
            lineHeight: 1.5,
          }}
        >
          Dispute partidas completas contra a inteligência artificial em Web Worker dedicado, treine localmente ou explore variantes com suporte a múltiplos temas e design responsivo.
        </p>

        {/* Quick Action in Hero */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.5rem' }}>
          {hasActiveMatch && !isGameOver && (
            <button
              id="hub-btn-resume-match"
              onClick={onResumeMatch}
              style={{
                backgroundColor: 'var(--color-accent)',
                color: '#ffffff',
                border: 'none',
                padding: '0.875rem 1.75rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.95rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-glow)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>▶</span>
              <span>Retomar Partida (Turno #{turnNumber})</span>
            </button>
          )}

          <button
            id="hub-btn-customize-hero"
            onClick={onOpenThemeModal}
            style={{
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-prominent)',
              padding: '0.875rem 1.5rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'all var(--transition-fast)',
            }}
          >
            <span>🎨</span>
            <span>Personalizar Tabuleiro & Peças</span>
          </button>
        </div>
      </div>

      {/* Primary Game Modes Grid */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem', letterSpacing: '-0.02em' }}>
          Modos de Jogo
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {/* Card 1: Human vs Bot */}
          <div
            id="card-mode-bot"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.25rem',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '2rem' }}>🤖</span>
                <span
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--color-success)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  Worker Nativo Ativo
                </span>
              </div>

              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Partida contra Robô (IA)</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Enfrente o motor de IA em thread dedicada com busca minimax, poda Alpha-Beta e avaliação dinâmica em centipawns.
              </p>

              {/* Difficulty selector inside card */}
              <div style={{ marginTop: '0.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                  Nível de Dificuldade:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.35rem' }}>
                  {([1, 2, 3, 4, 5] as AIDifficultyLevel[]).map((lvl) => {
                    const isSel = botDifficulty === lvl;
                    return (
                      <button
                        key={lvl}
                        id={`hub-diff-btn-${lvl}`}
                        onClick={() => onSelectDifficulty(lvl)}
                        style={{
                          padding: '0.5rem 0',
                          border: isSel ? '2px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: isSel ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                          color: isSel ? 'var(--color-accent)' : 'var(--text-secondary)',
                          fontWeight: 700,
                          fontSize: '0.875rem',
                          cursor: 'pointer',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {DIFFICULTY_NAMES[botDifficulty].icon} {DIFFICULTY_NAMES[botDifficulty].title}: {DIFFICULTY_NAMES[botDifficulty].desc}
                </div>
              </div>
            </div>

            <button
              id="hub-btn-play-bot"
              onClick={() => onStartBotMatch(botDifficulty)}
              style={{
                width: '100%',
                backgroundColor: 'var(--color-accent)',
                color: '#ffffff',
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
              <span>⚔️</span>
              <span>{botEnabled && hasActiveMatch ? 'Continuar contra Bot' : 'Jogar contra o Bot'}</span>
            </button>
          </div>

          {/* Card 2: Pass and Play Local */}
          <div
            id="card-mode-local"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              padding: '1.75rem',
              boxShadow: 'var(--shadow-sm)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '2rem' }}>👥</span>
                <span
                  style={{
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    color: 'var(--color-accent)',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  2 Jogadores
                </span>
              </div>

              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Pass & Play (Local)</h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Dispute partidas clássicas com um amigo no mesmo dispositivo com alternância de turnos, roque, en passant e validação estrita FIDE.
              </p>

              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                }}
              >
                <div>✓ Validação legal em tempo real</div>
                <div>✓ Histórico de comandos reversível (Undo/Redo)</div>
                <div>✓ Suporte a tabuleiros dinâmicos (4x4 a 16x16)</div>
              </div>
            </div>

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
              <span>♟</span>
              <span>Iniciar Partida Local</span>
            </button>
          </div>
        </div>
      </div>

      {/* Architecture & Spec Progress Footer Banner */}
      <div
        style={{
          padding: '1.25rem 1.5rem',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🏛️</span>
          <div>
            <strong>ChessInReact Governance:</strong> Spec 01 (ECS Core), Spec 04 (Rules Engine) e Spec 05 (AI Engines) homologadas.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem' }}>
          <span style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
            Turno Atual: #{turnNumber} ({activePlayer === 'P1' ? 'Brancas' : 'Pretas'})
          </span>
          <span style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
            Bot: {botEnabled ? `Ativo (Nível ${botDifficulty})` : 'Desativado'}
          </span>
        </div>
      </div>
    </div>
  );
};

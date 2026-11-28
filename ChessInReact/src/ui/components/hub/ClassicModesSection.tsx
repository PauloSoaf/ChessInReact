import { HumanColorPicker } from './HumanColorPicker';
import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { useTheme } from '../../theme/ThemeContext';
import { IconClock } from '../../icons/AppIcons';
import { DIFFICULTY_META } from './difficultyTypes';

export interface IClassicModesSectionProps {
  readonly botEnabled: boolean;
  readonly botDifficulty: number;
  readonly onSelectDifficulty: (d: number) => void;
  readonly onStartBotMatch: (difficulty: number) => void;
  readonly onStartLocalMatch: () => void;
  readonly onResumeMatch: () => void;
  readonly hasActiveMatch: boolean;
  readonly turnNumber: number;
  readonly onOpenStagingModal: (variantId: string, participants: number) => void;
}

export const ClassicModesSection: React.FC<IClassicModesSectionProps> = ({
  botEnabled,
  botDifficulty,
  onSelectDifficulty,
  onStartBotMatch,
  onStartLocalMatch,
  onResumeMatch,
  hasActiveMatch,
  turnNumber,
  onOpenStagingModal,
}) => {
  const { boardViewMode, setBoardViewMode } = useTheme();
  const activeDiff = DIFFICULTY_META.find((d) => d.level === botDifficulty) ?? DIFFICULTY_META[2];
  const isMatchInProgress = hasActiveMatch;

  return (
    <div className="hub-modes-grid">
      {/* Card 1: AI Bot Match */}
      <Card
        id="card-mode-bot"
        variant="interactive"
        selected={botEnabled}
        className="hub-mode-card"
        style={{ padding: undefined }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-accent-subtle)',
                  border: '1px solid var(--border-prominent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <circle cx="12" cy="5" r="2" />
                  <path d="M12 7v4M8 16h.01M16 16h.01" />
                </svg>
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.2rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Partida contra Robô (IA)
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  5 Níveis de Desafio • Avaliação Posicional ao Vivo
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '0.28rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent-subtle)',
                color: 'var(--color-accent)',
                border: '1px solid var(--border-prominent)',
                whiteSpace: 'nowrap',
              }}
            >
              {activeDiff.profile}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.58 }}>
            Escolha o nível do adversário para estudo de aberturas, treino tático ou partidas
            completas com leitura contínua de vantagem no tabuleiro.
          </p>

          {/* Difficulty Selector Panel */}
          <div className="hub-difficulty-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Força da IA: <strong style={{ color: 'var(--color-accent)' }}>{activeDiff.name}</strong>
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-surface)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Nível {botDifficulty}/5 • {activeDiff.cadence}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SegmentedControl
                idPrefix="hub-difficulty-btn"
                value={botDifficulty}
                onChange={(val) => onSelectDifficulty(Number(val))}
                options={DIFFICULTY_META.map((d) => ({
                  value: d.level,
                  label: `N${d.level}`,
                }))}
              />
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: 1.4,
              }}
            >
              {activeDiff.desc}
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <HumanColorPicker idPrefix="hub" />
            </div>

            {/* Dual 2D / 3D Board View Mode Selector */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                padding: '0.45rem 0.65rem',
                backgroundColor: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                Tabuleiro:
              </span>
              <div
                style={{
                  display: 'inline-flex',
                  borderRadius: 'var(--radius-xs)',
                  overflow: 'hidden',
                  border: '1px solid var(--border-prominent)',
                }}
              >
                <button
                  id="hub-ai-card-view-2d"
                  type="button"
                  onClick={() => setBoardViewMode('2D')}
                  style={{
                    padding: '0.26rem 0.6rem',
                    fontSize: '0.74rem',
                    fontWeight: boardViewMode !== '3D' ? 800 : 500,
                    backgroundColor: boardViewMode !== '3D' ? 'var(--color-accent)' : 'transparent',
                    color: boardViewMode !== '3D' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  2D Vetorial
                </button>
                <button
                  id="hub-ai-card-view-3d"
                  type="button"
                  onClick={() => setBoardViewMode('3D')}
                  style={{
                    padding: '0.26rem 0.6rem',
                    fontSize: '0.74rem',
                    fontWeight: boardViewMode === '3D' ? 800 : 500,
                    backgroundColor: boardViewMode === '3D' ? 'var(--color-accent)' : 'transparent',
                    color: boardViewMode === '3D' ? '#ffffff' : 'var(--text-secondary)',
                    border: 'none',
                    borderLeft: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  3D WebGL
                </button>
              </div>
            </div>
          </div>
        </div>

        {isMatchInProgress && botEnabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <ActionButton
              id="hub-card-btn-continue-bot"
              variant="primary"
              size="md"
              fullWidth
              onClick={onResumeMatch}
            >
              Continuar contra Bot (Turno #{turnNumber})
            </ActionButton>
            <ActionButton
              id="hub-card-btn-new-bot"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => onStartBotMatch(botDifficulty)}
            >
              Iniciar Nova Partida contra Bot
            </ActionButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <ActionButton
              id="hub-card-btn-play-bot"
              variant="primary"
              size="md"
              fullWidth
              onClick={() => onStartBotMatch(botDifficulty)}
            >
              Iniciar Nova Partida vs IA ({activeDiff.name})
            </ActionButton>
            <ActionButton
              id="hub-card-btn-clock-bot"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => onOpenStagingModal('STANDARD', 2)}
              leadingIcon={<IconClock size={16} color="currentColor" />}
            >
              Personalizar Relógio (Bullet, Blitz, Rápido, Clássico)
            </ActionButton>
          </div>
        )}
      </Card>

      {/* Card 2: Pass & Play Local */}
      <Card
        id="card-mode-local"
        variant="interactive"
        selected={!botEnabled && hasActiveMatch}
        className="hub-mode-card"
        style={{ padding: undefined }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-sunken)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-primary)',
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.2rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Duelo Local (Pass &amp; Play)
                </h3>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  2 Jogadores • Partida Presencial &amp; Estudo Livre
                </span>
              </div>
            </div>

            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '0.28rem 0.65rem',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--bg-sunken)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
              }}
            >
              2 Jogadores
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.58 }}>
            Dispute partidas presenciais ou conduza análises livres com inversão instantânea de
            perspectiva, histórico de movimentos e tabuleiros configuráveis de 4×4 a 16×16.
          </p>

          {/* Feature Grid for Pass & Play */}
          <div className="hub-feature-grid">
            <div className="hub-feature-pill">
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Desfazer &amp; Refazer
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Revise jogadas e teste linhas alternativas
              </span>
            </div>
            <div className="hub-feature-pill">
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Inversão de Tabuleiro
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Alterne a visão entre Brancas e Pretas
              </span>
            </div>
            <div className="hub-feature-pill">
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Grade 4×4 a 16×16
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Do clássico 8×8 a tabuleiros expandidos
              </span>
            </div>
            <div className="hub-feature-pill">
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Guias de Movimento
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Destaque de casas legais e capturas
              </span>
            </div>
          </div>
        </div>

        {isMatchInProgress && !botEnabled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <ActionButton
              id="hub-btn-play-local"
              variant="secondary"
              size="md"
              fullWidth
              onClick={onResumeMatch}
            >
              Continuar Duelo Local (Turno #{turnNumber})
            </ActionButton>
            <ActionButton
              id="hub-btn-new-local"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={onStartLocalMatch}
            >
              Iniciar Novo Duelo Local
            </ActionButton>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <ActionButton
              id="hub-btn-play-local"
              variant="secondary"
              size="md"
              fullWidth
              onClick={onStartLocalMatch}
            >
              Iniciar Duelo Local (2 Jogadores)
            </ActionButton>
            <ActionButton
              id="hub-btn-clock-local"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => onOpenStagingModal('STANDARD', 2)}
              leadingIcon={<IconClock size={16} color="currentColor" />}
            >
              Personalizar Relógio / Modo Livre Sem Tempo
            </ActionButton>
          </div>
        )}
      </Card>
    </div>
  );
};


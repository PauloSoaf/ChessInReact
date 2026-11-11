import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { StatusIndicator } from '../primitives/StatusIndicator';
import { ShowcaseFallback } from '../showcase/ShowcaseFallback';
import { useTheme } from '../../theme/ThemeContext';
import {
  AcademyStudyEngine,
  StudyCategory,
} from '../../../analysis/study/AcademyStudyEngine';

const LazyChessPieceShowcase = React.lazy(() =>
  import('../showcase/ChessPieceShowcase').then((m) => ({
    default: m.ChessPieceShowcase,
  }))
);

class LazyShowcaseErrorBoundary extends React.Component<
  { autoFocusOnError: boolean; children: React.ReactNode },
  { hasError: boolean }
> {
  private errorFallbackRef = React.createRef<HTMLDivElement>();

  constructor(props: { autoFocusOnError: boolean; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(_prevProps: { autoFocusOnError: boolean }, prevState: { hasError: boolean }) {
    if (!prevState.hasError && this.state.hasError && this.props.autoFocusOnError) {
      this.errorFallbackRef.current?.focus();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          ref={this.errorFallbackRef}
          id="chess-piece-showcase-error-fallback"
          data-testid="showcase-error-fallback"
          role="region"
          aria-label="Mostruário em modo 2D de segurança"
          tabIndex={this.props.autoFocusOnError ? -1 : undefined}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-prominent)',
            overflow: 'hidden',
          }}
        >
          <ShowcaseFallback finish="antique-brass" />
        </div>
      );
    }
    return this.props.children;
  }
}

export type Progressive3DMode = 'idle' | 'eager' | 'off';

export interface IGameHubProps {
  onStartBotMatch: (difficulty: number) => void;
  onStartLocalMatch: () => void;
  onResumeMatch: () => void;
  hasActiveMatch: boolean;
  turnNumber: number;
  activePlayer?: string;
  isGameOver?: boolean;
  botEnabled: boolean;
  botDifficulty: number;
  onSelectDifficulty: (d: number) => void;
  onOpenThemeModal: () => void;
  progressive3DMode?: Progressive3DMode;
  onLaunchMinigame?: (minigameId: string) => void;
}

const DIFFICULTY_META: {
  level: number;
  name: string;
  desc: string;
  profile: string;
  cadence: string;
}[] = [
  {
    level: 1,
    name: 'Iniciante',
    desc: 'Ideal para praticar movimentos fundamentais, capturas e desenvolvimento inicial.',
    profile: 'Treino Base',
    cadence: 'Ritmo Acessível',
  },
  {
    level: 2,
    name: 'Casual',
    desc: 'Transições fluidas para partidas recreativas e consolidação tática.',
    profile: 'Jogo Equilibrado',
    cadence: 'Ritmo Dinâmico',
  },
  {
    level: 3,
    name: 'Tático',
    desc: 'Explora peças desprotegidas e exige atenção constante na defesa.',
    profile: 'Intermediário',
    cadence: 'Combinações Ativas',
  },
  {
    level: 4,
    name: 'Forte',
    desc: 'Pressão posicional contínua no meio-jogo e coordenação precisa de peças.',
    profile: 'Avançado',
    cadence: 'Cálculo Profundo',
  },
  {
    level: 5,
    name: 'Mestre',
    desc: 'Leitura tática exigente para jogadores que buscam partidas de alto rigor.',
    profile: 'Desafio Máximo',
    cadence: 'Rigor Competitivo',
  },
];

const MINIGAMES_CATALOG = [
  {
    id: 'spell_chess',
    title: 'Spell Chess (Xadrez dos Feitiços)',
    badge: 'Spec 12 Arcano',
    accentColor: '#9333ea',
    icon: '🧙‍♂️',
    desc: 'Cartas arcanas de magia com mana compartilhado: Congelamento em área (Freeze), Salto sobre peças (Jump), Camuflagem furtiva e Portais dimensionais.',
    features: ['Deck de Feitiços & Mana', 'Topologia Clássica & Hexagonal', 'Cartas Colecionáveis'],
  },
  {
    id: 'duck_chess',
    title: 'Duck Chess (Xadrez do Pato)',
    badge: 'Variante Popular',
    accentColor: '#eab308',
    icon: '🦆',
    desc: 'Um pato de borracha neutro bloqueia uma casa após cada lance. O pato não pode ser capturado e impede a passagem de ambas as cores.',
    features: ['Pato Neutro Móvel', 'Sem Regra de Xeque Tradicional', 'Bloqueio Tático Total'],
  },
  {
    id: 'bughouse',
    title: 'Bughouse (Xadrez Duplo 2v2)',
    badge: 'Multiplayer em Duplas',
    accentColor: '#06b6d4',
    icon: '👯',
    desc: 'Disputa cooperativa em 2 tabuleiros paralelos. Peças capturadas pelo seu parceiro vão direto para o seu bolso de drops no tabuleiro vizinho.',
    features: ['Dois Tabuleiros Gêmeos', 'Repasse Imediato de Peças', 'Salas Síncronas Colyseus'],
  },
  {
    id: 'puzzle_rush',
    title: 'Puzzle Rush & Sobrevivência',
    badge: 'Treino Tático',
    accentColor: '#ef4444',
    icon: '⚡',
    desc: 'Resolva o maior número de combinações táticas e problemas de mate contra o relógio em 3 ou 5 minutos antes de esgotar suas 3 vidas.',
    features: ['Modo 3 Minutos & 5 Minutos', 'Modo Sobrevivência Sem Limite', 'Banco de 100k Puzzles'],
  },
  {
    id: 'fog_of_war',
    title: 'Fog of War (Névoa de Guerra)',
    badge: 'Informação Oculta',
    accentColor: '#64748b',
    icon: '🌫️',
    desc: 'Visão tática restrita: veja apenas as casas e peças dentro do raio de visão e ataque dos seus guerreiros. Surpreenda o adversário no escuro!',
    features: ['Campo de Visão Dinâmico', 'Emboscadas & Furtividade', 'Desafio Estratégico'],
  },
  {
    id: 'atomic',
    title: 'Atomic Chess (Xadrez Atômico)',
    badge: 'Detonação Caótica',
    accentColor: '#f97316',
    icon: '💥',
    desc: 'Cada captura explode em uma detonação de 3×3 casas, destruindo a peça capturada, a peça agressora e todas as peças adjacentes não-peões.',
    features: ['Explosões de Raio 1', 'Destruição em Cadeia', 'Risco Extremo ao Rei'],
  },
  {
    id: 'antichess',
    title: 'Antichess (Losing Chess)',
    badge: 'Objetivo Invertido',
    accentColor: '#10b981',
    icon: '🔄',
    desc: 'O objetivo é perder todas as suas peças ou ficar sem movimentos legais! Capturas são estritamente obrigatórias quando disponíveis.',
    features: ['Capturas Forçadas', 'Sem Xeque nem Roque', 'Vitória por Desarmamento'],
  },
];

export const GameHub: React.FC<IGameHubProps> = ({
  onStartBotMatch,
  onStartLocalMatch,
  onResumeMatch,
  hasActiveMatch,
  turnNumber,
  activePlayer = 'P1',
  isGameOver = false,
  botEnabled,
  botDifficulty,
  onSelectDifficulty,
  onOpenThemeModal,
  progressive3DMode,
  onLaunchMinigame,
}) => {
  const { uiTheme, boardViewMode, setBoardViewMode } = useTheme();
  const activeDiff = DIFFICULTY_META.find((d) => d.level === botDifficulty) ?? DIFFICULTY_META[2];
  const isMatchInProgress = hasActiveMatch && !isGameOver;
  const isMatchConcluded = hasActiveMatch && isGameOver;

  const effectiveMode: Progressive3DMode = progressive3DMode ?? 'idle';

  const [is3DActive, setIs3DActive] = React.useState<boolean>(() => effectiveMode === 'eager');
  const [keyboardActivated, setKeyboardActivated] = React.useState<boolean>(false);
  const [activeHubTab, setActiveHubTab] = React.useState<'CLASSIC' | 'MINIGAMES' | 'ACADEMY'>('CLASSIC');
  const [academyCategory, setAcademyCategory] = React.useState<StudyCategory | 'ALL'>('ALL');
  const [revealedHints, setRevealedHints] = React.useState<Record<string, boolean>>({});
  const [exerciseAnswers, setExerciseAnswers] = React.useState<Record<string, string>>({});
  const [exerciseFeedback, setExerciseFeedback] = React.useState<
    Record<string, { isCorrect: boolean; message: string }>
  >({});
  const [academyStats, setAcademyStats] = React.useState(() =>
    AcademyStudyEngine.getAcademyStats()
  );
  const showcaseStageRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (effectiveMode === 'off') {
      setKeyboardActivated(false);
      setIs3DActive(false);
      return;
    }
    if (effectiveMode === 'eager') {
      setIs3DActive(true);
      return;
    }

    if (is3DActive || typeof window === 'undefined') {
      return;
    }

    let cancelled = false;
    const activateOnIdle = () => {
      if (!cancelled) {
        setIs3DActive(true);
      }
    };

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      const idleId = win.requestIdleCallback(activateOnIdle, { timeout: 1500 });
      return () => {
        cancelled = true;
        if (typeof win.cancelIdleCallback === 'function') {
          win.cancelIdleCallback(idleId);
        }
      };
    }

    const timerId = window.setTimeout(activateOnIdle, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [effectiveMode, is3DActive]);

  const handleActivate3D = React.useCallback(
    (origin: 'pointer' | 'keyboard' = 'pointer') => {
      if (effectiveMode !== 'idle') {
        return;
      }
      if (origin === 'keyboard') {
        setKeyboardActivated(true);
      }
      setIs3DActive((prev) => (prev ? prev : true));
    },
    [effectiveMode]
  );

  const shouldRender3D = effectiveMode === 'eager' || (effectiveMode === 'idle' && is3DActive);

  return (
    <div id="game-hub" className="hub-shell">
      {/* 1. Editorial Hero Banner with Integrated 3D Staunton Showcase */}
      <Card className="hub-hero-card" variant="elevated" style={{ padding: undefined }}>
        <div className="hub-hero-grid">
          {/* Left Column: Editorial Typography & Primary Actions */}
          <div className="hub-hero-copy">
            <div className="hub-eyebrow-row">
              <div className="hub-eyebrow-pill">
                <StatusIndicator status="active" pulse />
                <span>Experiência de Xadrez Avançada</span>
              </div>

              {isMatchInProgress && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: 'var(--color-success)',
                    backgroundColor: 'var(--bg-sunken)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.28rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                  }}
                >
                  Sessão ativa • Turno #{turnNumber}
                </span>
              )}
            </div>

            <h1 className="hub-hero-title">
              Domínio Tático &amp;{' '}
              <span
                style={{
                  color: 'var(--color-accent)',
                  display: 'inline-block',
                }}
              >
                Estudo de Partida
              </span>
            </h1>

            <p className="hub-hero-lead">
              Pratique contra cinco níveis de desafio ou dispute partidas presenciais no mesmo
              dispositivo, com avaliação posicional, revisão livre de jogadas e três atmosferas
              visuais.
            </p>

            {/* Primary & Secondary Hero Actions */}
            <div className="hub-cta-row">
              {isMatchInProgress ? (
                <>
                  <ActionButton
                    id="hub-btn-resume-match"
                    variant="primary"
                    size="lg"
                    onClick={onResumeMatch}
                    leadingIcon={
                      <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor">
                        <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                      </svg>
                    }
                  >
                    Retomar Partida (Turno #{turnNumber} • {activePlayer === 'P1' ? 'Brancas' : 'Pretas'})
                  </ActionButton>
                  <ActionButton
                    id="hub-hero-btn-play-bot"
                    variant="secondary"
                    size="lg"
                    onClick={() => onStartBotMatch(botDifficulty)}
                  >
                    Nova Partida vs IA
                  </ActionButton>
                </>
              ) : isMatchConcluded ? (
                <>
                  <ActionButton
                    id="hub-hero-btn-play-bot"
                    variant="primary"
                    size="lg"
                    onClick={() => onStartBotMatch(botDifficulty)}
                    leadingIcon={<span>⚔️</span>}
                  >
                    Iniciar Nova Partida vs IA
                  </ActionButton>
                  <ActionButton
                    id="hub-btn-view-board"
                    variant="secondary"
                    size="lg"
                    onClick={onResumeMatch}
                  >
                    Ver Posição Final (Fim de Jogo)
                  </ActionButton>
                </>
              ) : (
                <ActionButton
                  id="hub-hero-btn-play-bot"
                  variant="primary"
                  size="lg"
                  onClick={() => onStartBotMatch(botDifficulty)}
                  leadingIcon={
                    <svg viewBox="0 0 20 20" width="17" height="17" fill="currentColor">
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                  }
                >
                  Jogar contra Robô ({activeDiff.name})
                </ActionButton>
              )}

              <ActionButton
                id="hub-btn-customize-hero"
                variant="outline"
                size="lg"
                onClick={onOpenThemeModal}
                leadingIcon={
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="7.5" cy="7.5" r="1.5" />
                    <circle cx="12.5" cy="7.5" r="1.5" />
                    <circle cx="10" cy="12.5" r="1.5" />
                    <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0z" />
                  </svg>
                }
              >
                Temas &amp; Peças
              </ActionButton>
            </div>

            {/* Player Experience Highlights Strip */}
            <div className="hub-specs-strip">
              <div className="hub-spec-item">
                <span className="hub-spec-value">5 Níveis de Desafio</span>
                <span className="hub-spec-label">Do treino iniciante ao rigor tático</span>
              </div>
              <div className="hub-spec-item">
                <span className="hub-spec-value">Revisão de Lances</span>
                <span className="hub-spec-label">Desfazer, refazer e avaliação da posição</span>
              </div>
              <div className="hub-spec-item">
                <span className="hub-spec-value">3 Atmosferas Visuais</span>
                <span className="hub-spec-label">Midnight, Ivory &amp; Synthwave</span>
              </div>
            </div>
          </div>

          {/* Right Column: Progressive 2D -> 3D Staunton Knight Studio Stage */}
          <div
            id="chess-piece-showcase-container"
            ref={showcaseStageRef}
            className="hub-hero-stage"
            data-3d-state={shouldRender3D ? 'active' : 'inactive'}
            data-3d-mode={effectiveMode}
            onMouseEnter={effectiveMode === 'idle' ? () => handleActivate3D('pointer') : undefined}
            onTouchStart={effectiveMode === 'idle' ? () => handleActivate3D('pointer') : undefined}
          >
            {shouldRender3D ? (
              <LazyShowcaseErrorBoundary autoFocusOnError={keyboardActivated}>
                <React.Suspense
                  fallback={
                    <div
                      id="chess-piece-showcase-suspense-fallback"
                      data-testid="showcase-suspense-fallback"
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border-prominent)',
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <ShowcaseFallback finish="antique-brass" />
                    </div>
                  }
                >
                  <LazyChessPieceShowcase
                    initialFinish="antique-brass"
                    height="100%"
                    theme={uiTheme}
                    autoFocusFirstControl={keyboardActivated}
                  />
                </React.Suspense>
              </LazyShowcaseErrorBoundary>
            ) : effectiveMode === 'off' ? (
              <div
                id="chess-piece-showcase-fallback-container"
                data-testid="showcase-static-fallback"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-prominent)',
                  background:
                    'radial-gradient(circle at 50% 42%, var(--color-accent-subtle) 0%, var(--bg-surface) 74%)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <ShowcaseFallback finish="antique-brass" />
              </div>
            ) : (
              <button
                id="chess-piece-showcase-fallback-container"
                data-testid="showcase-fallback-trigger"
                type="button"
                aria-label="Ativar mostruário 3D interativo do Cavalo Staunton"
                onClick={() => handleActivate3D('pointer')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleActivate3D('keyboard');
                  }
                }}
                className="ui-control"
                style={{
                  width: '100%',
                  height: '100%',
                  padding: 0,
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-prominent)',
                  background:
                    'radial-gradient(circle at 50% 42%, var(--color-accent-subtle) 0%, var(--bg-surface) 74%)',
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <ShowcaseFallback finish="antique-brass" />
                <div
                  style={{
                    position: 'absolute',
                    bottom: '0.85rem',
                    left: '1rem',
                    right: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--text-secondary)',
                      backgroundColor: 'var(--bg-surface-glass)',
                      padding: '0.28rem 0.75rem',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    Cavalo Staunton • Ativar Estúdio 3D
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Game Modes Selection Section */}
      <section className="hub-modes-section" aria-labelledby="hub-modes-heading">
        <div className="hub-modes-header">
          <div>
            <span
              style={{
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.09em',
                color: 'var(--color-accent)',
                display: 'block',
                marginBottom: '0.3rem',
              }}
            >
              Seleção de Modalidade
            </span>
            <h2
              id="hub-modes-heading"
              style={{
                margin: 0,
                fontSize: '1.45rem',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                color: 'var(--text-primary)',
                letterSpacing: '-0.025em',
              }}
            >
              {activeHubTab === 'CLASSIC'
                ? 'Modos Clássicos & Arena Tática'
                : activeHubTab === 'MINIGAMES'
                ? 'Central de Minijogos & Modos Alternativos'
                : 'Área de Estudos & Academia Tática'}
            </h2>
          </div>

          {/* Section Navigation Tabs: Classic | Minigames | Academy */}
          <div
            role="tablist"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-sunken)',
              border: '1px solid var(--border-prominent)',
              flexWrap: 'wrap',
            }}
          >
            <button
              id="hub-tab-classic"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'CLASSIC'}
              onClick={() => setActiveHubTab('CLASSIC')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'CLASSIC' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'CLASSIC' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              ♟️ Clássico (2)
            </button>

            <button
              id="hub-tab-minigames"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'MINIGAMES'}
              onClick={() => setActiveHubTab('MINIGAMES')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'MINIGAMES' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'MINIGAMES' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              🧙‍♂️ Minijogos (7)
            </button>

            <button
              id="hub-tab-academy"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'ACADEMY'}
              onClick={() => setActiveHubTab('ACADEMY')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'ACADEMY' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'ACADEMY' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              🎓 Academia &amp; Estudo
            </button>
          </div>
        </div>

        {activeHubTab === 'CLASSIC' && (
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
                      📐 2D Vetorial
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
                      🎲 3D WebGL
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
              <ActionButton
                id="hub-card-btn-play-bot"
                variant="primary"
                size="md"
                fullWidth
                onClick={() => onStartBotMatch(botDifficulty)}
              >
                Iniciar Nova Partida vs IA ({activeDiff.name})
              </ActionButton>
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
              <ActionButton
                id="hub-btn-play-local"
                variant="secondary"
                size="md"
                fullWidth
                onClick={onStartLocalMatch}
              >
                Iniciar Duelo Local (2 Jogadores)
              </ActionButton>
            )}
          </Card>
        </div>
      )}

      {/* Minigames Grid */}
      {activeHubTab === 'MINIGAMES' && (
        <div
          id="hub-minigames-container"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: '1.25rem',
            alignItems: 'stretch',
          }}
        >
          {MINIGAMES_CATALOG.map((mg) => (
            <Card
              key={mg.id}
              id={`card-minigame-${mg.id}`}
              variant="interactive"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1.25rem',
                border: '1px solid var(--border-prominent)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{mg.icon}</span>
                    <div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '1.05rem',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {mg.title}
                      </h3>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontFamily: 'var(--font-mono)',
                          color: mg.accentColor,
                          fontWeight: 700,
                        }}
                      >
                        {mg.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <p
                  style={{
                    margin: 0,
                    fontSize: '0.84rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {mg.desc}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {mg.features.map((feat, fIdx) => (
                    <span
                      key={fIdx}
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'var(--font-mono)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: 'var(--bg-sunken)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>

              <ActionButton
                id={`hub-btn-play-${mg.id}`}
                variant="primary"
                size="sm"
                fullWidth
                onClick={() => {
                  if (onLaunchMinigame) {
                    onLaunchMinigame(mg.id);
                  } else {
                    onStartBotMatch(botDifficulty);
                  }
                }}
              >
                Jogar {mg.title.split(' ')[0]}
              </ActionButton>
            </Card>
          ))}
        </div>
      )}

      {/* Academy Study Area */}
      {activeHubTab === 'ACADEMY' && (
        <div id="hub-academy-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Academy Progress Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-sunken)',
              border: '1px solid var(--border-prominent)',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-accent)',
                }}
              >
                Progresso do Treinamento
              </span>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {academyStats.completedCount} de {academyStats.totalExercises} exercícios concluídos ({academyStats.completionPercentage}%)
              </span>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(['ALL', 'FUNDAMENTALS', 'TACTICS', 'CHECKMATES', 'ENDGAMES'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setAcademyCategory(cat)}
                  style={{
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    borderRadius: 'var(--radius-full)',
                    cursor: 'pointer',
                    backgroundColor:
                      academyCategory === cat ? 'var(--color-accent)' : 'var(--bg-card)',
                    color: academyCategory === cat ? '#ffffff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {cat === 'ALL'
                    ? 'Todos'
                    : cat === 'FUNDAMENTALS'
                    ? 'Fundamentos'
                    : cat === 'TACTICS'
                    ? 'Tática'
                    : cat === 'CHECKMATES'
                    ? 'Mates'
                    : 'Finais'}
                </button>
              ))}
            </div>
          </div>

          {/* Exercises Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '1.15rem',
            }}
          >
            {AcademyStudyEngine.EXERCISES.filter(
              (ex) => academyCategory === 'ALL' || ex.category === academyCategory
            ).map((ex) => {
              const isHintOpen = Boolean(revealedHints[ex.id]);
              const currentFeedback = exerciseFeedback[ex.id];
              const isCompleted = AcademyStudyEngine.getCompletedExerciseIds().includes(ex.id);

              return (
                <Card
                  key={ex.id}
                  id={`exercise-${ex.id}`}
                  variant="elevated"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.85rem',
                    padding: '1.15rem',
                    border: isCompleted
                      ? '1px solid var(--color-success)'
                      : '1px solid var(--border-prominent)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--bg-sunken)',
                          color: 'var(--color-accent)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        {ex.category} • {ex.difficulty}
                      </span>

                      {isCompleted && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 700,
                            color: 'var(--color-success)',
                          }}
                        >
                          ✓ Concluído
                        </span>
                      )}
                    </div>

                    <h4
                      style={{
                        margin: 0,
                        fontSize: '1rem',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {ex.title}
                    </h4>

                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                      {ex.prompt}
                    </p>

                    {isHintOpen && (
                      <div
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--bg-sunken)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '0.76rem',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                        }}
                      >
                        💡 {ex.hint}
                      </div>
                    )}

                    {currentFeedback && (
                      <div
                        role="status"
                        style={{
                          padding: '0.55rem 0.75rem',
                          borderRadius: 'var(--radius-xs)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          backgroundColor: currentFeedback.isCorrect
                            ? 'var(--color-success-bg, rgba(16, 185, 129, 0.15))'
                            : 'var(--color-warning-bg, rgba(234, 179, 8, 0.15))',
                          color: currentFeedback.isCorrect
                            ? 'var(--color-success)'
                            : 'var(--color-warning)',
                          border: `1px solid ${
                            currentFeedback.isCorrect
                              ? 'var(--color-success)'
                              : 'var(--color-warning)'
                          }`,
                        }}
                      >
                        {currentFeedback.message}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        id={`input-${ex.id}`}
                        type="text"
                        placeholder="Lance em SAN (ex: e4, Nf3, Ra8#)"
                        value={exerciseAnswers[ex.id] || ''}
                        onChange={(e) =>
                          setExerciseAnswers((prev) => ({ ...prev, [ex.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const ans = exerciseAnswers[ex.id] || '';
                            if (ans.trim()) {
                              const outcome = AcademyStudyEngine.verifyMove(ex.id, 0, ans);
                              setExerciseFeedback((prev) => ({
                                ...prev,
                                [ex.id]: { isCorrect: outcome.isCorrect, message: outcome.feedback },
                              }));
                              if (outcome.isCorrect) {
                                setAcademyStats(AcademyStudyEngine.getAcademyStats());
                              }
                            }
                          }
                        }}
                        style={{
                          flex: 1,
                          padding: '0.35rem 0.6rem',
                          fontSize: '0.78rem',
                          fontFamily: 'var(--font-mono)',
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid var(--border-prominent)',
                          backgroundColor: 'var(--bg-sunken)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const ans = exerciseAnswers[ex.id] || '';
                          if (ans.trim()) {
                            const outcome = AcademyStudyEngine.verifyMove(ex.id, 0, ans);
                            setExerciseFeedback((prev) => ({
                              ...prev,
                              [ex.id]: { isCorrect: outcome.isCorrect, message: outcome.feedback },
                            }));
                            if (outcome.isCorrect) {
                              setAcademyStats(AcademyStudyEngine.getAcademyStats());
                            }
                          }
                        }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.76rem',
                          fontFamily: 'var(--font-sans)',
                          fontWeight: 700,
                          borderRadius: 'var(--radius-xs)',
                          backgroundColor: 'var(--color-accent)',
                          color: '#ffffff',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Verificar
                      </button>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedHints((prev) => ({ ...prev, [ex.id]: !prev[ex.id] }))
                        }
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        {isHintOpen ? 'Ocultar Dica' : 'Ver Dica'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const sol = ex.solutionSequence[0];
                          const outcome = AcademyStudyEngine.verifyMove(ex.id, 0, sol);
                          setExerciseAnswers((prev) => ({ ...prev, [ex.id]: sol }));
                          setExerciseFeedback((prev) => ({
                            ...prev,
                            [ex.id]: { isCorrect: outcome.isCorrect, message: outcome.feedback },
                          }));
                          setAcademyStats(AcademyStudyEngine.getAcademyStats());
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-accent)',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Ver Resposta
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </section>
    </div>
  );
};

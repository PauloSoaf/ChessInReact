import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { SegmentedControl } from '../primitives/SegmentedControl';
import { StatusIndicator } from '../primitives/StatusIndicator';
import { ShowcaseFallback } from '../showcase/ShowcaseFallback';
import { useTheme } from '../../theme/ThemeContext';

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
}) => {
  const { uiTheme, boardViewMode, setBoardViewMode } = useTheme();
  const activeDiff = DIFFICULTY_META.find((d) => d.level === botDifficulty) ?? DIFFICULTY_META[2];
  const isMatchInProgress = hasActiveMatch && !isGameOver;
  const isMatchConcluded = hasActiveMatch && isGameOver;

  const effectiveMode: Progressive3DMode = progressive3DMode ?? 'idle';

  const [is3DActive, setIs3DActive] = React.useState<boolean>(() => effectiveMode === 'eager');
  const [keyboardActivated, setKeyboardActivated] = React.useState<boolean>(false);
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
              Modos de Jogo &amp; Arena Tática
            </h2>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Configure a força da inteligência artificial ou dispute localmente no mesmo dispositivo
          </span>
        </div>

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
      </section>
    </div>
  );
};

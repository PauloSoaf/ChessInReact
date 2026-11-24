import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { StatusIndicator } from '../primitives/StatusIndicator';
import { ShowcaseFallback } from '../showcase/ShowcaseFallback';
import { useTheme } from '../../theme/ThemeContext';
import { PreMatchStagingModal } from './PreMatchStagingModal';
import { TournamentArenaModal } from './TournamentArenaModal';
import { AcademyStudySection } from './AcademyStudySection';
import { ClassicModesSection } from './ClassicModesSection';
import { DIFFICULTY_META } from './difficultyTypes';
import { IMatchConfiguration } from '../../../matchmaking/config/IMatchConfiguration';
import { ArenasMultiplayerSection } from './ArenasMultiplayerSection';
import { MinigamesCatalogSection } from './MinigamesCatalogSection';
import { GeometricCatalogSection } from './GeometricCatalogSection';
import { HistoricalCatalogSection } from './HistoricalCatalogSection';
import { MatchmakingQueueModal } from './MatchmakingQueueModal';
import { LobbyBrowserModal } from './LobbyBrowserModal';
import { LiveSpectateModal } from './LiveSpectateModal';
import {
  IconSwords,
  IconClock,
} from '../../icons/AppIcons';

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
  onLaunchMatch?: (config: IMatchConfiguration) => void;
}

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
  onLaunchMatch,
}) => {
  const { uiTheme } = useTheme();
  const activeDiff = DIFFICULTY_META.find((d) => d.level === botDifficulty) ?? DIFFICULTY_META[2];
  const isMatchInProgress = hasActiveMatch && !isGameOver;
  const isMatchConcluded = hasActiveMatch && isGameOver;

  const effectiveMode: Progressive3DMode = progressive3DMode ?? 'idle';

  const [is3DActive, setIs3DActive] = React.useState<boolean>(() => effectiveMode === 'eager');
  const [keyboardActivated, setKeyboardActivated] = React.useState<boolean>(false);
  const [activeHubTab, setActiveHubTab] = React.useState<
    'CLASSIC' | 'MINIGAMES' | 'ARENAS' | 'GEOMETRIC' | 'HISTORICAL' | 'ACADEMY'
  >('CLASSIC');
  const [stagingVariantId, setStagingVariantId] = React.useState<string | null>(null);
  const [stagingParticipants, setStagingParticipants] = React.useState<number>(2);
  const [isTournamentModalOpen, setIsTournamentModalOpen] = React.useState<boolean>(false);
  const [isMatchmakingOpen, setIsMatchmakingOpen] = React.useState<boolean>(false);
  const [isLobbyBrowserOpen, setIsLobbyBrowserOpen] = React.useState<boolean>(false);
  const [isLiveSpectateOpen, setIsLiveSpectateOpen] = React.useState<boolean>(false);
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
                <span>Central de Partidas • Experiência de Xadrez Avançada</span>
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
                Variantes
              </span>
            </h1>

            <p className="hub-hero-lead">
              Escolha seu modo de jogo: enfrente a inteligência artificial, dispute partidas locais com amigos, explore variantes táticas ou resolva desafios.
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
                    leadingIcon={<IconSwords size={16} />}
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

              <ActionButton
                id="hub-btn-clock-hero"
                variant="outline"
                size="lg"
                onClick={() => {
                  setStagingVariantId('STANDARD');
                  setStagingParticipants(2);
                }}
                leadingIcon={<IconClock size={16} color="currentColor" />}
              >
                Relógio &amp; Modos (Bullet, Blitz, Rápido)
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
                ? 'Central de Minijogos & Modos Mágicos'
                : activeHubTab === 'ARENAS'
                ? 'Arenas Multijogador Massivas (3 a 12 Jogadores)'
                : activeHubTab === 'GEOMETRIC'
                ? 'Tabuleiros Geométricos & Peças Fadas'
                : activeHubTab === 'HISTORICAL'
                ? 'Variantes Históricas & Regionais (Ásia e Pérsia)'
                : 'Área de Estudos & Academia Tática'}
            </h2>
          </div>

          {/* Section Navigation Tabs: 6 Categories */}
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
              Clássico (2)
            </button>

            <button
              id="hub-tab-minigames"
              data-testid="hub-tab-minigames"
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
              Mágicos &amp; Híbridos (7)
            </button>

            <button
              id="hub-tab-arenas"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'ARENAS'}
              onClick={() => setActiveHubTab('ARENAS')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'ARENAS' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'ARENAS' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Arenas Massivas (3-12P)
            </button>

            <button
              id="hub-tab-geometric"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'GEOMETRIC'}
              onClick={() => setActiveHubTab('GEOMETRIC')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'GEOMETRIC' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'GEOMETRIC' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Fadas &amp; Geometria
            </button>

            <button
              id="hub-tab-historical"
              type="button"
              role="tab"
              aria-selected={activeHubTab === 'HISTORICAL'}
              onClick={() => setActiveHubTab('HISTORICAL')}
              style={{
                padding: '0.4rem 0.8rem',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor:
                  activeHubTab === 'HISTORICAL' ? 'var(--color-accent)' : 'transparent',
                color: activeHubTab === 'HISTORICAL' ? '#ffffff' : 'var(--text-secondary)',
                border: 'none',
                transition: 'all var(--transition-fast)',
              }}
            >
              Histórico &amp; Regional
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
              Academia &amp; Estudo
            </button>
          </div>
        </div>

        {activeHubTab === 'CLASSIC' && (
          <ClassicModesSection
            botEnabled={botEnabled}
            botDifficulty={botDifficulty}
            onSelectDifficulty={onSelectDifficulty}
            onStartBotMatch={onStartBotMatch}
            onStartLocalMatch={onStartLocalMatch}
            onResumeMatch={onResumeMatch}
            hasActiveMatch={hasActiveMatch}
            turnNumber={turnNumber}
            onOpenStagingModal={(variantId, participants) => {
              setStagingVariantId(variantId);
              setStagingParticipants(participants);
            }}
          />
        )}

      {/* Minigames Grid */}
      {activeHubTab === 'MINIGAMES' && (
        <MinigamesCatalogSection
          onLaunchMinigame={onLaunchMinigame}
          onStartBotMatch={onStartBotMatch}
          botDifficulty={botDifficulty}
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Arenas Massivas (3 a 12 Jogadores) */}
      {activeHubTab === 'ARENAS' && (
        <ArenasMultiplayerSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
          onOpenMatchmaking={() => setIsMatchmakingOpen(true)}
          onOpenLobbyBrowser={() => setIsLobbyBrowserOpen(true)}
          onOpenTournamentModal={() => setIsTournamentModalOpen(true)}
          onOpenLiveSpectate={() => setIsLiveSpectateOpen(true)}
        />
      )}

      {/* Tabuleiros Geométricos & Peças Fadas */}
      {activeHubTab === 'GEOMETRIC' && (
        <GeometricCatalogSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Variantes Históricas & Regionais */}
      {activeHubTab === 'HISTORICAL' && (
        <HistoricalCatalogSection
          onOpenStagingModal={(variantId, participants) => {
            setStagingVariantId(variantId);
            setStagingParticipants(participants);
          }}
        />
      )}

      {/* Academy Study Area */}
      {activeHubTab === 'ACADEMY' && (
        <AcademyStudySection
          onOpenTournamentModal={() => setIsTournamentModalOpen(true)}
        />
      )}
    </section>

      {/* Pre-Match Universal Staging Modal (Spec 16 § 5, RF-16-06) */}
      {stagingVariantId && (
        <PreMatchStagingModal
          isOpen={true}
          variantId={stagingVariantId}
          initialParticipantsCount={stagingParticipants}
          onClose={() => setStagingVariantId(null)}
          onLaunchMatch={(cfg) => {
            setStagingVariantId(null);
            if (onLaunchMatch) {
              onLaunchMatch(cfg);
            } else if (onLaunchMinigame) {
              onLaunchMinigame(cfg.variantId);
            } else {
              onStartBotMatch(cfg.slots[1]?.botConfig?.difficultyLevel ?? botDifficulty);
            }
          }}
        />
      )}

      {/* Spec 18: Competitive Tournament Arena & Swiss Modal */}
      <TournamentArenaModal
        isOpen={isTournamentModalOpen}
        onClose={() => setIsTournamentModalOpen(false)}
      />

      {/* Spec 08: Global Matchmaking & ELO Ranked Queue Modal */}
      <MatchmakingQueueModal
        isOpen={isMatchmakingOpen}
        onClose={() => setIsMatchmakingOpen(false)}
        userId="player_hub_user"
        displayName="Jogador"
        eloRating={1500}
        variantId="standard"
        playerCount={2}
        onMatchStart={() => {
          setIsMatchmakingOpen(false);
          if (onStartLocalMatch) {
            onStartLocalMatch();
          } else if (onStartBotMatch) {
            onStartBotMatch(botDifficulty);
          }
        }}
      />

      {/* Spec 08: Community Lobbies Browser Modal */}
      <LobbyBrowserModal
        isOpen={isLobbyBrowserOpen}
        onClose={() => setIsLobbyBrowserOpen(false)}
        userId="player_hub_user"
        displayName="Jogador"
        onJoinLobbySuccess={(lobby) => {
          setIsLobbyBrowserOpen(false);
          setStagingVariantId(lobby.variantId);
          setStagingParticipants(lobby.maxPlayers);
        }}
      />

      {/* Spec 08: Live Spectator Streaming Modal (US08-P06, RF-11) */}
      <LiveSpectateModal
        isOpen={isLiveSpectateOpen}
        onClose={() => setIsLiveSpectateOpen(false)}
      />
    </div>
  );
};

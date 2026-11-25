import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { StatusIndicator } from '../primitives/StatusIndicator';
import { ShowcaseFallback } from '../showcase/ShowcaseFallback';
import { IconSwords, IconClock } from '../../icons/AppIcons';
import { UIThemeId } from '../../theme/types';
import { Progressive3DMode } from './GameHub';

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

export interface IGameHubHeroSectionProps {
  readonly hasActiveMatch: boolean;
  readonly isGameOver?: boolean;
  readonly turnNumber: number;
  readonly activePlayer?: string;
  readonly botDifficulty: number;
  readonly activeDiffName: string;
  readonly effectiveMode: Progressive3DMode;
  readonly shouldRender3D: boolean;
  readonly keyboardActivated: boolean;
  readonly uiTheme: UIThemeId;
  readonly onResumeMatch: () => void;
  readonly onStartBotMatch: (difficulty: number) => void;
  readonly onStartLocalMatch?: () => void;
  readonly onSelectTab?: (tab: 'CLASSIC' | 'MINIGAMES' | 'ARENAS' | 'GEOMETRIC' | 'HISTORICAL' | 'ACADEMY') => void;
  readonly onNavigateToPuzzles?: () => void;
  readonly onOpenThemeModal: () => void;
  readonly onClockModalOpen: () => void;
  readonly onActivate3D: (origin?: 'pointer' | 'keyboard') => void;
}

export const GameHubHeroSection: React.FC<IGameHubHeroSectionProps> = ({
  hasActiveMatch,
  isGameOver = false,
  turnNumber,
  activePlayer = 'P1',
  botDifficulty,
  activeDiffName,
  effectiveMode,
  shouldRender3D,
  keyboardActivated,
  uiTheme,
  onResumeMatch,
  onStartBotMatch,
  onStartLocalMatch,
  onSelectTab,
  onNavigateToPuzzles,
  onOpenThemeModal,
  onClockModalOpen,
  onActivate3D,
}) => {
  const isMatchInProgress = hasActiveMatch && !isGameOver;
  const isMatchConcluded = hasActiveMatch && isGameOver;
  const showcaseStageRef = React.useRef<HTMLDivElement | null>(null);

  return (
    <Card className="hub-hero-card" variant="elevated" style={{ padding: undefined }}>
      <div className="hub-hero-grid">
        {/* Left Column: Editorial Typography & Primary Actions */}
        <div className="hub-hero-copy">
          <div className="hub-eyebrow-row">
            <div className="hub-eyebrow-pill">
              <StatusIndicator status="active" pulse />
              <span>Ateliê de Xadrez • Central de Partidas</span>
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
            Xadrez &amp;{' '}
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
            Escolha seu modo de jogo: dispute partidas contra o computador, jogue localmente com amigos, explore variantes táticas ou resolva desafios.
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
                  Ver Posição Final
                </ActionButton>
              </>
            ) : (
              <>
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
                  Jogar contra Robô ({activeDiffName})
                </ActionButton>
                {onStartLocalMatch && (
                  <ActionButton
                    id="hub-btn-play-local"
                    variant="secondary"
                    size="lg"
                    onClick={onStartLocalMatch}
                  >
                    Duelo Local (Pass &amp; Play)
                  </ActionButton>
                )}
                {onSelectTab && (
                  <ActionButton
                    id="hub-btn-explore-variants"
                    variant="outline"
                    size="lg"
                    onClick={() => onSelectTab('MINIGAMES')}
                  >
                    Explorar Variantes
                  </ActionButton>
                )}
                {onNavigateToPuzzles && (
                  <ActionButton
                    id="hub-btn-solve-puzzles"
                    variant="outline"
                    size="lg"
                    onClick={onNavigateToPuzzles}
                  >
                    Resolver Puzzles
                  </ActionButton>
                )}
              </>
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
              onClick={onClockModalOpen}
              leadingIcon={<IconClock size={16} color="currentColor" />}
            >
              Relógio &amp; Modos
            </ActionButton>
          </div>

          {/* Player Experience Highlights Strip */}
          <div className="hub-specs-strip">
            <div className="hub-spec-item">
              <span className="hub-spec-value">Inteligência Artificial</span>
              <span className="hub-spec-label">5 Níveis de Desafio do Iniciante ao Mestre</span>
            </div>
            <div className="hub-spec-item">
              <span className="hub-spec-value">Duelo Local &amp; Relógios</span>
              <span className="hub-spec-label">Pass &amp; Play com controles de tempo</span>
            </div>
            <div className="hub-spec-item">
              <span className="hub-spec-value">Variantes &amp; Estudos</span>
              <span className="hub-spec-label">Spell Chess, Puzzles e Topologias</span>
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
          onMouseEnter={effectiveMode === 'idle' ? () => onActivate3D('pointer') : undefined}
          onTouchStart={effectiveMode === 'idle' ? () => onActivate3D('pointer') : undefined}
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
              onClick={() => onActivate3D('pointer')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onActivate3D('keyboard');
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
  );
};


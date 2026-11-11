import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ChessBoard from './components/ChessBoard/ChessBoard';
import { useActivePlayer, useGameActions, useGameStore, useTurnNumber } from './bindings/react/useGameStore';
import { useBotMatch } from './bindings/react/useBotMatch';
import { useMoveFeedback } from './bindings/react/useMoveFeedback';
import { AIDifficultyLevel } from './workers/ai/interfaces/IAIEngineContracts';
import { bootstrapGame } from './core/bootstrap/GameInitializer';
import { gameStore } from './core/state/gameStore';
import { ThemeProvider, useTheme } from './ui/theme/ThemeContext';
import { TopNavBar } from './ui/components/navigation/TopNavBar';
import { ThemeCustomizerModal } from './ui/components/navigation/ThemeCustomizerModal';
import { GameHub } from './ui/components/hub/GameHub';
import { PlayerCard } from './ui/components/game/PlayerCard';
import { EvaluationBar } from './ui/components/game/EvaluationBar';
import { GameControlsBar } from './ui/components/game/GameControlsBar';
import { RulesEngine } from './engine/rules/RulesEngine';
import { CheckValidator } from './engine/rules/CheckValidator';
import { SquareTopology } from './core/topology/SquareTopology';
import { isWebGLAvailable } from './rendering/webglCapabilities';
import './ui/theme/theme.css';

// Lazy-loaded 3D WebGL Chessboard to preserve initial 2D bundle size (Spec 07 Priority 2)
const LazyChessBoard3D = React.lazy(() =>
  import('./rendering/ChessBoard3D').then((m) => ({ default: m.ChessBoard3D }))
);

/**
 * Resilient Error Boundary for 3D WebGL scene failures or WebGL context loss (Spec 07 Priority 3).
 * Seamlessly reverts to the 2D SVG board to prevent blank screens or game interruption.
 */
class ChessBoard3DErrorBoundary extends React.Component<
  { onFallback: () => void; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { onFallback: () => void; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[ChessBoard3D] WebGL mounting or context failure, reverting to 2D:', error);
    this.props.onFallback();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const DIFFICULTY_LABELS: Record<AIDifficultyLevel, string> = {
  1: 'Iniciante (N1)',
  2: 'Casual (N2)',
  3: 'Tático (N3)',
  4: 'Forte (N4)',
  5: 'Mestre (N5)',
};

const AppContent: React.FC = () => {
  const [boardSize, setBoardSize] = useState(8);
  const [currentView, setCurrentView] = useState<'HUB' | 'GAME'>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#game') {
      return 'GAME';
    }
    return 'HUB';
  });
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const { preferences, updatePreferences } = useTheme();
  const isBoardFlipped = Boolean(preferences.flipBoard);

  const activePlayer = useActivePlayer();
  const turnNumber = useTurnNumber();
  const revision = useGameStore((state) => state.domain.revision);
  const isGameOver = useGameStore((state) => state.domain.isGameOver);
  const winnerId = useGameStore((state) => state.domain.winnerId);
  const entityCount = useGameStore((state) => Object.keys(state.domain.boardEntities).length);
  const hasActiveMatch = turnNumber > 1 || revision > 0;

  const domain = useGameStore((state) => state.domain);
  const topology = useMemo(
    () => new SquareTopology({ width: boardSize, height: boardSize }),
    [boardSize]
  );

  // Check state detection for White (P1) and Black (P2)
  const isP1InCheck = useMemo(
    () => CheckValidator.isRoyalInCheck('P1', domain, topology),
    [domain, topology]
  );
  const isP2InCheck = useMemo(
    () => CheckValidator.isRoyalInCheck('P2', domain, topology),
    [domain, topology]
  );

  const {
    feedback: invalidMoveFeedback,
    triggerFeedback,
    clearFeedback,
  } = useMoveFeedback();

  const { undo, redo } = useGameActions();

  const {
    isBotEnabled,
    difficulty,
    isThinking,
    lastEval,
    toggleBot,
    setDifficulty,
    cancelSearch,
    forceBotMove,
    updateTopologySize,
  } = useBotMatch({
    botPlayer: 'P2',
    difficulty: 3,
  });

  // Automatically fallback to 2D if WebGL is unavailable on device/browser (Spec 07 Priority 3)
  useEffect(() => {
    if (preferences.boardViewMode === '3D' && !isWebGLAvailable()) {
      console.warn('[App] WebGL unavailable, automatically selecting 2D board mode.');
      updatePreferences({ boardViewMode: '2D' });
    }
  }, [preferences.boardViewMode, updatePreferences]);

  // Initialize Core match on first mount (AUDIT-04 Single Source of Truth)
  useEffect(() => {
    if (entityCount === 0) {
      bootstrapGame({ targetStore: gameStore });
    }
  }, [entityCount]);

  // Two-way synchronization with URL hash (#game vs #hub)
  useEffect(() => {
    const handleHashChange = () => {
      if (typeof window !== 'undefined') {
        setCurrentView(window.location.hash === '#game' ? 'GAME' : 'HUB');
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateTo = useCallback((view: 'HUB' | 'GAME') => {
    setCurrentView(view);
    if (typeof window !== 'undefined') {
      const targetHash = view === 'GAME' ? '#game' : '#hub';
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash;
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    cancelSearch();
    clearFeedback();
    bootstrapGame({ targetStore: gameStore });
  }, [cancelSearch, clearFeedback]);

  const handleUndo = useCallback(() => {
    cancelSearch();
    clearFeedback();
    if (isBotEnabled) {
      const currentActive = gameStore.getState().domain.activePlayer;
      if (currentActive === 'P2') {
        undo();
      } else {
        const undoneFirst = undo();
        if (undoneFirst) {
          if (gameStore.getState().domain.activePlayer === 'P2') {
            undo();
          }
        }
      }
    } else {
      undo();
    }
  }, [cancelSearch, clearFeedback, isBotEnabled, undo]);

  const handleRedo = useCallback(() => {
    cancelSearch();
    clearFeedback();
    if (isBotEnabled) {
      const redoneFirst = redo();
      if (redoneFirst) {
        if (gameStore.getState().domain.activePlayer === 'P2') {
          redo();
        }
      }
    } else {
      redo();
    }
  }, [cancelSearch, clearFeedback, isBotEnabled, redo]);

  const handleBoardSizeChange = useCallback(
    (newSize: number) => {
      const clamped = Math.max(4, Math.min(16, newSize));
      setBoardSize(clamped);
      updateTopologySize(clamped);
      clearFeedback();
    },
    [updateTopologySize, clearFeedback]
  );

  const handleFlipBoard = useCallback(() => {
    updatePreferences({ flipBoard: !preferences.flipBoard });
    clearFeedback();
  }, [preferences.flipBoard, updatePreferences, clearFeedback]);

  const canClaimDraw = useMemo(
    () => !isGameOver && RulesEngine.canClaimDraw(domain, topology),
    [domain, topology, isGameOver]
  );

  const handleOfferDraw = useCallback(() => {
    if (isGameOver) return;
    cancelSearch();
    clearFeedback();

    if (canClaimDraw) {
      RulesEngine.claimDraw(domain, topology);
      gameStore.setState((s) => ({
        domain: {
          ...s.domain,
          isGameOver: true,
          winnerId: null,
        },
      }));
      triggerFeedback('ILLEGAL_MOVE', {
        message: 'Empate formal reivindicado por repetição tripla ou regra dos 50 lances.',
      });
    } else {
      // Mutual draw offer: against bot, bot accepts if position is balanced (|eval| <= 150)
      const botAccepts = !isBotEnabled || (lastEval !== null && Math.abs(lastEval) <= 150);
      if (botAccepts) {
        gameStore.setState((s) => ({
          domain: {
            ...s.domain,
            isGameOver: true,
            winnerId: null,
          },
        }));
        triggerFeedback('ILLEGAL_MOVE', {
          message: 'Proposta de empate aceita! Partida encerrada por mútuo acordo.',
        });
      } else {
        triggerFeedback('ILLEGAL_MOVE', {
          message: 'A IA recusou a proposta de empate por avaliar vantagem no tabuleiro.',
        });
      }
    }
  }, [
    isGameOver,
    cancelSearch,
    clearFeedback,
    canClaimDraw,
    domain,
    topology,
    isBotEnabled,
    lastEval,
    triggerFeedback,
  ]);

  const handleResign = useCallback(() => {
    if (isGameOver) return;
    cancelSearch();
    clearFeedback();

    const opponent = activePlayer === 'P1' ? 'P2' : 'P1';
    gameStore.setState((s) => ({
      domain: {
        ...s.domain,
        isGameOver: true,
        winnerId: opponent,
      },
    }));
    triggerFeedback('ILLEGAL_MOVE', {
      message: `Você abandonou a partida. Vitória concedida às ${opponent === 'P1' ? 'Brancas' : 'Pretas'}.`,
    });
  }, [isGameOver, cancelSearch, clearFeedback, activePlayer, triggerFeedback]);

  // Global Keyboard Shortcuts (Strictly disabled when modal is open to avoid unintended rollbacks)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isThemeModalOpen) {
        if (e.key === 'Escape') {
          setIsThemeModalOpen(false);
        }
        return;
      }

      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key === 'y' || e.key === 'Y') {
        handleRedo();
      } else if (e.key === 'h' || e.key === 'H') {
        navigateTo(currentView === 'HUB' ? 'GAME' : 'HUB');
      } else if (e.key === 'v' || e.key === 'V') {
        clearFeedback();
        updatePreferences({ boardViewMode: preferences.boardViewMode === '3D' ? '2D' : '3D' });
      } else if (e.key === 'f' || e.key === 'F') {
        handleFlipBoard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isThemeModalOpen, handleUndo, handleRedo, navigateTo, currentView, preferences.boardViewMode, updatePreferences, clearFeedback, handleFlipBoard]);

  const handleResumeMatch = useCallback(() => {
    navigateTo('GAME');
  }, [navigateTo]);

  const handleStartBotMatch = useCallback(
    (level: number) => {
      toggleBot(true);
      setDifficulty(level as AIDifficultyLevel);
      handleReset();
      navigateTo('GAME');
    },
    [toggleBot, setDifficulty, handleReset, navigateTo]
  );

  const handleStartLocalMatch = useCallback(() => {
    toggleBot(false);
    handleReset();
    navigateTo('GAME');
  }, [toggleBot, handleReset, navigateTo]);

  const handleLaunchMinigame = useCallback(
    (minigameId: string) => {
      handleReset();
      navigateTo('GAME');
      triggerFeedback('ILLEGAL_MOVE', {
        message: `Modo ${minigameId.toUpperCase().replace(/_/g, ' ')} inicializado com sucesso na arena.`,
      });
    },
    [handleReset, navigateTo, triggerFeedback]
  );

  return (
    <div className="app-shell">
      {/* Persistent Responsive Top Navigation Bar */}
      <TopNavBar
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        isMatchActive={currentView === 'GAME' || hasActiveMatch}
        turnNumber={turnNumber}
        activePlayer={activePlayer}
        isGameOver={isGameOver}
      />

      {/* Main Content Area */}
      {currentView === 'HUB' ? (
        <GameHub
          onStartBotMatch={handleStartBotMatch}
          onStartLocalMatch={handleStartLocalMatch}
          onResumeMatch={handleResumeMatch}
          hasActiveMatch={hasActiveMatch}
          turnNumber={turnNumber}
          activePlayer={activePlayer}
          isGameOver={isGameOver}
          botEnabled={isBotEnabled}
          botDifficulty={difficulty}
          onSelectDifficulty={(d) => setDifficulty(d as AIDifficultyLevel)}
          onOpenThemeModal={() => setIsThemeModalOpen(true)}
          onLaunchMinigame={handleLaunchMinigame}
        />
      ) : (
        <div id="match-arena-shell" className="match-arena-shell" data-testid="match-arena-shell">
          <div className="match-arena-grid">
            {/* Left / Center Stage: Protagonist Chessboard + Evaluation Bar + Player Cards */}
            <div className="match-stage-column">
              {/* Top Player Strip (Opponent - Black P2) */}
              <div className="match-stage-player-wrap">
                <PlayerCard
                  playerId="P2"
                  displayName={isBotEnabled ? 'Oponente IA' : 'Jogador 2 (Pretas)'}
                  subtitle={
                    isBotEnabled
                      ? 'Peças Pretas • Inteligência Artificial'
                      : 'Peças Pretas • Controle Manual Local'
                  }
                  isTurnActive={!isGameOver && activePlayer === 'P2'}
                  isThinking={isThinking}
                  isBot={isBotEnabled}
                  difficultyLabel={isBotEnabled ? DIFFICULTY_LABELS[difficulty] : undefined}
                  isInCheck={!isGameOver && isP2InCheck}
                />
              </div>

              {/* Board Perspective & View Mode Switcher Ribbon (2D vs 3D and Board Flip) */}
              <div
                className="match-stage-controls-ribbon"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  maxWidth: '604px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-sunken)',
                  border: '1px solid var(--border-prominent)',
                  boxShadow: 'var(--shadow-sm)',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                {/* 2D / 3D Prominent Segmented Switcher */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    Visualização:
                  </span>
                  <div
                    style={{
                      display: 'inline-flex',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: '1.5px solid var(--border-prominent)',
                      backgroundColor: 'var(--bg-card)',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <button
                      id="arena-view-mode-2d-btn"
                      type="button"
                      aria-label="Ativar Visão 2D Clássica"
                      onClick={() => {
                        clearFeedback();
                        updatePreferences({ boardViewMode: '2D' });
                      }}
                      style={{
                        padding: '0.36rem 0.75rem',
                        fontSize: '0.78rem',
                        fontWeight: preferences.boardViewMode !== '3D' ? 800 : 600,
                        cursor: 'pointer',
                        backgroundColor: preferences.boardViewMode !== '3D' ? 'var(--color-accent)' : 'transparent',
                        color: preferences.boardViewMode !== '3D' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all var(--transition-fast)',
                      }}
                      title="Modo 2D Clássico / Vetorial (Atalho: V)"
                    >
                      <span style={{ fontSize: '0.85rem' }}>📐</span>
                      <span>2D Vetorial</span>
                    </button>
                    <button
                      id="arena-view-mode-3d-btn"
                      type="button"
                      aria-label="Ativar Visão 3D"
                      onClick={() => {
                        clearFeedback();
                        updatePreferences({ boardViewMode: '3D' });
                      }}
                      style={{
                        padding: '0.36rem 0.75rem',
                        fontSize: '0.78rem',
                        fontWeight: preferences.boardViewMode === '3D' ? 800 : 600,
                        cursor: 'pointer',
                        backgroundColor: preferences.boardViewMode === '3D' ? 'var(--color-accent)' : 'transparent',
                        color: preferences.boardViewMode === '3D' ? '#ffffff' : 'var(--text-secondary)',
                        border: 'none',
                        borderLeft: '1px solid var(--border-subtle)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        transition: 'all var(--transition-fast)',
                      }}
                      title="Modo 3D WebGL Realtime (Atalho: V)"
                    >
                      <span style={{ fontSize: '0.85rem' }}>🎲</span>
                      <span>Modo 3D</span>
                    </button>
                  </div>
                </div>

                {/* Flip Board Quick Trigger */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <button
                    id="arena-flip-board-quick-btn"
                    type="button"
                    onClick={handleFlipBoard}
                    title="Inverter orientação do tabuleiro (Atalho: F)"
                    style={{
                      padding: '0.36rem 0.75rem',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      backgroundColor: isBoardFlipped ? 'var(--color-accent-subtle)' : 'var(--bg-card)',
                      color: isBoardFlipped ? 'var(--color-accent)' : 'var(--text-secondary)',
                      border: isBoardFlipped ? '1.5px solid var(--border-active)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 10a6 6 0 0110.24-4.24L16 7M16 3v4h-4M16 10a6 6 0 01-10.24 4.24L4 13M4 17v-4h4" />
                    </svg>
                    <span>Girar</span>
                  </button>
                </div>
              </div>

              {/* Sculpted Board Bezel: Real-time Evaluation Bar + Protagonist Board */}
              <div className="match-board-bezel" style={{ width: '100%', maxWidth: '604px' }}>
                <div style={{ display: 'flex', flexShrink: 0, alignSelf: 'stretch' }}>
                  <EvaluationBar evalScore={lastEval} />
                </div>

                {preferences.boardViewMode === '3D' ? (
                  <ChessBoard3DErrorBoundary
                    onFallback={() => {
                      updatePreferences({ boardViewMode: '2D' });
                    }}
                  >
                    <React.Suspense
                      fallback={
                        <div
                          data-testid="chess-board-3d-loading"
                          style={{
                            width: 'min(75vw, 520px)',
                            height: 'min(75vw, 520px)',
                            borderRadius: 'var(--radius-lg)',
                            border: '2px solid var(--border-prominent)',
                            backgroundColor: 'var(--bg-card)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-secondary)',
                            fontSize: '0.82rem',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          Carregando Tabuleiro 3D WebGL...
                        </div>
                      }
                    >
                      <LazyChessBoard3D
                        boardSize={boardSize}
                        isBotThinking={isThinking}
                        botPlayer={isBotEnabled ? 'P2' : undefined}
                        disabled={isBotEnabled && activePlayer === 'P2'}
                        isFlipped={isBoardFlipped}
                        invalidMoveFeedback={invalidMoveFeedback}
                        onTriggerInvalidMove={triggerFeedback}
                        onClearInvalidMove={clearFeedback}
                        onFallbackTo2D={() => updatePreferences({ boardViewMode: '2D' })}
                      />
                    </React.Suspense>
                  </ChessBoard3DErrorBoundary>
                ) : (
                  <main
                    style={{
                      flex: 1,
                      maxWidth: '548px',
                      aspectRatio: '1 / 1',
                      borderRadius: 'var(--radius-md)',
                      overflow: 'hidden',
                      boxShadow: 'var(--shadow-lg)',
                      border: '2px solid var(--border-prominent)',
                      backgroundColor: 'var(--bg-card)',
                    }}
                  >
                    <ChessBoard
                      boardSize={boardSize}
                      isBotThinking={isThinking}
                      botPlayer={isBotEnabled ? 'P2' : undefined}
                      disabled={isBotEnabled && activePlayer === 'P2'}
                      invalidMoveFeedback={invalidMoveFeedback}
                      onTriggerInvalidMove={triggerFeedback}
                      onClearInvalidMove={clearFeedback}
                    />
                  </main>
                )}
              </div>

              {/* Bottom Player Strip (Human - White P1) */}
              <div className="match-stage-player-wrap">
                <PlayerCard
                  playerId="P1"
                  displayName="Você (Brancas)"
                  subtitle="Peças Brancas • Perspectiva Principal"
                  isTurnActive={!isGameOver && activePlayer === 'P1'}
                  isInCheck={!isGameOver && isP1InCheck}
                />
              </div>
            </div>

            {/* Right Sidebar: Match Status & Tactical Controls Deck */}
            <aside className="match-hud-sidebar" aria-label="Estado e Controles da Partida">
              {/* Check Constraint & Move Error Feedback Banner (US04-P06, SPEC07-CHECK-CONSTRAINT-FEEDBACK-01) */}
              {invalidMoveFeedback && (
                <div
                  role="status"
                  aria-live="polite"
                  data-testid="check-constraint-banner"
                  className={`check-constraint-banner ${
                    invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                      ? 'check-constraint-banner--danger'
                      : 'check-constraint-banner--warning'
                  }`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? 'var(--color-danger-bg)'
                        : 'rgba(212, 155, 75, 0.14)',
                    border:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? '1.5px solid var(--color-danger)'
                        : '1.5px solid var(--color-warning)',
                    boxShadow:
                      invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? '0 4px 16px rgba(239, 68, 68, 0.22)'
                        : '0 4px 16px rgba(212, 155, 75, 0.16)',
                    animation: 'checkErrorShake 0.4s ease',
                  }}
                >
                  <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>⚠️</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
                    <strong
                      style={{
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        color:
                          invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                            ? 'var(--color-danger)'
                            : 'var(--color-warning)',
                      }}
                    >
                      {invalidMoveFeedback.reason === 'CHECK_CONSTRAINT'
                        ? 'MOVIMENTO INVÁLIDO: REI EM XEQUE'
                        : 'MOVIMENTO NÃO PERMITIDO'}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                      {invalidMoveFeedback.message}
                    </span>
                  </div>
                </div>
              )}

              <div className="match-telemetry-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost"
                    onClick={() => navigateTo('HUB')}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.3rem 0.65rem',
                    }}
                  >
                    <span>←</span>
                    <span>Voltar ao Hub</span>
                  </button>

                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {isBotEnabled ? `Partida vs IA (${DIFFICULTY_LABELS[difficulty]})` : 'Duelo Local'}
                  </span>
                </div>

                {isGameOver && (
                  <div
                    role="status"
                    style={{
                      color: 'var(--color-danger)',
                      fontWeight: 800,
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-danger-bg)',
                      border: '1px solid var(--color-danger-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>FIM DE JOGO</span>
                    <span>
                      {winnerId
                        ? `Vitória: ${winnerId === 'P1' ? 'Brancas' : 'Pretas'}`
                        : 'Partida Encerrada'}
                    </span>
                  </div>
                )}

                <div className="match-telemetry-grid">
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Turno</span>
                    <span className="match-stat-value">#{turnNumber}</span>
                  </div>
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Vez de Jogar</span>
                    <span className="match-stat-value">
                      {isGameOver ? 'Encerrada' : activePlayer === 'P1' ? 'Brancas' : 'Pretas'}
                    </span>
                  </div>
                  <div className="match-stat-cell">
                    <span className="match-stat-label">Tabuleiro</span>
                    <span className="match-stat-value">
                      {boardSize}×{boardSize}
                    </span>
                  </div>
                </div>
              </div>

              <GameControlsBar
                isBotEnabled={isBotEnabled}
                difficulty={difficulty}
                isThinking={isThinking}
                lastEval={lastEval}
                boardSize={boardSize}
                onToggleBot={toggleBot}
                onSetDifficulty={setDifficulty}
                onBoardSizeChange={handleBoardSizeChange}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onReset={handleReset}
                onOpenThemeModal={() => setIsThemeModalOpen(true)}
                onFlipBoard={handleFlipBoard}
                isBoardFlipped={isBoardFlipped}
                boardViewMode={preferences.boardViewMode ?? '2D'}
                onToggleBoardViewMode={(mode) => {
                  clearFeedback();
                  updatePreferences({ boardViewMode: mode });
                }}
                onForceBotMove={forceBotMove}
                onOfferDraw={handleOfferDraw}
                onResign={handleResign}
                isGameOver={isGameOver}
                canClaimDraw={canClaimDraw}
              />
            </aside>
          </div>
        </div>
      )}

      {/* Theme Customizer Live Preview Modal */}
      <ThemeCustomizerModal
        isOpen={isThemeModalOpen}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
};

export default App;

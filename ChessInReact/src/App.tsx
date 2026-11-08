import React, { useEffect, useState, useCallback } from 'react';
import ChessBoard from './components/ChessBoard/ChessBoard';
import { useActivePlayer, useGameActions, useGameStore, useTurnNumber } from './bindings/react/useGameStore';
import { useBotMatch } from './bindings/react/useBotMatch';
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
import './ui/theme/theme.css';

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

  const { undo, redo } = useGameActions();

  const {
    isBotEnabled,
    difficulty,
    isThinking,
    lastEval,
    toggleBot,
    setDifficulty,
    cancelSearch,
    updateTopologySize,
  } = useBotMatch({
    botPlayer: 'P2',
    difficulty: 3,
  });

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
    bootstrapGame({ targetStore: gameStore });
  }, [cancelSearch]);

  const handleUndo = useCallback(() => {
    cancelSearch();
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
  }, [cancelSearch, isBotEnabled, undo]);

  const handleRedo = useCallback(() => {
    cancelSearch();
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
  }, [cancelSearch, isBotEnabled, redo]);

  const handleBoardSizeChange = useCallback(
    (newSize: number) => {
      const clamped = Math.max(4, Math.min(16, newSize));
      setBoardSize(clamped);
      updateTopologySize(clamped);
    },
    [updateTopologySize]
  );

  const handleFlipBoard = useCallback(() => {
    updatePreferences({ flipBoard: !preferences.flipBoard });
  }, [preferences.flipBoard, updatePreferences]);

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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isThemeModalOpen, handleUndo, handleRedo, navigateTo, currentView]);

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
                />
              </div>

              {/* Sculpted Board Bezel: Real-time Evaluation Bar + Protagonist Board */}
              <div className="match-board-bezel" style={{ width: '100%', maxWidth: '604px' }}>
                <div style={{ display: 'flex', flexShrink: 0, alignSelf: 'stretch' }}>
                  <EvaluationBar evalScore={lastEval} />
                </div>

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
                  />
                </main>
              </div>

              {/* Bottom Player Strip (Human - White P1) */}
              <div className="match-stage-player-wrap">
                <PlayerCard
                  playerId="P1"
                  displayName="Você (Brancas)"
                  subtitle="Peças Brancas • Perspectiva Principal"
                  isTurnActive={!isGameOver && activePlayer === 'P1'}
                />
              </div>
            </div>

            {/* Right Sidebar: Match Status & Tactical Controls Deck */}
            <aside className="match-hud-sidebar" aria-label="Estado e Controles da Partida">
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

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
  1: 'Iniciante (D1)',
  2: 'Casual (D2)',
  3: 'Intermediário (D3)',
  4: 'Avançado (D4)',
  5: 'Mestre (D5)',
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
        // In bot's turn: undo the human move that initiated the deliberation
        undo();
      } else {
        // In human's turn: undo full 2-ply round (bot move + human move)
        const undoneFirst = undo();
        if (undoneFirst) {
          // If state reverts to bot's turn, undo once more so turn returns to the human
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
      // In human vs bot mode, redo restores a full 2-ply round (human move + bot move)
      const redoneFirst = redo();
      if (redoneFirst) {
        // If state is at bot's turn, redo the bot move immediately as part of the same round
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

      // Avoid intercepting form inputs
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
    (level: AIDifficultyLevel) => {
      toggleBot(true);
      setDifficulty(level);
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-canvas, var(--bg-app))',
        color: 'var(--text-primary)',
        fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        transition: 'background-color var(--transition-normal), color var(--transition-normal)',
      }}
    >
      {/* Modern Responsive Top Navigation Bar */}
      <TopNavBar
        currentView={currentView}
        onNavigate={navigateTo}
        onOpenThemeModal={() => setIsThemeModalOpen(true)}
        isMatchActive={hasActiveMatch}
        turnNumber={turnNumber}
        activePlayer={activePlayer}
        isGameOver={isGameOver}
      />

      {/* Main Body */}
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
          onSelectDifficulty={setDifficulty}
          onOpenThemeModal={() => setIsThemeModalOpen(true)}
        />
      ) : (
        <div
          className="animate-fade-in"
          style={{
            maxWidth: '1080px',
            width: '100%',
            margin: '0 auto',
            padding: 'clamp(1rem, 3vw, 2rem) clamp(0.75rem, 2.5vw, 1.5rem) clamp(2rem, 4vw, 4rem)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            alignItems: 'center',
          }}
        >
          {/* Match HUD Subheader */}
          <div
            style={{
              width: '100%',
              maxWidth: '620px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>
                Turno: <strong style={{ color: 'var(--text-primary)' }}>#{turnNumber}</strong>
              </span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>
                Rev: <strong style={{ color: 'var(--text-muted)' }}>{revision}</strong>
              </span>
              <span style={{ opacity: 0.4 }}>•</span>
              <span>
                Dim: <strong style={{ color: 'var(--text-primary)' }}>{boardSize}×{boardSize}</strong>
              </span>
            </div>

            {isGameOver && (
              <span
                style={{
                  color: 'var(--color-danger)',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(248, 113, 113, 0.16)',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                }}
              >
                FIM DE JOGO
              </span>
            )}
          </div>

          {/* Opponent Card (Black - P2) */}
          <div style={{ width: '100%', maxWidth: '620px' }}>
            <PlayerCard
              playerId="P2"
              displayName={isBotEnabled ? 'Robô MCTS / Alpha-Beta' : 'Jogador 2'}
              isTurnActive={activePlayer === 'P2'}
              isThinking={isThinking}
              isBot={isBotEnabled}
              difficultyLabel={isBotEnabled ? DIFFICULTY_LABELS[difficulty] : undefined}
            />
          </div>

          {/* Central Arena: Evaluation Bar + Protagonist Chessboard (Pieces rendered upright) */}
          <div
            style={{
              width: '100%',
              maxWidth: '620px',
              display: 'flex',
              alignItems: 'stretch',
              justifyContent: 'center',
              gap: 'clamp(0.4rem, 1.5vw, 0.875rem)',
            }}
          >
            {/* Real-time Positional Evaluation Bar (Spec 06 RF-15) */}
            <div style={{ display: 'flex', flexShrink: 0, alignSelf: 'stretch' }}>
              <EvaluationBar evalScore={lastEval} />
            </div>

            {/* Chessboard Main Surface (No inverted CSS transform) */}
            <main
              style={{
                flex: 1,
                maxWidth: '560px',
                aspectRatio: '1 / 1',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-lg), var(--shadow-glow)',
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

          {/* Player Card (White - P1 / You) */}
          <div style={{ width: '100%', maxWidth: '620px' }}>
            <PlayerCard
              playerId="P1"
              displayName="Você (Humano)"
              isTurnActive={activePlayer === 'P1'}
            />
          </div>

          {/* Unified Controls Bar */}
          <div style={{ width: '100%', maxWidth: '620px', marginTop: '0.25rem' }}>
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

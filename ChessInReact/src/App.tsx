import React, { useEffect, useState } from 'react';
import ChessBoard from './components/ChessBoard/ChessBoard';
import { Input } from 'antd';
import { useActivePlayer, useGameActions, useGameStore, useTurnNumber } from './bindings/react/useGameStore';
import { useBotMatch } from './bindings/react/useBotMatch';
import { AIDifficultyLevel } from './workers/ai/interfaces/IAIEngineContracts';
import { bootstrapGame } from './core/bootstrap/GameInitializer';
import { gameStore } from './core/state/gameStore';

const App: React.FC = () => {
  const [boardSize, setBoardSize] = useState(8);

  const activePlayer = useActivePlayer();
  const turnNumber = useTurnNumber();
  const revision = useGameStore((state) => state.domain.revision);
  const isGameOver = useGameStore((state) => state.domain.isGameOver);
  const entityCount = useGameStore((state) => Object.keys(state.domain.boardEntities).length);

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

  const handleReset = () => {
    cancelSearch();
    bootstrapGame({ targetStore: gameStore });
  };

  const handleUndo = () => {
    cancelSearch();
    if (isBotEnabled) {
      if (isThinking) {
        // If bot is thinking, undo the single human move that initiated the deliberation
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
  };

  const handleRedo = () => {
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
  };

  const handleBoardSizeChange = (newSize: number) => {
    const clamped = Math.max(4, Math.min(16, newSize));
    setBoardSize(clamped);
    updateTopologySize(clamped);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        backgroundColor: '#18181b',
        color: '#f4f4f5',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em' }}>
          ChessInReact — Core Architecture
        </h1>
        <div
          style={{
            display: 'flex',
            gap: '1.5rem',
            alignItems: 'center',
            fontSize: '0.95rem',
            color: '#a1a1aa',
          }}
        >
          <span>
            Active Player:{' '}
            <strong style={{ color: activePlayer === 'P1' ? '#38bdf8' : '#f43f5e' }}>
              {activePlayer === 'P1' ? 'White (P1)' : 'Black (P2)'}
            </strong>
          </span>
          <span>•</span>
          <span>
            Turn: <strong>#{turnNumber}</strong> (Rev {revision})
          </span>
          {isGameOver && (
            <>
              <span>•</span>
              <span style={{ color: '#ef4444', fontWeight: 700 }}>GAME OVER</span>
            </>
          )}
        </div>
      </header>

      {/* Minimal Bot Match Controls (Spec 05 functional integration, no Spec 06 visual overhaul) */}
      <div
        id="bot-controls"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          backgroundColor: '#27272a',
          padding: '0.625rem 1.25rem',
          borderRadius: '8px',
          border: '1px solid #3f3f46',
          fontSize: '0.875rem',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            id="bot-toggle-checkbox"
            type="checkbox"
            checked={isBotEnabled}
            onChange={(e) => toggleBot(e.target.checked)}
            style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
          />
          <span>AI Opponent (P2 - Black)</span>
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="bot-difficulty-select" style={{ color: '#a1a1aa' }}>
            Level:
          </label>
          <select
            id="bot-difficulty-select"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value) as AIDifficultyLevel)}
            style={{
              backgroundColor: '#18181b',
              color: '#f4f4f5',
              border: '1px solid #3f3f46',
              borderRadius: '4px',
              padding: '0.25rem 0.5rem',
              fontSize: '0.875rem',
            }}
          >
            <option value={1}>1 - Novice (D1)</option>
            <option value={2}>2 - Casual (D2)</option>
            <option value={3}>3 - Intermediate (D3)</option>
            <option value={4}>4 - Advanced (D4)</option>
            <option value={5}>5 - Master (D5)</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            id="bot-status-badge"
            style={{
              padding: '0.2rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: isThinking ? '#f59e0b' : '#3f3f46',
              color: isThinking ? '#000000' : '#d4d4d8',
            }}
          >
            {isThinking ? '🤖 Calculating...' : 'Idle'}
          </span>
          {lastEval !== null && (
            <span
              id="bot-eval-badge"
              style={{
                fontSize: '0.75rem',
                color: '#a1a1aa',
                fontFamily: 'monospace',
              }}
            >
              Eval: {lastEval > 0 ? `+${(lastEval / 100).toFixed(2)}` : (lastEval / 100).toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <label htmlFor="board-size-input" style={{ fontSize: '0.875rem', color: '#a1a1aa' }}>
          Board Dimension:
        </label>
        <Input
          id="board-size-input"
          type="number"
          min={4}
          max={16}
          value={boardSize}
          onChange={(event) => {
            handleBoardSizeChange(Number(event.target.value) || 8);
          }}
          style={{
            width: '4.5rem',
            height: '2rem',
            color: '#f4f4f5',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            textAlign: 'center',
          }}
        />
      </div>

      <main
        style={{
          width: 'min(80vw, 560px)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4)',
          border: '1px solid #27272a',
        }}
      >
        <ChessBoard
          boardSize={boardSize}
          isBotThinking={isThinking}
          botPlayer={isBotEnabled ? 'P2' : undefined}
          disabled={isBotEnabled && activePlayer === 'P2'}
        />
      </main>

      <footer style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
        <button
          id="bot-undo-button"
          type="button"
          onClick={handleUndo}
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: '#27272a',
            color: '#f4f4f5',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease',
          }}
        >
          ↶ Undo
        </button>

        <button
          id="bot-redo-button"
          type="button"
          onClick={handleRedo}
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: '#27272a',
            color: '#f4f4f5',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease',
          }}
        >
          ↷ Redo
        </button>

        <button
          id="bot-reset-button"
          type="button"
          onClick={handleReset}
          style={{
            padding: '0.5rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: '#0284c7',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            transition: 'background-color 0.15s ease',
          }}
        >
          ↻ Reset Match
        </button>
      </footer>
    </div>
  );
};

export default App;

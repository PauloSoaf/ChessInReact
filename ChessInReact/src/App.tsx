import React, { useEffect, useState } from 'react';
import ChessBoard from './components/ChessBoard/ChessBoard';
import { Input } from 'antd';
import { useActivePlayer, useGameActions, useGameStore, useTurnNumber } from './bindings/react/useGameStore';
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

  // Initialize Core match on first mount (AUDIT-04 Single Source of Truth)
  useEffect(() => {
    if (entityCount === 0) {
      bootstrapGame({ targetStore: gameStore });
    }
  }, [entityCount]);

  const handleReset = () => {
    bootstrapGame({ targetStore: gameStore });
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
            const newSize = Math.max(4, Math.min(16, Number(event.target.value) || 8));
            setBoardSize(newSize);
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
        <ChessBoard boardSize={boardSize} />
      </main>

      <footer style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
        <button
          type="button"
          onClick={() => undo()}
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
          type="button"
          onClick={() => redo()}
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

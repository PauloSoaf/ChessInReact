import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  PuzzleRushEngine,
  IPuzzleRushSession,
  ITacticalPuzzle,
  PuzzleRushMode,
} from '../../../analysis/minigames/PuzzleRushEngine';
import { PuzzleBattleBotStrategy } from '../../../workers/ai/strategies/PuzzleBattleBotStrategy';

export interface IPuzzleRushArenaProps {
  onBackToHub: () => void;
  initialMode?: PuzzleRushMode;
}

export const PuzzleRushArena: React.FC<IPuzzleRushArenaProps> = ({
  onBackToHub,
  initialMode = 'TIMED_3MIN',
}) => {
  const [puzzles] = useState<readonly ITacticalPuzzle[]>(() =>
    PuzzleRushEngine.getCanonicalPuzzleCatalog()
  );
  const [session, setSession] = useState<IPuzzleRushSession>(() =>
    PuzzleRushEngine.createSession(initialMode)
  );
  const [candidateMove, setCandidateMove] = useState('');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [botPuzzleIndex, setBotPuzzleIndex] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer ticker
  useEffect(() => {
    if (session.isGameOver || session.isPaused || session.timeRemainingMs === Infinity) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSession((prev) => PuzzleRushEngine.tickTimer(prev, 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session.isGameOver, session.isPaused, session.timeRemainingMs]);

  // Local Puzzle Battle opponent: the bot consumes the same ordered puzzle stream
  // and publishes its score through the authoritative session transition.
  useEffect(() => {
    if (session.mode !== 'BATTLE' || session.isGameOver || session.isPaused) return;

    const puzzle = puzzles[botPuzzleIndex];
    if (!puzzle) return;

    const result = PuzzleBattleBotStrategy.simulatePuzzleAttempt(
      1600,
      puzzle.rating,
      puzzle.solutionMoves[0] ?? ''
    );
    const timeout = setTimeout(() => {
      setSession((prev) =>
        PuzzleRushEngine.updateOpponentScore(
          prev,
          (prev.battleOpponentScore ?? 0) + (result.isSolved ? 1 : 0)
        )
      );
      setBotPuzzleIndex((prev) => prev + 1);
    }, result.thinkTimeMs);

    return () => clearTimeout(timeout);
  }, [botPuzzleIndex, puzzles, session.isGameOver, session.isPaused, session.mode]);

  const currentPuzzle: ITacticalPuzzle | undefined = puzzles[session.currentPuzzleIndex];

  const handleSubmit = useCallback(
    (move: string) => {
      if (session.isGameOver || !move.trim()) return;

      const outcome = PuzzleRushEngine.submitMove(session, puzzles, move.trim());
      setSession(outcome.nextSession);

      if (outcome.isCorrect) {
        setFeedback({
          isCorrect: true,
          message: outcome.isPuzzleCompleted
            ? '✅ Combinação correta! Próximo problema...'
            : '✅ Lance correto! Complete a linha tática...',
        });
      } else {
        setFeedback({
          isCorrect: false,
          message: `❌ Lance incorreto (${move}). Vida consumida!`,
        });
      }

      setCandidateMove('');
    },
    [session, puzzles]
  );

  const handleRestart = useCallback(() => {
    setSession(PuzzleRushEngine.createSession(initialMode));
    setFeedback(null);
    setCandidateMove('');
    setBotPuzzleIndex(0);
  }, [initialMode]);

  const formatTime = (ms: number) => {
    if (ms === Infinity) return '∞';
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      id="puzzle-rush-arena"
      data-testid="puzzle-rush-arena"
      role="region"
      aria-label="Arena Tática Puzzle Rush"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '720px',
        margin: '0 auto',
        padding: '1.25rem 1rem',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <button
          type="button"
          id="pr-btn-back"
          onClick={onBackToHub}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: 0,
          }}
        >
          ← Voltar ao Hub
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span
            id="pr-timer"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.15rem',
              fontWeight: 800,
              color: session.timeRemainingMs < 30000 ? 'var(--color-danger)' : 'var(--text-primary)',
            }}
          >
            ⏱️ {formatTime(session.timeRemainingMs)}
          </span>

          <span
            id="pr-score"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.15rem',
              fontWeight: 800,
              color: 'var(--color-accent)',
            }}
          >
            🏆 {session.score}
          </span>

          {session.mode === 'BATTLE' && (
            <span
              id="pr-opponent-score"
              aria-label={`Pontuação do bot: ${session.battleOpponentScore ?? 0}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.05rem',
                fontWeight: 800,
                color: 'var(--color-warning)',
              }}
            >
              🤖 {session.battleOpponentScore ?? 0}
            </span>
          )}

          {session.lives !== Infinity && (
            <span id="pr-lives" style={{ fontSize: '1.1rem' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} style={{ opacity: i < session.lives ? 1 : 0.25 }}>
                  ❤️
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {session.isGameOver ? (
        <Card
          id="pr-game-over-card"
          variant="elevated"
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.25rem',
          }}
        >
          <span style={{ fontSize: '3rem' }}>🏁</span>
          <h2 style={{ margin: 0, fontSize: '1.6rem', color: 'var(--text-primary)' }}>
            Fim do Desafio Tático!
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Você resolveu <strong>{session.score}</strong> puzzles táticos com sucesso!
          </p>

          <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <ActionButton id="pr-btn-restart" variant="primary" onClick={handleRestart}>
              Jogar Novamente
            </ActionButton>
            <ActionButton id="pr-btn-exit" variant="secondary" onClick={onBackToHub}>
              Voltar ao Hub
            </ActionButton>
          </div>
        </Card>
      ) : currentPuzzle ? (
        <Card
          id="pr-active-puzzle-card"
          variant="elevated"
          style={{
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                padding: '0.25rem 0.65rem',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'rgba(79, 140, 255, 0.14)',
                border: '1px solid var(--color-accent)',
                color: 'var(--color-accent)',
                fontWeight: 700,
              }}
            >
              Rating: {currentPuzzle.rating} • {currentPuzzle.theme}
            </span>

            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Problema #{session.currentPuzzleIndex + 1} de {puzzles.length}
            </span>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-sunken)',
              padding: '0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
            }}
          >
            <strong>FEN:</strong> {currentPuzzle.fen}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label
              htmlFor="pr-move-input"
              style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}
            >
              Insira o melhor lance (formato UCI, ex: {currentPuzzle.solutionMoves[0]}):
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="pr-move-input"
                data-testid="pr-move-input"
                type="text"
                value={candidateMove}
                onChange={(e) => setCandidateMove(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit(candidateMove);
                }}
                placeholder={`ex: ${currentPuzzle.solutionMoves[0]}`}
                style={{
                  flex: 1,
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-prominent)',
                  backgroundColor: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  fontSize: '0.9rem',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
              <ActionButton
                id="pr-btn-submit"
                variant="primary"
                onClick={() => handleSubmit(candidateMove)}
              >
                Enviar
              </ActionButton>
            </div>
          </div>

          {/* Quick Click Suggested Move Shortcuts */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Atalhos:</span>
            {currentPuzzle.solutionMoves.map((m, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSubmit(m)}
                style={{
                  background: 'var(--bg-sunken)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.2rem 0.5rem',
                  cursor: 'pointer',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {feedback && (
            <div
              id="pr-feedback"
              style={{
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: feedback.isCorrect
                  ? 'rgba(34, 197, 94, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                border: feedback.isCorrect
                  ? '1px solid var(--color-success)'
                  : '1px solid var(--color-danger)',
                color: feedback.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              {feedback.message}
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
};

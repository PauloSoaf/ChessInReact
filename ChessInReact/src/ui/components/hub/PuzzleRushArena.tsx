import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  PuzzleRushEngine,
  IPuzzleRushSession,
  ITacticalPuzzle,
  PuzzleRushMode,
} from '../../../analysis/minigames/PuzzleRushEngine';
import { PuzzleBattleBotStrategy } from '../../../workers/ai/strategies/PuzzleBattleBotStrategy';
import { PieceRenderer } from '../pieces/PieceRenderer';
import { useTheme } from '../../theme/ThemeContext';
import { PlayerId } from '../../../core/coordinates/types';
import { GlobalEventBus } from '../../../core/events/EventBus';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';

export interface IPuzzleRushArenaProps {
  onBackToHub: () => void;
  initialMode?: PuzzleRushMode;
}

interface IParsedFenPiece {
  readonly variantId: string;
  readonly ownerId: PlayerId;
}

const FEN_LETTER_TO_VARIANT: Record<string, string> = {
  p: 'PAWN',
  n: 'KNIGHT',
  b: 'BISHOP',
  r: 'ROOK',
  q: 'QUEEN',
  k: 'KING',
};

const BOT_DIFFICULTY_ELO: Record<AIDifficultyLevel, number> = {
  1: 1000,
  2: 1350,
  3: 1650,
  4: 2000,
  5: 2400,
};

function parseFenBoard(
  fen: string,
  executedMoves: readonly string[] = []
): Map<string, IParsedFenPiece> {
  const map = new Map<string, IParsedFenPiece>();
  const placement = fen.split(' ')[0] ?? '';
  const ranks = placement.split('/');

  for (let rIdx = 0; rIdx < ranks.length && rIdx < 8; rIdx++) {
    const rank = 7 - rIdx;
    let file = 0;
    for (const ch of ranks[rIdx]) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch, 10);
      } else {
        const variantId = FEN_LETTER_TO_VARIANT[ch.toLowerCase()];
        if (variantId && file < 8) {
          const isWhite = ch === ch.toUpperCase();
          const alg = `${String.fromCharCode(97 + file)}${rank + 1}`;
          map.set(alg, {
            variantId,
            ownerId: isWhite ? 'P1' : 'P2',
          });
        }
        file += 1;
      }
    }
  }

  for (const uci of executedMoves) {
    if (uci.length >= 4) {
      const from = uci.slice(0, 2).toLowerCase();
      const to = uci.slice(2, 4).toLowerCase();
      const moving = map.get(from);
      if (moving) {
        map.delete(from);
        map.set(to, moving);
      }
    }
  }
  return map;
}

export const PuzzleRushArena: React.FC<IPuzzleRushArenaProps> = ({
  onBackToHub,
  initialMode = 'TIMED_3MIN',
}) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const [puzzles] = useState<readonly ITacticalPuzzle[]>(() =>
    PuzzleRushEngine.getCanonicalPuzzleCatalog()
  );
  const [session, setSession] = useState<IPuzzleRushSession>(() =>
    PuzzleRushEngine.createSession(initialMode)
  );
  const [candidateMove, setCandidateMove] = useState('');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);
  const [botPuzzleIndex, setBotPuzzleIndex] = useState(0);
  const [selectedMode, setSelectedMode] = useState<PuzzleRushMode>(initialMode);
  const [botDifficulty, setBotDifficulty] = useState<AIDifficultyLevel>(3);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);

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

  // Local Puzzle Battle opponent: calibrated by selected botDifficulty ELO
  useEffect(() => {
    if (session.mode !== 'BATTLE' || session.isGameOver || session.isPaused) return;

    const puzzle = puzzles[botPuzzleIndex];
    if (!puzzle) return;

    const botElo = BOT_DIFFICULTY_ELO[botDifficulty];
    const result = PuzzleBattleBotStrategy.simulatePuzzleAttempt(
      botElo,
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
  }, [botPuzzleIndex, puzzles, session.isGameOver, session.isPaused, session.mode, botDifficulty]);

  const currentPuzzle: ITacticalPuzzle | undefined = puzzles[session.currentPuzzleIndex];
  const boardPiecesMap = useMemo(
    () =>
      currentPuzzle
        ? parseFenBoard(
            currentPuzzle.fen,
            currentPuzzle.solutionMoves.slice(0, session.currentMoveIndex)
          )
        : new Map<string, IParsedFenPiece>(),
    [currentPuzzle, session.currentMoveIndex]
  );

  const handleSubmit = useCallback(
    (move: string) => {
      if (session.isGameOver || !move.trim()) return;

      const outcome = PuzzleRushEngine.submitMove(session, puzzles, move.trim());
      setSession(outcome.nextSession);
      setSelectedSquare(null);

      // Decoupled audio & haptic feedback via EventBus (Spec 12 RF-18)
      GlobalEventBus.emit('PUZZLE_ATTEMPT', {
        isCorrect: outcome.isCorrect,
        isCompleted: outcome.isPuzzleCompleted,
      });

      if (outcome.isCorrect) {
        setFeedback({
          isCorrect: true,
          message: outcome.isPuzzleCompleted
            ? 'Combinação correta! Próximo problema...'
            : 'Lance correto! Complete a linha tática...',
        });
      } else {
        setFeedback({
          isCorrect: false,
          message: `Lance incorreto (${move}). Vida consumida!`,
        });
      }

      setCandidateMove('');
    },
    [session, puzzles]
  );

  const handleBoardSquareClick = useCallback(
    (algebraicSq: string) => {
      if (session.isGameOver || !currentPuzzle) return;
      const pieceAtSq = boardPiecesMap.get(algebraicSq);

      if (!selectedSquare) {
        if (pieceAtSq) {
          setSelectedSquare(algebraicSq);
        }
        return;
      }

      if (selectedSquare === algebraicSq) {
        setSelectedSquare(null);
        return;
      }

      let uci = `${selectedSquare}${algebraicSq}`;
      const expectedSolution =
        currentPuzzle.solutionMoves[session.currentMoveIndex] ??
        currentPuzzle.solutionMoves[0] ??
        '';
      if (
        expectedSolution.length === 5 &&
        expectedSolution.slice(0, 4).toLowerCase() === uci.toLowerCase()
      ) {
        uci = expectedSolution;
      }
      handleSubmit(uci);
    },
    [
      session.isGameOver,
      session.currentMoveIndex,
      currentPuzzle,
      boardPiecesMap,
      selectedSquare,
      handleSubmit,
    ]
  );

  const handleRestart = useCallback(() => {
    setSession(PuzzleRushEngine.createSession(selectedMode));
    setFeedback(null);
    setCandidateMove('');
    setSelectedSquare(null);
    setBotPuzzleIndex(0);
  }, [selectedMode]);

  const handleModeChange = useCallback((mode: PuzzleRushMode) => {
    setSelectedMode(mode);
    setSession(PuzzleRushEngine.createSession(mode));
    setFeedback(null);
    setCandidateMove('');
    setSelectedSquare(null);
    setBotPuzzleIndex(0);
  }, []);

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
        maxWidth: '760px',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.78rem' }}>
            Modo{' '}
            <select
              aria-label="Modo Puzzle Rush"
              value={selectedMode}
              onChange={(event) => handleModeChange(event.target.value as PuzzleRushMode)}
            >
              <option value="SURVIVAL">Sobrevivência</option>
              <option value="TIMED_3MIN">3 minutos</option>
              <option value="TIMED_5MIN">5 minutos</option>
              <option value="BATTLE">Battle vs Bot</option>
            </select>
          </label>

          {selectedMode === 'BATTLE' && (
            <label style={{ fontSize: '0.78rem' }}>
              Nível Bot{' '}
              <select
                aria-label="Nível do Bot Puzzle Battle"
                value={botDifficulty}
                onChange={(e) => setBotDifficulty(Number(e.target.value) as AIDifficultyLevel)}
              >
                <option value={1}>N1 Iniciante (1000)</option>
                <option value={2}>N2 Casual (1350)</option>
                <option value={3}>N3 Tático (1650)</option>
                <option value={4}>N4 Forte (2000)</option>
                <option value={5}>N5 Mestre (2400)</option>
              </select>
            </label>
          )}

          <button
            type="button"
            data-testid="pr-view-toggle"
            onClick={() => setViewMode((v) => (v === '2D' ? '3D' : '2D'))}
            title="Alterna entre tabuleiro plano 2D e perspectiva isométrica inclinada"
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border-prominent)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Visão: {viewMode === '3D' ? '3D (Perspectiva Isométrica)' : '2D Plana'}
          </button>

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
              fontSize: '1rem',
              fontWeight: 800,
              color: 'var(--color-accent)',
            }}
          >
            Pontos: {session.score}
          </span>

          {session.mode === 'BATTLE' && (
            <span
              id="pr-opponent-score"
              aria-label={`Pontuação do bot: ${session.battleOpponentScore ?? 0}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.95rem',
                fontWeight: 800,
                color: 'var(--color-warning)',
              }}
            >
              Bot: {session.battleOpponentScore ?? 0}
            </span>
          )}

          {session.lives !== Infinity && (
            <span id="pr-lives" style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: i < session.lives ? '#ef4444' : 'rgba(255,255,255,0.15)',
                    border: '1px solid rgba(239,68,68,0.5)',
                  }}
                  aria-label={i < session.lives ? 'Vida ativa' : 'Vida perdida'}
                />
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

          {/* Interactive 2D / 3D Tactical Chessboard for Puzzle Rush */}
          <div
            role="grid"
            aria-label="Tabuleiro Tático do Puzzle"
            data-testid="puzzle-rush-board"
            style={{
              width: '100%',
              maxWidth: '380px',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(8, 1fr)',
              aspectRatio: '1 / 1',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              border: '2px solid var(--border-prominent)',
              transform:
                viewMode === '3D'
                  ? 'perspective(760px) rotateX(22deg) scale(0.96)'
                  : 'none',
              boxShadow:
                viewMode === '3D'
                  ? '0 18px 32px rgba(0, 0, 0, 0.48), 0 6px 0 rgba(15, 23, 42, 0.9)'
                  : 'var(--shadow-md)',
              transition: 'transform 220ms ease, box-shadow 220ms ease',
            }}
          >
            {Array.from({ length: 64 }, (_, idx) => {
              const file = idx % 8;
              const rank = 7 - Math.floor(idx / 8);
              const alg = `${String.fromCharCode(97 + file)}${rank + 1}`;
              const piece = boardPiecesMap.get(alg);
              const isSelected = selectedSquare === alg;
              const isDark = (file + rank) % 2 === 0;

              return (
                <button
                  key={alg}
                  type="button"
                  role="gridcell"
                  data-testid={`puzzle-sq-${alg}`}
                  aria-label={`Casa ${alg}${piece ? ` ${piece.variantId}` : ''}`}
                  onClick={() => handleBoardSquareClick(alg)}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    padding: 0,
                    border: isSelected
                      ? '2px solid var(--color-accent)'
                      : '0.5px solid rgba(0,0,0,0.08)',
                    background: isSelected
                      ? activeBoardColors.selectedSquare
                      : isDark
                      ? activeBoardColors.darkSquare
                      : activeBoardColors.lightSquare,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {piece ? (
                    <PieceRenderer
                      variantId={piece.variantId}
                      ownerId={piece.ownerId}
                      pieceSet={pieceSet}
                      size="78%"
                    />
                  ) : null}
                </button>
              );
            })}
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
              Clique na peça e na casa de destino no tabuleiro acima, ou insira o lance no formato UCI (ex: e2e4):
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
                placeholder="ex: e2e4, d7d8q"
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

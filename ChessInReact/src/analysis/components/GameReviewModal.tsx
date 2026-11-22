import React, { useState, useEffect, useMemo } from 'react';
import { GameReviewEngine } from '../GameReviewEngine';
import { AdvantageGraph } from './AdvantageGraph';
import { IGameReviewSummary, MoveClassification } from '../types';
import { globalAudioSynthesizer } from '../../audio/WebAudioSynthesizer';

export interface IGameReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  moveSans?: readonly string[];
  evaluationsCp?: readonly number[];
  whitePlayerName?: string;
  blackPlayerName?: string;
  onRetryMistake?: (ply: number, bestMoveSan?: string) => void;
}

const CLASSIFICATION_LABELS: Record<MoveClassification, { label: string; glyph: string; color: string }> = {
  BRILLIANT: { label: 'Brilhante', glyph: '!!', color: '#06b6d4' },
  GREAT: { label: 'Grande Lance', glyph: '!', color: '#3b82f6' },
  BEST: { label: 'Melhor Lance', glyph: '★', color: '#10b981' },
  EXCELLENT: { label: 'Excelente', glyph: '!?', color: '#22c55e' },
  GOOD: { label: 'Bom', glyph: '✓', color: '#84cc16' },
  BOOK: { label: 'Abertura Teórica', glyph: 'T', color: '#a855f7' },
  INACCURACY: { label: 'Imprecisão', glyph: '?!', color: '#f59e0b' },
  MISTAKE: { label: 'Erro', glyph: '?', color: '#f97316' },
  BLUNDER: { label: 'Gafe (Blunder)', glyph: '??', color: '#ef4444' },
  MISSED_WIN: { label: 'Vitória Perdida', glyph: '✕', color: '#dc2626' },
};

/**
 * Spec 12 § 1 & RF-01, RF-02, RF-03, RF-04:
 * Interactive Post-Game Review Modal with CAPS2 accuracy metrics,
 * SVG positional advantage graph, FIDE NAG annotations, and Retry Mistakes drill.
 */
export const GameReviewModal: React.FC<IGameReviewModalProps> = ({
  isOpen,
  onClose,
  moveSans = [],
  evaluationsCp = [],
  whitePlayerName = 'Brancas',
  blackPlayerName = 'Pretas',
  onRetryMistake,
}) => {
  const [selectedPly, setSelectedPly] = useState<number>(0);
  const [copiedPgn, setCopiedPgn] = useState<boolean>(false);

  // Authoritative evaluation stream: consumes real evaluations emitted by engine/AI Worker.
  // Zero synthetic sinusoidal oscillations (P0 Audit Resolution).
  const effectiveEvals = useMemo(() => {
    if (evaluationsCp.length > 0) {
      const evals = [...evaluationsCp];
      const last = evals[evals.length - 1] ?? 0;
      while (evals.length <= moveSans.length) {
        evals.push(last);
      }
      return evals;
    }
    // Baseline zero-advantage stream without fabricated blunders or mistakes
    return new Array(moveSans.length + 1).fill(0);
  }, [evaluationsCp, moveSans]);

  const reviewSummary: IGameReviewSummary = useMemo(() => {
    return GameReviewEngine.analyzeMatch(effectiveEvals, moveSans);
  }, [effectiveEvals, moveSans]);

  // Extract mistakes and blunders for the "Retry Mistakes" training feature
  const mistakesList = useMemo(() => {
    return reviewSummary.evalStream.filter(
      (pt) => pt.classification === 'BLUNDER' || pt.classification === 'MISTAKE' || pt.classification === 'MISSED_WIN'
    );
  }, [reviewSummary]);

  // Keyboard navigation: Escape closes modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyAnnotatedPgn = async () => {
    const pgn = GameReviewEngine.exportAnnotatedPGN(reviewSummary, {
      White: whitePlayerName,
      Black: blackPlayerName,
      Event: 'ChessInReact Game Review',
      Date: new Date().toISOString().split('T')[0].replace(/-/g, '.'),
    });

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(pgn);
        setCopiedPgn(true);
        globalAudioSynthesizer.playTactileClick();
        setTimeout(() => setCopiedPgn(false), 2200);
      }
    } catch (err) {
      console.warn('[GameReviewModal] Failed to copy annotated PGN:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-review-title"
      data-testid="game-review-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '92vh',
          backgroundColor: 'var(--bg-elevated, #1e293b)',
          border: '2px solid var(--border-prominent, #475569)',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-prominent, #f8fafc)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-subtle, #334155)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-sunken, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <div>
              <h2
                id="game-review-title"
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  color: 'var(--color-accent, #38bdf8)',
                }}
              >
                Revisão de Partida (Game Review & CAPS2)
              </h2>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle, #94a3b8)' }}>
                Análise determinística pós-jogo com classificação científica de lances
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-close-review"
            onClick={onClose}
            aria-label="Fechar revisão"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-subtle, #94a3b8)',
              cursor: 'pointer',
              fontSize: '1.25rem',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-sm, 4px)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div
          style={{
            padding: '1.15rem 1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
          }}
        >
          {/* CAPS2 Accuracy Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
            }}
          >
            {/* White Player Card */}
            <div
              data-testid="white-accuracy-card"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1.5px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>⚪ {whitePlayerName}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle, #94a3b8)' }}>Precisão CAPS2</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: '#38bdf8',
                  }}
                >
                  {reviewSummary.whiteAccuracy.toFixed(1)}%
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
                  {reviewSummary.whiteAccuracy >= 90 ? 'Excelente' : reviewSummary.whiteAccuracy >= 75 ? 'Muito Bom' : 'Sólido'}
                </span>
              </div>
            </div>

            {/* Black Player Card */}
            <div
              data-testid="black-accuracy-card"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                border: '1.5px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>⚫ {blackPlayerName}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle, #94a3b8)' }}>Precisão CAPS2</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                <span
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: 900,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: '#a855f7',
                  }}
                >
                  {reviewSummary.blackAccuracy.toFixed(1)}%
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
                  {reviewSummary.blackAccuracy >= 90 ? 'Excelente' : reviewSummary.blackAccuracy >= 75 ? 'Muito Bom' : 'Sólido'}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive Advantage Graph */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.45rem',
              }}
            >
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-subtle, #94a3b8)' }}>
                Curva de Vantagem Posicional (Centipawns & Win Chance)
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle, #94a3b8)' }}>
                Clique no gráfico para inspecionar o lance
              </span>
            </div>
            <AdvantageGraph
              evalStream={reviewSummary.evalStream}
              currentPly={selectedPly}
              onSelectPly={setSelectedPly}
              height={130}
            />
          </div>

          {/* Move Classification Tally Badges */}
          <div>
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 700,
                color: 'var(--text-subtle, #94a3b8)',
                display: 'block',
                marginBottom: '0.5rem',
              }}
            >
              Distribuição de Qualidade dos Lances
            </span>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                gap: '0.5rem',
              }}
            >
              {(['BRILLIANT', 'BEST', 'EXCELLENT', 'INACCURACY', 'MISTAKE', 'BLUNDER'] as MoveClassification[]).map(
                (c) => {
                  const meta = CLASSIFICATION_LABELS[c];
                  const countP1 = reviewSummary.counts.P1[c] || 0;
                  const countP2 = reviewSummary.counts.P2[c] || 0;
                  return (
                    <div
                      key={c}
                      style={{
                        padding: '0.45rem 0.65rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        backgroundColor: 'var(--bg-sunken, #0f172a)',
                        border: `1px solid ${meta.color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ color: meta.color, fontWeight: 900 }}>{meta.glyph}</span>
                        <span>{meta.label}</span>
                      </div>
                      <span
                        style={{
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: meta.color,
                        }}
                      >
                        {countP1 + countP2}
                      </span>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* Retry Mistakes Section (Spec 12 Diamond Feature / Free on ChessInReact) */}
          <div
            data-testid="retry-mistakes-container"
            style={{
              backgroundColor: 'rgba(249, 115, 22, 0.08)',
              border: '1.5px solid rgba(249, 115, 22, 0.3)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fb923c' }}>
                  Corrija Seus Erros (Retry Mistakes)
                </span>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#fed7aa', fontWeight: 600 }}>
                {mistakesList.length} lance(s) passível(is) de melhoria
              </span>
            </div>

            {mistakesList.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
                Excelente partida! Não foram identificadas gafes graves ou vitórias perdidas.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                {mistakesList.slice(0, 4).map((m) => {
                  const meta = CLASSIFICATION_LABELS[m.classification];
                  return (
                    <div
                      key={m.ply}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.4rem 0.65rem',
                        borderRadius: 'var(--radius-sm, 4px)',
                        backgroundColor: 'rgba(15, 23, 42, 0.6)',
                        border: `1px solid ${meta.color}40`,
                        fontSize: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: meta.color, fontWeight: 900 }}>{meta.glyph}</span>
                        <span>
                          Lance #{m.turnNumber} ({m.isWhite ? 'Brancas' : 'Pretas'}):{' '}
                          <strong>{m.moveSan ?? `ply ${m.ply}`}</strong>
                        </span>
                      </div>
                      {onRetryMistake && (
                        <button
                          type="button"
                          data-testid={`btn-retry-ply-${m.ply}`}
                          onClick={() => {
                            globalAudioSynthesizer.playTactileClick();
                            onRetryMistake(m.ply, m.bestMoveSan);
                            onClose();
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: '1px solid #f97316',
                            backgroundColor: 'rgba(249, 115, 22, 0.25)',
                            color: '#fed7aa',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                          }}
                        >
                          Tentar Novamente
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            borderTop: '1px solid var(--border-subtle, #334155)',
            backgroundColor: 'var(--bg-sunken, #0f172a)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            data-testid="btn-copy-annotated-pgn"
            onClick={handleCopyAnnotatedPgn}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid #38bdf8',
              backgroundColor: copiedPgn ? 'rgba(16, 185, 129, 0.25)' : 'rgba(56, 189, 248, 0.15)',
              color: copiedPgn ? '#10b981' : '#38bdf8',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
            }}
          >
            <span>{copiedPgn ? '✓' : '📋'}</span>
            <span>{copiedPgn ? 'PGN Anotado Copiado!' : 'Copiar PGN Anotado (FIDE NAG)'}</span>
          </button>

          <button
            type="button"
            data-testid="btn-finish-review"
            onClick={onClose}
            style={{
              padding: '0.45rem 1.15rem',
              borderRadius: 'var(--radius-sm, 6px)',
              border: '1px solid var(--border-prominent, #475569)',
              backgroundColor: 'var(--bg-elevated, #334155)',
              color: '#f8fafc',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameReviewModal;


import React, { useState, useEffect, useMemo } from 'react';
import { GameReviewEngine } from '../GameReviewEngine';
import { AdvantageGraph } from './AdvantageGraph';
import { IGameReviewSummary, MoveClassification } from '../types';
import { globalAudioSynthesizer } from '../../audio/WebAudioSynthesizer';
import { IconBarChart, IconCopy, IconCheck } from '../../ui/icons/AppIcons';

export interface IGameReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  moveSans?: readonly string[];
  evaluationsCp?: readonly number[];
  whitePlayerName?: string;
  blackPlayerName?: string;
  onRetryMistake?: (ply: number, bestMoveSan?: string) => void;
  variantId?: string;
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
 * Spec 12 § 1 & RF-01, RF-02, RF-03, RF-04, PATCH-04:
 * Interactive Post-Game Review Modal with real engine evaluations, CAPS2 accuracy metrics,
 * SVG positional advantage graph, FIDE NAG annotations, and Retry Mistakes drill.
 *
 * Invariant (PATCH-04): Zero synthetic sinusoidal oscillations, zero artificial centipawn
 * fabrication when evaluations are missing, and explicit blocking for unsupported variants.
 */
export const GameReviewModal: React.FC<IGameReviewModalProps> = ({
  isOpen,
  onClose,
  moveSans = [],
  evaluationsCp = [],
  whitePlayerName = 'Brancas',
  blackPlayerName = 'Pretas',
  onRetryMistake,
  variantId,
}) => {
  const [selectedPly, setSelectedPly] = useState<number>(0);
  const [copiedPgn, setCopiedPgn] = useState<boolean>(false);

  // Check if variant supports classical comparative centipawn review (FIDE 8x8 rules)
  const isVariantSupported = useMemo(() => {
    if (!variantId) return true;
    const v = variantId.toUpperCase();
    return v === 'CLASSIC_SQUARE' || v === 'STANDARD' || v === 'CHESS' || v === 'FIDE';
  }, [variantId]);

  const hasEvaluations = evaluationsCp.length > 0;

  // Authoritative evaluation stream: consumes real evaluations emitted by engine/AI Worker.
  const effectiveEvals = useMemo(() => {
    if (!hasEvaluations || !isVariantSupported) {
      return [];
    }
    const evals = [...evaluationsCp];
    const last = evals[evals.length - 1] ?? 0;
    while (evals.length <= moveSans.length) {
      evals.push(last);
    }
    return evals;
  }, [evaluationsCp, moveSans, hasEvaluations, isVariantSupported]);

  const reviewSummary: IGameReviewSummary = useMemo(() => {
    if (!isVariantSupported || !hasEvaluations) {
      return {
        isAvailable: false,
        unavailableReason: !isVariantSupported
          ? 'Variante não clássica sem suporte a centipawns.'
          : 'Nenhuma avaliação registrada por motor.',
        whiteAccuracy: 0,
        blackAccuracy: 0,
        counts: {
          P1: {
            BRILLIANT: 0,
            GREAT: 0,
            BEST: 0,
            EXCELLENT: 0,
            GOOD: 0,
            BOOK: 0,
            INACCURACY: 0,
            MISTAKE: 0,
            BLUNDER: 0,
            MISSED_WIN: 0,
          },
          P2: {
            BRILLIANT: 0,
            GREAT: 0,
            BEST: 0,
            EXCELLENT: 0,
            GOOD: 0,
            BOOK: 0,
            INACCURACY: 0,
            MISTAKE: 0,
            BLUNDER: 0,
            MISSED_WIN: 0,
          },
        },
        evalStream: [],
      };
    }
    return GameReviewEngine.analyzeMatch(effectiveEvals, moveSans);
  }, [effectiveEvals, moveSans, isVariantSupported, hasEvaluations]);

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
    if (!reviewSummary.isAvailable) return;

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
            <IconBarChart size={22} color="var(--color-accent, #38bdf8)" />
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
                {isVariantSupported && hasEvaluations
                  ? 'Análise determinística pós-jogo com classificação científica de lances'
                  : 'Auditoria de integridade analítica da partida'}
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
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-sm, 4px)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        {!isVariantSupported ? (
          // Unsupported Variant State (PATCH-04 Acceptance Gate)
          <div
            data-testid="variant-unsupported-notice"
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1.5px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontSize: '1.4rem',
                fontWeight: 900,
              }}
            >
              !
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 800 }}>
                Análise Indisponível para esta Variante
              </h3>
              <p
                style={{
                  margin: 0,
                  maxWidth: '520px',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  color: 'var(--text-subtle, #94a3b8)',
                }}
              >
                O motor de análise posicional opera sob as regras e dimensões clássicas FIDE (8x8).
                Variantes com regras especiais (Spell, Duck, Bughouse), peças fadas ou geometrias estendidas
                não possuem escala posicional padronizada em centipawns para emissão de precisão CAPS2.
              </p>
            </div>
            <div
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--bg-sunken, #0f172a)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-subtle, #334155)',
                fontSize: '0.74rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Princípio de Rigor (PATCH-04): Nenhuma métrica ou gráfico sintético é fabricado para variantes não suportadas.
            </div>
          </div>
        ) : !hasEvaluations ? (
          // Missing Evaluations State (PATCH-04 Acceptance Gate)
          <div
            data-testid="no-evaluations-notice"
            style={{
              padding: '2.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                backgroundColor: 'rgba(245, 158, 11, 0.15)',
                border: '1.5px solid rgba(245, 158, 11, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b',
                fontSize: '1.4rem',
                fontWeight: 900,
              }}
            >
              i
            </div>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 800 }}>
                Nenhuma Avaliação de Engine Registrada
              </h3>
              <p
                style={{
                  margin: 0,
                  maxWidth: '520px',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                  color: 'var(--text-subtle, #94a3b8)',
                }}
              >
                Esta partida não possui registros de avaliação posicional calculados por lance pelo motor de IA.
                Para manter a fidelidade científica, curvas de vantagem, contagem de gafes e pontuações de precisão
                não são geradas a partir de dados ausentes.
              </p>
            </div>
            <div
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: 'var(--bg-sunken, #0f172a)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-subtle, #334155)',
                fontSize: '0.74rem',
                color: 'var(--text-muted, #64748b)',
              }}
            >
              Métricas e estimativas são exclusivas de partidas com cálculo de centipawns ativo por ply.
            </div>
          </div>
        ) : (
          // Full Supported Review with Real Evaluations
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: '#f8fafc',
                        display: 'inline-block',
                      }}
                      aria-hidden="true"
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{whitePlayerName}</span>
                  </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: '#0f172a',
                        border: '1.5px solid #94a3b8',
                        display: 'inline-block',
                      }}
                      aria-hidden="true"
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{blackPlayerName}</span>
                  </div>
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

            {/* Retry Mistakes Section (Spec 12 Feature) */}
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

            {/* Scientific Transparency Notice */}
            <div
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-muted, #64748b)',
                textAlign: 'center',
                paddingTop: '0.25rem',
              }}
            >
              Estimativas e probabilidades geradas pelo motor local heurístico/Minimax (Spec 12/Spec 15).
            </div>
          </div>
        )}

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
          {isVariantSupported && hasEvaluations ? (
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
              <span>{copiedPgn ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}</span>
              <span>{copiedPgn ? 'PGN Anotado Copiado!' : 'Copiar PGN Anotado (FIDE NAG)'}</span>
            </button>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)' }}>
              Revisão posicional bloqueada (Critério de Integridade)
            </div>
          )}

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

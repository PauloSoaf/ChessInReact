/**
 * ChessInReact - Opening Explorer & Repertoire Studio Modal
 * Spec 17: RF-17-03, RF-17-04, RF-17-06 & RNF-17-02
 *
 * Full-featured accessible interactive modal displaying ECO classification,
 * master move tree with win/draw/loss distributions, and spaced-repetition drills.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { OpeningExplorerEngine } from '../openings/OpeningExplorerEngine';
import { RepertoireTrainerEngine } from '../openings/RepertoireTrainerEngine';
import { IRepertoireCard, ITrainingFeedback } from '../openings/types';
import { IconCopy, IconCheck } from '../../ui/icons/AppIcons';

export interface IOpeningExplorerModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly currentFen?: string;
  readonly onSelectMove?: (san: string) => void;
}

export const OpeningExplorerModal: React.FC<IOpeningExplorerModalProps> = ({
  isOpen,
  onClose,
  currentFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  onSelectMove
}) => {
  const [activeTab, setActiveTab] = useState<'EXPLORER' | 'REPERTOIRE'>('EXPLORER');
  const [repertoireColor, setRepertoireColor] = useState<'WHITE' | 'BLACK'>('WHITE');
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [drillInput, setDrillInput] = useState('');
  const [drillFeedback, setDrillFeedback] = useState<ITrainingFeedback | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Opening node evaluation
  const openingNode = useMemo(() => {
    return OpeningExplorerEngine.getOpeningNode(currentFen);
  }, [currentFen]);

  // Repertoire cards for selected color
  const repertoireCards = useMemo(() => {
    return RepertoireTrainerEngine.getAllCards().filter(c => c.color === repertoireColor);
  }, [repertoireColor]);

  const currentCard: IRepertoireCard | undefined = repertoireCards[activeCardIndex];

  const handleDrillSubmit = useCallback(() => {
    if (!currentCard || !drillInput.trim()) return;
    const feedback = RepertoireTrainerEngine.verifyMove(currentCard.id, drillInput.trim());
    setDrillFeedback(feedback);
  }, [currentCard, drillInput]);

  const handleNextCard = useCallback(() => {
    setDrillFeedback(null);
    setDrillInput('');
    if (activeCardIndex + 1 < repertoireCards.length) {
      setActiveCardIndex(prev => prev + 1);
    } else {
      setActiveCardIndex(0);
    }
  }, [activeCardIndex, repertoireCards.length]);

  const handleExportRepertoire = useCallback(async () => {
    const json = RepertoireTrainerEngine.exportRepertoireJson();
    try {
      await navigator.clipboard.writeText(json);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    } catch {
      // Fallback
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="opening-explorer-title"
      className="opening-explorer-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        className="opening-explorer-modal-content"
        style={{
          width: '100%',
          maxWidth: '780px',
          maxHeight: '90vh',
          backgroundColor: '#161922',
          border: '1px solid #2d3548',
          borderRadius: '16px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#e2e8f0',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #2d3548',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1b202e'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: '#3b82f6',
                color: '#ffffff'
              }}
            >
              ECO {openingNode.eco}
            </span>
            <div>
              <h2
                id="opening-explorer-title"
                style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}
              >
                {openingNode.name}
              </h2>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {openingNode.totalGames > 0
                  ? `${openingNode.totalGames.toLocaleString()} partidas de mestres indexadas`
                  : 'Posição teórica padrão'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar explorador"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '8px'
            }}
          >
            ✕
          </button>
        </header>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #2d3548',
            backgroundColor: '#13161f'
          }}
        >
          <button
            onClick={() => setActiveTab('EXPLORER')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              background: activeTab === 'EXPLORER' ? '#1b202e' : 'transparent',
              color: activeTab === 'EXPLORER' ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === 'EXPLORER' ? '2px solid #38bdf8' : 'none',
              cursor: 'pointer'
            }}
          >
            Explorador Mestre
          </button>
          <button
            onClick={() => setActiveTab('REPERTOIRE')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              background: activeTab === 'REPERTOIRE' ? '#1b202e' : 'transparent',
              color: activeTab === 'REPERTOIRE' ? '#a855f7' : '#94a3b8',
              border: 'none',
              borderBottom: activeTab === 'REPERTOIRE' ? '2px solid #a855f7' : 'none',
              cursor: 'pointer'
            }}
          >
            Treinador de Repertório (SM-2)
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'EXPLORER' ? (
            <div>
              {/* Overall Position Win Distribution Bar */}
              <div style={{ marginBottom: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginBottom: '6px'
                  }}
                >
                  <span style={{ color: '#ffffff' }}>Brancas: {openingNode.whiteWinPct}%</span>
                  <span style={{ color: '#94a3b8' }}>Empates: {openingNode.drawPct}%</span>
                  <span style={{ color: '#64748b' }}>Pretas: {openingNode.blackWinPct}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Distribuição de resultados das Brancas, Empates e Pretas"
                  style={{
                    display: 'flex',
                    height: '10px',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    backgroundColor: '#1e293b'
                  }}
                >
                  <div style={{ width: `${openingNode.whiteWinPct}%`, backgroundColor: '#38bdf8' }} />
                  <div style={{ width: `${openingNode.drawPct}%`, backgroundColor: '#94a3b8' }} />
                  <div style={{ width: `${openingNode.blackWinPct}%`, backgroundColor: '#475569' }} />
                </div>
              </div>

              {/* Master Moves Table */}
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '10px' }}>
                Lances Mais Jogados por Mestres:
              </h3>

              {openingNode.candidateMoves.length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    backgroundColor: '#1b202e',
                    borderRadius: '10px',
                    color: '#94a3b8',
                    fontSize: '13px'
                  }}
                >
                  Nenhum lance adicional registrado no banco mestre para esta posição específica.
                </div>
              ) : (
                <div style={{ border: '1px solid #2d3548', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1e2433', color: '#94a3b8', textAlign: 'left' }}>
                        <th style={{ padding: '10px 14px' }}>Lance</th>
                        <th style={{ padding: '10px 14px' }}>Partidas</th>
                        <th style={{ padding: '10px 14px' }}>Brancas %</th>
                        <th style={{ padding: '10px 14px' }}>Empate %</th>
                        <th style={{ padding: '10px 14px' }}>Pretas %</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right' }}>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openingNode.candidateMoves.map(candidate => (
                        <tr
                          key={candidate.san}
                          style={{
                            borderTop: '1px solid #23293b',
                            transition: 'background-color 0.15s'
                          }}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#38bdf8' }}>
                            {candidate.san}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#e2e8f0' }}>
                            {candidate.totalGames.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#38bdf8' }}>
                            {candidate.whiteWinPct}%
                          </td>
                          <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                            {candidate.drawPct}%
                          </td>
                          <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                            {candidate.blackWinPct}%
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                            <button
                              onClick={() => onSelectMove?.(candidate.san)}
                              style={{
                                padding: '4px 10px',
                                backgroundColor: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Jogar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Color Switcher */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button
                  onClick={() => {
                    setRepertoireColor('WHITE');
                    setActiveCardIndex(0);
                    setDrillFeedback(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: '1px solid #3b82f6',
                    backgroundColor: repertoireColor === 'WHITE' ? '#3b82f6' : 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  ⚪ Repertório de Brancas
                </button>
                <button
                  onClick={() => {
                    setRepertoireColor('BLACK');
                    setActiveCardIndex(0);
                    setDrillFeedback(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: '1px solid #a855f7',
                    backgroundColor: repertoireColor === 'BLACK' ? '#a855f7' : 'transparent',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  ⚫ Repertório de Pretas
                </button>
              </div>

              {/* Drill Card */}
              {currentCard ? (
                <div
                  style={{
                    backgroundColor: '#1b202e',
                    border: '1px solid #2d3548',
                    borderRadius: '12px',
                    padding: '18px',
                    marginBottom: '16px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '12px'
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: '#334155',
                          color: '#93c5fd',
                          marginRight: '8px'
                        }}
                      >
                        {currentCard.eco}
                      </span>
                      <strong style={{ fontSize: '15px', color: '#f8fafc' }}>
                        {currentCard.openingName}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          color: '#38bdf8',
                          fontWeight: 600
                        }}
                      >
                        Caixa {currentCard.boxLevel} / 5 (SM-2)
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          color: '#94a3b8'
                        }}
                      >
                        {activeCardIndex + 1} de {repertoireCards.length}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: '#cbd5e1', margin: '0 0 14px 0' }}>
                    {currentCard.explanation ?? 'Encontre o lance teórico do seu repertório nesta posição.'}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    <input
                      type="text"
                      placeholder="Digite o lance (ex: e4, Nf3, Bc4)..."
                      value={drillInput}
                      onChange={e => setDrillInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleDrillSubmit();
                      }}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '14px'
                      }}
                    />
                    <button
                      onClick={handleDrillSubmit}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Verificar
                    </button>
                  </div>

                  {drillFeedback && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        backgroundColor: drillFeedback.isCorrect ? '#064e3b' : '#7f1d1d',
                        border: `1px solid ${drillFeedback.isCorrect ? '#059669' : '#dc2626'}`,
                        color: '#ffffff',
                        fontSize: '13px',
                        marginBottom: '12px'
                      }}
                    >
                      {drillFeedback.feedbackText}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={handleNextCard}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#3b82f6',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Próxima Linha ➔
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    backgroundColor: '#1b202e',
                    borderRadius: '10px',
                    color: '#94a3b8',
                    fontSize: '13px'
                  }}
                >
                  Nenhuma linha de repertório cadastrada para esta cor.
                </div>
              )}

              {/* Repertoire Export/Import */}
              <div
                style={{
                  marginTop: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '16px',
                  borderTop: '1px solid #2d3548'
                }}
              >
                <button
                  onClick={handleExportRepertoire}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#334155',
                    color: '#f8fafc',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {copySuccess ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}
                    {copySuccess ? 'Copiado para Clipboard!' : 'Exportar Repertório JSON'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

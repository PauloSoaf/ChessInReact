/**
 * ChessInReact - Competitive Tournament Arena & Swiss System Modal
 * Spec 18: RF-18-01, RF-18-04, RF-18-05, RF-18-06
 *
 * Full-featured accessible interactive modal displaying live tournament standings,
 * FIDE Dutch Swiss pairings, Arena Fast-Pairings, Win Streak multipliers, and Berserk toggles.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SwissTournamentEngine } from '../../../engine/tournament/SwissTournamentEngine';
import { ArenaTournamentEngine } from '../../../engine/tournament/ArenaTournamentEngine';
import { ISwissTournamentState, IArenaTournamentState, GameOutcome } from '../../../engine/tournament/types';

export interface ITournamentArenaModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export const TournamentArenaModal: React.FC<ITournamentArenaModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeFormat, setActiveFormat] = useState<'SWISS' | 'ARENA'>('SWISS');

  // Initial Swiss State
  const [swissState, setSwissState] = useState<ISwissTournamentState>(() => {
    return SwissTournamentEngine.createTournament(
      'tourney_swiss_master_001',
      'Torneio Suíço Aberto de Mestres (FIDE)',
      [
        { id: 'p1', name: 'GM Magnus Carlsen', rating: 2830 },
        { id: 'p2', name: 'GM Hikaru Nakamura', rating: 2795 },
        { id: 'p3', name: 'GM Alireza Firouzja', rating: 2780 },
        { id: 'p4', name: 'GM Fabiano Caruana', rating: 2805 },
        { id: 'p5', name: 'GM Gukesh D', rating: 2770 },
        { id: 'p6', name: 'GM Nodirbek Abdusattorov', rating: 2765 },
        { id: 'p7', name: 'GM Praggnanandhaa R', rating: 2755 },
        { id: 'p8', name: 'Você (Humano)', rating: 2150 }
      ],
      3
    );
  });

  // Initial Arena State
  const [arenaState, setArenaState] = useState<IArenaTournamentState>(() => {
    return ArenaTournamentEngine.createTournament(
      'tourney_arena_blitz_001',
      'Arena Relâmpago 3+0 com Berserk e Win Streaks',
      [
        { id: 'p1', name: 'GM Magnus Carlsen', rating: 2830 },
        { id: 'p2', name: 'GM Hikaru Nakamura', rating: 2795 },
        { id: 'p3', name: 'GM Alireza Firouzja', rating: 2780 },
        { id: 'p4', name: 'GM Fabiano Caruana', rating: 2805 },
        { id: 'p5', name: 'Você (Humano)', rating: 2150 }
      ],
      45
    );
  });

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

  // Swiss: Next Round
  const handleSwissNextRound = useCallback(() => {
    try {
      const { nextState } = SwissTournamentEngine.generateNextRoundPairings(swissState);
      setSwissState(nextState);
    } catch {
      // Tournament finished
    }
  }, [swissState]);

  // Swiss: Submit Match Result
  const handleSwissRecordMatch = useCallback((matchId: string, outcome: GameOutcome) => {
    const updated = SwissTournamentEngine.recordMatchOutcome(swissState, matchId, outcome);
    setSwissState(updated);
  }, [swissState]);

  // Arena: Fast Pairings
  const handleArenaFastPairings = useCallback(() => {
    const { nextState } = ArenaTournamentEngine.generateFastPairings(arenaState);
    setArenaState(nextState);
  }, [arenaState]);

  // Arena: Toggle Berserk
  const handleArenaToggleBerserk = useCallback((playerId: string) => {
    const player = arenaState.players.find(p => p.id === playerId);
    if (!player) return;
    const updated = ArenaTournamentEngine.setPlayerBerserk(arenaState, playerId, !player.isBerserkActive);
    setArenaState(updated);
  }, [arenaState]);

  // Arena: Record Match Result
  const handleArenaRecordMatch = useCallback((matchId: string, outcome: GameOutcome) => {
    const updated = ArenaTournamentEngine.recordMatchOutcome(arenaState, matchId, outcome);
    setArenaState(updated);
  }, [arenaState]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tournament-title"
      className="tournament-arena-modal-overlay"
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
        className="tournament-arena-modal-content"
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '92vh',
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
                backgroundColor: activeFormat === 'SWISS' ? '#3b82f6' : '#f59e0b',
                color: '#ffffff'
              }}
            >
              {activeFormat === 'SWISS' ? 'FIDE SWISS' : 'ARENA BERSERK'}
            </span>
            <div>
              <h2
                id="tournament-title"
                style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#f8fafc' }}
              >
                {activeFormat === 'SWISS' ? swissState.title : arenaState.title}
              </h2>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {activeFormat === 'SWISS'
                  ? `Rodada ${swissState.currentRound} de ${swissState.totalRounds} • ${swissState.players.length} Jogadores`
                  : `${arenaState.durationMinutes} min • Fila Instantânea com Win Streaks`}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar torneio"
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

        {/* Format Selector Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #2d3548',
            backgroundColor: '#13161f'
          }}
        >
          <button
            onClick={() => setActiveFormat('SWISS')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              background: activeFormat === 'SWISS' ? '#1b202e' : 'transparent',
              color: activeFormat === 'SWISS' ? '#38bdf8' : '#94a3b8',
              border: 'none',
              borderBottom: activeFormat === 'SWISS' ? '2px solid #38bdf8' : 'none',
              cursor: 'pointer'
            }}
          >
            Sistema Suíço Oficial (FIDE)
          </button>
          <button
            onClick={() => setActiveFormat('ARENA')}
            style={{
              flex: 1,
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              background: activeFormat === 'ARENA' ? '#1b202e' : 'transparent',
              color: activeFormat === 'ARENA' ? '#f59e0b' : '#94a3b8',
              border: 'none',
              borderBottom: activeFormat === 'ARENA' ? '2px solid #f59e0b' : 'none',
              cursor: 'pointer'
            }}
          >
            Arena Contínua &amp; Berserk
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {activeFormat === 'SWISS' ? (
            <div>
              {/* Swiss Controls */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {swissState.isCompleted
                    ? '🎉 Torneio Concluído!'
                    : `Rodada Ativa: ${swissState.currentRound} / ${swissState.totalRounds}`}
                </div>
                {!swissState.isCompleted && (
                  <button
                    onClick={handleSwissNextRound}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {swissState.currentRound === 0 ? 'Iniciar Rodada 1' : 'Gerar Próxima Rodada ➔'}
                  </button>
                )}
              </div>

              {/* Standings Table */}
              <div style={{ border: '1px solid #2d3548', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1e2433', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Pos</th>
                      <th style={{ padding: '10px 14px' }}>Jogador</th>
                      <th style={{ padding: '10px 14px' }}>Rating</th>
                      <th style={{ padding: '10px 14px' }}>Pontos</th>
                      <th style={{ padding: '10px 14px' }}>Buchholz Cut 1</th>
                      <th style={{ padding: '10px 14px' }}>Sonneborn-Berger</th>
                      <th style={{ padding: '10px 14px' }}>Vitórias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swissState.players.map((p, idx) => (
                      <tr
                        key={p.id}
                        style={{
                          borderTop: '1px solid #23293b',
                          backgroundColor: idx === 0 ? 'rgba(59, 130, 246, 0.08)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          {idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                          {p.rating}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#38bdf8' }}>
                          {p.points}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                          {p.tiebreakBuchholzCut1}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#cbd5e1' }}>
                          {p.tiebreakSonnebornBerger}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                          {p.winsCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Matches for Current Round */}
              {swissState.matches.filter(m => m.roundNumber === swissState.currentRound).length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '10px' }}>
                    Confrontos da Rodada {swissState.currentRound}:
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {swissState.matches
                      .filter(m => m.roundNumber === swissState.currentRound)
                      .map(match => {
                        const whitePlayer = swissState.players.find(p => p.id === match.whitePlayerId);
                        const blackPlayer = swissState.players.find(p => p.id === match.blackPlayerId);

                        return (
                          <div
                            key={match.matchId}
                            style={{
                              padding: '12px 16px',
                              backgroundColor: '#1b202e',
                              borderRadius: '8px',
                              border: '1px solid #2d3548',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '13px'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: '#ffffff' }}>⚪ {whitePlayer?.name ?? 'Brancas'}</span>
                              <span style={{ margin: '0 8px', color: '#94a3b8' }}>vs</span>
                              <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                ⚫ {match.blackPlayerId === 'BYE' ? 'FOLGA (BYE)' : (blackPlayer?.name ?? 'Pretas')}
                              </span>
                            </div>

                            {match.outcome === 'IN_PROGRESS' ? (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  onClick={() => handleSwissRecordMatch(match.matchId, 'WHITE_WIN')}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    backgroundColor: '#2563eb',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  1 - 0
                                </button>
                                <button
                                  onClick={() => handleSwissRecordMatch(match.matchId, 'DRAW')}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    backgroundColor: '#475569',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  ½ - ½
                                </button>
                                <button
                                  onClick={() => handleSwissRecordMatch(match.matchId, 'BLACK_WIN')}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                    backgroundColor: '#2563eb',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  0 - 1
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                                {match.outcome === 'WHITE_WIN'
                                  ? '1 - 0'
                                  : match.outcome === 'BLACK_WIN'
                                  ? '0 - 1'
                                  : match.outcome === 'DRAW'
                                  ? '½ - ½'
                                  : 'BYE (+1)'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Arena Controls */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px'
                }}
              >
                <div style={{ fontSize: '13px', color: '#f59e0b', fontWeight: 600 }}>
                  ⏱️ Tempo de Arena: {arenaState.durationMinutes} minutos restantes
                </div>
                <button
                  onClick={handleArenaFastPairings}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#d97706',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Parear Jogadores Livres (Fast Pairing)
                </button>
              </div>

              {/* Arena Standings Table */}
              <div style={{ border: '1px solid #2d3548', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#1e2433', color: '#94a3b8', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px' }}>Pos</th>
                      <th style={{ padding: '10px 14px' }}>Jogador</th>
                      <th style={{ padding: '10px 14px' }}>Rating</th>
                      <th style={{ padding: '10px 14px' }}>Pontos</th>
                      <th style={{ padding: '10px 14px' }}>Sequência</th>
                      <th style={{ padding: '10px 14px' }}>Berserk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arenaState.players.map((p, idx) => (
                      <tr
                        key={p.id}
                        style={{
                          borderTop: '1px solid #23293b',
                          backgroundColor: idx === 0 ? 'rgba(245, 158, 11, 0.08)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                          {idx === 0 ? '🥇 1º' : idx === 1 ? '🥈 2º' : idx === 2 ? '🥉 3º' : `${idx + 1}º`}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>
                          {p.name}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                          {p.rating}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#f59e0b' }}>
                          {p.points}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {p.currentStreak >= 2 ? (
                            <span style={{ color: '#ef4444', fontWeight: 700 }}>🔥 {p.currentStreak} (2x pts)</span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>{p.currentStreak}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <button
                            onClick={() => handleArenaToggleBerserk(p.id)}
                            style={{
                              padding: '3px 8px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid #d97706',
                              backgroundColor: p.isBerserkActive ? '#d97706' : 'transparent',
                              color: p.isBerserkActive ? '#ffffff' : '#f59e0b',
                              cursor: 'pointer',
                              fontWeight: 600
                            }}
                          >
                            {p.isBerserkActive ? '⚔️ Berserk ATIVO' : '⚔️ Ativar Berserk'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Active Arena Matches */}
              {arenaState.matches.filter(m => m.outcome === 'IN_PROGRESS').length > 0 && (
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9', marginBottom: '10px' }}>
                    Partidas em Andamento:
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {arenaState.matches
                      .filter(m => m.outcome === 'IN_PROGRESS')
                      .map(match => {
                        const whitePlayer = arenaState.players.find(p => p.id === match.whitePlayerId);
                        const blackPlayer = arenaState.players.find(p => p.id === match.blackPlayerId);

                        return (
                          <div
                            key={match.matchId}
                            style={{
                              padding: '12px 16px',
                              backgroundColor: '#1b202e',
                              borderRadius: '8px',
                              border: '1px solid #2d3548',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '13px'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                ⚪ {whitePlayer?.name} {match.isWhiteBerserk && '⚔️'}
                              </span>
                              <span style={{ margin: '0 8px', color: '#94a3b8' }}>vs</span>
                              <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                ⚫ {blackPlayer?.name} {match.isBlackBerserk && '⚔️'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => handleArenaRecordMatch(match.matchId, 'WHITE_WIN')}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  backgroundColor: '#d97706',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Brancas Vencem
                              </button>
                              <button
                                onClick={() => handleArenaRecordMatch(match.matchId, 'DRAW')}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  backgroundColor: '#475569',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Empate
                              </button>
                              <button
                                onClick={() => handleArenaRecordMatch(match.matchId, 'BLACK_WIN')}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  backgroundColor: '#d97706',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer'
                                }}
                              >
                                Pretas Vencem
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


import React, { useState } from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  IconEye,
  IconX,
} from '../../icons/AppIcons';
import { ILiveMatchSummary } from '../../../matchmaking/interfaces/IMatchmakingContracts';
import { useSpectatorStream } from '../../../bindings/react/useSpectatorStream';
import { SpectatorRelayPubSub } from '../../../matchmaking/engine/SpectatorRelayPubSub';

export interface ILiveSpectateModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly initialMatches?: readonly ILiveMatchSummary[];
  readonly spectatorRelay?: SpectatorRelayPubSub;
}

const DEFAULT_MOCK_MATCHES: readonly ILiveMatchSummary[] = [
  {
    matchId: 'live-match-01',
    roomId: 'room-magnus-hikaru',
    variantId: 'STANDARD_BLITZ',
    topology: 'SQUARE_8X8',
    whitePlayer: { userId: 'u-1', displayName: 'GM Magnus C.', elo: 2850 },
    blackPlayer: { userId: 'u-2', displayName: 'GM Hikaru N.', elo: 2825 },
    currentPly: 24,
    fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 5',
    evalCentipawns: 35,
    spectatorCount: 142,
    startedAt: Date.now() - 320_000,
  },
  {
    matchId: 'live-match-02',
    roomId: 'room-hex-clash',
    variantId: 'HEXAGONAL_4P',
    topology: 'HEXAGONAL',
    whitePlayer: { userId: 'u-3', displayName: 'GrandMasterHex', elo: 2210 },
    blackPlayer: { userId: 'u-4', displayName: 'TacticalVector', elo: 2185 },
    currentPly: 18,
    fen: 'hex:start:r4k1/1p6/8/8/8/6P1/1K4R1 w - - 0 10',
    evalCentipawns: -15,
    spectatorCount: 67,
    startedAt: Date.now() - 480_000,
  },
  {
    matchId: 'live-match-03',
    roomId: 'room-duck-chaos',
    variantId: 'DUCK_CHESS',
    topology: 'SQUARE_8X8',
    whitePlayer: { userId: 'u-5', displayName: 'QuackMaster', elo: 1940 },
    blackPlayer: { userId: 'u-6', displayName: 'PawnStormer', elo: 1915 },
    currentPly: 12,
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2 [duck:d4]',
    spectatorCount: 38,
    startedAt: Date.now() - 180_000,
  },
];

export const LiveSpectateModal: React.FC<ILiveSpectateModalProps> = ({
  isOpen,
  onClose,
  initialMatches = DEFAULT_MOCK_MATCHES,
  spectatorRelay,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeMatch, setActiveMatch] = useState<ILiveMatchSummary | null>(null);

  const spectatorStream = useSpectatorStream(
    activeMatch ? activeMatch.matchId : null,
    spectatorRelay
  );

  if (!isOpen) return null;

  const filteredMatches = initialMatches.filter((m) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.whitePlayer.displayName.toLowerCase().includes(q) ||
      m.blackPlayer.displayName.toLowerCase().includes(q) ||
      m.variantId.toLowerCase().includes(q) ||
      m.matchId.toLowerCase().includes(q)
    );
  });

  return (
    <div
      id="live-spectate-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
    >
      <Card
        id="live-spectate-modal-container"
        style={{
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          padding: '1.5rem',
          backgroundColor: '#0F172A',
          border: '1px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconEye size={22} color="#60A5FA" />
            <h2
              id="live-spectate-title"
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#F8FAFC',
              }}
            >
              {activeMatch ? `Assistindo: ${activeMatch.variantId}` : 'Partidas ao Vivo (Spec 08)'}
            </h2>
          </div>

          <button
            id="btn-close-live-spectate"
            type="button"
            onClick={() => {
              setActiveMatch(null);
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94A3B8',
              padding: '0.25rem',
            }}
            aria-label="Fechar"
          >
            <IconX size={20} />
          </button>
        </div>

        {/* View Mode: Active Spectate Stream or Matches List */}
        {activeMatch ? (
          <div
            id="spectator-active-stream-view"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(30, 41, 59, 0.6)',
                borderRadius: '8px',
                border: '1px solid rgba(59, 130, 246, 0.2)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase' }}>
                  Confronto ao Vivo
                </span>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#F8FAFC' }}>
                  {activeMatch.whitePlayer.displayName} ({activeMatch.whitePlayer.elo}) vs{' '}
                  {activeMatch.blackPlayer.displayName} ({activeMatch.blackPlayer.elo})
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#60A5FA' }}>
                  <IconEye size={16} />
                  <span id="spectator-live-count" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                    {spectatorStream.spectatorCount > 0
                      ? spectatorStream.spectatorCount
                      : activeMatch.spectatorCount}
                  </span>
                </div>
                <span
                  style={{
                    backgroundColor: '#EF4444',
                    color: '#FFFFFF',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                  }}
                >
                  AO VIVO
                </span>
              </div>
            </div>

            {/* FEN and State Info */}
            <div
              style={{
                padding: '0.85rem',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#CBD5E1',
                wordBreak: 'break-all',
              }}
            >
              <div style={{ marginBottom: '0.4rem', color: '#94A3B8' }}>
                Posicao Atual (FEN / Ply: {spectatorStream.currentPly || activeMatch.currentPly}):
              </div>
              <div id="spectator-current-fen">
                {spectatorStream.currentFen ?? activeMatch.fen}
              </div>
            </div>

            {/* Recent Live Moves Feed */}
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#E2E8F0', marginBottom: '0.5rem' }}>
                Fluxo de Lances Transmitidos (Edge Relay):
              </div>
              <div
                id="spectator-recent-moves-log"
                style={{
                  maxHeight: '140px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  padding: '0.5rem',
                  backgroundColor: 'rgba(2, 6, 23, 0.7)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                {spectatorStream.recentEvents.length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    Aguardando novos lances da partida...
                  </span>
                ) : (
                  spectatorStream.recentEvents.map((ev, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.8rem',
                        color: '#94A3B8',
                      }}
                    >
                      <span>
                        Lance {ev.ply}: <strong style={{ color: '#F8FAFC' }}>{ev.moveNotation}</strong>
                      </span>
                      <span>{new Date(ev.timestampMs).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Back Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <ActionButton
                id="btn-leave-spectate"
                variant="secondary"
                size="sm"
                onClick={() => setActiveMatch(null)}
              >
                Retornar a Lista de Partidas
              </ActionButton>
            </div>
          </div>
        ) : (
          /* Match Selection List */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input
                id="input-search-live-matches"
                type="text"
                placeholder="Filtrar por jogador ou variante..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.6rem 0.85rem',
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#F8FAFC',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div
              id="live-matches-list"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {filteredMatches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  Nenhuma partida ao vivo encontrada para o filtro informado.
                </div>
              ) : (
                filteredMatches.map((m) => (
                  <Card
                    key={m.matchId}
                    id={`live-match-card-${m.matchId}`}
                    variant="interactive"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '1rem',
                      backgroundColor: 'rgba(30, 41, 59, 0.5)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      borderRadius: '8px',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            color: '#60A5FA',
                            textTransform: 'uppercase',
                          }}
                        >
                          {m.variantId}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          Lance {m.currentPly}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#F8FAFC' }}>
                        {m.whitePlayer.displayName} ({m.whitePlayer.elo}) vs{' '}
                        {m.blackPlayer.displayName} ({m.blackPlayer.elo})
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#94A3B8', fontSize: '0.8rem' }}>
                        <IconEye size={14} color="#60A5FA" />
                        <span>{m.spectatorCount} espectadores</span>
                      </div>
                    </div>

                    <ActionButton
                      id={`btn-watch-match-${m.matchId}`}
                      variant="primary"
                      size="sm"
                      onClick={() => setActiveMatch(m)}
                    >
                      <IconEye size={15} />
                      Assistir Partida
                    </ActionButton>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};


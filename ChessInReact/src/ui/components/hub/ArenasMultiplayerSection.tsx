import React from 'react';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import { IconShield, IconSwords, IconUsers, IconTrophy } from '../../icons/AppIcons';
import { CompositeArenaLayouts } from '../../../engine/multiplayer/arenas/CompositeArenaLayouts';

export interface IArenasMultiplayerSectionProps {
  readonly onOpenStagingModal: (variantId: string, participants: number) => void;
  readonly onOpenMatchmaking?: () => void;
  readonly onOpenLobbyBrowser?: () => void;
  readonly onOpenTournamentModal?: () => void;
}

export const ArenasMultiplayerSection: React.FC<IArenasMultiplayerSectionProps> = ({
  onOpenStagingModal,
  onOpenMatchmaking,
  onOpenLobbyBrowser,
  onOpenTournamentModal,
}) => {
  const layouts = CompositeArenaLayouts.getAllLayouts();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Spec 08 Global Matchmaking & Lobbies Quick Access Bar */}
      <Card
        id="hub-multiplayer-quick-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconSwords size={20} color="#60A5FA" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#F8FAFC' }}>
              Multijogador & Pareamento Online (Spec 08)
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8' }}>
            Partidas ranqueadas com balanceamento de ELO dinâmico, saguão de salas e torneios ao vivo.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          {onOpenMatchmaking && (
            <ActionButton
              id="hub-btn-ranked-queue"
              variant="primary"
              size="sm"
              onClick={onOpenMatchmaking}
            >
              <IconSwords size={16} />
              Fila Ranqueada Global
            </ActionButton>
          )}

          {onOpenLobbyBrowser && (
            <ActionButton
              id="hub-btn-community-lobbies"
              variant="secondary"
              size="sm"
              onClick={onOpenLobbyBrowser}
            >
              <IconUsers size={16} />
              Saguão de Lobbies
            </ActionButton>
          )}

          {onOpenTournamentModal && (
            <ActionButton
              id="hub-btn-open-tournament"
              variant="secondary"
              size="sm"
              onClick={onOpenTournamentModal}
            >
              <IconTrophy size={16} />
              Arena de Torneios
            </ActionButton>
          )}
        </div>
      </Card>

      {/* Arenas Massivas (3 a 12 Jogadores) Grid */}
      <div
        id="hub-arenas-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        {layouts.map((arena) => (
          <Card
            key={arena.id}
            id={`card-arena-${arena.id}`}
            variant="interactive"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
              padding: '1.25rem',
              border: '1px solid var(--border-prominent)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <IconShield size={28} color="var(--color-accent)" />
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: 'var(--color-primary, #60a5fa)',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  }}
                >
                  {arena.totalParticipants} Jogadores
                </span>
              </div>

              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: '1.05rem',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                  }}
                >
                  {arena.name}
                </h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Topologia: {arena.boardType}
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {arena.allowedEliminationPolicies.map((pol) => (
                  <span
                    key={pol}
                    style={{
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-xs)',
                      backgroundColor: 'var(--bg-sunken)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {pol}
                  </span>
                ))}
              </div>
            </div>

            <ActionButton
              id={`hub-btn-arena-${arena.id}`}
              variant="primary"
              size="sm"
              fullWidth
              onClick={() => onOpenStagingModal(arena.id, arena.totalParticipants)}
            >
              Configurar Arena ({arena.totalParticipants}P)
            </ActionButton>
          </Card>
        ))}
      </div>
    </div>
  );
};

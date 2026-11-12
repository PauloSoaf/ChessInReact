import React from 'react';
import { IParticipantSlot } from '../../../matchmaking/config/IMatchConfiguration';
import { PlayerId } from '../../../core/coordinates/types';

export interface IMultiplayerFactionRibbonProps {
  readonly slots: readonly IParticipantSlot[];
  readonly activePlayer: PlayerId;
  readonly scores: Readonly<Record<string, number>>;
  readonly eliminatedPlayers: ReadonlyArray<string>;
  readonly isThinking?: boolean;
}

export const MultiplayerFactionRibbon: React.FC<IMultiplayerFactionRibbonProps> = ({
  slots,
  activePlayer,
  scores,
  eliminatedPlayers,
  isThinking = false,
}) => {
  return (
    <div
      role="region"
      aria-label="Fitas de Facções da Arena Multiplayer"
      data-testid="multiplayer-faction-ribbon"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
        maxWidth: '604px',
        overflowX: 'auto',
        padding: '0.45rem 0.6rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-sunken)',
        border: '1px solid var(--border-prominent)',
        boxShadow: 'var(--shadow-sm)',
        marginBottom: '0.5rem',
      }}
    >
      {slots.map((slot) => {
        const playerId = `P${slot.slotIndex + 1}` as PlayerId;
        const factionKey = `FACTION_${slot.slotIndex + 1}`;
        const isActive = activePlayer === playerId;
        const isEliminated =
          eliminatedPlayers.includes(factionKey) || eliminatedPlayers.includes(playerId);
        const score = scores[factionKey] ?? scores[playerId] ?? 0;
        const isBot = slot.role === 'AI_BOT' || slot.role === 'BOT_STANDIN';

        return (
          <div
            key={slot.slotIndex}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: isActive ? 'var(--bg-elevated)' : 'transparent',
              border: isActive
                ? `2px solid ${slot.hexColor}`
                : '1px solid var(--border-subtle)',
              opacity: isEliminated ? 0.4 : 1,
              boxShadow: isActive ? `0 0 8px ${slot.hexColor}66` : 'none',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Color dot */}
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: slot.hexColor,
                display: 'inline-block',
                boxShadow: `0 0 4px ${slot.hexColor}`,
              }}
            />

            {/* Label and Score */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 800 : 600,
                  color: 'var(--text-prominent)',
                  lineHeight: 1.1,
                }}
              >
                {slot.displayName}
                {isActive && isThinking && ' 💭'}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  color: isEliminated ? '#ef4444' : 'var(--text-subtle)',
                  fontWeight: 500,
                }}
              >
                {isEliminated
                  ? 'Eliminado'
                  : `${score} pts • ${isBot ? `Bot N${slot.botConfig?.difficultyLevel ?? 3}` : 'Local'}`}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

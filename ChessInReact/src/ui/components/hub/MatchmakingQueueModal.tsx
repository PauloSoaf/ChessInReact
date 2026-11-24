import React, { useEffect } from 'react';
import {
  useMatchmakingQueue,
  IUseMatchmakingQueueOptions,
} from '../../../bindings/react/useMatchmakingQueue';
import {
  IMatchFoundPayload,
  IMatchmakingQueueClient,
} from '../../../matchmaking/interfaces/IMatchmakingContracts';
import { AntiDodgePenaltyManager } from '../../../matchmaking/engine/AntiDodgePenaltyManager';
import { Card } from '../primitives/Card';
import { ActionButton } from '../primitives/ActionButton';
import {
  IconTarget,
  IconClock,
  IconShield,
  IconCheck,
  IconX,
  IconAlertTriangle,
} from '../../icons/AppIcons';

export interface IMatchmakingQueueModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly userId: string;
  readonly displayName: string;
  readonly eloRating: number;
  readonly variantId: string;
  readonly playerCount?: number;
  readonly queueClient?: IMatchmakingQueueClient;
  readonly penaltyManager?: AntiDodgePenaltyManager;
  readonly onMatchStart?: (payload: IMatchFoundPayload) => void;
}

export const MatchmakingQueueModal: React.FC<IMatchmakingQueueModalProps> = ({
  isOpen,
  onClose,
  userId,
  displayName,
  eloRating,
  variantId,
  playerCount = 2,
  queueClient,
  penaltyManager,
  onMatchStart,
}) => {
  const queueOptions: IUseMatchmakingQueueOptions = {
    queueClient,
    penaltyManager,
    onMatchAccepted: (payload) => {
      onMatchStart?.(payload);
      onClose();
    },
  };

  const {
    state,
    elapsedSeconds,
    toleranceWindow,
    foundMatch,
    acceptCountdown,
    penaltyRemainingSeconds,
    isHeartbeatActive,
    joinQueue,
    cancelQueue,
    acceptMatch,
    declineMatch,
  } = useMatchmakingQueue(queueOptions);

  // Auto-enqueue on modal open if idle
  useEffect(() => {
    if (isOpen && state === 'idle') {
      joinQueue({
        userId,
        displayName,
        eloRating,
        variantId,
        playerCount,
      });
    }
  }, [isOpen, state, joinQueue, userId, displayName, eloRating, variantId, playerCount]);

  if (!isOpen) {
    return null;
  }

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = () => {
    cancelQueue();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="matchmaking-modal-title"
      data-testid="matchmaking-queue-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        {state === 'searching' && (
          <>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(59, 130, 246, 0.4)',
              }}
            >
              <IconTarget size={32} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h2
                id="matchmaking-modal-title"
                style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}
              >
                Buscando Oponente
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                Modo: {variantId.toUpperCase()} ({playerCount} Jogadores)
              </span>
            </div>

            {/* Elapsed Time Display */}
            <div
              data-testid="queue-timer-display"
              style={{
                fontSize: '2rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <IconClock size={24} />
              {formatTime(elapsedSeconds)}
            </div>

            {/* Elo Tolerance Window */}
            <div
              data-testid="tolerance-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '9999px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                fontSize: '0.8rem',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <IconShield size={14} />
              <span>Janela ELO: ±{toleranceWindow} pts</span>
            </div>

            {/* Heartbeat Status */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.75rem',
                color: isHeartbeatActive ? '#10B981' : 'rgba(255, 255, 255, 0.4)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: isHeartbeatActive ? '#10B981' : '#6B7280',
                  display: 'inline-block',
                }}
              />
              <span>Redis Heartbeat Ativo (TTL 15s)</span>
            </div>

            {/* Cancel Button */}
            <ActionButton
              id="btn-cancel-queue"
              variant="secondary"
              onClick={handleCancel}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              <IconX size={16} />
              Cancelar Busca
            </ActionButton>
          </>
        )}

        {state === 'match_found' && (
          <>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(16, 185, 129, 0.5)',
              }}
            >
              <IconCheck size={32} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h2
                id="matchmaking-modal-title"
                style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#10B981' }}
              >
                Partida Encontrada!
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                Sala: {foundMatch?.roomId}
              </span>
            </div>

            {/* 10s Countdown Bar */}
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                }}
              >
                <span>Confirme sua presenca</span>
                <span data-testid="match-countdown" style={{ fontWeight: 700 }}>
                  {acceptCountdown}s
                </span>
              </div>
              <div
                style={{
                  width: '100%',
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(acceptCountdown / 10) * 100}%`,
                    backgroundColor: '#10B981',
                    transition: 'width 1s linear',
                  }}
                />
              </div>
            </div>

            {/* Accept / Decline Action Buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
              <ActionButton
                id="btn-decline-match"
                variant="secondary"
                onClick={() => declineMatch('manual')}
                style={{ flex: 1 }}
              >
                <IconX size={16} />
                Recusar
              </ActionButton>
              <ActionButton
                id="btn-accept-match"
                variant="primary"
                onClick={acceptMatch}
                style={{ flex: 1 }}
              >
                <IconCheck size={16} />
                Aceitar ({acceptCountdown}s)
              </ActionButton>
            </div>
          </>
        )}

        {state === 'cooldown' && (
          <>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid rgba(239, 68, 68, 0.5)',
              }}
            >
              <IconAlertTriangle size={32} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <h2
                id="matchmaking-modal-title"
                style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#EF4444' }}
              >
                Penalidade Anti-Dodge Ativa
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.65)' }}>
                Voce recusou ou nao confirmou a partida a tempo.
              </span>
            </div>

            <div
              data-testid="cooldown-timer-display"
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#EF4444',
                fontFamily: 'monospace',
              }}
            >
              Bloqueado por mais {penaltyRemainingSeconds}s
            </div>

            <ActionButton
              id="btn-close-cooldown"
              variant="secondary"
              onClick={onClose}
              style={{ width: '100%', marginTop: '0.5rem' }}
            >
              Fechar
            </ActionButton>
          </>
        )}
      </Card>
    </div>
  );
};

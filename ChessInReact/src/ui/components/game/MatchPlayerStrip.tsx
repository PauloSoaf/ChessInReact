/** One player's panel. Everything is derived from the seat of `playerId`, never from its colour. */
import React from 'react';
import { PlayerId } from '../../../core/coordinates';
import { IMatchConfiguration } from '../../../matchmaking/config/IMatchConfiguration';
import { isBotRole, sideName, singleLocalHuman, slotOfPlayer } from '../../../matchmaking/config/participants';
import { IPlayerCardProps, PlayerCard } from './PlayerCard';

export interface IMatchPlayerStripProps extends Pick<IPlayerCardProps,
  'capturedPieces' | 'materialAdvantage' | 'timeLeftMs' | 'isInCheck' | 'isUnlimited' | 'timeControlLabel' | 'isRanked' | 'actionSlot'> {
  readonly position: 'top' | 'bottom';
  readonly playerId: PlayerId;
  readonly config: IMatchConfiguration;
  readonly activePlayer: PlayerId;
  readonly isGameOver: boolean;
  readonly isThinking: boolean;
  readonly difficultyLabels: Readonly<Record<number, string>>;
}

export const MatchPlayerStrip: React.FC<IMatchPlayerStripProps> = ({
  position, playerId, config, activePlayer, isGameOver, isThinking, difficultyLabels, ...card
}) => {
  const slot = slotOfPlayer(config, playerId);
  const isBot = isBotRole(slot?.role);
  const level = slot?.botConfig?.difficultyLevel ?? 3;
  const isLocalHuman = singleLocalHuman(config) === playerId;
  const name = slot?.displayName.replace(/\s*\(N[1-5]\).*$/, '').trim() || (isBot ? 'Oponente IA' : 'Jogador');
  const control = isBot ? `IA (N${level})`
    : isLocalHuman ? 'Você' : slot?.role === 'HUMAN_REMOTE' ? 'Jogador remoto' : 'Controle Manual Local';
  const active = !isGameOver && activePlayer === playerId;
  return (
    <div className="match-stage-player-wrap" data-testid={`player-strip-${position}`}
      data-player-id={playerId} data-seat={isBot ? 'bot' : 'human'}>
      <PlayerCard
        {...card}
        playerId={playerId}
        displayName={name}
        subtitle={`Peças ${sideName(playerId)} • ${control}`}
        isTurnActive={active}
        isThinking={isThinking && active && isBot}
        isBot={isBot}
        difficultyLabel={isBot ? difficultyLabels[level] : undefined}
      />
    </div>
  );
};

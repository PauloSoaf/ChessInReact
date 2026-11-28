import React from 'react';

export type ReplaySpeed = 0.5 | 1 | 2;

export interface IReplayNavigationBarProps {
  /** Ply being viewed, or null while following the live game. */
  readonly selectedPly: number | null;
  readonly livePly: number;
  readonly isPlaying: boolean;
  readonly speed: ReplaySpeed;
  readonly isEnded: boolean;
  /** Spell cast during the viewed turn, if any. */
  readonly spellText?: string | null;
  readonly notice?: string | null;
  readonly onSelectPly: (ply: number) => void;
  readonly onTogglePlay: () => void;
  readonly onSpeedChange: (speed: ReplaySpeed) => void;
  readonly onExit: () => void;
}

const Icon: React.FC<{ d: string }> = ({ d }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const ReplayNavigationBar: React.FC<IReplayNavigationBarProps> = ({
  selectedPly, livePly, isPlaying, speed, isEnded, spellText, notice,
  onSelectPly, onTogglePlay, onSpeedChange, onExit,
}) => {
  const reviewing = selectedPly !== null;
  const current = selectedPly ?? livePly;
  const button = (testId: string, label: string, path: string, disabled: boolean, onClick: () => void) => (
    <button type="button" className="replay-btn" data-testid={testId} aria-label={label} title={label}
      disabled={disabled} onClick={onClick}>
      <Icon d={path} />
    </button>
  );
  return (
    <div className="replay-bar" data-testid="move-history-nav-bar" role="group" aria-label="Navegação da partida">
      {reviewing && (
        <div className="replay-status" role="status" data-testid="replay-status">
          <strong>Analisando partida</strong>
          <span>{current === 0 ? 'Posição inicial' : `Lance ${current} de ${livePly}`}</span>
        </div>
      )}
      {reviewing && spellText && <div className="replay-spell" data-testid="replay-spell">{spellText}</div>}
      {notice && <div className="replay-spell" role="note">{notice}</div>}
      <div className="replay-controls">
        {button('btn-move-first', 'Posição inicial', 'M18 5 8 12l10 7zM6 5v14', current <= 0, () => onSelectPly(0))}
        {button('btn-move-prev', 'Lance anterior', 'M15 5 8 12l7 7', current <= 0, () => onSelectPly(current - 1))}
        {button('btn-replay-play', isPlaying ? 'Pausar' : 'Reproduzir',
          isPlaying ? 'M8 5v14M16 5v14' : 'M7 5l12 7-12 7z', livePly === 0, onTogglePlay)}
        {button('btn-move-next', 'Próximo lance', 'm9 5 7 7-7 7', current >= livePly, () => onSelectPly(current + 1))}
        {button('btn-move-last', 'Último lance', 'M6 5l10 7-10 7zM18 5v14', reviewing ? current >= livePly : livePly === 0,
          () => onSelectPly(livePly))}
        <select className="replay-speed" data-testid="replay-speed" aria-label="Velocidade da reprodução"
          value={speed} onChange={(e) => onSpeedChange(Number(e.target.value) as ReplaySpeed)}>
          <option value={0.5}>0,5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
        </select>
      </div>
      {reviewing && (
        <button type="button" className="replay-exit" data-testid="btn-replay-exit" onClick={onExit}>
          {isEnded ? 'Voltar ao último lance' : 'Voltar ao vivo'}
        </button>
      )}
    </div>
  );
};

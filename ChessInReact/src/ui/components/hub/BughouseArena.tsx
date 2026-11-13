import React, { useMemo, useState } from 'react';
import { ActionButton } from '../primitives/ActionButton';
import { Card } from '../primitives/Card';
import {
  BughouseBoardId,
  BughouseEngine,
  BughousePieceType,
  IBughouseMatchState,
} from '../../../analysis/minigames/BughouseEngine';
import { IPieceEntity } from '../../../core/entities/types';

const PLAYERS = {
  alice: 'alice',
  bob: 'bob',
  charlie: 'charlie',
  diana: 'diana',
} as const;

const PIECE_GLYPHS: Record<string, string> = {
  PAWN: '♟',
  KNIGHT: '♞',
  BISHOP: '♝',
  ROOK: '♜',
  QUEEN: '♛',
  KING: '♚',
};

const PLAYER_LABELS: Record<string, string> = {
  alice: 'Você · Mesa A Brancas',
  bob: 'Você · Mesa B Pretas',
  charlie: 'Oponente · Mesa A Pretas',
  diana: 'Oponente · Mesa B Brancas',
};

function coordinate(file: number, rank: number): string {
  return `${file},${rank}`;
}

function algebraic(file: number, rank: number): string {
  return `${String.fromCharCode(97 + file)}${rank + 1}`;
}

function boardPieces(board: IBughouseMatchState['boardA']): Map<string, IPieceEntity> {
  const result = new Map<string, IPieceEntity>();
  for (const entity of Object.values(board.domainState?.boardEntities ?? {})) {
    if (entity.type === 'PIECE' && entity.position && !entity.isCaptured) {
      result.set(entity.position, entity as IPieceEntity);
    }
  }
  return result;
}

const BughouseBoard: React.FC<{
  board: IBughouseMatchState['boardA'];
  boardId: BughouseBoardId;
  selected: string | null;
  onSquareClick: (boardId: BughouseBoardId, coord: string) => void;
}> = ({ board, boardId, selected, onSquareClick }) => {
  const pieces = useMemo(() => boardPieces(board), [board]);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{boardId === 'BOARD_A' ? 'Mesa A' : 'Mesa B'}</strong>
        <span>Turno: {board.activeColor === 'WHITE' ? 'Brancas' : 'Pretas'}</span>
      </div>
      <div
        role="grid"
        aria-label={`Tabuleiro ${boardId}`}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', aspectRatio: '1' }}
      >
        {Array.from({ length: 64 }, (_, index) => {
          const file = index % 8;
          const rank = 7 - Math.floor(index / 8);
          const coord = coordinate(file, rank);
          const piece = pieces.get(coord);
          const isSelected = selected === coord;
          return (
            <button
              key={coord}
              type="button"
              role="gridcell"
              aria-label={`${algebraic(file, rank)}${piece ? ` ${piece.variantId}` : ''}`}
              onClick={() => onSquareClick(boardId, coord)}
              style={{
                border: isSelected ? '2px solid var(--color-accent)' : '1px solid var(--border-subtle)',
                background: (file + rank) % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-sunken)',
                color: piece?.ownerId === 'P1' ? 'var(--color-accent)' : 'var(--text-primary)',
                fontSize: 'clamp(1.1rem, 3vw, 2rem)',
                aspectRatio: '1',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {piece ? PIECE_GLYPHS[piece.variantId] ?? '?' : ''}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const BughouseArena: React.FC<{ onBackToHub: () => void }> = ({ onBackToHub }) => {
  const createLocalMatch = () =>
    BughouseEngine.createMatch({
      team1WhiteA: PLAYERS.alice,
      team1BlackB: PLAYERS.bob,
      team2BlackA: PLAYERS.charlie,
      team2WhiteB: PLAYERS.diana,
    }, 'local_bughouse');

  const [match, setMatch] = useState<IBughouseMatchState>(createLocalMatch);
  const [activePlayer, setActivePlayer] = useState<string>(PLAYERS.alice);
  const [selected, setSelected] = useState<{ boardId: BughouseBoardId; coord: string } | null>(null);
  const [reserveType, setReserveType] = useState<BughousePieceType | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const player = match.players[activePlayer];
  const reserve = player?.reservePieces ?? [];
  const activeBoard = player?.boardId === 'BOARD_A' ? match.boardA : player?.boardId === 'BOARD_B' ? match.boardB : null;

  const handleSquareClick = (boardId: BughouseBoardId, coord: string) => {
    if (!player || player.boardId !== boardId || match.isGameOver) return;
    const board = boardId === 'BOARD_A' ? match.boardA : match.boardB;
    const pieces = boardPieces(board);
    const piece = pieces.get(coord);
    const playerColor = player.color === 'WHITE' ? 'P1' : 'P2';

    try {
      if (reserveType) {
        setMatch(BughouseEngine.executeDrop(match, boardId, activePlayer, reserveType, coord));
        setReserveType(null);
        setSelected(null);
        setFeedback(null);
        return;
      }
      if (!selected || selected.boardId !== boardId) {
        if (piece?.ownerId === playerColor) {
          setSelected({ boardId, coord });
        } else {
          setFeedback('Selecione uma peça sua para iniciar o lance.');
        }
        return;
      }
      if (selected.coord === coord) {
        setSelected(null);
        return;
      }
      if (piece?.ownerId === playerColor) {
        setSelected({ boardId, coord });
        setFeedback(null);
        return;
      }
      setMatch(BughouseEngine.executeMove(match, boardId, activePlayer, {
        from: selected.coord,
        to: coord,
      }));
      setSelected(null);
      setFeedback(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Lance rejeitado.');
    }
  };

  const handleRestart = () => {
    setMatch(createLocalMatch());
    setSelected(null);
    setReserveType(null);
    setFeedback(null);
  };

  const handleResign = () => {
    if (!player || match.isGameOver) return;
    setMatch(BughouseEngine.resign(match, activePlayer));
    setSelected(null);
    setReserveType(null);
    setFeedback(null);
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1rem', display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
        <ActionButton variant="secondary" onClick={onBackToHub}>← Voltar ao Hub</ActionButton>
        <h2 style={{ margin: 0 }}>Bughouse 2v2 · Mesas Gêmeas</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span>{match.isGameOver ? match.winReason : 'Partida local'}</span>
          <ActionButton variant="secondary" onClick={handleRestart}>Reiniciar</ActionButton>
        </div>
      </div>
      <Card variant="elevated" style={{ padding: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label>
          Jogador local{' '}
          <select value={activePlayer} onChange={(event) => {
            setActivePlayer(event.target.value);
            setSelected(null);
            setReserveType(null);
          }}>
            {Object.keys(PLAYER_LABELS).map((id) => <option key={id} value={id}>{PLAYER_LABELS[id]}</option>)}
          </select>
        </label>
        <span>
          Turno: {activeBoard?.activeColor === player?.color ? 'seu' : 'aguarde'} · Reserva:{' '}
          {reserve.length ? reserve.join(' ') : 'vazia'}
        </span>
        {reserve.map((type, index) => (
          <button
            key={`${type}-${index}`}
            type="button"
            aria-pressed={reserveType === type}
            onClick={() => setReserveType(reserveType === type ? null : type)}
          >
            Drop {type.toUpperCase()}
          </button>
        ))}
        <ActionButton variant="secondary" onClick={handleResign} disabled={match.isGameOver}>
          Abandonar
        </ActionButton>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <Card variant="elevated" style={{ padding: '0.75rem' }}>
          <BughouseBoard board={match.boardA} boardId="BOARD_A" selected={selected?.boardId === 'BOARD_A' ? selected.coord : null} onSquareClick={handleSquareClick} />
        </Card>
        <Card variant="elevated" style={{ padding: '0.75rem' }}>
          <BughouseBoard board={match.boardB} boardId="BOARD_B" selected={selected?.boardId === 'BOARD_B' ? selected.coord : null} onSquareClick={handleSquareClick} />
        </Card>
      </div>
      {feedback && <div role="alert" style={{ color: 'var(--color-danger)' }}>{feedback}</div>}
      <div>Selecione uma peça e depois a casa de destino. Para drop, selecione uma peça da reserva e clique numa casa vazia.</div>
    </div>
  );
};

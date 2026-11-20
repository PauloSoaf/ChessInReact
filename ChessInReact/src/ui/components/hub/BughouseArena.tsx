import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ActionButton } from '../primitives/ActionButton';
import { Card } from '../primitives/Card';
import {
  BughouseBoardId,
  BughouseEngine,
  BughousePieceType,
  IBughouseMatchState,
} from '../../../analysis/minigames/BughouseEngine';
import { IPieceEntity } from '../../../core/entities/types';
import { PieceRenderer } from '../pieces/PieceRenderer';
import { useTheme } from '../../theme/ThemeContext';
import { RulesEngine } from '../../../engine/rules/RulesEngine';
import { SquareTopology } from '../../../core/topology/SquareTopology';
import { CheckValidator } from '../../../engine/rules/CheckValidator';
import { AIWorkerPool } from '../../../workers/ai/AIWorkerPool';
import { AIDifficultyLevel } from '../../../workers/ai/interfaces/IAIEngineContracts';

const PLAYERS = {
  alice: 'alice',
  bob: 'bob',
  charlie: 'charlie',
  diana: 'diana',
} as const;

type SeatId = keyof typeof PLAYERS;

export interface ISeatConfig {
  readonly role: 'HUMAN_LOCAL' | 'AI_BOT';
  readonly difficulty: AIDifficultyLevel;
}

const PLAYER_LABELS: Record<string, string> = {
  alice: 'Você · Mesa A Brancas',
  bob: 'Parceiro · Mesa B Pretas',
  charlie: 'Oponente · Mesa A Pretas',
  diana: 'Oponente · Mesa B Brancas',
};

const TOPOLOGY_8X8 = new SquareTopology({ width: 8, height: 8 });

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
  legalDestinations: ReadonlyMap<string, boolean>;
  viewMode: '2D' | '3D';
  onSquareClick: (boardId: BughouseBoardId, coord: string) => void;
}> = ({ board, boardId, selected, legalDestinations, viewMode, onSquareClick }) => {
  const { pieceSet, activeBoardColors } = useTheme();
  const pieces = useMemo(() => boardPieces(board), [board]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{boardId === 'BOARD_A' ? 'Mesa A (Time 1 Brancas × Time 2 Pretas)' : 'Mesa B (Time 2 Brancas × Time 1 Pretas)'}</strong>
        <span>Turno: {board.activeColor === 'WHITE' ? 'Brancas' : 'Pretas'}</span>
      </div>
      <div
        role="grid"
        aria-label={`Tabuleiro ${boardId}`}
        data-testid={`bughouse-board-${boardId}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          aspectRatio: '1',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          border: '2px solid var(--border-prominent)',
          transform:
            viewMode === '3D'
              ? 'perspective(760px) rotateX(22deg) scale(0.96)'
              : 'none',
          transformOrigin: 'center center',
          boxShadow:
            viewMode === '3D'
              ? '0 18px 32px rgba(0, 0, 0, 0.48), 0 6px 0 rgba(15, 23, 42, 0.9)'
              : 'var(--shadow-md)',
          transition: 'transform 220ms ease, box-shadow 220ms ease',
        }}
      >
        {Array.from({ length: 64 }, (_, index) => {
          const file = index % 8;
          const rank = 7 - Math.floor(index / 8);
          const coord = coordinate(file, rank);
          const piece = pieces.get(coord);
          const isSelected = selected === coord;
          const isDark = (file + rank) % 2 === 0;
          const destCapture = legalDestinations.get(coord);
          const isMoveDest = destCapture !== undefined && !destCapture;
          const isCaptureDest = destCapture !== undefined && destCapture;

          return (
            <button
              key={coord}
              type="button"
              role="gridcell"
              data-testid={`bughouse-sq-${boardId}-${coord}`}
              aria-label={`${algebraic(file, rank)}${piece ? ` ${piece.variantId}` : ''}`}
              onClick={() => onSquareClick(boardId, coord)}
              style={{
                position: 'relative',
                border: isSelected
                  ? '2px solid var(--color-accent)'
                  : '0.5px solid rgba(0,0,0,0.08)',
                background: isSelected
                  ? activeBoardColors.selectedSquare
                  : isDark
                  ? activeBoardColors.darkSquare
                  : activeBoardColors.lightSquare,
                aspectRatio: '1',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isMoveDest && (
                <span
                  data-testid="bughouse-legal-dot"
                  style={{
                    position: 'absolute',
                    width: '26%',
                    height: '26%',
                    borderRadius: '50%',
                    backgroundColor: activeBoardColors.legalMoveDot,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {isCaptureDest && (
                <span
                  data-testid="bughouse-capture-ring"
                  style={{
                    position: 'absolute',
                    inset: '3px',
                    borderRadius: '50%',
                    border: `2.5px solid ${activeBoardColors.captureSquare}`,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {piece ? (
                <PieceRenderer
                  variantId={piece.variantId}
                  ownerId={piece.ownerId}
                  pieceSet={pieceSet}
                  size="78%"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const BughouseArena: React.FC<{ onBackToHub: () => void }> = ({ onBackToHub }) => {
  const createLocalMatch = () =>
    BughouseEngine.createMatch(
      {
        team1WhiteA: PLAYERS.alice,
        team1BlackB: PLAYERS.bob,
        team2BlackA: PLAYERS.charlie,
        team2WhiteB: PLAYERS.diana,
      },
      'local_bughouse'
    );

  const [match, setMatch] = useState<IBughouseMatchState>(createLocalMatch);
  const [activePlayer, setActivePlayer] = useState<string>(PLAYERS.alice);
  const [selected, setSelected] = useState<{ boardId: BughouseBoardId; coord: string } | null>(null);
  const [reserveType, setReserveType] = useState<BughousePieceType | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  const [isPaused, setIsPaused] = useState(false);
  const [partnerRequest, setPartnerRequest] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reserveType || partnerRequest || selected) {
          setReserveType(null);
          setPartnerRequest(null);
          setSelected(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reserveType, partnerRequest, selected]);
  const [seatConfigs, setSeatConfigs] = useState<Record<SeatId, ISeatConfig>>({
    alice: { role: 'HUMAN_LOCAL', difficulty: 3 },
    bob: { role: 'HUMAN_LOCAL', difficulty: 3 },
    charlie: { role: 'HUMAN_LOCAL', difficulty: 3 },
    diana: { role: 'HUMAN_LOCAL', difficulty: 3 },
  });

  const player = match.players[activePlayer];
  const reserve = player?.reservePieces ?? [];
  const activeBoard =
    player?.boardId === 'BOARD_A'
      ? match.boardA
      : player?.boardId === 'BOARD_B'
      ? match.boardB
      : null;

  // Compute legal destinations for currently selected piece on either board
  const computeLegalMap = useCallback(
    (board: IBughouseMatchState['boardA'], boardId: BughouseBoardId): Map<string, boolean> => {
      const map = new Map<string, boolean>();
      if (!selected || selected.boardId !== boardId || !board.domainState) return map;
      const pieces = boardPieces(board);
      const selPiece = pieces.get(selected.coord);
      if (!selPiece) return map;
      const moves = RulesEngine.getLegalMovesForPiece(selPiece, board.domainState, TOPOLOGY_8X8);
      for (const m of moves) {
        map.set(m.to, Boolean(m.isCapture));
      }
      return map;
    },
    [selected]
  );

  const legalMapA = useMemo(() => computeLegalMap(match.boardA, 'BOARD_A'), [computeLegalMap, match.boardA]);
  const legalMapB = useMemo(() => computeLegalMap(match.boardB, 'BOARD_B'), [computeLegalMap, match.boardB]);

  // Execute a single bot turn on the specified board using BughouseCoordinatedAgent
  const executeBotTurnOnBoard = useCallback(
    async (boardId: BughouseBoardId) => {
      const board = boardId === 'BOARD_A' ? match.boardA : match.boardB;
      if (match.isGameOver || !board.domainState) return;

      const seatId: SeatId =
        boardId === 'BOARD_A'
          ? board.activeColor === 'WHITE'
            ? 'alice'
            : 'charlie'
          : board.activeColor === 'WHITE'
          ? 'diana'
          : 'bob';

      const seatCfg = seatConfigs[seatId];
      if (!seatCfg || seatCfg.role !== 'AI_BOT') return;

      const domain = board.domainState;
      const legalMoves = RulesEngine.getLegalMoves(domain, TOPOLOGY_8X8);
      if (legalMoves.length === 0) return;

      const botPlayerObj = match.players[seatId];
      const emptySquares: string[] = [];
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 8; y++) {
          const c = `${x},${y}`;
          if (!domain.occupancy[c as keyof typeof domain.occupancy]) {
            emptySquares.push(c);
          }
        }
      }

      const oppPlayerId = domain.activePlayer === 'P1' ? 'P2' : 'P1';
      const oppKing = CheckValidator.findRoyalPiece(oppPlayerId, domain);

      const decision = await AIWorkerPool.dispatchDecision({
        matchId: `${match.matchId}_${boardId}`,
        variantId: 'BUGHOUSE',
        actingPlayer: domain.activePlayer,
        difficultyLevel: seatCfg.difficulty,
        timeBudgetMs: 350,
        legalMoves: legalMoves.map((m) => ({
          from: m.from,
          to: m.to,
          pieceId: m.pieceId,
          isCapture: m.isCapture,
          promotion: m.isPromotion ? 'QUEEN' : undefined,
        })),
        specializedContext: {
          partnerRequest: partnerRequest ?? undefined,
          reservePieces: botPlayerObj?.reservePieces ?? [],
          emptySquares,
          opponentKingCoord: oppKing?.position,
        },
        domain,
        topology: TOPOLOGY_8X8,
      });

      setMatch((prev) => {
        if (prev.isGameOver) return prev;
        const currBoard = boardId === 'BOARD_A' ? prev.boardA : prev.boardB;
        const expectedColor = seatId === 'alice' || seatId === 'diana' ? 'WHITE' : 'BLACK';
        if (currBoard.activeColor !== expectedColor) return prev;

        try {
          if (decision.secondaryAction?.type === 'DROP_PIECE') {
            const dropType = decision.secondaryAction.payload.pieceType as BughousePieceType;
            const targetCoord = decision.secondaryAction.payload.targetCoordinate as string;
            if (prev.players[seatId]?.reservePieces.includes(dropType)) {
              return BughouseEngine.executeDrop(prev, boardId, seatId, dropType, targetCoord);
            }
          }
          return BughouseEngine.executeMove(prev, boardId, seatId, {
            from: decision.move.from,
            to: decision.move.to,
          });
        } catch {
          return prev;
        }
      });
    },
    [match, seatConfigs, partnerRequest]
  );

  // Autonomous bot scheduler across both Twin Boards
  useEffect(() => {
    if (match.isGameOver || isPaused) return;

    const seatA: SeatId = match.boardA.activeColor === 'WHITE' ? 'alice' : 'charlie';
    const seatB: SeatId = match.boardB.activeColor === 'WHITE' ? 'diana' : 'bob';

    const timers: Array<ReturnType<typeof setTimeout>> = [];

    if (seatConfigs[seatA].role === 'AI_BOT') {
      timers.push(
        setTimeout(() => {
          void executeBotTurnOnBoard('BOARD_A');
        }, 420)
      );
    }

    if (seatConfigs[seatB].role === 'AI_BOT') {
      timers.push(
        setTimeout(() => {
          void executeBotTurnOnBoard('BOARD_B');
        }, 520)
      );
    }

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [
    match.isGameOver,
    match.boardA.activeColor,
    match.boardA.fullmoveNumber,
    match.boardB.activeColor,
    match.boardB.fullmoveNumber,
    isPaused,
    seatConfigs,
    executeBotTurnOnBoard,
  ]);

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
          setFeedback(null);
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
      setMatch(
        BughouseEngine.executeMove(match, boardId, activePlayer, {
          from: selected.coord,
          to: coord,
        })
      );
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

  const updateSeat = (seat: SeatId, role: 'HUMAN_LOCAL' | 'AI_BOT', difficulty: AIDifficultyLevel) => {
    setSeatConfigs((prev) => ({
      ...prev,
      [seat]: { role, difficulty },
    }));
  };

  return (
    <div
      data-testid="bughouse-arena"
      style={{ maxWidth: 1140, margin: '0 auto', padding: '1rem', display: 'grid', gap: '1rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <ActionButton variant="secondary" onClick={onBackToHub}>
          ← Voltar ao Hub
        </ActionButton>
        <h2 style={{ margin: 0 }}>Bughouse 2v2 · Mesas Gêmeas</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{match.isGameOver ? match.winReason : 'Partida local'}</span>
          <ActionButton
            variant="secondary"
            onClick={() => setViewMode((v) => (v === '2D' ? '3D' : '2D'))}
            data-testid="bughouse-view-toggle"
            title="Alterna entre visualização plana 2D e perspectiva isométrica inclinada"
          >
            Visão: {viewMode === '3D' ? '3D (Perspectiva Isométrica)' : '2D Plana'}
          </ActionButton>
          <ActionButton variant="secondary" onClick={() => setIsPaused((p) => !p)}>
            {isPaused ? '▶ Retomar Bots' : '⏸ Pausar Bots'}
          </ActionButton>
          <ActionButton variant="secondary" onClick={handleRestart}>
            Reiniciar
          </ActionButton>
        </div>
      </div>

      {/* Universal 4-Seat Human / Multi-Level Bot Configurator */}
      <Card
        variant="elevated"
        style={{
          padding: '0.75rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.65rem',
        }}
      >
        {(Object.keys(PLAYERS) as SeatId[]).map((seatId) => {
          const cfg = seatConfigs[seatId];
          return (
            <div
              key={seatId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                padding: '0.45rem 0.6rem',
                borderRadius: 'var(--radius-xs)',
                backgroundColor: 'var(--bg-sunken)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <strong style={{ fontSize: '0.76rem' }}>{PLAYER_LABELS[seatId]}</strong>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <select
                  aria-label={`Controlador ${seatId}`}
                  value={cfg.role}
                  onChange={(e) =>
                    updateSeat(seatId, e.target.value as 'HUMAN_LOCAL' | 'AI_BOT', cfg.difficulty)
                  }
                  style={{ fontSize: '0.75rem', flex: 1 }}
                >
                  <option value="HUMAN_LOCAL">Humano Local</option>
                  <option value="AI_BOT">Bot IA Coordenado</option>
                </select>
                {cfg.role === 'AI_BOT' && (
                  <select
                    aria-label={`Nível Bot ${seatId}`}
                    value={cfg.difficulty}
                    onChange={(e) =>
                      updateSeat(seatId, cfg.role, Number(e.target.value) as AIDifficultyLevel)
                    }
                    style={{ fontSize: '0.75rem' }}
                  >
                    <option value={1}>N1 Iniciante</option>
                    <option value={2}>N2 Casual</option>
                    <option value={3}>N3 Tático</option>
                    <option value={4}>N4 Forte</option>
                    <option value={5}>N5 Mestre</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <Card variant="elevated" style={{ padding: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          Jogador local{' '}
          <select
            value={activePlayer}
            onChange={(event) => {
              setActivePlayer(event.target.value);
              setSelected(null);
              setReserveType(null);
            }}
          >
            {Object.keys(PLAYER_LABELS).map((id) => (
              <option key={id} value={id}>
                {PLAYER_LABELS[id]}
              </option>
            ))}
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
        {reserveType && (
          <button
            id="btn-cancel-bughouse-drop"
            data-testid="btn-cancel-bughouse-drop"
            type="button"
            onClick={() => setReserveType(null)}
            style={{
              padding: '0.25rem 0.55rem',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid #ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.22)',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕ Cancelar Drop (Esc)
          </button>
        )}
        <div style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center', marginLeft: 'auto' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pedir ao Parceiro:</span>
          {(['KNIGHT', 'QUEEN', 'ROOK', 'PAWN'] as const).map((reqType) => (
            <button
              key={reqType}
              type="button"
              onClick={() => setPartnerRequest((curr) => (curr === reqType ? null : reqType))}
              style={{
                fontSize: '0.72rem',
                padding: '0.2rem 0.45rem',
                borderRadius: 'var(--radius-xs)',
                border:
                  partnerRequest === reqType
                    ? '1.5px solid var(--color-accent)'
                    : '1px solid var(--border-subtle)',
                background:
                  partnerRequest === reqType ? 'rgba(79, 140, 255, 0.16)' : 'var(--bg-sunken)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              {reqType}
            </button>
          ))}
        </div>
        <ActionButton variant="secondary" onClick={handleResign} disabled={match.isGameOver}>
          Abandonar
        </ActionButton>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <Card variant="elevated" style={{ padding: '0.75rem' }}>
          <BughouseBoard
            board={match.boardA}
            boardId="BOARD_A"
            selected={selected?.boardId === 'BOARD_A' ? selected.coord : null}
            legalDestinations={legalMapA}
            viewMode={viewMode}
            onSquareClick={handleSquareClick}
          />
        </Card>
        <Card variant="elevated" style={{ padding: '0.75rem' }}>
          <BughouseBoard
            board={match.boardB}
            boardId="BOARD_B"
            selected={selected?.boardId === 'BOARD_B' ? selected.coord : null}
            legalDestinations={legalMapB}
            viewMode={viewMode}
            onSquareClick={handleSquareClick}
          />
        </Card>
      </div>
      {feedback && (
        <div role="alert" style={{ color: 'var(--color-danger)' }}>
          {feedback}
        </div>
      )}
      <div>
        Selecione uma peça e depois a casa de destino. Para drop, selecione uma peça da reserva e clique numa casa vazia.
      </div>
    </div>
  );
};

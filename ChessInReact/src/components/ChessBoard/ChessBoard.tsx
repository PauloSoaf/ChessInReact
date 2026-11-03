import React, { useMemo } from 'react';
import BoardSquare from '../BoardSquare/BoardSquare';
import { IChessPiece, ISquareInfo } from '../../Interfaces/Interfaces';
import { chessPieces } from '../../constants/chessPieces';
import { useGameActions, useGameStore } from '../../bindings/react/useGameStore';
import { asCoordinateKey } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IPieceEntity } from '../../core/entities/types';
import { SquareTopology } from '../../core/topology/SquareTopology';
import { RulesEngine } from '../../engine/rules/RulesEngine';
import { PlayerId } from '../../core/coordinates/types';
import { useTheme } from '../../ui/theme/ThemeContext';

export interface IChessBoardProps {
  boardSize?: number;
  isBotThinking?: boolean;
  disabled?: boolean;
  botPlayer?: PlayerId;
  /** Optional legacy prop maintained for backward compatibility */
  boardDisplay?: IChessPiece[][];
  setBoardDisplay?: (newBoardDisplay: Array<IChessPiece>[]) => void;
}

export const ChessBoard: React.FC<IChessBoardProps> = ({
  boardSize = 8,
  isBotThinking = false,
  disabled = false,
  botPlayer,
}) => {
  const { preferences, activeBoardColors } = useTheme();
  const isFlipped = Boolean(preferences.flipBoard);

  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece } = useGameActions();

  // WAI-ARIA Roving Tabindex for 8x8 Chessboard Grid: exactly 1 active tab stop
  const [focusedSquare, setFocusedSquare] = React.useState<{ col: number; row: number }>({
    col: isFlipped ? 3 : 4,
    row: isFlipped ? 1 : 6, // e2 on standard board
  });

  // Keep roving active square in sync with selected piece
  React.useEffect(() => {
    if (!ui.selectedPieceId) return;
    const entity = domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined;
    if (!entity?.position) return;
    const parts = entity.position.split(',');
    if (parts.length === 2) {
      const gx = parseInt(parts[0], 10);
      const gy = parseInt(parts[1], 10);
      const col = isFlipped ? boardSize - 1 - gx : gx;
      const row = isFlipped ? gy : boardSize - 1 - gy;
      setFocusedSquare({ col, row });
    }
  }, [ui.selectedPieceId, domain.boardEntities, isFlipped, boardSize]);

  const topology = useMemo(
    () => new SquareTopology({ width: boardSize, height: boardSize }),
    [boardSize]
  );

  // Derive board display matrix reactively from Core domain state (Single Source of Truth - AUDIT-04)
  const derivedBoard = useMemo(() => {
    const grid: IChessPiece[][] = [];

    for (let rowIndex = 0; rowIndex < boardSize; rowIndex++) {
      const row: IChessPiece[] = [];
      const gameY = isFlipped ? rowIndex : boardSize - 1 - rowIndex;

      for (let colIndex = 0; colIndex < boardSize; colIndex++) {
        const gameX = isFlipped ? boardSize - 1 - colIndex : colIndex;
        const coordKey = asCoordinateKey(`${gameX},${gameY}`);
        const entityId = domain.occupancy[coordKey];
        const entity = entityId
          ? (domain.boardEntities[entityId] as IPieceEntity | undefined)
          : undefined;

        if (entity && entity.type === 'PIECE' && !entity.isCaptured) {
          const variantKey = entity.variantId.toLowerCase();
          const base = chessPieces[variantKey] ?? { symbol: '♟', name: variantKey };
          row.push({
            name: entity.variantId,
            symbol: base.symbol,
            color: entity.ownerId === 'P1' ? 'white' : '#ed2fed',
          });
        } else {
          row.push(chessPieces.none);
        }
      }
      grid.push(row);
    }
    return grid;
  }, [domain.occupancy, domain.boardEntities, boardSize, isFlipped]);

  // Currently selected entity
  const selectedEntity = useMemo(() => {
    if (!ui.selectedPieceId) return undefined;
    return domain.boardEntities[ui.selectedPieceId] as IPieceEntity | undefined;
  }, [ui.selectedPieceId, domain.boardEntities]);

  // Compute legal moves map when showLegalMoves preference is enabled
  const legalMovesMap = useMemo(() => {
    if (
      !preferences.showLegalMoves ||
      !selectedEntity ||
      selectedEntity.ownerId !== domain.activePlayer
    ) {
      return new Map<string, boolean>();
    }
    const moves = RulesEngine.getLegalMovesForPiece(selectedEntity, domain, topology);
    const map = new Map<string, boolean>();
    for (const m of moves) {
      const isCap = Boolean(m.isCapture || (m.to && domain.occupancy[m.to]));
      map.set(m.to, isCap);
    }
    return map;
  }, [preferences.showLegalMoves, selectedEntity, domain, topology]);

  const getSquareBackground = (gameX: number, gameY: number) => {
    return (gameX + gameY) % 2 === 0
      ? activeBoardColors.darkSquare
      : activeBoardColors.lightSquare;
  };

  const handleSquareClick = (squareInfo: ISquareInfo) => {
    // Block any selection or move dispatch if match already concluded, bot is thinking, disabled, or bot controls the turn
    if (
      domain.isGameOver ||
      domain.winnerId !== null ||
      isBotThinking ||
      disabled ||
      (botPlayer && domain.activePlayer === botPlayer)
    ) {
      return;
    }

    const gameX =
      squareInfo.gameX !== undefined
        ? squareInfo.gameX
        : isFlipped
        ? boardSize - 1 - squareInfo.column
        : squareInfo.column;
    const gameY =
      squareInfo.gameY !== undefined
        ? squareInfo.gameY
        : isFlipped
        ? squareInfo.row
        : boardSize - 1 - squareInfo.row;
    const clickedCoord = asCoordinateKey(`${gameX},${gameY}`);

    const clickedEntityId = domain.occupancy[clickedCoord];
    const clickedEntity = clickedEntityId
      ? (domain.boardEntities[clickedEntityId] as IPieceEntity | undefined)
      : undefined;

    // 1. If no piece is currently selected
    if (!ui.selectedPieceId) {
      if (
        clickedEntity &&
        clickedEntity.type === 'PIECE' &&
        clickedEntity.ownerId === domain.activePlayer &&
        !clickedEntity.isCaptured
      ) {
        selectPiece(clickedEntity.id);
      }
      return;
    }

    // 2. A piece is currently selected
    const activeSelected = domain.boardEntities[ui.selectedPieceId] as
      | IPieceEntity
      | undefined;
    if (!activeSelected) {
      selectPiece(null);
      return;
    }

    // Clicking the same piece deselects it
    if (activeSelected.id === clickedEntityId || activeSelected.position === clickedCoord) {
      selectPiece(null);
      return;
    }

    // Clicking another friendly piece switches the selection
    if (
      clickedEntity &&
      clickedEntity.type === 'PIECE' &&
      clickedEntity.ownerId === domain.activePlayer &&
      !clickedEntity.isCaptured
    ) {
      selectPiece(clickedEntity.id);
      return;
    }

    // Rules Engine Validation: Query legal moves for this piece before dispatching (RF-14)
    const legalMoves = RulesEngine.getLegalMovesForPiece(activeSelected, domain, topology);
    const matchedMove = legalMoves.find((m) => m.to === clickedCoord);

    if (!matchedMove) {
      console.warn(
        `[RulesEngine] Move rejected: ${activeSelected.variantId} at ${activeSelected.position} cannot legally move to ${clickedCoord}.`
      );
      selectPiece(null);
      return;
    }

    // Dispatch MovePieceCommand through Core State Store with full rules validation
    try {
      const promotionVariant = matchedMove.isPromotion ? 'QUEEN' : undefined;
      const moveCmd = new MovePieceCommand(
        activeSelected.id,
        activeSelected.position,
        clickedCoord,
        domain.activePlayer,
        undefined,
        true,
        true,
        promotionVariant,
        topology
      );
      executeCommand(moveCmd);
    } catch (err) {
      console.warn('[RulesEngine] Move rejected by Core invariants / Rules Engine:', err);
    } finally {
      selectPiece(null);
    }
  };

  return (
    <div
      data-testid="chess-board"
      className="chess-board-grid"
      style={{
        display: 'grid',
        aspectRatio: '1 / 1',
        gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
        gridTemplateRows: `repeat(${boardSize}, 1fr)`,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {derivedBoard.map((row, rowIndex) =>
        row.map((piece, columnIndex) => {
          const gameY = isFlipped ? rowIndex : boardSize - 1 - rowIndex;
          const gameX = isFlipped ? boardSize - 1 - columnIndex : columnIndex;
          const coordKey = asCoordinateKey(`${gameX},${gameY}`);
          const entityId = domain.occupancy[coordKey];
          const isSelected = Boolean(ui.selectedPieceId && entityId === ui.selectedPieceId);

          const legalMoveInfo = legalMovesMap.get(coordKey);
          const isMoveDestination = legalMoveInfo !== undefined && !legalMoveInfo;
          const isCaptureDestination = legalMoveInfo !== undefined && legalMoveInfo;

          const rankLabel =
            preferences.showCoordinates && columnIndex === 0
              ? String(gameY + 1)
              : undefined;
          const fileLabel =
            preferences.showCoordinates && rowIndex === boardSize - 1
              ? String.fromCharCode(97 + gameX)
              : undefined;

          const isRovingActive =
            focusedSquare.col === columnIndex && focusedSquare.row === rowIndex;

          return (
            <BoardSquare
              key={`${columnIndex}-${rowIndex}`}
              testId={`square-${gameX},${gameY}`}
              piece={piece}
              boardDisplay={derivedBoard}
              squareInfo={{
                row: rowIndex,
                column: columnIndex,
                gameX,
                gameY,
                squareID: `${columnIndex}-${rowIndex}`,
                name: `${piece.name}${rowIndex}`,
              }}
              backgroundColor={getSquareBackground(gameX, gameY)}
              isSelected={isSelected}
              handleClick={handleSquareClick}
              isMoveDestination={isMoveDestination}
              isCaptureDestination={isCaptureDestination}
              rankLabel={rankLabel}
              fileLabel={fileLabel}
              tabIndex={isRovingActive ? 0 : -1}
              onFocusSquare={(col, row) => setFocusedSquare({ col, row })}
            />
          );
        })
      )}
    </div>
  );
};

export default ChessBoard;
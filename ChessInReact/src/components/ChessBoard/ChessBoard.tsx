import React, { useMemo } from 'react';
import BoardSquare from '../BoardSquare/BoardSquare';
import { IChessPiece, ISquareInfo } from '../../Interfaces/Interfaces';
import { chessPieces } from '../../constants/chessPieces';
import { useGameActions, useGameStore } from '../../bindings/react/useGameStore';
import { asCoordinateKey } from '../../core/coordinates';
import { MovePieceCommand } from '../../core/commands/MovePieceCommand';
import { IPieceEntity } from '../../core/entities/types';

export interface IChessBoardProps {
  boardSize?: number;
  /** Optional legacy prop maintained for backward compatibility */
  boardDisplay?: IChessPiece[][];
  setBoardDisplay?: (newBoardDisplay: Array<IChessPiece>[]) => void;
}

const defaultLightSquare = {
  backgroundColor: 'black',
};
const defaultDarkSquare = {
  backgroundColor: '#300030',
};

const getSquareBackground = (row: number, column: number) => {
  return (row + column) % 2 === 0
    ? defaultDarkSquare.backgroundColor
    : defaultLightSquare.backgroundColor;
};

export const ChessBoard: React.FC<IChessBoardProps> = ({ boardSize = 8 }) => {
  const domain = useGameStore((state) => state.domain);
  const ui = useGameStore((state) => state.ui);
  const { executeCommand, selectPiece, setActivePlayer } = useGameActions();

  // Derive board display matrix reactively from Core domain state (Single Source of Truth - AUDIT-04)
  const derivedBoard = useMemo(() => {
    const grid: IChessPiece[][] = [];

    for (let rowIndex = 0; rowIndex < boardSize; rowIndex++) {
      const row: IChessPiece[] = [];
      const gameY = boardSize - 1 - rowIndex;

      for (let colIndex = 0; colIndex < boardSize; colIndex++) {
        const gameX = colIndex;
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
  }, [domain.occupancy, domain.boardEntities, boardSize]);

  const handleSquareClick = (squareInfo: ISquareInfo) => {
    const gameX = squareInfo.column;
    const gameY = boardSize - 1 - squareInfo.row;
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
    const selectedEntity = domain.boardEntities[ui.selectedPieceId] as
      | IPieceEntity
      | undefined;
    if (!selectedEntity) {
      selectPiece(null);
      return;
    }

    // Clicking the same piece deselects it
    if (selectedEntity.id === clickedEntityId || selectedEntity.position === clickedCoord) {
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

    // Dispatch MovePieceCommand through Core State Store
    try {
      const moveCmd = new MovePieceCommand(
        selectedEntity.id,
        selectedEntity.position,
        clickedCoord,
        domain.activePlayer
      );
      executeCommand(moveCmd);

      // Advance turn
      setActivePlayer(domain.activePlayer === 'P1' ? 'P2' : 'P1');
    } catch (err) {
      console.warn('Move rejected by Core invariants:', err);
    } finally {
      selectPiece(null);
    }
  };

  return (
    <div
      data-testid="chess-board"
      style={{
        display: 'grid',
        aspectRatio: '1 / 1',
        gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
        gridTemplateRows: `repeat(${boardSize}, 1fr)`,
      }}
    >
      {derivedBoard.map((row, rowIndex) =>
        row.map((piece, columnIndex) => {
          const gameY = boardSize - 1 - rowIndex;
          const gameX = columnIndex;
          const coordKey = asCoordinateKey(`${gameX},${gameY}`);
          const entityId = domain.occupancy[coordKey];
          const isSelected = Boolean(ui.selectedPieceId && entityId === ui.selectedPieceId);

          return (
            <BoardSquare
              key={`${columnIndex}-${rowIndex}`}
              piece={piece}
              boardDisplay={derivedBoard}
              squareInfo={{
                row: rowIndex,
                column: columnIndex,
                squareID: `${columnIndex}-${rowIndex}`,
                name: `${piece.name}${rowIndex}`,
              }}
              backgroundColor={getSquareBackground(rowIndex, columnIndex)}
              isSelected={isSelected}
              handleClick={handleSquareClick}
            />
          );
        })
      )}
    </div>
  );
};

export default ChessBoard;
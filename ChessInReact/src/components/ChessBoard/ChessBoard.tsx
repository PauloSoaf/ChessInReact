import { useState } from "react";
import BoardSquare from "../BoardSquare/BoardSquare";
import { IChessPiece, ISquareInfo } from "../../Interfaces/Interfaces";
import { chessPieces } from "../../App";

interface IChessBoard {
  boardDisplay: IChessPiece[][];
  setBoardDisplay: (newboardDisplay: Array<IChessPiece>[]) => void;

}

const ChessBoard: React.FC<IChessBoard> = ({boardDisplay, setBoardDisplay}) => {



  const chessBoard = boardDisplay.map((row, rowIndex) => {
    return row.map((column, columnIndex) => {
      return (
        {
          key: `${columnIndex}-${rowIndex}`,
          squareID: `${columnIndex}-${rowIndex}`,
          name: `${column}${rowIndex}`,
          x: columnIndex,
          y: rowIndex,
          piece: column,
        }
      );
    });
  });



  const defaultLightSquare = {
    backgroundColor: 'black',
  }
  const defaultDarkSquare = {
    backgroundColor: '#300030',
  }

  const defaltBackground = (row: number, column: number) => {
    if ((row + column) % 2 === 0) {
      return defaultDarkSquare.backgroundColor;
    } else {
      return defaultLightSquare.backgroundColor;
    }
  }


  const [selectedPiece, setSelectedPiece] = useState<{ squareInfo: ISquareInfo, piece: IChessPiece }>(
    {
       squareInfo: {
        row: 0,
        column: 0,
        squareID: '',
        name: '',

  }, piece: {name: 'none'} });

  const handleClick = (squareInfo: ISquareInfo, piece: IChessPiece) => {
    if (selectedPiece.squareInfo.squareID === '' || selectedPiece.piece === chessPieces.none) {
      setSelectedPiece({ squareInfo, piece });
    } else {
      const [column, row] = [squareInfo.column, squareInfo.row];
      const [selectedColumn, selectedRow] = [selectedPiece.squareInfo.column, selectedPiece.squareInfo.row];
      const newBoardDisplay = [...boardDisplay];
      newBoardDisplay[selectedRow][selectedColumn] = chessPieces.none;
      newBoardDisplay[row][column] = selectedPiece.piece;
      setBoardDisplay(newBoardDisplay);
      setSelectedPiece(
        {
          squareInfo: {
           row: 0,
           column: 0,
           squareID: '',
           name: '',
   
     }, piece: {name: 'none'}}
      )
    }
  }
  

  return (
    <div style={{
      display: 'grid',
      aspectRatio: 1 / 1,
      gridTemplateColumns: `repeat(${boardDisplay.length}, 1fr)`,
      gridTemplateRows: `repeat(${boardDisplay.length}, 1fr)`,
    }}>
      {chessBoard.map((row, rowIndex) => row.map((column, columnIndex) =>
        <BoardSquare
          piece={column.piece}
          key={`${columnIndex}-${rowIndex}`}
          squareInfo={
            {
              row: rowIndex,
              column: columnIndex,
              squareID: `${columnIndex}-${rowIndex}`,
              name: column.name,
            }
          }
          boardDisplay={boardDisplay}
          backgroundColor={defaltBackground(rowIndex, columnIndex)}
          isSelected={selectedPiece.squareInfo.squareID === `${columnIndex}-${rowIndex}`}
          handleClick={handleClick}
        />))}
    
    </div>
  )

}
export default ChessBoard;
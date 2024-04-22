import { useState } from "react";
import BoardSquare from "../BoardSquare/BoardSquare";
import { IChessPiece, IChessPieces } from "../../Interfaces/Interfaces";

const ChessBoard = () => {
  const [columns, setColumns] = useState(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  const [rows, setRows] = useState(['1', '2', '3', '4', '5', '6', '7', '8']);


  const chessBoard = rows.reverse().map((row, rowIndex) => {
    return columns.map((column, columnIndex) => {
      return (
        {
          key: `${columnIndex}-${row}`,
          squareID: `${columnIndex}-${row}`,
          name: `${column}${row}`,
          x: columnIndex,
          y: rowIndex,
        }
      );
    });
  });
  console.log(chessBoard);


  const defaultLightSquare = {
    backgroundColor: 'darkpink',
  }
  const defaultDarkSquare = {
    backgroundColor: 'darkred',
  }

  const chessPieces: IChessPieces = {
    pawn: {
      symbol: '♟',
      name: 'pawn',
    },
    knight: {
      symbol: '♞',
      name: 'knight',
    },
    bishop: {
      symbol: '♝',
      name: 'bishop',
    },
    rook: {
      symbol: '♜',
      name: 'rook',
    },
    queen: {
      symbol: '♛',
      name: 'queen',
    },
    king: {
      symbol: '♚',
      name: 'king',
    },
    none: {
      symbol: '',
      name: 'none',
    },
  }

  const addColorToPieces = (pieces: IChessPieces , color: string) => {
    const coloredPieces: IChessPieces = {...pieces};
    for (const [key, value] of Object.entries(pieces)) {
      coloredPieces[key] = {...value, color: color };
    }
    return coloredPieces;
  }
  
  // Adicionando a propriedade color às peças brancas e pretas
  const blackChessPieces = addColorToPieces(chessPieces, 'black');
  const whiteChessPieces = addColorToPieces(chessPieces, 'white');
  const defaltBackground = (row: number, column: number) => {
    if ((row + column) % 2 === 0) {
      return defaultDarkSquare.backgroundColor;
    } else {
      return defaultLightSquare.backgroundColor;
    }
  }


  const [board, setBoard] = useState([
    ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
    ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
    ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
    ['none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'],
    ['pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn', 'pawn'],
    ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'],
  ]);

  const [selectedPiece, setSelectedPiece] = useState<{ squareID: string, piece: IChessPiece }>({ squareID: '', piece: '' });

  const handleClick = (squareID: string, piece: IChessPiece) => {
    if (selectedPiece.squareID === '' || selectedPiece.piece.name === 'none') {
      setSelectedPiece({ squareID, piece });
    } else {
      const [column, row] = squareID.split('-');
      const [selectedColumn, selectedRow] = selectedPiece.squareID.split('-');
      const newBoard = [...board];
      newBoard[selectedRow][selectedColumn] = 'none';
      newBoard[row][column] = selectedPiece.piece.name;
      setBoard(newBoard);
      setSelectedPiece({ squareID: '', piece: { name: '' } });
    }
  }

  const handlePieces = (row: number, column: number, name: string) => {
    return name.includes('1') || name.includes( '2') ? whiteChessPieces[board[row][column]] : blackChessPieces[board[row][column]];
  };

  return (
    <div style={{
      background: 'black',
      minHeight: '50vh',
      minWidth: '50vh',
      maxHeight: '50%',
      maxWidth: '50%',
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 1fr)',
      gridTemplateRows: 'repeat(8, 1fr)',
      border: '1px solid white',
    }}>
      {chessBoard.map((row, rowIndex) => row.map((column, columnIndex) =>
        <BoardSquare
          piece={handlePieces(rowIndex, columnIndex, column.name)}
          key={`${columnIndex}-${rowIndex}`}
          squareID={`${columnIndex}-${rowIndex}`}
          name={column.name}
          backgroundColor={defaltBackground(rowIndex, columnIndex)}
          isSelected={selectedPiece.squareID === `${columnIndex}-${rowIndex}`}
          handleClick={handleClick}
        />))}
    </div>
  )

}
export default ChessBoard;
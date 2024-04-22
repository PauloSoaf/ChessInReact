import { useState } from "react";
import ChessBoard from "./components/ChessBoard/ChessBoard"
import { IChessPiece, IChessPieces } from "./Interfaces/Interfaces";
import { Input } from "antd";
export const chessPieces: IChessPieces = {
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
    color: 'transparent'
  },
};

const App = () => {
  const [boardSize, setBoardSize] = useState(8)

  const addColorToPieces = (pieces: IChessPieces, color: string) => {
    const coloredPieces: IChessPieces = { ...pieces };
    for (const [key, value] of Object.entries(pieces)) {
      coloredPieces[key] = { ...value, color: color };
    }
    return coloredPieces;
  }

  // Adicionando a propriedade color às peças brancas e pretas
  const whiteChessPieces = addColorToPieces(chessPieces, 'white');
  const blackChessPieces = addColorToPieces(chessPieces, '#ed2fed');

  const defaltChessDisplay = [
    [blackChessPieces.rook, blackChessPieces.knight, blackChessPieces.bishop, blackChessPieces.queen, blackChessPieces.king, blackChessPieces.bishop, blackChessPieces.knight, blackChessPieces.rook],
    [blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn, blackChessPieces.pawn],
    [chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none],
    [chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none],
    [chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none],
    [chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none, chessPieces.none],
    [whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn, whiteChessPieces.pawn],
    [whiteChessPieces.rook, whiteChessPieces.knight, whiteChessPieces.bishop, whiteChessPieces.queen, whiteChessPieces.king, whiteChessPieces.bishop, whiteChessPieces.knight, whiteChessPieces.rook],
  ];
  const [boardDisplay, setBoardDisplay] = useState(defaltChessDisplay);

  const fillBoard = () => {
    setBoardDisplay(defaltChessDisplay);
  }
  const updateBoardDisplay = (newBoardDisplay: Array<IChessPiece>[]) => {
    setBoardDisplay(newBoardDisplay);
  };
  console.log(boardDisplay)
  return (
    <div style={{
      minHeight: '100vh',
      alignItems: 'center',
      display: 'flex',
      justifyContent: 'center',
      backgroundColor: '#212121',
      color: 'white',
      flexDirection: 'column',
      gap: '2rem',
    }}>

      <Input
        type="number"
        value={boardSize}
        onChange={(event) => {
          const newSize = Number(event.target.value);
          setBoardSize(newSize);
          setBoardDisplay(prev => {
              const newBoardDisplay: Array<Array<IChessPiece>> = Array.from({ length: newSize }, (_, rowIndex) =>
                  Array.from({ length: newSize }, (_, columnIndex) => {
                      if (rowIndex < prev.length && columnIndex < prev[rowIndex].length) {
                          return prev[rowIndex][columnIndex];
                      } else {
                          return chessPieces.none;
                      }
                  })
              );
              return newBoardDisplay;
          });
      }}
      style={{
        width: '3rem',
        height: '2rem',
        color: 'white',
        backgroundColor: 'black',
        border: 'none',
      }}
         />
      <ChessBoard
        boardDisplay={boardDisplay}
        setBoardDisplay={updateBoardDisplay}
      />
      <button style={{
        width: '15%',
        height: '4rem',
        fontSize: '2rem'
      }}
        onClick={fillBoard}
      > reset Board</button>
    </div>
  )
}

export default App

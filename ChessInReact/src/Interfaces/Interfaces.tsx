export interface IBoardSquare {
  piece: IChessPiece;
  backgroundColor?: string;
  handleClick: (squareID: ISquareInfo, piece: IChessPiece) => void;
  name?: string;
  key: string;
  isSelected?: boolean;
  squareInfo: ISquareInfo;
  boardDisplay: IChessPiece[][];
}

export interface IChessPiece {
  symbol?: string;
  color?: string;
  name: string;
}

export interface IChessPieces {
  [key: string]: IChessPiece;
}

export interface ISquareInfo{
  row: number;
  column: number;
  squareID: string;
  name?: string;
}
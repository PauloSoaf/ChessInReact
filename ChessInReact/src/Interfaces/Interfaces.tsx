export interface IBoardSquare {
  piece: IChessPiece;
  backgroundColor?: string;
  handleClick: (squareID: string, piece: IChessPiece) => void;
  name?: string;
  key: string;
  isSelected?: boolean;
  squareID: string;
}

export interface IChessPiece {
  symbol?: string;
  color?: string;
  name: string;
}
export interface IChessPieces {
  pawn: IChessPiece;
  knight: IChessPiece;
  bishop: IChessPiece;
  rook: IChessPiece;
  queen: IChessPiece;
  king: IChessPiece;
  none: IChessPiece;
}


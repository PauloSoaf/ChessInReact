export interface IBoardSquare {
  piece: IChessPiece;
  backgroundColor?: string;
  handleClick: (squareID: ISquareInfo, piece: IChessPiece) => void;
  name?: string;
  key?: string;
  testId?: string;
  isSelected?: boolean;
  squareInfo: ISquareInfo;
  boardDisplay: IChessPiece[][];
  isMoveDestination?: boolean;
  isCaptureDestination?: boolean;
  rankLabel?: string;
  fileLabel?: string;
  tabIndex?: number;
  onFocusSquare?: (col: number, row: number) => void;
}

export interface IChessPiece {
  symbol?: string;
  color?: string;
  name: string;
}

export interface IChessPieces {
  [key: string]: IChessPiece;
}

export interface ISquareInfo {
  row: number;
  column: number;
  squareID: string;
  name?: string;
  gameX?: number;
  gameY?: number;
}
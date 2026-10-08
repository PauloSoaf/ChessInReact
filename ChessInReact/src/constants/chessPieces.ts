import { IChessPieces } from '../Interfaces/Interfaces';

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
    color: 'transparent',
  },
};

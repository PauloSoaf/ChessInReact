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
  // Shogi pieces (Japanese Chess - kanji)
  lance: {
    symbol: '香',
    name: 'lance',
  },
  silver: {
    symbol: '銀',
    name: 'silver',
  },
  gold: {
    symbol: '金',
    name: 'gold',
  },
  gyoku: {
    symbol: '玉',
    name: 'gyoku',
  },
  tokin: {
    symbol: 'と',
    name: 'tokin',
  },
  shogi_pawn: {
    symbol: '歩',
    name: 'shogi_pawn',
  },
  // Xiangqi pieces (Chinese Chess - hanzi)
  cannon: {
    symbol: '砲',
    name: 'cannon',
  },
  advisor: {
    symbol: '仕',
    name: 'advisor',
  },
  elephant: {
    symbol: '相',
    name: 'elephant',
  },
  chariot: {
    symbol: '車',
    name: 'chariot',
  },
  horse: {
    symbol: '馬',
    name: 'horse',
  },
  soldier: {
    symbol: '兵',
    name: 'soldier',
  },
  general: {
    symbol: '帥',
    name: 'general',
  },
  jiang: {
    symbol: '將',
    name: 'jiang',
  },
  shuai: {
    symbol: '帥',
    name: 'shuai',
  },
  // Fairy pieces
  chancellor: {
    symbol: '🨩',
    name: 'chancellor',
  },
  archbishop: {
    symbol: '🨨',
    name: 'archbishop',
  },
  amazon: {
    symbol: '🨦',
    name: 'amazon',
  },
  hawk: {
    symbol: '🦅',
    name: 'hawk',
  },
  duck: {
    symbol: '🦆',
    name: 'duck',
  },
  none: {
    symbol: '',
    name: 'none',
    color: 'transparent',
  },
};


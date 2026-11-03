import {
  IBoardThemeDefinition,
  IPieceSetDefinition,
  IUIThemeDefinition,
  UIThemeId,
  BoardThemeId,
  PieceSetId,
} from './types';

export const UI_THEMES: Record<UIThemeId, IUIThemeDefinition> = {
  midnight: {
    id: 'midnight',
    name: 'Midnight Slate',
    description: 'Modo escuro profissional com superfícies de obsidiana e acentos ciano elétrico.',
    category: 'DARK',
    previewColors: ['#0a0b0e', '#161a23', '#38bdf8'],
  },
  ivory: {
    id: 'ivory',
    name: 'Warm Ivory',
    description: 'Interface clara minimalista com superfícies alabastro e acentos quentes.',
    category: 'LIGHT',
    previewColors: ['#f8fafc', '#ffffff', '#f59e0b'],
  },
  synthwave: {
    id: 'synthwave',
    name: 'Neon Synthwave',
    description: 'Estética cyberpunk vibrante com brilhos magenta e ciano sobre fundo ultra-escuro.',
    category: 'SPECIAL',
    previewColors: ['#090414', '#170b2c', '#f43f5e'],
  },
};

export const BOARD_THEMES: Record<BoardThemeId, IBoardThemeDefinition> = {
  'slate-emerald': {
    id: 'slate-emerald',
    name: 'Tournament Emerald',
    description: 'Padrão moderno de torneio internacional em ardósia clara e esmeralda profundo.',
    lightSquare: '#e2e8f0',
    darkSquare: '#0f766e',
    selectedSquare: 'rgba(56, 189, 248, 0.45)',
    legalMoveDot: 'rgba(15, 118, 110, 0.65)',
    captureSquare: 'rgba(239, 68, 68, 0.55)',
    lastMoveHighlight: 'rgba(250, 204, 21, 0.35)',
    previewColors: ['#e2e8f0', '#0f766e'],
  },
  'classic-wood': {
    id: 'classic-wood',
    name: 'Grandmaster Wood',
    description: 'Madeiras nobres clássicas de bétula clara e nogueira escura.',
    lightSquare: '#f0d9b5',
    darkSquare: '#b58863',
    selectedSquare: 'rgba(245, 158, 11, 0.5)',
    legalMoveDot: 'rgba(181, 136, 99, 0.7)',
    captureSquare: 'rgba(220, 38, 38, 0.6)',
    lastMoveHighlight: 'rgba(217, 119, 6, 0.4)',
    previewColors: ['#f0d9b5', '#b58863'],
  },
  'carbon-cyber': {
    id: 'carbon-cyber',
    name: 'Carbon Cyber',
    description: 'Visual futurista em fibra de carbono, ardósia espacial e bordas ciano.',
    lightSquare: '#1e293b',
    darkSquare: '#090d16',
    selectedSquare: 'rgba(6, 182, 212, 0.55)',
    legalMoveDot: 'rgba(56, 189, 248, 0.65)',
    captureSquare: 'rgba(244, 63, 94, 0.65)',
    lastMoveHighlight: 'rgba(129, 140, 248, 0.4)',
    previewColors: ['#1e293b', '#090d16'],
  },
};

export const PIECE_SETS: Record<PieceSetId, IPieceSetDefinition> = {
  'neo-classic': {
    id: 'neo-classic',
    name: 'Neo Classic Unicode',
    description: 'Tipografia de xadrez em alta definição com acabamento refinado e sombras suaves.',
    type: 'UNICODE',
  },
  'tournament-vector': {
    id: 'tournament-vector',
    name: 'Tournament Vector',
    description: 'Conjunto vetorial SVG profissional com contornos geométricos perfeitos.',
    type: 'SVG_VECTOR',
  },
  'pixel-art': {
    id: 'pixel-art',
    name: '8-Bit Retro Arcade',
    description: 'Glifos pixelizados nostálgicos com visual arcade clássico.',
    type: 'PIXEL',
  },
};

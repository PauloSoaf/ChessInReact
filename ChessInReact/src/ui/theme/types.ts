/**
 * Spec 06 UI/UX & Design System Theme Contracts
 */

export type UIThemeId = 'midnight' | 'ivory' | 'synthwave';
export type BoardThemeId = 'slate-emerald' | 'classic-wood' | 'carbon-cyber';
export type PieceSetId = 'neo-classic' | 'tournament-vector' | 'pixel-art';
export type BoardViewMode = '2D' | '3D';

export interface IUIThemeDefinition {
  id: UIThemeId;
  name: string;
  description: string;
  category: 'DARK' | 'LIGHT' | 'SPECIAL';
  previewColors: [string, string, string]; // 3 representative hex colors for preview
}

export interface IBoardThemeDefinition {
  id: BoardThemeId;
  name: string;
  description: string;
  lightSquare: string;
  darkSquare: string;
  selectedSquare: string;
  legalMoveDot: string;
  captureSquare: string;
  lastMoveHighlight: string;
  previewColors: [string, string];
}

export interface IPieceSetDefinition {
  id: PieceSetId;
  name: string;
  description: string;
  type: 'UNICODE' | 'SVG_VECTOR' | 'PIXEL';
}

export interface IUserThemePreferences {
  uiTheme: UIThemeId;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  boardViewMode: BoardViewMode;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  soundEnabled: boolean;
  flipBoard: boolean;
}

export const DEFAULT_THEME_PREFERENCES: IUserThemePreferences = {
  uiTheme: 'midnight',
  boardTheme: 'slate-emerald',
  pieceSet: 'neo-classic',
  boardViewMode: '2D',
  showLegalMoves: true,
  showCoordinates: true,
  soundEnabled: true,
  flipBoard: false,
};

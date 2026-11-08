import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  BoardThemeId,
  BoardViewMode,
  DEFAULT_THEME_PREFERENCES,
  IBoardThemeDefinition,
  IUIThemeDefinition,
  IUserThemePreferences,
  PieceSetId,
  UIThemeId,
} from './types';
import { BOARD_THEMES, UI_THEMES } from './themeRegistry';

interface IThemeContextValue {
  preferences: IUserThemePreferences;
  uiTheme: UIThemeId;
  boardTheme: BoardThemeId;
  pieceSet: PieceSetId;
  boardViewMode: BoardViewMode;
  activeUIColors: IUIThemeDefinition;
  activeBoardColors: IBoardThemeDefinition;
  setUITheme: (id: UIThemeId) => void;
  setBoardTheme: (id: BoardThemeId) => void;
  setPieceSet: (id: PieceSetId) => void;
  setBoardViewMode: (mode: BoardViewMode) => void;
  updatePreferences: (partial: Partial<IUserThemePreferences>) => void;
}

const STORAGE_KEY = 'chess_in_react_theme_preferences';

const ThemeContext = createContext<IThemeContextValue | null>(null);

function loadStoredPreferences(): IUserThemePreferences {
  if (typeof window === 'undefined') return DEFAULT_THEME_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<IUserThemePreferences>;
    return {
      ...DEFAULT_THEME_PREFERENCES,
      ...parsed,
    };
  } catch {
    return DEFAULT_THEME_PREFERENCES;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<IUserThemePreferences>(loadStoredPreferences);

  // Sync HTML root element class when UI theme changes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.classList.remove('theme-midnight', 'theme-ivory', 'theme-synthwave');
    root.classList.add(`theme-${preferences.uiTheme}`);
  }, [preferences.uiTheme]);

  // Persist preferences to LocalStorage
  const updatePreferences = useCallback((partial: Partial<IUserThemePreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage quota errors
      }
      return next;
    });
  }, []);

  const setUITheme = useCallback((id: UIThemeId) => {
    updatePreferences({ uiTheme: id });
  }, [updatePreferences]);

  const setBoardTheme = useCallback((id: BoardThemeId) => {
    updatePreferences({ boardTheme: id });
  }, [updatePreferences]);

  const setPieceSet = useCallback((id: PieceSetId) => {
    updatePreferences({ pieceSet: id });
  }, [updatePreferences]);

  const setBoardViewMode = useCallback((mode: BoardViewMode) => {
    updatePreferences({ boardViewMode: mode });
  }, [updatePreferences]);

  const activeUIColors = useMemo(
    () => UI_THEMES[preferences.uiTheme] ?? UI_THEMES.midnight,
    [preferences.uiTheme]
  );

  const activeBoardColors = useMemo(
    () => BOARD_THEMES[preferences.boardTheme] ?? BOARD_THEMES['slate-emerald'],
    [preferences.boardTheme]
  );

  const value = useMemo(
    () => ({
      preferences,
      uiTheme: preferences.uiTheme,
      boardTheme: preferences.boardTheme,
      pieceSet: preferences.pieceSet,
      boardViewMode: preferences.boardViewMode ?? '2D',
      activeUIColors,
      activeBoardColors,
      setUITheme,
      setBoardTheme,
      setPieceSet,
      setBoardViewMode,
      updatePreferences,
    }),
    [
      preferences,
      activeUIColors,
      activeBoardColors,
      setUITheme,
      setBoardTheme,
      setPieceSet,
      setBoardViewMode,
      updatePreferences,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): IThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Graceful fallback for isolated tests that render components without Provider
    return {
      preferences: DEFAULT_THEME_PREFERENCES,
      uiTheme: DEFAULT_THEME_PREFERENCES.uiTheme,
      boardTheme: DEFAULT_THEME_PREFERENCES.boardTheme,
      pieceSet: DEFAULT_THEME_PREFERENCES.pieceSet,
      boardViewMode: DEFAULT_THEME_PREFERENCES.boardViewMode,
      activeUIColors: UI_THEMES.midnight,
      activeBoardColors: BOARD_THEMES['slate-emerald'],
      setUITheme: () => {},
      setBoardTheme: () => {},
      setPieceSet: () => {},
      setBoardViewMode: () => {},
      updatePreferences: () => {},
    };
  }
  return ctx;
}

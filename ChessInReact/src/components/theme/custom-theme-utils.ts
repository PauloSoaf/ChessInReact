"use client";

import { useEffect, useState } from "react";

export type CuratedThemeId =
  | "blue-beige"
  | "nutriopus-light"
  | "clinical-soft"
  | "dark-blue-premium"
  | "minimal-beige"
  | "midnight-purple"
  | "metallic-black"
  | "soft-rose"
  | "elegant-lilac";

type LegacyThemeId =
  | "warm-beige"
  | "clinical-white"
  | "soft-blue"
  | "soft-leaf"
  | "premium-dark";

export type CustomThemeConfig = {
  primary: string;
  accent: string;
  secondary: string;
  navbarBackground: string;
  sidebarBackground: string;
  sidebarAccent: string;
  backgroundPreset: CuratedThemeId | LegacyThemeId;
};

export type CuratedThemePreset = {
  id: CuratedThemeId;
  labelKey: string;
  descriptionKey: string;
  colors: [string, string, string];
  isDark: boolean;
  config: CustomThemeConfig;
};

const STORAGE_KEY = "nutriopus-custom-theme";

export const defaultCustomTheme: CustomThemeConfig = {
  primary: "#08284D",
  accent: "#D2AB85",
  secondary: "#F4E8DB",
  navbarBackground: "#FBF8F4",
  sidebarBackground: "#F7EFE6",
  sidebarAccent: "#08284D",
  backgroundPreset: "blue-beige",
};

export const CURATED_THEME_PRESETS: CuratedThemePreset[] = [
  {
    id: "blue-beige",
    labelKey: "theme.presets.blue_beige",
    descriptionKey: "theme.palette_descriptions.blue_beige",
    colors: ["#FBF8F4", "#D2AB85", "#08284D"],
    isDark: false,
    config: defaultCustomTheme,
  },
  {
    id: "nutriopus-light",
    labelKey: "theme.presets.nutriopus_light",
    descriptionKey: "theme.palette_descriptions.nutriopus_light",
    colors: ["#FFFFFF", "#E7EEF6", "#08284D"],
    isDark: false,
    config: {
      primary: "#08284D",
      accent: "#D2AB85",
      secondary: "#E7EEF6",
      navbarBackground: "#FFFFFF",
      sidebarBackground: "#F7EFE6",
      sidebarAccent: "#08284D",
      backgroundPreset: "nutriopus-light",
    },
  },
  {
    id: "clinical-soft",
    labelKey: "theme.presets.clinical_soft",
    descriptionKey: "theme.palette_descriptions.clinical_soft",
    colors: ["#F3F7FB", "#D2AB85", "#164875"],
    isDark: false,
    config: {
      primary: "#164875",
      accent: "#D2AB85",
      secondary: "#E7EEF6",
      navbarBackground: "#F3F7FB",
      sidebarBackground: "#F3F7FB",
      sidebarAccent: "#164875",
      backgroundPreset: "clinical-soft",
    },
  },
  {
    id: "minimal-beige",
    labelKey: "theme.presets.minimal_beige",
    descriptionKey: "theme.palette_descriptions.minimal_beige",
    colors: ["#FBF6F0", "#D2AB85", "#08284D"],
    isDark: false,
    config: {
      primary: "#08284D",
      accent: "#D2AB85",
      secondary: "#F4E8DB",
      navbarBackground: "#FBF6F0",
      sidebarBackground: "#F4E8DB",
      sidebarAccent: "#08284D",
      backgroundPreset: "minimal-beige",
    },
  },
  {
    id: "soft-rose",
    labelKey: "theme.presets.soft_rose",
    descriptionKey: "theme.palette_descriptions.soft_rose",
    colors: ["#FCF8FA", "#D8A0B3", "#7A3E55"],
    isDark: false,
    config: {
      primary: "#7A3E55",
      accent: "#D8A0B3",
      secondary: "#F7E8EE",
      navbarBackground: "#FFF8FA",
      sidebarBackground: "#FBEFF3",
      sidebarAccent: "#7A3E55",
      backgroundPreset: "soft-rose",
    },
  },
  {
    id: "elegant-lilac",
    labelKey: "theme.presets.elegant_lilac",
    descriptionKey: "theme.palette_descriptions.elegant_lilac",
    colors: ["#FAF8FC", "#B9A3D1", "#594174"],
    isDark: false,
    config: {
      primary: "#594174",
      accent: "#B9A3D1",
      secondary: "#EEE8F5",
      navbarBackground: "#FCFAFE",
      sidebarBackground: "#F3EEF8",
      sidebarAccent: "#594174",
      backgroundPreset: "elegant-lilac",
    },
  },
  {
    id: "dark-blue-premium",
    labelKey: "theme.presets.dark_blue_premium",
    descriptionKey: "theme.palette_descriptions.dark_blue_premium",
    colors: ["#061525", "#0B1F38", "#D2AB85"],
    isDark: true,
    config: {
      primary: "#D2AB85",
      accent: "#EAD5C0",
      secondary: "#132C4A",
      navbarBackground: "#061525",
      sidebarBackground: "#0B1F38",
      sidebarAccent: "#D2AB85",
      backgroundPreset: "dark-blue-premium",
    },
  },
  {
    id: "midnight-purple",
    labelKey: "theme.presets.midnight_purple",
    descriptionKey: "theme.palette_descriptions.midnight_purple",
    colors: ["#120F1B", "#2A2040", "#C4B5FD"],
    isDark: true,
    config: {
      primary: "#C4B5FD",
      accent: "#E9D5FF",
      secondary: "#2A2040",
      navbarBackground: "#171225",
      sidebarBackground: "#211832",
      sidebarAccent: "#C4B5FD",
      backgroundPreset: "midnight-purple",
    },
  },
  {
    id: "metallic-black",
    labelKey: "theme.presets.metallic_black",
    descriptionKey: "theme.palette_descriptions.metallic_black",
    colors: ["#0E1012", "#25282D", "#D5DAE3"],
    isDark: true,
    config: {
      primary: "#D5DAE3",
      accent: "#AEB6C3",
      secondary: "#25282D",
      navbarBackground: "#121417",
      sidebarBackground: "#1B1E22",
      sidebarAccent: "#D5DAE3",
      backgroundPreset: "metallic-black",
    },
  },
];

export const CURATED_THEME_SURFACES: Record<
  CuratedThemeId,
  { background: string; card: string; text: string; muted: string; border: string }
> = {
  "blue-beige": { background: "#FBF8F4", card: "#FFFFFF", text: "#102033", muted: "#607084", border: "#E6D9CC" },
  "nutriopus-light": { background: "#FFFFFF", card: "#FFFFFF", text: "#102033", muted: "#607084", border: "#E6D9CC" },
  "clinical-soft": { background: "#F3F7FB", card: "#FFFFFF", text: "#102033", muted: "#607084", border: "#DDE7F1" },
  "minimal-beige": { background: "#FBF6F0", card: "#FFFFFF", text: "#102033", muted: "#607084", border: "#E6D9CC" },
  "soft-rose": { background: "#FCF8FA", card: "#FFFFFF", text: "#291A20", muted: "#6F5962", border: "#E8D9DF" },
  "elegant-lilac": { background: "#FAF8FC", card: "#FFFFFF", text: "#211A29", muted: "#655B70", border: "#DED5E7" },
  "dark-blue-premium": { background: "#061525", card: "#0B1F38", text: "#F1F5F9", muted: "#A8B6C8", border: "#3F4B5A" },
  "midnight-purple": { background: "#120F1B", card: "#1D1729", text: "#F7F4FF", muted: "#C8BED8", border: "#45375C" },
  "metallic-black": { background: "#0E1012", card: "#191C20", text: "#F5F7FA", muted: "#B7BEC8", border: "#3C424A" },
};

const LEGACY_PRESET_MAP: Record<LegacyThemeId, CuratedThemeId> = {
  "warm-beige": "blue-beige",
  "clinical-white": "nutriopus-light",
  "soft-blue": "clinical-soft",
  "soft-leaf": "minimal-beige",
  "premium-dark": "dark-blue-premium",
};

function getCuratedPreset(id: CustomThemeConfig["backgroundPreset"] | undefined) {
  const normalizedId = id && id in LEGACY_PRESET_MAP
    ? LEGACY_PRESET_MAP[id as LegacyThemeId]
    : id;

  return CURATED_THEME_PRESETS.find((preset) => preset.id === normalizedId)
    ?? CURATED_THEME_PRESETS[0];
}

function normalizeCustomTheme(theme?: Partial<CustomThemeConfig> | null): CustomThemeConfig {
  return { ...getCuratedPreset(theme?.backgroundPreset).config };
}

export function getStoredCustomTheme(): CustomThemeConfig {
  if (typeof window === "undefined") return defaultCustomTheme;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeCustomTheme(JSON.parse(stored)) : defaultCustomTheme;
  } catch {
    return defaultCustomTheme;
  }
}

export function saveCustomTheme(theme: CustomThemeConfig, force = false) {
  if (typeof window === "undefined") return;

  const normalizedTheme = normalizeCustomTheme(theme);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedTheme));
  applyCustomThemeStyles(normalizedTheme, force);
}

const FAVORITES_STORAGE_KEY = "nutriopus-theme-favorites";

export function getStoredFavoriteThemes(): CuratedThemeId[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is CuratedThemeId => CURATED_THEME_PRESETS.some((preset) => preset.id === id));
  } catch {
    return [];
  }
}

function saveFavoriteThemes(ids: CuratedThemeId[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(ids));
}

/** Most-recently-favorited id first, so it lands at the top of the pinned list. */
export function useFavoriteThemes() {
  const [favorites, setFavorites] = useState<CuratedThemeId[]>(() => getStoredFavoriteThemes());

  const toggleFavorite = (id: CuratedThemeId) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((favoriteId) => favoriteId !== id) : [id, ...prev];
      saveFavoriteThemes(next);
      return next;
    });
  };

  return { favorites, toggleFavorite };
}

export function getContrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const normalized = hex.replace("#", "");
    const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4
    ));

    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };

  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
    / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

export function getReadableTextColor(background: string, light = "#FFFFFF", dark = "#102033") {
  return getContrastRatio(light, background) >= getContrastRatio(dark, background) ? light : dark;
}

function getBackgroundVars(preset: CuratedThemeId) {
  switch (preset) {
    case "nutriopus-light":
      return `
        --background: #FFFFFF;
        --foreground: #102033;
        --warm-surface: #F3F7FB;
        --warm-beige: #F4E8DB;
        --surface-soft-blue: #F3F7FB;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #102033;
        --popover: #FFFFFF;
        --popover-foreground: #102033;
        --text-primary: #102033;
        --text-secondary: #607084;
        --text-tertiary: #7B8794;
        --border-neutral: #E6D9CC;
        --border: #E6D9CC;
        --input: #E6D9CC;
      `;
    case "clinical-soft":
      return `
        --background: #F3F7FB;
        --foreground: #102033;
        --warm-surface: #FFFFFF;
        --warm-beige: #F4E8DB;
        --surface-soft-blue: #E7EEF6;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #102033;
        --popover: #FFFFFF;
        --popover-foreground: #102033;
        --text-primary: #102033;
        --text-secondary: #607084;
        --text-tertiary: #7B8794;
        --border-neutral: #DDE7F1;
        --border: #DDE7F1;
        --input: #DDE7F1;
      `;
    case "minimal-beige":
      return `
        --background: #FBF6F0;
        --foreground: #102033;
        --warm-surface: #F7EFE6;
        --warm-beige: #F4E8DB;
        --surface-soft-blue: #F3F7FB;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #102033;
        --popover: #FFFFFF;
        --popover-foreground: #102033;
        --text-primary: #102033;
        --text-secondary: #607084;
        --text-tertiary: #7B8794;
        --border-neutral: #E6D9CC;
        --border: #E6D9CC;
        --input: #E6D9CC;
      `;
    case "soft-rose":
      return `
        --background: #FCF8FA;
        --foreground: #291A20;
        --warm-surface: #FFF8FA;
        --warm-beige: #F7E8EE;
        --surface-soft-blue: #FBEFF3;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #291A20;
        --popover: #FFFFFF;
        --popover-foreground: #291A20;
        --text-primary: #291A20;
        --text-secondary: #6F5962;
        --text-tertiary: #88727B;
        --border-neutral: #E8D9DF;
        --border: #E8D9DF;
        --input: #E0CDD5;
      `;
    case "elegant-lilac":
      return `
        --background: #FAF8FC;
        --foreground: #211A29;
        --warm-surface: #FCFAFE;
        --warm-beige: #EEE8F5;
        --surface-soft-blue: #F3EEF8;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #211A29;
        --popover: #FFFFFF;
        --popover-foreground: #211A29;
        --text-primary: #211A29;
        --text-secondary: #655B70;
        --text-tertiary: #7D7189;
        --border-neutral: #DED5E7;
        --border: #DED5E7;
        --input: #D5C9E0;
      `;
    case "midnight-purple":
      return `
        --background: #120F1B;
        --foreground: #F7F4FF;
        --warm-surface: #211832;
        --warm-beige: #2A2040;
        --surface-soft-blue: #251C38;
        --card-bg: #1D1729;
        --card: #1D1729;
        --card-foreground: #F7F4FF;
        --popover: #211832;
        --popover-foreground: #F7F4FF;
        --text-primary: #F7F4FF;
        --text-secondary: #C8BED8;
        --text-tertiary: #988DA8;
        --border-neutral: #45375C;
        --border: #45375C;
        --input: #514267;
      `;
    case "metallic-black":
      return `
        --background: #0E1012;
        --foreground: #F5F7FA;
        --warm-surface: #1B1E22;
        --warm-beige: #25282D;
        --surface-soft-blue: #20242A;
        --card-bg: #191C20;
        --card: #191C20;
        --card-foreground: #F5F7FA;
        --popover: #1B1E22;
        --popover-foreground: #F5F7FA;
        --text-primary: #F5F7FA;
        --text-secondary: #B7BEC8;
        --text-tertiary: #8E96A2;
        --border-neutral: #3C424A;
        --border: #3C424A;
        --input: #484F59;
      `;
    case "dark-blue-premium":
      return `
        --background: #061525;
        --foreground: #F8FAFC;
        --warm-surface: #0B1F38;
        --warm-beige: #132C4A;
        --surface-soft-blue: #0E2744;
        --card-bg: #0B1F38;
        --card: #0B1F38;
        --card-foreground: #F8FAFC;
        --popover: #0B1F38;
        --popover-foreground: #F8FAFC;
        --text-primary: #F1F5F9;
        --text-secondary: #A8B6C8;
        --text-tertiary: #7F91A6;
        --border-neutral: #3F4B5A;
        --border: #3F4B5A;
        --input: #536071;
      `;
    case "blue-beige":
    default:
      return `
        --background: #FBF8F4;
        --foreground: #102033;
        --warm-surface: #F7EFE6;
        --warm-beige: #F4E8DB;
        --surface-soft-blue: #F3F7FB;
        --card-bg: #FFFFFF;
        --card: #FFFFFF;
        --card-foreground: #102033;
        --popover: #FFFFFF;
        --popover-foreground: #102033;
        --text-primary: #102033;
        --text-secondary: #607084;
        --text-tertiary: #7B8794;
        --border-neutral: #E6D9CC;
        --border: #E6D9CC;
        --input: #E6D9CC;
      `;
  }
}

/**
 * Synthetic marker class for dark curated presets — kept separate from next-themes' own
 * "dark" class name (see the `@custom-variant dark` comment in globals.css) so next-themes'
 * class-list bookkeeping can never strip it out from under us.
 */
export const CUSTOM_DARK_CLASS = "theme-custom-dark";

export function applyCustomThemeStyles(theme: CustomThemeConfig, force = false) {
  if (typeof document === "undefined") return;

  const styleId = "nutriopus-custom-theme-vars";
  let styleElement = document.getElementById(styleId);

  if (force) {
    document.documentElement.setAttribute("data-theme", "theme-custom");
    document.documentElement.classList.add("theme-custom");
  }

  if (
    !force &&
    document.documentElement.getAttribute("data-theme") !== "theme-custom"
    && !document.documentElement.classList.contains("theme-custom")
  ) {
    styleElement?.remove();
    document.documentElement.classList.remove(CUSTOM_DARK_CLASS);
    return;
  }

  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = styleId;
    document.head.appendChild(styleElement);
  }

  const normalizedTheme = normalizeCustomTheme(theme);
  const preset = getCuratedPreset(normalizedTheme.backgroundPreset);
  // next-themes only adds the "theme-custom" class for curated presets, never "dark" —
  // toggle this separate marker so components relying on Tailwind's `dark:` variant still read correctly.
  document.documentElement.classList.toggle(CUSTOM_DARK_CLASS, preset.isDark);
  const { config } = preset;
  const primaryForeground = getReadableTextColor(config.primary);
  const accentForeground = getReadableTextColor(config.accent);
  const secondaryForeground = getReadableTextColor(config.secondary);
  const navbarForeground = getReadableTextColor(config.navbarBackground, "#F8FAFC", "#102033");
  const sidebarForeground = getReadableTextColor(config.sidebarBackground, "#F8FAFC", "#102033");
  const sidebarActiveForeground = getReadableTextColor(config.sidebarAccent);

  styleElement.innerHTML = `
    :root, .theme-custom, [data-theme="theme-custom"] {
      ${getBackgroundVars(preset.id)}
      --brand-navy: ${config.primary};
      --brand-navy-hover: ${config.primary};
      --brand-navy-soft: ${config.secondary};
      --brand-beige: ${config.accent};
      --brand-beige-hover: ${config.accent};
      --brand-beige-soft: ${config.secondary};
      --brand-blue: ${config.primary};
      --brand-blue-hover: ${config.primary};
      --brand-blue-soft: ${config.secondary};
      --primary: ${config.primary};
      --primary-foreground: ${primaryForeground};
      --primary-hover: ${config.primary};
      --primary-subtle: ${config.secondary};
      --secondary: ${config.secondary};
      --secondary-foreground: ${secondaryForeground};
      --accent: ${config.accent};
      --accent-foreground: ${accentForeground};
      --accent-hover: ${config.accent};
      --accent-subtle: ${config.secondary};
      --muted: ${config.secondary};
      --muted-foreground: var(--text-secondary);
      --ring: ${config.primary};
      --navbar-background: ${config.navbarBackground};
      --navbar-foreground: ${navbarForeground};
      --navbar-border: var(--border-neutral);
      --navbar-accent: ${config.accent};
      --sidebar-background: ${config.sidebarBackground};
      --sidebar-foreground: ${sidebarForeground};
      --sidebar-accent: ${config.sidebarAccent};
      --sidebar-accent-foreground: ${sidebarActiveForeground};
      --sidebar-hover: ${config.secondary};
      --sidebar-hover-foreground: var(--text-primary);
      --sidebar-border: var(--border-neutral);
      --tooltip-bg: var(--card-bg);
      --tooltip-foreground: var(--text-primary);
      --tooltip-border: var(--border-neutral);
      --clinical-info: ${preset.isDark ? "rgba(196, 181, 253, 0.14)" : "#E7EEF6"};
      --clinical-info-foreground: ${preset.isDark ? "#DDD6FE" : "#08284D"};
      --clinical-warning: ${preset.isDark ? "rgba(251, 191, 36, 0.16)" : "#FFF4DE"};
      --clinical-warning-foreground: ${preset.isDark ? "#FDE68A" : "#8A5A18"};
      --clinical-success: ${preset.isDark ? "rgba(16, 185, 129, 0.16)" : "#E8F5EC"};
      --clinical-success-foreground: ${preset.isDark ? "#6EE7B7" : "#1F6B3A"};
    }
  `;
}

export function useCustomThemeSync(currentThemeName?: string) {
  useEffect(() => {
    if (currentThemeName === "theme-custom") {
      applyCustomThemeStyles(getStoredCustomTheme());
      return;
    }

    document.getElementById("nutriopus-custom-theme-vars")?.remove();
    document.documentElement.classList.remove(CUSTOM_DARK_CLASS);
  }, [currentThemeName]);
}

"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Moon, Palette, Star, Sun } from "lucide-react";
import { AppTooltip } from "@/components/ui/AppTooltip";
import { useI18n } from "@/lib/i18n/I18nContext";
import { CustomThemeDialog } from "../theme/CustomThemeDialog";
import { ThemePreviewDots } from "../theme/ThemePreviewDots";
import {
  CURATED_THEME_PRESETS,
  CUSTOM_DARK_CLASS,
  CuratedThemeId,
  getStoredCustomTheme,
  saveCustomTheme,
  useCustomThemeSync,
  useFavoriteThemes,
} from "../theme/custom-theme-utils";

/** Total items shown in the "Presets" group of the quick menu (pinned favorites + static presets). */
const MAX_PRESET_SLOTS = 4;

const THEME_CLASS_NAMES = [
  "light",
  "dark",
  "theme-nutri-blue",
  "theme-clinical-leaf",
  "theme-premium-sand",
  "theme-clinical-green",
  "theme-classic-blue",
  "theme-classic-sand",
  "theme-custom",
];

export function ThemeToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);
  const [activeCustomPresetId, setActiveCustomPresetId] = useState<CuratedThemeId | null>(
    () => getStoredCustomTheme().backgroundPreset as CuratedThemeId,
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { favorites, toggleFavorite } = useFavoriteThemes();

  useCustomThemeSync(theme);

  type ThemeMenuItem = {
    id: string;
    label: string;
    icon: ReactNode;
    dots: string[];
    kind: "theme" | "custom";
    curatedId?: CuratedThemeId;
    isFavorite?: boolean;
  };

  const staticPresetItems: ThemeMenuItem[] = [
    {
      id: "theme-premium-sand",
      label: t("theme.presets.minimal_beige"),
      icon: <span className="inline-block h-4 w-4 rounded-full bg-[#D2AB85]" />,
      dots: ["#FBF6F0", "#FFFFFF", "#D2AB85"],
      kind: "theme",
    },
    {
      id: "theme-clinical-green",
      label: t("theme.presets.clinical_green"),
      icon: <span className="inline-block h-4 w-4 rounded-full bg-[#4F8A5B]" />,
      dots: ["#F6F8F2", "#FFFFFF", "#4F8A5B"],
      kind: "theme",
    },
    {
      id: "theme-classic-blue",
      label: t("theme.presets.classic_blue"),
      icon: <span className="inline-block h-4 w-4 rounded-full bg-[#2563EB]" />,
      dots: ["#F5F8FF", "#FFFFFF", "#2563EB"],
      kind: "theme",
    },
    {
      id: "theme-classic-sand",
      label: t("theme.presets.classic_sand"),
      icon: <span className="inline-block h-4 w-4 rounded-full bg-[#B8894D]" />,
      dots: ["#F8F4EC", "#FFFFFF", "#B8894D"],
      kind: "theme",
    },
  ];

  const favoritePresetItems: ThemeMenuItem[] = favorites
    .map((id) => CURATED_THEME_PRESETS.find((preset) => preset.id === id))
    .filter((preset): preset is NonNullable<typeof preset> => Boolean(preset))
    .map((preset) => ({
      id: `custom:${preset.id}`,
      label: t(preset.labelKey),
      icon: <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: preset.colors[2] }} />,
      dots: preset.colors,
      kind: "custom" as const,
      curatedId: preset.id,
      isFavorite: true,
    }));

  // Pinned favorites take priority; the oldest static presets fall off once the 6-item budget (2 appearance + 4 presets) is exceeded.
  const presetItems = [...favoritePresetItems, ...staticPresetItems].slice(0, MAX_PRESET_SLOTS);

  const appearanceItems: ThemeMenuItem[] = [
    {
      id: "light",
      label: t("theme.presets.blue_beige"),
      icon: <Sun className="h-4 w-4" />,
      dots: ["#FBF8F4", "#FFFFFF", "#08284D"],
      kind: "theme",
    },
    {
      id: "dark",
      label: t("theme.presets.dark_blue_premium"),
      icon: <Moon className="h-4 w-4" />,
      dots: ["#061525", "#0B1F38", "#D2AB85"],
      kind: "theme",
    },
  ];

  const themes = [
    {
      group: t("theme.groups.appearance", { defaultValue: "Aparencia" }),
      items: appearanceItems,
    },
    {
      group: t("theme.groups.presets", { defaultValue: "Presets" }),
      items: presetItems,
    },
  ];

  const handleThemeChange = (newTheme: string) => {
    document.documentElement.classList.remove(...THEME_CLASS_NAMES, CUSTOM_DARK_CLASS);
    setTheme(newTheme);
    setIsOpen(false);
  };

  const handleCustomPresetClick = (curatedId: CuratedThemeId) => {
    const preset = CURATED_THEME_PRESETS.find((item) => item.id === curatedId);
    if (!preset) return;
    document.documentElement.classList.remove(...THEME_CLASS_NAMES, CUSTOM_DARK_CLASS);
    saveCustomTheme(preset.config, true);
    setTheme("theme-custom");
    setActiveCustomPresetId(curatedId);
    setIsOpen(false);
  };

  const handleItemClick = (item: ThemeMenuItem) => {
    if (item.kind === "custom" && item.curatedId) {
      handleCustomPresetClick(item.curatedId);
    } else {
      handleThemeChange(item.id);
    }
  };

  const isItemActive = (item: ThemeMenuItem) =>
    item.kind === "custom" ? theme === "theme-custom" && activeCustomPresetId === item.curatedId : theme === item.id;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!mounted) return null;

  const CurrentIcon = theme === "dark"
    ? Moon
    : theme === "theme-custom"
      ? Palette
      : Sun;

  return (
    <div className={`relative inline-block ${isOpen ? "z-[10000]" : "z-auto"}`} ref={dropdownRef}>
      <AppTooltip content={t("theme.toggle")}>
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className={`flex items-center gap-2 rounded-lg p-2 text-text-secondary transition-all duration-150 hover:bg-brand-blue-soft hover:text-brand-blue active:scale-95 ${className}`}
          aria-label={t("theme.toggle")}
        >
          <CurrentIcon className="h-5 w-5 transition-transform duration-300" />
          {showLabel && <span className="text-sm font-medium">{t("theme.label", { defaultValue: "Tema" })}</span>}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </AppTooltip>

      <div
        className={`absolute right-0 top-full z-[10000] mt-0 w-64 origin-top overflow-hidden rounded-xl border border-border-neutral bg-card-bg shadow-xl transition-all duration-200 ${
          isOpen ? "translate-y-0 scale-y-100 opacity-100 pointer-events-auto" : "-translate-y-1 scale-y-95 opacity-0 pointer-events-none"
        }`}
      >
        <div className="py-1.5">
          {themes.map(({ group, items }) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                {group}
              </div>
              {items.map((item, index) => {
                const active = isItemActive(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`flex w-full items-center px-4 py-2.5 text-sm transition-all duration-100 ${
                      active
                        ? "bg-brand-blue-soft/60 font-medium text-brand-blue"
                        : "text-text-primary hover:bg-warm-surface hover:pl-5"
                    }`}
                    style={{ transitionDelay: isOpen ? `${index * 25}ms` : "0ms" }}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="mr-3 shrink-0">{item.icon}</span>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    {item.isFavorite && (
                      <Star className="mr-1 h-3 w-3 shrink-0 fill-amber-500 text-amber-500" aria-label={t("theme.customize.favorite_badge", { defaultValue: "Favorito" })} />
                    )}
                    {active && <Check className="mr-1 h-4 w-4 shrink-0 text-brand-blue" />}
                    <ThemePreviewDots colors={item.dots as [string, string, string]} />
                  </button>
                );
              })}
              <div className="my-1 border-t border-border-neutral" />
            </div>
          ))}

          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
            {t("theme.groups.customization", { defaultValue: "Personalizacao" })}
          </div>
          <button
            type="button"
            className={`flex w-full items-center px-4 py-2.5 text-sm transition-all duration-100 ${
              theme === "theme-custom"
                ? "bg-brand-blue-soft/60 font-medium text-brand-blue"
                : "text-text-primary hover:bg-warm-surface hover:pl-5"
            }`}
            onClick={() => {
              handleThemeChange("theme-custom");
              setIsCustomDialogOpen(true);
            }}
          >
            <Palette className="mr-3 h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">{t("theme.more_themes", { defaultValue: "Outros temas..." })}</span>
            {theme === "theme-custom" && <Check className="h-4 w-4 shrink-0 text-brand-blue" />}
          </button>
        </div>
      </div>

      <CustomThemeDialog
        open={isCustomDialogOpen}
        onOpenChange={setIsCustomDialogOpen}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        onApplied={setActiveCustomPresetId}
      />
    </div>
  );
}

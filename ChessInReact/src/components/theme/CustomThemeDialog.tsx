"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, ShieldCheck, Star, X } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/I18nContext";
import {
  CURATED_THEME_SURFACES,
  CURATED_THEME_PRESETS,
  CuratedThemeId,
  CustomThemeConfig,
  getReadableTextColor,
  getStoredCustomTheme,
  saveCustomTheme,
} from "./custom-theme-utils";

interface CustomThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  favorites: CuratedThemeId[];
  onToggleFavorite: (id: CuratedThemeId) => void;
  onApplied?: (id: CuratedThemeId) => void;
}

export function CustomThemeDialog({ open, onOpenChange, favorites, onToggleFavorite, onApplied }: CustomThemeDialogProps) {
  const [config, setConfig] = useState<CustomThemeConfig>(() => getStoredCustomTheme());
  const [pendingFavoriteId, setPendingFavoriteId] = useState<CuratedThemeId | null>(null);
  const { t } = useI18n();
  const { setTheme } = useTheme();

  if (!open) return null;

  const selectedPreset = CURATED_THEME_PRESETS.find(
    (preset) => preset.id === config.backgroundPreset,
  ) ?? CURATED_THEME_PRESETS[0];
  const preview = CURATED_THEME_SURFACES[selectedPreset.id];
  const primaryForeground = getReadableTextColor(selectedPreset.config.primary);
  const sidebarActiveForeground = getReadableTextColor(selectedPreset.config.sidebarAccent);

  const handleApply = () => {
    saveCustomTheme(selectedPreset.config, true);
    setTheme("theme-custom");
    onApplied?.(selectedPreset.id);
    toast.success(t("theme.customize.saved"));
    onOpenChange(false);
  };

  const handleToggleFavorite = async (event: React.MouseEvent, id: CuratedThemeId) => {
    event.stopPropagation();
    if (pendingFavoriteId) return;

    const wasFavorite = favorites.includes(id);
    setPendingFavoriteId(id);
    await new Promise((resolve) => setTimeout(resolve, 280));
    onToggleFavorite(id);
    setPendingFavoriteId(null);
    toast.success(
      wasFavorite
        ? t("theme.customize.favorite_removed", { defaultValue: "Removido dos favoritos." })
        : t("theme.customize.favorite_added", { defaultValue: "Tema favoritado! Ele aparece no menu rápido agora." }),
    );
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/50 p-4 animate-in fade-in sm:p-6">
      <div className="my-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border-neutral bg-card-bg text-text-primary shadow-2xl">
        <div className="flex shrink-0 items-start justify-between border-b border-border-neutral px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">{t("theme.customize.title")}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t("theme.customize.description")}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-warm-surface hover:text-text-primary"
            aria-label={t("common.close", { defaultValue: "Fechar" })}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t("theme.customize.palette_title")}</h3>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                <ShieldCheck className="h-3.5 w-3.5 text-clinical-success-foreground" />
                {t("theme.customize.accessible_contrast")}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CURATED_THEME_PRESETS.map((preset) => {
                const isSelected = selectedPreset.id === preset.id;
                const isFavorite = favorites.includes(preset.id);
                const isFavoritePending = pendingFavoriteId === preset.id;

                return (
                  <div
                    key={preset.id}
                    className={`relative min-h-24 rounded-lg border transition-colors ${
                      isSelected
                        ? "border-brand-blue bg-brand-blue-soft/60 ring-2 ring-brand-blue/15"
                        : "border-border-neutral bg-warm-surface/50 hover:border-brand-blue/40 hover:bg-warm-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(event) => handleToggleFavorite(event, preset.id)}
                      disabled={isFavoritePending}
                      aria-pressed={isFavorite}
                      aria-label={
                        isFavorite
                          ? t("theme.customize.unfavorite", { defaultValue: "Remover dos favoritos" })
                          : t("theme.customize.favorite", { defaultValue: "Favoritar tema" })
                      }
                      className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-amber-500 transition-all hover:bg-amber-500/10 disabled:opacity-60"
                    >
                      {isFavoritePending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Star className={`h-3.5 w-3.5 transition-transform ${isFavorite ? "scale-110 fill-amber-500" : "fill-none"}`} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfig(preset.config)}
                      className="block h-full w-full p-3 pl-9 text-left"
                      aria-pressed={isSelected}
                    >
                      <span className="mb-3 flex items-center gap-1.5">
                        {preset.colors.map((color) => (
                          <span
                            key={color}
                            className="h-5 w-5 rounded-full border border-black/10 shadow-sm"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <span className="block pr-6 text-sm font-semibold text-text-primary">
                        {t(preset.labelKey)}
                      </span>
                      <span className="mt-0.5 block text-xs leading-4 text-text-secondary">
                        {t(preset.descriptionKey)}
                      </span>
                    </button>
                    {isSelected && (
                      <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-brand-blue text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">{t("theme.customize.preview")}</h3>
            <div
              className="overflow-hidden rounded-lg border shadow-sm"
              style={{ backgroundColor: preview.background, borderColor: preview.border }}
            >
              <div
                className="flex h-10 items-center justify-between border-b px-3"
                style={{
                  backgroundColor: selectedPreset.config.navbarBackground,
                  borderColor: preview.border,
                  color: getReadableTextColor(selectedPreset.config.navbarBackground, "#F8FAFC", "#102033"),
                }}
              >
                <span className="text-[11px] font-semibold">NutriOpus</span>
                <span className="h-2.5 w-10 rounded-full" style={{ backgroundColor: selectedPreset.config.accent }} />
              </div>

              <div className="flex min-h-52">
                <div
                  className="w-16 border-r p-2"
                  style={{
                    backgroundColor: selectedPreset.config.sidebarBackground,
                    borderColor: preview.border,
                  }}
                >
                  <div
                    className="flex h-8 items-center justify-center rounded-md text-[10px] font-bold"
                    style={{
                      backgroundColor: selectedPreset.config.sidebarAccent,
                      color: sidebarActiveForeground,
                    }}
                  >
                    Aa
                  </div>
                  <div className="mx-auto mt-3 h-2 w-8 rounded-full" style={{ backgroundColor: preview.border }} />
                  <div className="mx-auto mt-2 h-2 w-8 rounded-full" style={{ backgroundColor: preview.border }} />
                </div>

                <div className="min-w-0 flex-1 p-3">
                  <div
                    className="rounded-lg border p-3"
                    style={{ backgroundColor: preview.card, borderColor: preview.border }}
                  >
                    <p className="text-xs font-semibold" style={{ color: preview.text }}>
                      {t("theme.preview.card_example")}
                    </p>
                    <p className="mt-1 text-[10px] leading-4" style={{ color: preview.muted }}>
                      {t("theme.preview.description")}
                    </p>
                    <span
                      className="mt-3 inline-flex rounded px-2 py-1 text-[10px] font-semibold"
                      style={{
                        backgroundColor: selectedPreset.config.secondary,
                        color: getReadableTextColor(selectedPreset.config.secondary, "#F8FAFC", "#102033"),
                      }}
                    >
                      {t("theme.preview.badge_example")}
                    </span>
                    <button
                      type="button"
                      className="mt-3 w-full rounded-md px-3 py-2 text-xs font-semibold"
                      style={{
                        backgroundColor: selectedPreset.config.primary,
                        color: primaryForeground,
                      }}
                    >
                      {t("theme.preview.main_button")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end border-t border-border-neutral bg-warm-surface px-5 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-border-neutral bg-card-bg px-4 py-2 text-sm font-medium transition-colors hover:bg-warm-surface"
            >
              {t("common.cancel", { defaultValue: "Cancelar" })}
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              {t("theme.customize.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

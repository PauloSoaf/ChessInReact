import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CURATED_THEME_PRESETS,
  CURATED_THEME_SURFACES,
  getContrastRatio,
  getReadableTextColor,
} from "../custom-theme-utils";

describe("curated custom themes", () => {
  it("uses unique preset identifiers", () => {
    const ids = CURATED_THEME_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(CURATED_THEME_PRESETS)("$id keeps semantic text readable", (preset) => {
    const { config } = preset;

    expect(getContrastRatio(getReadableTextColor(config.primary), config.primary)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(getReadableTextColor(config.accent), config.accent)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(getReadableTextColor(config.secondary), config.secondary)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(getReadableTextColor(config.navbarBackground), config.navbarBackground)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(getReadableTextColor(config.sidebarBackground), config.sidebarBackground)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(getReadableTextColor(config.sidebarAccent), config.sidebarAccent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CURATED_THEME_PRESETS)("$id keeps primary and secondary copy above WCAG AA", (preset) => {
    const surface = CURATED_THEME_SURFACES[preset.id];

    expect(getContrastRatio(surface.text, surface.background)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(surface.text, surface.card)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(surface.muted, surface.background)).toBeGreaterThanOrEqual(4.5);
    expect(getContrastRatio(surface.muted, surface.card)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("restored classic themes", () => {
  const stylesheet = readFileSync(
    new URL("../../../app/globals.css", import.meta.url),
    "utf8",
  );

  function getThemeVariables(themeClass: string) {
    const block = stylesheet.match(
      new RegExp(`\\.${themeClass},[\\s\\S]*?\\{([\\s\\S]*?)\\n\\}`),
    )?.[1];

    expect(block).toBeDefined();
    return Object.fromEntries(
      [...(block ?? "").matchAll(/--([a-z-]+):\s*(#[0-9A-F]{6});/gi)]
        .map((match) => [match[1], match[2]]),
    );
  }

  it.each(["theme-classic-blue", "theme-classic-sand"])(
    "%s keeps its key text pairs above WCAG AA",
    (themeClass) => {
      const variables = getThemeVariables(themeClass);

      expect(getContrastRatio(variables["text-primary"], variables.background)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(variables["primary-foreground"], variables.primary)).toBeGreaterThanOrEqual(4.5);
      expect(
        getContrastRatio(
          variables["sidebar-accent-foreground"],
          variables["sidebar-accent"],
        ),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});

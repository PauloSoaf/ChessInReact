"use client";

import { useI18n } from "@/lib/i18n/I18nContext";
import { useEffect, useState, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AppTooltip } from "@/components/ui/AppTooltip";

const LOCALES = [
  { code: "pt", label: "Português", flag: "https://flagcdn.com/w20/br.png", flag2x: "https://flagcdn.com/w40/br.png" },
  { code: "en", label: "English",   flag: "https://flagcdn.com/w20/us.png", flag2x: "https://flagcdn.com/w40/us.png" },
  { code: "es", label: "Español",   flag: "https://flagcdn.com/w20/es.png", flag2x: "https://flagcdn.com/w40/es.png" },
] as const;

export function LangToggle({ className = "", showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const current = LOCALES.find((l) => l.code === locale)!;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <AppTooltip content={t("lang.toggle")}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          className={`flex items-center gap-2 rounded-lg p-2 text-sm font-medium text-text-secondary transition-all duration-150 hover:bg-brand-blue-soft hover:text-brand-blue active:scale-95 ${className}`}
          aria-label={t("lang.toggle")}
        >
          <img
            src={current.flag}
            srcSet={`${current.flag2x} 2x`}
            width={18}
            height={13}
            alt={current.label}
            className="rounded-sm object-cover"
          />
          <span>{current.code.toUpperCase()}</span>
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
          {showLabel && <span className="ml-1">{t("lang.toggle")}</span>}
        </button>
      </AppTooltip>

      {/* Dropdown — always in DOM, animated via CSS */}
      <div
        className={`absolute right-0 top-full mt-0 w-44 bg-card-bg border border-border-neutral shadow-xl rounded-xl z-50 overflow-hidden transition-all duration-200 origin-top
          ${isOpen
            ? "opacity-100 scale-y-100 translate-y-0 pointer-events-auto"
            : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none"
          }`}
      >
        <div className="py-1.5 text-text-primary">
          {LOCALES.map(({ code, label, flag, flag2x }, i) => (
            <button
              key={code}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-all duration-100
                ${locale === code
                  ? "text-brand-blue bg-brand-blue-soft/40 font-medium"
                  : "hover:bg-warm-surface hover:pl-5"
                }`}
              style={{ transitionDelay: isOpen ? `${i * 30}ms` : "0ms" }}
              onClick={() => { setLocale(code); setIsOpen(false); }}
            >
              <span className="flex items-center gap-2.5">
                <img
                  src={flag}
                  srcSet={`${flag2x} 2x`}
                  width={20}
                  height={15}
                  alt={label}
                  className="rounded-sm object-cover shadow-sm"
                />
                {label}
              </span>
              {locale === code && <Check className="w-4 h-4 text-brand-blue" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

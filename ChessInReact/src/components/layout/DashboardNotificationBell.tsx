"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Bell,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Loader2,
  MessageCircle,
  Plus,
} from "lucide-react";
import { AppTooltip } from "@/components/ui/AppTooltip";
import { useI18n } from "@/lib/i18n/I18nContext";
import { PendingButtonLink } from "@/components/navigation/PendingButtonLink";

type NotificationTone = "blue" | "green" | "amber" | "rose";
type NotificationType = "reminder" | "appointment" | "anamnese" | "message" | "mood";

type ClinicalNotification = {
  id: string;
  type: NotificationType;
  tone: NotificationTone;
  title: string;
  description: string;
  href: string;
  at?: string;
  patientName?: string;
};

type NotificationPayload = {
  generatedAt: string;
  reminders: ClinicalNotification[];
  alerts: ClinicalNotification[];
  summary: {
    dueReminders: number;
    todayAppointments: number;
    newAnamneses: number;
    unreadMessages: number;
    lowMoodAlerts: number;
    totalOpen: number;
  };
};

const toneClasses: Record<NotificationTone, string> = {
  blue: "bg-brand-blue-soft text-brand-blue",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

const typeIcons = {
  reminder: Bell,
  appointment: CalendarDays,
  anamnese: ClipboardList,
  message: MessageCircle,
  mood: Activity,
} satisfies Record<NotificationType, typeof Bell>;

function formatNotificationTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function NotificationRow({
  item,
  onClick,
}: {
  item: ClinicalNotification;
  onClick: () => void;
}) {
  const Icon = typeIcons[item.type];
  const timeLabel = formatNotificationTime(item.at);

  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onClick}
      className="group flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-warm focus-visible:bg-surface-warm focus-visible:outline-none"
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneClasses[item.tone]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold text-text-primary group-hover:text-brand-blue">
            {item.title}
          </span>
          {timeLabel && <span className="shrink-0 text-[11px] text-text-secondary">{timeLabel}</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-text-secondary">
          {item.description}
        </span>
      </span>
    </Link>
  );
}

export function DashboardNotificationBell() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<NotificationPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const lastLoadedAtRef = useRef(0);

  const tenant = useMemo(() => {
    const [, area, slug] = pathname.split("/");
    return area === "dashboard" ? slug : null;
  }, [pathname]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const loadNotifications = useCallback(async (force = false) => {
    if (!tenant) return;
    const freshEnough = Date.now() - lastLoadedAtRef.current < 30_000;
    if (!force && payload && freshEnough) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/dashboard/${tenant}/notifications`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Falha ao carregar notificacoes.");
      const data = (await response.json()) as NotificationPayload;
      setPayload(data);
      lastLoadedAtRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar notificacoes.");
    } finally {
      setLoading(false);
    }
  }, [payload, tenant]);

  const openPanel = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
    void loadNotifications(false);
  }, [clearCloseTimer, loadNotifications]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  }, [clearCloseTimer]);

  if (!tenant) return null;

  const totalOpen = payload?.summary.totalOpen ?? 0;
  const hasItems = Boolean((payload?.reminders.length ?? 0) + (payload?.alerts.length ?? 0));

  return (
    <div
      className="relative"
      onMouseEnter={openPanel}
      onMouseLeave={scheduleClose}
      onFocus={openPanel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clearCloseTimer();
          setOpen(false);
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
      }}
    >
      <AppTooltip
        content={t("notifications.tooltip", { defaultValue: "Notificacoes, lembretes e alertas" })}
        side="bottom"
        align="end"
        disabled={open}
      >
        <button
          type="button"
          onClick={openPanel}
          className="flex items-center gap-1.5 rounded-lg p-2 text-text-secondary transition-all duration-150 hover:bg-brand-blue-soft hover:text-brand-blue active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/30"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={t("notifications.open", { defaultValue: "Abrir notificacoes" })}
        >
          <Bell className="h-5 w-5" />
          {totalOpen > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
              {totalOpen > 9 ? "9+" : totalOpen}
            </span>
          )}
          {totalOpen === 0 && <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </AppTooltip>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[120] mt-2 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-border-neutral bg-card-bg shadow-[0_22px_60px_rgba(15,23,42,0.18)]"
        >
          <div className="border-b border-border-neutral px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {t("notifications.title", { defaultValue: "Central clinica" })}
                </p>
                <p className="text-xs text-text-secondary">
                  {t("notifications.subtitle", { defaultValue: "Lembretes, agenda e alertas atuais" })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadNotifications(true)}
                className="rounded-lg border border-border-neutral px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-60"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("common.refresh", { defaultValue: "Atualizar" })}
              </button>
            </div>
          </div>

          {loading && !payload && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading", { defaultValue: "Carregando..." })}
            </div>
          )}

          {error && !loading && (
            <div className="m-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {payload && (
            <div className="max-h-[26rem] overflow-y-auto p-2">
              {payload.reminders.length > 0 && (
                <div className="pb-2">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                    {t("notifications.sections.reminders", { defaultValue: "Lembretes ativos" })}
                  </p>
                  {payload.reminders.map((item) => (
                    <NotificationRow key={item.id} item={item} onClick={() => setOpen(false)} />
                  ))}
                </div>
              )}

              {payload.alerts.length > 0 && (
                <div className="pb-2">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-text-secondary">
                    {t("notifications.sections.alerts", { defaultValue: "Alertas atuais" })}
                  </p>
                  {payload.alerts.map((item) => (
                    <NotificationRow key={item.id} item={item} onClick={() => setOpen(false)} />
                  ))}
                </div>
              )}

              {!hasItems && (
                <div className="px-4 py-8 text-center">
                  <Bell className="mx-auto mb-2 h-8 w-8 text-text-secondary/35" />
                  <p className="text-sm font-medium text-text-primary">
                    {t("notifications.empty.title", { defaultValue: "Tudo em dia" })}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {t("notifications.empty.description", { defaultValue: "Nenhum lembrete ou alerta pendente agora." })}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 border-t border-border-neutral bg-surface-warm/60 p-2">
            <PendingButtonLink
              href={`/dashboard/${tenant}/lembretes`}
              prefetch={false}
              pendingLabel="Abrindo..."
              onNavigate={scheduleClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-neutral bg-card-bg px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue/30 hover:text-brand-blue"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("notifications.actions.reminders", { defaultValue: "Lembretes" })}
            </PendingButtonLink>
            <PendingButtonLink
              href={`/dashboard/${tenant}/agenda`}
              prefetch={false}
              pendingLabel="Abrindo..."
              onNavigate={scheduleClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border-neutral bg-card-bg px-3 py-2 text-xs font-semibold text-text-primary transition-colors hover:border-brand-blue/30 hover:text-brand-blue"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              {t("nav.agenda", { defaultValue: "Agenda" })}
            </PendingButtonLink>
          </div>
        </div>
      )}
    </div>
  );
}

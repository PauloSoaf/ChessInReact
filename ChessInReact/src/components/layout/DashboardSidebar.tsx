"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NutriOpusLogo } from "@/components/ui/NutriOpusLogo";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Settings,
  ExternalLink,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Wrench,
  BookOpen,
  Video,
  UserCog,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/I18nContext";

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
}

interface SidebarProps {
  tenantSlug: string;
  nutritionistName: string;
  dashboardBaseHref?: string;
  publicPageHref?: string;
  /** Overrides the default clinic nav items (used by e.g. the Global Admin shell). */
  items?: SidebarNavItem[];
  /** Small pill shown under the logo instead of `nutritionistName` (e.g. "GLOBAL ADMIN"). */
  badge?: ReactNode;
  /** Extra content pinned to the bottom of the sidebar, below the nav list. */
  footer?: ReactNode;
}

export function DashboardSidebar({
  tenantSlug,
  nutritionistName,
  dashboardBaseHref = `/dashboard/${tenantSlug}`,
  publicPageHref = `/${tenantSlug}`,
  items,
  badge,
  footer,
}: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    const stored = localStorage.getItem("sidebarExpanded");
    if (stored !== null) {
      queueMicrotask(() => setDesktopExpanded(stored === "true"));
    }
  }, []);

  // Clear pending as soon as pathname reflects the new route
  useEffect(() => {
    queueMicrotask(() => setPendingHref(null));
  }, [pathname]);

  const toggleSidebar = () => {
    const newVal = !desktopExpanded;
    setDesktopExpanded(newVal);
    localStorage.setItem("sidebarExpanded", String(newVal));
  };

  const navItems: SidebarNavItem[] = items ?? [
    { label: t("nav.dashboard"), href: dashboardBaseHref, icon: LayoutDashboard },
    { label: t("nav.agenda"), href: `${dashboardBaseHref}/agenda`, icon: CalendarDays },
    { label: t("nav.care_sessions"), href: `${dashboardBaseHref}/atendimentos`, icon: Video },
    { label: t("nav.patients"), href: `${dashboardBaseHref}/pacientes`, icon: Users },
    { label: t("nav.plan_studio"), href: `${dashboardBaseHref}/ferramentas/oficina-planos`, icon: BookOpen },
    { label: t("nav.tools"), href: `${dashboardBaseHref}/ferramentas`, icon: Wrench },
    { label: t("nav.team"), href: `${dashboardBaseHref}/equipe`, icon: UserCog },
    { label: t("nav.settings"), href: `${dashboardBaseHref}/config`, icon: Settings },
    {
      label: t("nav.public_page"),
      href: publicPageHref,
      icon: ExternalLink,
      external: true,
    },
  ];

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg border border-[var(--sidebar-border)] bg-[var(--sidebar-background)] p-2 shadow-md lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5 text-text-primary" />
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/30 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full border-r border-[var(--sidebar-border)] bg-[var(--sidebar-background)] text-[var(--sidebar-foreground)]
          flex flex-col transition-all duration-300 ease-in-out
          lg:sticky lg:top-0 lg:h-screen lg:z-[95]
          ${mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
          ${desktopExpanded ? "lg:w-64" : "lg:w-20"}
        `}
      >
        <div className="relative flex min-h-[85px] items-center border-b border-[var(--sidebar-border)] p-6">
          <div className={`flex items-center justify-between w-full ${!desktopExpanded && "lg:hidden"}`}>
            <div className="overflow-hidden flex-1 flex flex-col justify-center">
              <NutriOpusLogo
                role="img"
                aria-label="NutriOpus"
                className="h-9 w-auto object-contain self-start"
              />
              {badge ? (
                <div className="mt-1">{badge}</div>
              ) : (
                <p className="text-xs text-text-secondary mt-0.5 truncate">
                  {nutritionistName}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1 rounded hover:bg-[var(--sidebar-hover)]"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5 text-text-secondary" />
              </button>
            </div>
          </div>

          <div className={`hidden items-center justify-center w-full ${desktopExpanded ? "lg:hidden" : "lg:flex"}`}>
            <Image
              src="/nutriopus_mini_logo_exata.svg"
              alt="NutriOpus"
              width={32}
              height={32}
              className="h-8 w-auto object-contain"
            />
          </div>

          <button
            onClick={toggleSidebar}
            className="absolute -right-3 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--sidebar-border)] bg-[var(--sidebar-background)] text-text-secondary shadow-sm transition-colors hover:border-brand-blue hover:text-brand-blue lg:flex"
          >
            {desktopExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isCurrentPath =
              !item.external &&
              (pathname === item.href ||
                (item.href !== dashboardBaseHref &&
                  pathname.startsWith(item.href + "/") &&
                  !(item.href === `${dashboardBaseHref}/ferramentas` &&
                    pathname.startsWith(`${dashboardBaseHref}/ferramentas/oficina-planos`))));

            // Optimistic: highlight immediately on click, before pathname updates
            const isPending = pendingHref === item.href;
            const isActive = isPending || isCurrentPath;
            // Only show the spinner while genuinely waiting for an uncached
            // route to load — once the pathname matches we're already there.
            const isLoading = isPending && !isCurrentPath;

            const Icon = item.icon;

            return (
              <div key={item.href} className="relative group">
                <Link
                  href={item.href}
                  prefetch={true}
                  target={item.external ? "_blank" : undefined}
                  onClick={() => {
                    if (!item.external) setPendingHref(item.href);
                    setMobileOpen(false);
                  }}
                  className={`
                    flex items-center px-3 py-2.5 rounded-lg text-sm font-medium
                    transition-all duration-150
                    ${desktopExpanded ? "gap-3" : "justify-center lg:justify-start"}
                    ${
                      isActive
                        ? "bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)] shadow-sm"
                        : "text-text-secondary hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-hover-foreground)]"
                    }
                  `}
                >
                  {isLoading ? (
                    <Loader2 className={`w-5 h-5 shrink-0 animate-spin ${!desktopExpanded && "lg:mx-auto"}`} />
                  ) : (
                    <Icon className={`w-5 h-5 shrink-0 ${!desktopExpanded && "lg:mx-auto"}`} />
                  )}
                  <span className={`truncate transition-all duration-300 ${!desktopExpanded ? "lg:hidden lg:opacity-0 lg:w-0" : "opacity-100"}`}>
                    {item.label}
                  </span>
                  {item.external && desktopExpanded && (
                    <ExternalLink className="w-3 h-3 ml-auto opacity-50 shrink-0" />
                  )}
                </Link>
                {!desktopExpanded && (
                  <div className="pointer-events-none absolute left-full top-1/2 z-[9999] ml-2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-[var(--tooltip-border)] bg-[var(--tooltip-bg)] px-2 py-1 text-xs font-medium text-[var(--tooltip-foreground)] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 lg:block">
                    {item.label}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {footer && (
          <div className="border-t border-[var(--sidebar-border)] p-4 shrink-0">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

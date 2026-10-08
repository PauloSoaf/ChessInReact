"use client";

import { ClipboardList } from "lucide-react";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileDropdown } from "./ProfileDropdown";
import { DashboardNotificationBell } from "./DashboardNotificationBell";
import { AppBreadcrumbs } from "@/components/navigation/AppBreadcrumbs";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import type { BreadcrumbItem, BackButtonConfig } from "@/lib/navigation/navigation-types";

interface HeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  backButton?: BackButtonConfig;
  /** Extra badge rendered next to the title (e.g. a "Global Admin" pill). */
  badge?: React.ReactNode;
  /** Set to false to hide the patient/tenant notification bell (e.g. in the Global Admin area). */
  showNotifications?: boolean;
}

export function DashboardHeader({ title, subtitle, breadcrumbs, backButton, badge, showNotifications = true }: HeaderProps) {
  const hasMeta = !!(breadcrumbs?.length || backButton);

  return (
    <>
      {/* ── Navbar principal ── */}
      <header className="relative z-[90] border-b border-[var(--navbar-border)] bg-[var(--navbar-background)] px-6 py-4 text-[var(--navbar-foreground)] backdrop-blur-md lg:px-8">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3 ml-10 lg:ml-0">
            <div className="p-2 bg-brand-blue-soft rounded-lg">
              <ClipboardList className="w-5 h-5 text-brand-blue" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-text-primary">{title}</h1>
                {badge}
              </div>
              {subtitle && (
                <p className="text-sm text-text-secondary">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {showNotifications && <DashboardNotificationBell />}
            <LangToggle />
            <ThemeToggle />
            <div className="w-px h-5 bg-border-neutral mx-1" />
            <ProfileDropdown />
          </div>
        </div>
      </header>

      {/* ── Navegação contextual (fora do header, na área de conteúdo) ── */}
      {hasMeta && (
        <div className="px-6 lg:px-8 pt-5 pb-4">
          <div className="ml-10 lg:ml-0 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {backButton && (
              <AppBackButton href={backButton.href} label={backButton.label} />
            )}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <AppBreadcrumbs items={breadcrumbs} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

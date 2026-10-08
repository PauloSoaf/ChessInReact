"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, CalendarDays, Wrench, Settings } from "lucide-react";
import { PendingButtonLink } from "@/components/navigation/PendingButtonLink";

interface MobileBottomNavProps {
  tenantSlug: string;
  dashboardBaseHref?: string;
}

export function MobileBottomNav({
  tenantSlug,
  dashboardBaseHref = `/dashboard/${tenantSlug}`,
}: MobileBottomNavProps) {
  const pathname = usePathname();

  const items = [
    { label: "Início", href: dashboardBaseHref, icon: LayoutDashboard, exact: true },
    { label: "Agenda", href: `${dashboardBaseHref}/agenda`, icon: CalendarDays, exact: false },
    { label: "Pacientes", href: `${dashboardBaseHref}/pacientes`, icon: Users, exact: false },
    { label: "Ferramentas", href: `${dashboardBaseHref}/ferramentas`, icon: Wrench, exact: false },
    { label: "Config", href: `${dashboardBaseHref}/config`, icon: Settings, exact: false },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-card-bg border-t border-border-neutral safe-area-inset-bottom">
      <div className="flex items-center justify-around py-1.5 pb-safe">
        {items.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <PendingButtonLink
              key={item.href}
              href={item.href}
              pendingLabel={null}
              className={`
                flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg min-w-0 flex-1
                transition-colors duration-200
                ${isActive ? "text-brand-blue" : "text-text-secondary"}
              `}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "stroke-[2.5px]" : ""}`} />
              <span className={`text-[10px] truncate font-medium ${isActive ? "font-semibold" : ""}`}>
                {item.label}
              </span>
            </PendingButtonLink>
          );
        })}
      </div>
    </nav>
  );
}

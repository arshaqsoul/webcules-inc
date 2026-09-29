"use client";

/* Shared dashboard navigation (WEB-171) — one source of truth consumed by
 * the desktop aside and the mobile drawer; highlights the active route. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, CreditCard, Images, LayoutGrid, Link2, Settings, Snowflake, Users , BookOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/projects", label: "Projects", icon: Images },
  { href: "/dashboard/galleries", label: "Galleries", icon: Link2 },
  { href: "/dashboard/raw-vault", label: "RAW Vault", icon: Snowflake },
  { href: "/dashboard/transactions", label: "Transactions", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/docs/embeds", label: "Docs", icon: BookOpen },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export function DashboardNavLinks({ onNavigate, includeDocs = true, collapsed = false }: { onNavigate?: () => void; /** desktop aside groups Docs with theme/logout instead */ includeDocs?: boolean; /** icon rail: icons only, labels become tooltips */ collapsed?: boolean }) {
  const pathname = usePathname();
  const items = includeDocs ? NAV_ITEMS : NAV_ITEMS.filter((i) => !i.href.startsWith("/docs"));
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const rowCls = `flex w-full items-center gap-2.5 rounded-md text-sm transition-colors ${collapsed ? "justify-center py-2" : "px-3 py-2"}`;
        // Docs lives outside the dashboard — open beside it, keep the session.
        if (item.href.startsWith("/docs")) {
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={rowCls + " text-ink-subtle hover:bg-surface-2 hover:text-ink"}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed && item.label}
            </a>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={rowCls + ` ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden />
            {!collapsed && item.label}
          </Link>
        );
      })}
    </nav>
  );
}

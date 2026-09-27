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

export function DashboardNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-2">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        // Docs lives outside the dashboard — open beside it, keep the session.
        if (item.href.startsWith("/docs")) {
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </a>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
              active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <item.icon className="h-4 w-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

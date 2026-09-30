"use client";

/* Shared dashboard navigation (WEB-171) — one source of truth consumed by
 * the desktop aside and the mobile drawer; highlights the active route.
 * Settings and Templates nest as collapsible groups (WEB-234/286): the
 * parent row links to the section's landing redirect and the chevron toggles
 * the sub-list; landing on any sub-route auto-expands the group. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, CalendarDays, ChevronDown, Clock, Code2, CreditCard, FileText, Globe, Images, LayoutGrid, LayoutTemplate, Link2, ListChecks, Mail, PackageCheck, Receipt, Settings, SlidersHorizontal, Snowflake, Users, BookOpen, Palette, Frame } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard/projects", label: "Projects", icon: Images },
  { href: "/dashboard/galleries", label: "Galleries", icon: Link2 },
  { href: "/dashboard/raw-vault", label: "RAW Vault", icon: Snowflake },
  { href: "/dashboard/transactions", label: "Transactions", icon: CreditCard },
  { href: "/docs/embeds", label: "Docs", icon: BookOpen },
];

/** Settings sections (WEB-224/234) — rendered as the collapsible group's
 * children; the routes live under /dashboard/settings/*. */
export const SETTINGS_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard/settings/general", label: "General", icon: SlidersHorizontal },
  { href: "/dashboard/settings/brand", label: "Brand", icon: Palette },
  { href: "/dashboard/settings/domains", label: "Domains", icon: Globe },
  { href: "/dashboard/settings/embeds", label: "Embeds", icon: Code2 },
  { href: "/dashboard/settings/delivery", label: "Delivery", icon: PackageCheck },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings/payouts", label: "Payouts", icon: Banknote },
];

/** Template library sections (WEB-286) — every reusable definition lives
 * here; Calendar keeps only a session-type picker. */
export const TEMPLATES_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard/templates/contracts", label: "Contracts", icon: FileText },
  { href: "/dashboard/templates/forms", label: "Forms & Questionnaires", icon: ListChecks },
  { href: "/dashboard/templates/emails", label: "Emails", icon: Mail },
  { href: "/dashboard/templates/invoice-presets", label: "Invoice presets", icon: Receipt },
  { href: "/dashboard/templates/gallery-styles", label: "Gallery styles", icon: Frame },
  { href: "/dashboard/templates/session-types", label: "Session types", icon: Clock },
];

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

/** Collapsible sidebar group (Settings, Templates) — parent row links to the
 * group's landing redirect; chevron toggles; sub-routes auto-expand. */
function NavGroup({
  pathname,
  collapsed,
  onNavigate,
  onExpand,
  parentHref,
  label,
  icon: Icon,
  items,
}: {
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  /** Collapsed rail: opening the group also expands the sidebar so the
   * sub-list becomes visible. */
  onExpand?: () => void;
  parentHref: string;
  label: string;
  icon: LucideIcon;
  items: { href: string; label: string; icon: LucideIcon }[];
}) {
  const active = pathname === parentHref || pathname.startsWith(parentHref + "/");
  const [open, setOpen] = useState(false);
  // Landing on (or navigating between) the group's routes keeps it open;
  // the user can still fold it away manually.
  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  const rowCls = `flex w-full items-center gap-2.5 rounded-md text-sm transition-colors ${collapsed ? "justify-center py-2" : "px-3 py-2"}`;

  if (collapsed) {
    return (
      <Link
        href={parentHref}
        onClick={() => {
          onNavigate?.();
          onExpand?.();
        }}
        title={label}
        aria-label={label}
        className={rowCls + ` ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"}`}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="relative">
        <Link
          href={parentHref}
          onClick={onNavigate}
          className={`${rowCls} ${active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"} pr-9`}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${label.toLowerCase()} sections` : `Expand ${label.toLowerCase()} sections`}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-hairline pl-2.5">
          {items.map((item) => {
            const itemActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={itemActive ? "page" : undefined}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                  itemActive ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DashboardNavLinks({ onNavigate, includeDocs = true, collapsed = false, onExpandSidebar }: { onNavigate?: () => void; /** desktop aside groups Docs with theme/logout instead */ includeDocs?: boolean; /** icon rail: icons only, labels become tooltips */ collapsed?: boolean; /** collapsed rail: opening a group expands the sidebar */ onExpandSidebar?: () => void }) {
  const pathname = usePathname();
  const items = includeDocs ? NAV_ITEMS : NAV_ITEMS.filter((i) => !i.href.startsWith("/docs"));
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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
      <NavGroup pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} onExpand={onExpandSidebar} parentHref="/dashboard/templates" label="Templates" icon={LayoutTemplate} items={TEMPLATES_ITEMS} />
      <NavGroup pathname={pathname} collapsed={collapsed} onNavigate={onNavigate} onExpand={onExpandSidebar} parentHref="/dashboard/settings" label="Settings" icon={Settings} items={SETTINGS_ITEMS} />
    </nav>
  );
}

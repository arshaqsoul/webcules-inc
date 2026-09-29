"use client";

/* Settings sub-nav (WEB-234/235) — desktop vertical list + mobile horizontal
 * chip scroller, reusing the dashboard's active-route and no-scrollbar chip
 * patterns. Items own an optional hint slot (right-aligned on desktop):
 * Domains gets an action-needed dot from WEB-224/229; Billing shows the plan
 * name fed by the layout. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Banknote, Code2, CreditCard, Globe, PackageCheck, Palette, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

export const SETTINGS_NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard/settings/general", label: "General", icon: SlidersHorizontal },
  { href: "/dashboard/settings/brand", label: "Brand", icon: Palette },
  { href: "/dashboard/settings/domains", label: "Domains", icon: Globe },
  { href: "/dashboard/settings/embeds", label: "Embeds", icon: Code2 },
  { href: "/dashboard/settings/delivery", label: "Delivery", icon: PackageCheck },
  { href: "/dashboard/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings/payouts", label: "Payouts", icon: Banknote },
];

export function SettingsNav({ hints }: { hints?: Partial<Record<string, ReactNode>> }) {
  const pathname = usePathname();
  const hintFor = (href: string) => hints?.[href.split("/").pop() ?? ""];

  return (
    <>
      {/* desktop — vertical list, mirrors dashboard-nav rows */}
      <nav aria-label="Settings sections" className="hidden w-44 shrink-0 flex-col gap-0.5 sm:flex">
        {SETTINGS_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const hint = hintFor(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                active ? "bg-surface-2 font-medium text-ink" : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {hint}
            </Link>
          );
        })}
      </nav>

      {/* mobile — horizontal chip scroller, mirrors the project tab strip */}
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 sm:hidden"
      >
        {SETTINGS_NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const hint = hintFor(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-transparent bg-ink text-background"
                  : "border-hairline bg-surface-1 text-ink-subtle hover:text-ink"
              }`}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {item.label}
              {hint}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@webcules/ui/lib/utils";
import { LIBRARY } from "@/components/library/manifest.gen";

const ITEMS: { name: string; href: string; exact?: boolean }[] = [
  { name: "Overview", href: "/components", exact: true },
  ...LIBRARY.filter((c) => c.phase === "approved").map((c) => ({
    name: c.title,
    href: `/components/${c.name}`,
  })),
];

/** Just the nav list — used by the desktop aside and the mobile drawer. */
export function ComponentsSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <>
      <p className="mb-3 px-3 text-xs font-medium uppercase tracking-widest text-white/35">
        Components
      </p>
      <nav className="space-y-1">
        {ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "block rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-white/10 font-medium text-white"
                  : "text-white/50 hover:bg-white/5 hover:text-white",
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <p className="mt-6 px-3 text-xs leading-relaxed text-white/30">
        Copy-pastable components, used in production on Webcules sites.
      </p>
    </>
  );
}

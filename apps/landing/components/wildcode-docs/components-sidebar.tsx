"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@webcules/ui/lib/utils";

const ITEMS: { name: string; href: string; exact?: boolean }[] = [
  { name: "Overview", href: "/components", exact: true },
  { name: "WildcodeField", href: "/components/wildcode-field" },
];

export function ComponentsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-28 hidden h-fit w-56 shrink-0 lg:block">
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
    </aside>
  );
}

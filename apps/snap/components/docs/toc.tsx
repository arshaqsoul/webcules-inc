"use client";

/* Right-hand "on this page" rail with scroll-spy — Linear's docs inner
 * navigation: H2 entries darker, H3 indented and muted, a 1px rail with the
 * active segment highlighted. Hidden below xl (Linear hides it there too). */
import { useEffect, useState } from "react";

import type { TocItem } from "@/lib/docs/extract";

export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (!items.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      let current = items[0]?.id ?? null;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 100) current = item.id;
        else break;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [items]);

  if (items.length < 2) return null;

  return (
    <aside className="sticky top-16 hidden max-h-[calc(100vh-4rem)] w-[240px] shrink-0 overflow-y-auto py-12 pr-2 xl:block" aria-label="On this page">
      <div className="border-l border-hairline">
        <ul className="flex flex-col">
          {items.map((item) => {
            const isActive = item.id === active;
            return (
              <li key={item.id} className="relative">
                {isActive && <span className="absolute -left-px top-0 h-full w-[2px] bg-ink" aria-hidden />}
                <a
                  href={`#${item.id}`}
                  aria-current={isActive ? "location" : undefined}
                  className={`block py-[5px] text-[13px] leading-[1.45] transition-colors ${
                    item.level === 3 ? "pl-7" : "pl-4"
                  } ${isActive ? "font-medium text-ink" : item.level === 3 ? "text-ink-tertiary hover:text-ink-muted" : "text-ink-subtle hover:text-ink"}`}
                >
                  {item.title}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

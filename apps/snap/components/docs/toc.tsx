"use client";

/* Right-hand "on this page" rail with scroll-spy — Linear's docs inner
 * navigation: a single 2px indicator that SLIDES between sections, H2
 * entries darker, H3 indented and muted, rail fixed 240px with a ~76px gap
 * from the article column. Hidden below xl.
 *
 * Click-activation (the standard docs behavior): clicking an entry sets it
 * active immediately and suppresses the spy until the click-scroll settles —
 * no threshold math can guess intent at max scroll, so the click wins and
 * the spy resumes only on the user's next manual scroll. */
import { useEffect, useRef, useState } from "react";

import type { TocItem } from "@/lib/docs/extract";

export function DocsToc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const linkRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  /** Timestamp until which spy updates are suppressed (click-scroll in flight). */
  const clickLockRef = useRef(0);

  useEffect(() => {
    if (!items.length) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      if (performance.now() < clickLockRef.current) return;
      let current: string | null = null;
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 100) current = item.id;
        else break;
      }
      // At max scroll a bottom-of-page target can never cross the top
      // threshold (the page runs out of scroll first). When the threshold
      // section has scrolled off the top, take the last heading in the upper
      // 70% of the viewport — bounded so a main title *below* the section
      // you're reading can never steal the highlight.
      if (current) {
        const el = document.getElementById(current);
        if (el && el.getBoundingClientRect().top < 0) {
          const atBottom =
            window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
          if (atBottom) {
            let last = current;
            for (const item of items) {
              const e2 = document.getElementById(item.id);
              if (e2 && e2.getBoundingClientRect().top < window.innerHeight * 0.7) last = item.id;
            }
            current = last;
          }
        }
      }
      setActive(current ?? items[0]?.id ?? null);
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

  // One continuous indicator: measured from the active link, animated with a
  // compositor transform so it GLIDES to the next section as you scroll.
  useEffect(() => {
    const el = active ? linkRefs.current.get(active) : null;
    if (!el) {
      setIndicator(null);
      return;
    }
    setIndicator({ top: el.offsetTop, height: el.offsetHeight });
  }, [active, items]);

  if (items.length < 2) return null;

  const onNavClick = (item: TocItem) => {
    setActive(item.id);
    // Hold the spy off through the smooth scroll; it resumes on the next
    // manual scroll after the lock expires.
    clickLockRef.current = performance.now() + 1200;
  };

  return (
    <aside
      className="sticky top-16 hidden max-h-[calc(100vh-4rem)] w-[240px] shrink-0 overflow-y-auto py-12 xl:ml-[76px] xl:block"
      aria-label="On this page"
    >
      <div className="relative border-l border-hairline">
        {indicator && (
          <span
            aria-hidden
            className="absolute left-[-1px] top-0 w-[2px] bg-ink transition-transform duration-300 ease-out will-change-transform"
            style={{ transform: `translateY(${indicator.top}px)`, height: indicator.height }}
          />
        )}
        <ul className="flex flex-col">
          {items.map((item) => {
            const isActive = item.id === active;
            return (
              <li key={item.id}>
                <a
                  ref={(el) => {
                    if (el) linkRefs.current.set(item.id, el);
                    else linkRefs.current.delete(item.id);
                  }}
                  href={`#${item.id}`}
                  onClick={() => onNavClick(item)}
                  aria-current={isActive ? "location" : undefined}
                  className={`block py-[5px] text-[13px] leading-[1.45] transition-colors duration-200 ${
                    item.level === 3 ? "pl-7" : "pl-4"
                  } ${
                    isActive
                      ? "font-medium text-ink"
                      : item.level === 3
                        ? "text-ink-tertiary hover:text-ink-muted"
                        : "text-ink-subtle hover:text-ink"
                  }`}
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

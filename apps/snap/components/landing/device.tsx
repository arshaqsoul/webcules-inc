"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInView } from "framer-motion";

/**
 * Looping clock for product replays. Ticks only while the element is on
 * screen, so a page full of "screen recordings" costs nothing off-viewport.
 */
export function useLoop(steps: number, ms: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % steps), ms);
    return () => window.clearInterval(id);
  }, [inView, steps, ms]);
  return { ref, step, inView };
}

/**
 * Lays children out on a fixed design canvas (w x h) and scales the whole
 * canvas to the container width - every replay is authored once at 960x600
 * and stays pixel-identical from a phone to a 4K monitor.
 */
export function Scaled({
  w,
  h,
  children,
  className = "",
}: {
  w: number;
  h: number;
  children: ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setScale(el.clientWidth / w);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={box} className={`relative w-full overflow-hidden ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: w, height: h, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}

export function Laptop({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div className="rounded-[14px] bg-[#16171b] p-[7px] pb-[8px] shadow-[0_40px_80px_-20px_rgb(0,0,0,0.55),0_0_0_1px_rgb(255,255,255,0.08)_inset] sm:rounded-[18px] sm:p-[9px]">
        <div aria-hidden className="absolute left-1/2 top-[3px] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-white/25 sm:top-[4px]" />
        <div className="overflow-hidden rounded-[6px] bg-background sm:rounded-[8px]">{children}</div>
      </div>
      <div
        aria-hidden
        className="mx-auto h-[7px] w-[112%] -translate-x-[5.4%] rounded-b-[14px] bg-gradient-to-b from-[#2a2c33] to-[#14151a] shadow-[0_10px_20px_-8px_rgb(0,0,0,0.5)]"
        style={{ width: "112%", marginLeft: "-6%" }}
      />
    </div>
  );
}

export function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-[38px] bg-[#16171b] p-[7px] shadow-[0_40px_80px_-20px_rgb(0,0,0,0.6),0_0_0_1px_rgb(255,255,255,0.1)_inset] ${className}`}
    >
      <div aria-hidden className="absolute left-1/2 top-[14px] z-20 h-[17px] w-[56px] -translate-x-1/2 rounded-full bg-black" />
      <div className="relative overflow-hidden rounded-[32px] bg-background">{children}</div>
    </div>
  );
}

/** Shared app chrome for every laptop replay - sidebar + title bar at 960x600. */
export function AppCanvas({
  active,
  title,
  right,
  children,
}: {
  active: "Pipeline" | "Calendar" | "Galleries" | "Contracts" | "Payments";
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const items = ["Pipeline", "Calendar", "Galleries", "Contracts", "Payments"] as const;
  return (
    <div className="flex h-[600px] w-[960px] bg-background text-ink">
      <aside className="flex w-[176px] shrink-0 flex-col gap-1 border-r border-hairline bg-surface-1 px-3 py-4">
        <div className="mb-4 flex items-center gap-2 px-2">
          <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-primary text-white">
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
              <circle cx="12" cy="12" r="9.75" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 8.2 15.65 21.04M15.29 10.1 6 19.68M15.29 13.9 2.34 10.64M12 15.8 8.35 2.96M8.71 13.9 18 4.32M8.71 10.1 21.66 13.36"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="text-[13px] font-semibold">Willow &amp; Pine</span>
        </div>
        {items.map((it) => (
          <div
            key={it}
            className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-medium ${
              it === active ? "bg-surface-3 text-ink" : "text-ink-subtle"
            }`}
          >
            {it}
          </div>
        ))}
        <div className="mt-auto rounded-md border border-hairline bg-background px-2.5 py-2 text-[11px] text-ink-subtle">
          <div className="mb-1 flex justify-between">
            <span>Storage</span>
            <span>8.4 / 20 GB</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-[42%] rounded-full bg-primary" />
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b border-hairline px-6">
          <span className="text-[15px] font-semibold tracking-[-0.2px]">{title}</span>
          {right}
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

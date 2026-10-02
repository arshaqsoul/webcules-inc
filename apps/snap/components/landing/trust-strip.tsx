"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";

import { FadeUp } from "./text-reveal";

const STATS = [
  { to: 0, suffix: "%", prefix: "", label: "commission on client payments" },
  { to: 20, suffix: " GB", prefix: "", label: "free storage, forever" },
  { to: 5, suffix: "", prefix: "", label: "live galleries on the free plan" },
  { to: 1, suffix: "", prefix: "", label: "login for booking, contracts, galleries and payouts" },
];

function Count({ to, prefix, suffix }: { to: number; prefix: string; suffix: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {v}
      {suffix}
    </span>
  );
}

/** Numbers that are literally true of the free plan (see lib/plans-data.ts) - no invented customer counts. */
export function TrustStrip() {
  return (
    <section aria-label="Snap at a glance" className="border-b border-hairline bg-background">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        {STATS.map((s, i) => (
          <FadeUp key={s.label} delay={i * 0.06} className="text-center md:border-l md:border-hairline md:first:border-l-0">
            <div className="snap-display text-5xl leading-none text-ink sm:text-6xl">
              <Count to={s.to} prefix={s.prefix} suffix={s.suffix} />
            </div>
            <p className="mx-auto mt-2 max-w-[180px] text-[12px] leading-snug text-ink-subtle">{s.label}</p>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}

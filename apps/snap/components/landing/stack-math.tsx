"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";
import { Check, X } from "lucide-react";

import { FadeUp } from "./text-reveal";

/**
 * The money argument, honest math straight from the competitive analysis:
 * the CRM + gallery stack runs $52–100/mo plus commission exposure; Snap is
 * $29 with 0% commission on anything a client pays.
 */
export function StackMath() {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const [stackTotal, setStackTotal] = useState(0);
  const [snapTotal, setSnapTotal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, 100, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        setStackTotal(Math.round((v / 100) * 76));
        setSnapTotal(Math.round((v / 100) * 29));
      },
    });
    return () => controls.stop();
  }, [inView]);

  return (
    <section className="border-y border-hairline bg-surface-1 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeUp className="mx-auto mb-12 max-w-2xl text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">The math</p>
          <h2 className="snap-display mt-3 text-4xl leading-[1.05] text-ink sm:text-6xl">
            The stack tax, <em className="italic">retired.</em>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-ink-subtle sm:text-base">
            The typical studio pays for a CRM <em>and</em> a gallery app - and still
            hands over a commission on every print sale. Do the math once:
          </p>
        </FadeUp>

        <div ref={ref} className="grid gap-4 md:grid-cols-2">
          <FadeUp className="rounded-2xl border border-hairline bg-background p-6 sm:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-ink-tertiary">The old stack</p>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                ["CRM - Dubsado, HoneyBook…", "$20–36/mo"],
                ["Galleries - Pixieset, Pic-Time…", "$20–42/mo"],
                ["E-sign, questionnaires, proofs", "$0–20/mo"],
              ].map(([label, price]) => (
                <li key={label} className="flex items-center justify-between gap-4 text-ink-muted">
                  <span className="flex items-center gap-2.5">
                    <X className="h-4 w-4 text-destructive/70" /> {label}
                  </span>
                  <span className="font-mono text-[13px] text-ink">{price}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 text-sm">
                <span className="flex items-center gap-2.5 text-ink-muted">
                  <X className="h-4 w-4 text-destructive/70" /> Commission on your sales
                </span>
                <span className="font-mono text-[13px] font-semibold text-destructive">up to 15%</span>
              </li>
            </ul>
            <div className="mt-6 border-t border-hairline pt-5">
              <p className="text-3xl font-semibold tracking-[-0.8px] text-ink tabular-nums">
                ${stackTotal === 76 ? "52–100" : stackTotal >= 40 ? "52–100" : "…"}
                <span className="text-sm font-normal text-ink-subtle"> /mo</span>
              </p>
              <p className="mt-1 text-xs text-ink-tertiary">Two logins. Two bills. Zero of it talking to each other.</p>
            </div>
          </FadeUp>

          <FadeUp delay={0.12} className="relative overflow-hidden rounded-2xl border border-lavender/40 bg-background p-6 ring-1 ring-primary/15 sm:p-8">
            <span className="absolute right-5 top-5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
              One bill
            </span>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-primary">With Snap</p>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "CRM, pipeline, booking, questionnaires",
                "Vault-grade client galleries + RAW Vault",
                "Contracts, e-sign, invoices, reminders",
                "White-label: your brand, your domain",
              ].map((label) => (
                <li key={label} className="flex items-center gap-2.5 text-ink-muted">
                  <Check className="h-4 w-4 text-success-text" /> {label}
                </li>
              ))}
              <li className="flex items-center gap-2.5 text-sm font-medium text-ink">
                <Check className="h-4 w-4 text-success-text" /> 0% commission - payouts to your own Stripe
              </li>
            </ul>
            <div className="mt-6 border-t border-hairline pt-5">
              <p className="text-3xl font-semibold tracking-[-0.8px] text-ink tabular-nums">
                ${snapTotal}
                <span className="text-sm font-normal text-ink-subtle"> /mo</span>
              </p>
              <p className="mt-1 text-xs text-ink-tertiary">One login. Every job. What clients pay you stays yours.</p>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.15} className="mx-auto mt-6 max-w-3xl rounded-2xl border border-hairline bg-background p-5 text-center">
          <p className="text-sm leading-relaxed text-ink-muted">
            On a competitor's free tier, a <strong className="font-semibold text-ink">$2,400 print sale</strong> keeps{" "}
            <strong className="font-semibold text-destructive">$360</strong> for the platform. On Snap it keeps{" "}
            <strong className="font-semibold text-success-text">$2,400</strong> - Stripe's fee, nothing else.
          </p>
        </FadeUp>
      </div>
    </section>
  );
}

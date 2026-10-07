"use client";

import Link from "next/link";

import { PricingTiers } from "@/components/pricing-tiers";
import { FadeUp } from "./text-reveal";

export function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <FadeUp className="mx-auto mb-12 max-w-2xl text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-tertiary sm:text-[11px]">Pricing</p>
        <h2 className="snap-display mt-3 text-4xl leading-[1.05] text-ink sm:text-6xl">
          Honest pricing. <em className="italic">Every tier.</em>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-sm leading-relaxed text-ink-subtle sm:text-base">
          Start free - the whole platform, 20 GB. Grow when the bookings do.
          Storage you can predict, overage at one flat rate, and zero commission
          on anything your clients pay you.
        </p>
      </FadeUp>

      <FadeUp delay={0.1}>
        <PricingTiers mode="marketing" />
      </FadeUp>

      <FadeUp delay={0.15}>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-relaxed text-ink-tertiary">
          Studio storage beyond 500 GB is $0.10/GB-month. Need 1 TB or more? Talk to us.
          Client payments run through your own Stripe account at Stripe's standard rate; that fee goes to Stripe, never to us.
        </p>
      </FadeUp>
    </section>
  );
}

"use client";

/* Full marketing-style tier cards. mode="marketing" links each CTA to its
 * signup URL; mode="onboarding" fires onChoose (checkout / dashboard) and
 * marks the current plan. Settings → Plan keeps its own dense grid but
 * sources the same TIER_CARDS data. The data itself lives in lib/tier-cards
 * (pure, testable, no React). */
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";
import { TIER_CARDS, type TierCard, type TierId } from "@/lib/tier-cards";

export { TIER_CARDS };
export type { TierCard, TierId };

/** Full marketing-style tier cards. mode="marketing" links each CTA to its
 * signup URL; mode="onboarding" fires onChoose (checkout / dashboard) and
 * marks the current plan. Settings → Plan keeps its own dense grid but
 * sources the same TIER_CARDS data. */
export function PricingTiers({
  mode,
  currentPlan = null,
  busyPlan = null,
  disabled = false,
  onChoose,
}: {
  mode: "marketing" | "onboarding";
  currentPlan?: TierId | null;
  busyPlan?: TierId | null;
  disabled?: boolean;
  onChoose?: (id: TierId) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TIER_CARDS.map((t) => (
        <div
          key={t.id}
          className={`flex flex-col rounded-[16px] border p-6 ${
            t.highlight ? "border-primary/50 bg-surface-1 ring-1 ring-primary/20" : "border-hairline bg-surface-1"
          }`}
        >
          {t.highlight && (
            <span className="mb-3 w-fit rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              Most popular
            </span>
          )}
          <h3 className="text-[15px] font-medium text-ink">{t.name}</h3>
          <p className="mt-1 text-xs text-ink-tertiary">{t.tagline}</p>
          <p className="mt-4">
            <span className="text-3xl font-semibold tracking-[-0.8px] text-ink">{t.priceLabel}</span>
            <span className="text-sm text-ink-subtle">{t.cadence}</span>
          </p>
          <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink-muted">
            {t.features.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 text-success-text">✓</span>
                {f}
              </li>
            ))}
          </ul>
          {mode === "marketing" ? (
            <Link
              href={t.href}
              className={`mt-6 rounded-md px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                t.highlight
                  ? "bg-primary text-white hover:bg-lavender-hover"
                  : "border border-hairline bg-background text-ink hover:bg-surface-2"
              }`}
            >
              {t.cta}
            </Link>
          ) : (
            <Button
              variant={t.id === currentPlan ? "outline" : t.highlight ? "default" : "outline"}
              disabled={disabled || Boolean(busyPlan)}
              onClick={() => onChoose?.(t.id)}
              className="mt-6"
            >
              {busyPlan === t.id
                ? "Opening checkout…"
                : t.id === currentPlan
                  ? "Current plan — continue"
                  : t.id === "free"
                    ? "Start on Free"
                    : `Subscribe to ${t.name}`}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

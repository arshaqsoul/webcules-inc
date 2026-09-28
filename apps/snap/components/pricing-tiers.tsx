"use client";

/* The single place Snap's public pricing lives. Every surface that shows
 * tiers — the landing page, /onboarding/plan, and Settings → Plan — reads
 * TIER_CARDS here, so a tier change is one edit. Enforcement limits stay in
 * lib/plans.ts (the single source of truth); this mirrors them for display
 * because that server module pulls in the DB and can't be imported from
 * client components. */
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";

export type TierId = "free" | "lite" | "studio" | "pro";

export type TierCard = {
  id: TierId;
  name: string;
  /** Numeric price for dialogs and dense layouts (Settings → Plan). */
  price: number;
  priceLabel: string;
  cadence: string;
  tagline: string;
  /** Compact spec line for dense surfaces ("20GB · RAW trial · 5 galleries"). */
  spec: string;
  features: string[];
  highlight: boolean;
  cta: string;
  href: string;
};

export const TIER_CARDS: TierCard[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    priceLabel: "$0",
    cadence: "",
    tagline: "Try the whole thing",
    spec: "20GB · RAW trial · 5 galleries",
    features: ["20 GB (incl. 3 GB RAW trial)", "Unlimited bookings", "5 active galleries", "Full CRM + pipeline"],
    highlight: false,
    cta: "Start free",
    href: "/signup?plan=free",
  },
  {
    id: "lite",
    name: "Lite",
    price: 15,
    priceLabel: "$15",
    cadence: "/mo",
    tagline: "For part-timers growing",
    spec: "150GB · RAW · 15 galleries",
    features: ["150 GB storage", "Unlimited RAW Vault", "15 active galleries", "Bookings + payments"],
    highlight: false,
    cta: "Start Lite",
    href: "/signup?plan=lite",
  },
  {
    id: "studio",
    name: "Studio",
    price: 29,
    priceLabel: "$29",
    cadence: "/mo",
    tagline: "The working pro's tier",
    spec: "500GB · white-label · $0.10/GB",
    features: ["500 GB, then $0.10/GB", "Unlimited galleries", "White-label everything", "RAW Vault + payment automations"],
    highlight: true,
    cta: "Start Studio",
    href: "/signup?plan=studio",
  },
  {
    id: "pro",
    name: "Pro",
    price: 59,
    priceLabel: "$59",
    cadence: "/mo",
    tagline: "Studios & teams",
    spec: "2TB · white-label · $0.10/GB",
    features: ["2 TB, then $0.10/GB", "Teams & permissions", "Contracts & e-sign", "Priority support"],
    highlight: false,
    cta: "Start Pro",
    href: "/signup?plan=pro",
  },
];

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

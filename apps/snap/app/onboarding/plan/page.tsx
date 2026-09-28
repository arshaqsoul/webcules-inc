"use client";

/* Onboarding step 2 — pick your plan (Linear-style: account first, plan
 * next, dashboard last). Paid tiers open a Stripe Checkout subscription
 * (activated by the webhook on completion); Free goes straight in. This is
 * also where a checkout failure from signup lands so nothing dead-ends. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";

type PlanId = "free" | "lite" | "studio" | "pro";

/* Mirrors lib/plans.ts (kept local — the server module pulls in the DB). */
const TIERS: {
  id: PlanId;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlight: boolean;
}[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    tagline: "Try the whole thing",
    features: ["20 GB (JPG)", "5 active galleries", "1 active booking", "Full CRM + pipeline"],
    highlight: false,
  },
  {
    id: "lite",
    name: "Lite",
    price: "$15",
    tagline: "For part-timers growing",
    features: ["150 GB storage", "RAW Vault included", "15 active galleries", "Bookings + payments"],
    highlight: false,
  },
  {
    id: "studio",
    name: "Studio",
    price: "$29",
    tagline: "The working pro's tier",
    features: ["500 GB, then $0.10/GB", "Unlimited galleries", "White-label everything", "RAW Vault + payment automations"],
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$59",
    tagline: "Studios & teams",
    features: ["2 TB, then $0.10/GB", "Teams & permissions", "Contracts (coming)", "Priority support"],
    highlight: false,
  },
];

export default function PlanOnboardingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<PlanId>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/studio/plan")
      .then((r) => (r.ok ? (r.json() as Promise<{ plan?: string }>) : null))
      .then((j) => {
        if (j?.plan && ["free", "lite", "studio", "pro"].includes(j.plan)) setCurrent(j.plan as PlanId);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function choose(plan: PlanId) {
    if (busy) return;
    setError(null);
    if (plan === "free") {
      router.push("/dashboard");
      return;
    }
    setBusy(plan);
    try {
      const res = await fetch("/api/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && body.url) {
        window.location.href = body.url;
        return;
      }
      setError(
        body.error === "unauthorized"
          ? "Your session expired — sign in again and pick your plan from Settings."
          : "Couldn't start checkout — try again in a moment, or start on Free and upgrade from Settings.",
      );
    } catch {
      setError("Network error — try again.");
    }
    setBusy(null);
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-6 py-12">
      <div className="mb-8 flex items-center gap-2">
        <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
        <span className="text-sm font-medium text-ink">Snap</span>
      </div>
      <div className="w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.6px] text-ink">Choose your plan</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-subtle">
            Your studio is ready. Pick a tier — start on Free and upgrade anytime, or subscribe now
            (secure Stripe checkout, cancel whenever). Your work is never deleted when plans change.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TIERS.map((t) => (
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
              <h2 className="text-[15px] font-medium text-ink">{t.name}</h2>
              <p className="mt-1 text-xs text-ink-tertiary">{t.tagline}</p>
              <p className="mt-4">
                <span className="text-3xl font-semibold tracking-[-0.8px] text-ink">{t.price}</span>
                <span className="text-sm text-ink-subtle">{t.id === "free" ? "" : "/mo"}</span>
              </p>
              <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm text-ink-muted">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-success-text">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                variant={t.id === current ? "outline" : t.highlight ? "default" : "outline"}
                disabled={Boolean(busy) || loading}
                onClick={() => void choose(t.id)}
                className="mt-6"
              >
                {busy === t.id
                  ? "Opening checkout…"
                  : t.id === current
                    ? "Current plan — continue"
                    : t.id === "free"
                      ? "Start on Free"
                      : `Subscribe to ${t.name}`}
              </Button>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
        <p className="mt-6 text-center text-xs text-ink-tertiary">
          Changing your mind later is one click in{" "}
          <Link href="/dashboard/settings" className="underline underline-offset-2">
            Settings → Plan
          </Link>
          . Downgrades apply at the end of your billing period; nothing you've uploaded is ever deleted.
        </p>
      </div>
    </main>
  );
}

"use client";

/* Onboarding step 2 — pick your plan (Linear-style: account first, plan
 * next, dashboard last). Paid tiers open a Stripe Checkout subscription
 * (activated by the webhook on completion); Free goes straight in. This is
 * also where a checkout failure from signup lands so nothing dead-ends.
 * Tier cards come from the shared pricing component (one source). */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PricingTiers, type TierId } from "@/components/pricing-tiers";
import { SnapMark } from "@/components/snap-mark";

export default function PlanOnboardingPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<TierId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<TierId>("free");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/studio/plan")
      .then((r) => (r.ok ? (r.json() as Promise<{ plan?: string }>) : null))
      .then((j) => {
        if (j?.plan && ["free", "lite", "studio", "pro"].includes(j.plan)) setCurrent(j.plan as TierId);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  async function choose(plan: TierId) {
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
        <SnapMark className="h-6 w-6" />
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
        <PricingTiers mode="onboarding" currentPlan={current} busyPlan={busy} disabled={loading} onChoose={(id) => void choose(id)} />
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

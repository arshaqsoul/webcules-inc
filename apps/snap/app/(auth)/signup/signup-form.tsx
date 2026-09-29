"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Input } from "@webcules/ui/components/input";
import { Label } from "@webcules/ui/components/label";

import { authClient, signUp } from "@/lib/auth-client";

type PlanChoice = "free" | "lite" | "studio" | "pro";

const PLAN_INFO: Record<PlanChoice, { name: string; price: string }> = {
  free: { name: "Free", price: "$0" },
  lite: { name: "Lite", price: "$15/mo" },
  studio: { name: "Studio", price: "$29/mo" },
  pro: { name: "Pro", price: "$59/mo" },
};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function SignupForm({ initialPlan }: { initialPlan: PlanChoice | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending("Creating your account…");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    const { error: signUpError } = await signUp.email({
      name: String(form.get("name") ?? ""),
      email,
      password,
    });
    if (signUpError) {
      setPending(null);
      setError(signUpError.message || "Sign up failed.");
      return;
    }

    // Create the studio organization + profile, then activate it. Studios
    // always START on Free — a chosen paid tier only activates after the
    // Stripe webhook confirms the subscription, so an abandoned checkout
    // never leaves an unpaid "paid" studio.
    setPending("Setting up your studio…");
    const studioRes = await fetch("/api/studio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studioName: String(form.get("studioName") ?? ""),
        timezone: detectTimezone(),
        contactEmail: email,
        plan: "free",
      }),
    });
    if (!studioRes.ok) {
      setPending(null);
      setError("Account created, but studio setup failed — continue from onboarding.");
      router.push("/onboarding");
      return;
    }
    const studio = (await studioRes.json()) as { organizationId: string };
    await authClient.organization.setActive({ organizationId: studio.organizationId });

    // Paid tier chosen (usually from the pricing page) → straight into
    // Stripe checkout; the webhook activates the plan on completion.
    if (initialPlan && initialPlan !== "free") {
      setPending("Opening secure checkout…");
      try {
        const res = await fetch("/api/studio/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: initialPlan }),
        });
        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (res.ok && body.url) {
          window.location.href = body.url;
          return;
        }
        // Checkout failed (e.g. billing hiccup) — don't strand them: they
        // land on the plan step and can retry.
        router.push("/onboarding/plan");
        return;
      } catch {
        router.push("/onboarding/plan");
        return;
      }
    }

    // Explicit Free choice from pricing → dashboard; organic signup picks
    // a tier on the next step.
    setPending(null);
    router.push(initialPlan === "free" ? "/dashboard" : "/onboarding/plan");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <span aria-hidden className="inline-block h-4 w-4 rounded-[4px] bg-primary" />
          <span className="text-sm font-medium text-ink">Snap</span>
        </div>
        <div className="rounded-[12px] border border-hairline bg-surface-1 p-6">
          <h1 className="text-lg font-semibold text-ink">Create your studio</h1>
          <p className="mt-1 text-sm text-ink-subtle">
            Branded booking, galleries, and payments — under your brand.
          </p>
          {initialPlan && (
            <p className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-ink-muted">
              Plan selected: <span className="font-medium text-ink">{PLAN_INFO[initialPlan].name}</span> (
              {PLAN_INFO[initialPlan].price}
              {initialPlan === "free" ? " — upgrade anytime" : ", billed securely through Stripe after setup"})
              {initialPlan !== "free" && (
                <>
                  {" · "}
                  <Link href="/signup" className="text-primary hover:text-lavender-hover">
                    choose a different plan
                  </Link>
                </>
              )}
            </p>
          )}
          <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
              <p className="text-xs text-ink-tertiary">At least 8 characters.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="studioName">Studio name</Label>
              <Input id="studioName" name="studioName" placeholder="e.g. Willow & Pine Photography" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={Boolean(pending)} className="w-full">
              {pending ?? (initialPlan && initialPlan !== "free" ? `Continue — ${PLAN_INFO[initialPlan].name} plan` : "Create studio")}
            </Button>
            <p className="text-center text-xs text-ink-tertiary">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">Terms</Link> and{" "}
              <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
            </p>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-ink-subtle">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:text-lavender-hover">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

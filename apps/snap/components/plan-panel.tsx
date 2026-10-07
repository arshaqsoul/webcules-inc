"use client";

/* Settings → Plan (WEB-149/151/152) — current tier, live usage vs caps with
 * the overage zone, upgrade/downgrade via Stripe checkout (in-place swap when
 * already subscribed), portal for card/invoice self-service, and locked
 * feature affordances. */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@webcules/ui/components/dialog";
import { useConfirm } from "@/components/confirm-provider";
import { DocHint } from "@/components/doc-hint";
import { PRO_CARD, TEAMS_CTA, TIER_CARDS } from "@/lib/tier-cards";
import { planDef } from "@/lib/plans-data";

type PlanStatus = {
  plan: "free" | "lite" | "studio" | "pro";
  planName: string;
  planStatus: string;
  priceMonthlyUsd: number;
  storageUsedBytes: number;
  storageCapBytes: number;
  hardLockBytes: number;
  storagePct: number;
  inOverageZone: boolean;
  atHardLock: boolean;
  fileCount: number;
  fileCap: number;
  monthUploadBytes: number;
  monthlyUploadBytes: number;
  activeGalleries: number;
  maxActiveGalleries: number | null;
  activeBookings: number;
  maxActiveBookings: number | null;
  jpgOnly: boolean;
  rawAllowed: boolean;
  whiteLabel: boolean;
  hasSubscription: boolean;
  planPeriodEnd: number | null;
  pendingPlan: string | null;
  rawTrialBytes: number | null;
  rawBytesUsed: number;
  downgradeReversible: boolean;
  /** WEB-217 multi-studio family. */
  familyStudioCount: number;
  maxLinkedStudios: number | null;
  isFamilyChild: boolean;
  /** WEB-224 custom domains. */
  maxCustomDomains: number;
  activeCustomDomains: number;
  addonCustomDomain: boolean;
  pendingAddonRemoval: boolean;
  /** WEB-245: white-label toggle state (chip shows on/off + links Brand). */
  removeBranding: boolean;
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

function fmtBytes(b: number): string {
  if (b >= TB) return `${(b / TB).toFixed(b / TB >= 10 ? 0 : 1)}TB`;
  if (b >= GB) return `${(b / GB).toFixed(b / GB >= 10 ? 0 : 1)}GB`;
  return `${Math.max(1, Math.round(b / 1024 / 1024))}MB`;
}

/* Tier identity (names, prices, spec lines) comes from the shared tier data —
 * one source across landing, onboarding, and this panel. WEB-329: Pro is not
 * offered here; it only appears as the current plan for studios already on it. */
const PUBLIC_PLANS = TIER_CARDS;

export function PlanPanel({ returnHint }: { returnHint?: string }) {
  const confirm = useConfirm();
  const [st, setSt] = useState<PlanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  // Reversal choice (upgraded this cycle, now stepping down): Slack-style
  // explicit pick between switch-back-now (prorated credit) and next-cycle.
  const [reversal, setReversal] = useState<string | null>(null);
  // Public ladder, plus Pro only when this studio is on it (shown as current).
  const ALL_PLANS = st?.plan === "pro" ? [...PUBLIC_PLANS, PRO_CARD] : PUBLIC_PLANS;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/plan");
      if (res.ok) setSt((await res.json()) as PlanStatus);
    } catch { /* cached render stands */ }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The checkout "welcome aboard" hint is a one-shot: strip the ?plan=
  // marker so refreshes and later in-place changes don't keep showing it.
  useEffect(() => {
    if (returnHint === "return" && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("plan")) {
        url.searchParams.delete("plan");
        window.history.replaceState(null, "", url);
      }
    }
  }, [returnHint]);

  function fmtUsd(minor: number): string {
    return `$${(Math.abs(minor) / 100).toFixed(2)}`;
  }

  function periodEndDate(): string | null {
    if (!st?.planPeriodEnd) return null;
    return new Date(st.planPeriodEnd * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  async function submit(plan: string, timing: "now" | "cycle") {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, timing }),
      });
      const result = (await res.json().catch(() => ({}))) as { url?: string; mode?: string; message?: string; error?: string };
      if (res.ok && result.url) {
        window.location.href = result.url; // Stripe checkout
      } else if (res.ok) {
        setNotice(result.message ?? (result.mode === "scheduled" ? "Scheduled — the new plan starts at the end of your billing period." : "Plan updated."));
        void refresh();
      } else {
        setNotice("Couldn't change the plan — try again in a moment.");
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy(false);
  }

  /** WEB-231: subscribe/cancel the $5/mo custom-domain add-on on the
   * existing subscription (one bill — never a second subscription). */
  async function addon(enable: boolean) {
    if (!st) return;
    if (!enable) {
      const ok = await confirm({
        title: "Cancel the domain add-on?",
        body: "It stays active until the end of your billing period (links keep working), then your bill drops by $5/mo. Your domain settings are preserved.",
        confirmLabel: "Cancel add-on",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/studio/plan/addon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setNotice(body.message ?? (res.ok ? "Done." : "Couldn't reach Stripe — try again."));
      if (res.ok) await refresh();
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy(false);
  }

  async function choose(plan: string) {
    if (plan === st?.plan) return;
    if (!st) return;
    const target = ALL_PLANS.find((p) => p.id === plan);
    if (!target) return;

    if (plan === "free") {
      const ok = st.hasSubscription
        ? await confirm({
            title: "Downgrade to Free?",
            body: `Your subscription cancels at the end of the current billing period — ${st.planName} keeps working until then, nothing further is charged, and your files are never deleted.`,
          })
        : await confirm({
            title: "Move to Free?",
            body: "You have no active subscription, so this takes effect immediately. Your files are never deleted.",
          });
      if (ok) await submit(plan, "cycle");
      return;
    }

    if (!st.hasSubscription || st.plan === "free") {
      // First subscription — checkout, nothing to prorate.
      const ok = await confirm({
        title: `Start ${target.name}?`,
        body: `You don't have an active subscription yet — this opens Stripe checkout to start ${target.name} at $${target.price}/mo from today. Nothing is owed for your current plan.`,
      });
      if (ok) await submit(plan, "cycle");
      return;
    }

    if (target.price < st.priceMonthlyUsd) {
      // Downgrade. Industry default: next cycle, nothing charged. When the
      // current tier was adopted THIS cycle (an upgrade the user may be
      // rethinking), offer the instant prorated switch-back explicitly.
      if (st.downgradeReversible) {
        setReversal(plan);
        return;
      }
      const ok = await confirm({
        title: `Switch to ${target.name}?`,
        body: `The $${target.price}/mo price starts on your next billing cycle — nothing is charged now, and ${st.planName} keeps working until then.`,
      });
      if (ok) await submit(plan, "cycle");
      return;
    }

    // Upgrade: show the exact prorated amount Stripe will charge now.
    let extra = "";
    try {
      const res = await fetch("/api/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preview: plan }),
      });
      if (res.ok) {
        const p = (await res.json()) as { ok: boolean; netMinor?: number };
        if (p.ok && typeof p.netMinor === "number") {
          extra = ` Charged now: ${fmtUsd(p.netMinor)} (prorated for the rest of this cycle).`;
        }
      }
    } catch { /* preview is best-effort */ }
    const ok = await confirm({
      title: `Upgrade to ${target.name}?`,
      body: `Switches immediately${extra || " — Stripe prorates, so you're only charged the difference for the rest of this cycle."} Your next invoice is $${target.price}/mo.`,
    });
    if (ok) await submit(plan, "cycle");
  }

  async function openPortal() {
    setBusy(true);
    try {
      const res = await fetch("/api/studio/plan/portal", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { url?: string };
      if (res.ok && body.url) window.open(body.url, "_blank", "noreferrer");
      else setNotice("Billing portal isn't available yet — subscribe first.");
    } catch { /* ignore */ }
    setBusy(false);
  }

  if (!st) {
    return (
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Plan</h2>
        <p className="mt-2 text-sm text-ink-subtle">Checking your plan…</p>
      </section>
    );
  }

  const overageNote = st.inOverageZone
    ? st.plan === "studio" || st.plan === "pro"
      ? "You're in the overage zone — $0.10/GB-mo beyond your cap, billed monthly and capped at the next tier's price difference."
      : "You're over your plan's storage — upgrade to keep uploading."
    : null;

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-medium text-ink">Plan</h2>
            <DocHint slug="billing-plans" />
          </div>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {st.planName}{st.priceMonthlyUsd ? ` · $${st.priceMonthlyUsd}/mo` : ""}
            {st.planStatus !== "active" ? ` · ${st.planStatus.replace("_", " ")}` : ""}
          </p>
          {st.pendingPlan && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Switching to {st.pendingPlan} on{" "}
              {st.planPeriodEnd
                ? new Date(st.planPeriodEnd * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "your next billing cycle"}{" "}
              — nothing is charged until then.
            </p>
          )}
        </div>
        {st.hasSubscription && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void openPortal()}>
            Manage billing
          </Button>
        )}
      </div>

      {/* Usage bar with overage zone */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-ink-subtle">
          <span>Storage</span>
          <span>
            {fmtBytes(st.storageUsedBytes)} of {fmtBytes(st.storageCapBytes)}
            {st.plan === "studio" || st.plan === "pro" ? ` (lock at ${fmtBytes(st.hardLockBytes)})` : ""}
          </span>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full transition-[width] ${st.atHardLock ? "bg-destructive" : st.storagePct >= 90 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (st.storageUsedBytes / st.hardLockBytes) * 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-tertiary">
          <span>{st.storagePct}% of plan storage</span>
          <span>{st.fileCount.toLocaleString()} / {st.fileCap.toLocaleString()} files</span>
        </div>
        {overageNote && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{overageNote}</p>}
        {st.isFamilyChild && (
          <p className="mt-2 text-xs text-ink-tertiary">
            Quotas pool across your studio family — this bill covers every studio under one subscription.
          </p>
        )}
        {st.atHardLock && (
          <p className="mt-1 text-xs text-destructive">
            Uploads are locked — downloads and galleries keep working. Upgrade to continue.
          </p>
        )}
      </div>

      {/* Quota chips */}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
          {st.maxActiveGalleries === null ? "Unlimited galleries" : `${st.activeGalleries}/${st.maxActiveGalleries} galleries`}
        </span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
          {st.maxActiveBookings === null ? "Unlimited bookings" : `${st.activeBookings}/${st.maxActiveBookings} active bookings`}
        </span>
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
          {st.maxLinkedStudios === null ? "Unlimited studios" : `${st.familyStudioCount}/${st.maxLinkedStudios} studios`}
        </span>
        <a href="/dashboard/templates" className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted hover:text-ink" title="Template library">
          {planDef(st.plan).maxSessionTypes === null ? "Unlimited session types" : `Session types · up to ${planDef(st.plan).maxSessionTypes}`}
        </a>
        <a href="/dashboard/templates" className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted hover:text-ink" title="Template library">
          {planDef(st.plan).maxContractTemplates === null ? "Unlimited templates" : `Contract templates · up to ${planDef(st.plan).maxContractTemplates}`}
        </a>
        <span className={`rounded-full px-2.5 py-1 ${st.plan === "studio" || st.plan === "pro" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Custom form fields</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan !== "free" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Booking page designer</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan !== "free" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Designed galleries + client app</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan !== "free" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Slideshows w/ music + sharing</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan !== "free" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Download PIN + web size</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan === "studio" || st.plan === "pro" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Sneak peeks + approvals</span>
        <span className={`rounded-full px-2.5 py-1 ${st.plan === "studio" || st.plan === "pro" ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Per-photo insights</span>
        {st.rawAllowed ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">RAW uploads</span>
        ) : st.rawTrialBytes ? (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted">
            RAW · {fmtBytes(st.rawBytesUsed)} / {fmtBytes(st.rawTrialBytes)} trial
          </span>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-tertiary line-through">RAW uploads</span>
        )}
        {st.whiteLabel ? (
          <a
            href="/dashboard/settings/brand"
            className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-muted hover:text-ink"
            title="White-label settings"
          >
            White-label · {st.removeBranding ? "on" : "off"}
          </a>
        ) : (
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-ink-tertiary line-through">White-label</span>
        )}
        <span className={`rounded-full px-2.5 py-1 ${st.whiteLabel ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>Watermarks</span>
        <span className={`rounded-full px-2.5 py-1 ${st.maxCustomDomains > 0 ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>
          {st.plan === "pro"
            ? `Custom domains · ${st.activeCustomDomains}/2`
            : st.addonCustomDomain
              ? "Domain add-on active"
              : "Custom domain"}
        </span>
      </div>

      {/* WEB-231: Studio add-on — second item on the existing subscription. */}
      {st.plan === "studio" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-canvas p-3">
          <div>
            <p className="text-sm text-ink">Custom domain add-on · $5/mo</p>
            <p className="text-xs text-ink-tertiary">
              {st.addonCustomDomain
                ? st.pendingAddonRemoval
                  ? "Cancelling — stays active until the end of your billing period."
                  : "Active — one domain on your own hostname, billed with your plan."
                : "Put your galleries on gallery.yourstudio.com. Billed on this subscription, cancel anytime."}
            </p>
          </div>
          {st.addonCustomDomain ? (
            <Button size="sm" variant="secondary" disabled={busy || st.pendingAddonRemoval} onClick={() => void addon(false)}>
              {st.pendingAddonRemoval ? "Cancelling at period end" : "Cancel add-on"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy || !st.hasSubscription} onClick={() => void addon(true)}>
              Add for $5/mo
            </Button>
          )}
        </div>
      )}

      {returnHint === "return" && <p className="mt-2 text-xs text-success-text">Subscription active — welcome aboard.</p>}
      {notice && <p className="mt-2 text-xs text-ink-muted">{notice}</p>}

      {/* Plan cards */}
      <div className={`mt-5 grid grid-cols-2 gap-2 ${ALL_PLANS.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {ALL_PLANS.map((p) => {
          const current = p.id === st.plan;
          return (
            <div
              key={p.id}
              className={`flex flex-col gap-1.5 rounded-[12px] border p-3 ${current ? "border-primary bg-primary/5" : "border-hairline bg-canvas"}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <span className="text-xs text-ink-subtle">{p.price ? `$${p.price}/mo` : "$0"}</span>
              </div>
              <p className="text-[11px] leading-snug text-ink-tertiary">{p.spec}</p>
              {current ? (
                <span className="mt-auto text-[11px] font-medium text-primary">Current plan</span>
              ) : (
                <Button size="sm" variant={p.price === 0 ? "ghost" : "outline"} className="mt-auto" disabled={busy} onClick={() => void choose(p.id)}>
                  {p.price === 0 ? "Downgrade" : st.plan === "free" ? "Upgrade" : "Switch"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-subtle">
        {TEAMS_CTA.title}{" "}
        <a href={TEAMS_CTA.href} target="_blank" rel="noreferrer" className="font-medium text-primary underline underline-offset-2">
          {TEAMS_CTA.cta}
        </a>
      </p>
      <p className="mt-3 text-[11px] text-ink-tertiary">
        Stripe processing fees apply to payments. Upgrades apply immediately with proration; downgrades take effect on your next billing cycle — your files are never deleted.
      </p>

      {/* Same-cycle switch-back: the current tier was an upgrade made this
       * cycle, so offer the industry-standard choice — instant prorated
       * reversal, or keep the tier until the period ends. */}
      <Dialog open={reversal !== null} onOpenChange={(v) => !busy && !v && setReversal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Switch back to {ALL_PLANS.find((p) => p.id === reversal)?.name ?? reversal}?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-4 text-sm text-ink-subtle">
                <p>
                  You upgraded to {st?.planName} during this billing cycle, so you can switch back right away — the
                  unused difference is credited on your next invoice — or stay on {st?.planName} until the cycle ends
                  {periodEndDate() ? ` (${periodEndDate()})` : ""} and switch then.
                </p>
                <div className="flex flex-col gap-2">
                  <Button disabled={busy} onClick={() => { const p = reversal!; setReversal(null); void submit(p, "now"); }}>
                    {busy ? "Switching…" : "Switch back now — prorated credit on next invoice"}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => { const p = reversal!; setReversal(null); void submit(p, "cycle"); }}>
                    Keep {st?.planName} until {periodEndDate()} — switch then
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setReversal(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </section>
  );
}

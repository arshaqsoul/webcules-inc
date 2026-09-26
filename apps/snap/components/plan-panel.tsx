"use client";

/* Settings → Plan (WEB-149/151/152) — current tier, live usage vs caps with
 * the overage zone, upgrade/downgrade via Stripe checkout (in-place swap when
 * already subscribed), portal for card/invoice self-service, and locked
 * feature affordances. */
import { useCallback, useEffect, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { useConfirm } from "@/components/confirm-provider";

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
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

function fmtBytes(b: number): string {
  if (b >= TB) return `${(b / TB).toFixed(b / TB >= 10 ? 0 : 1)}TB`;
  if (b >= GB) return `${(b / GB).toFixed(b / GB >= 10 ? 0 : 1)}GB`;
  return `${Math.max(1, Math.round(b / 1024 / 1024))}MB`;
}

const ALL_PLANS: { id: PlanStatus["plan"]; name: string; price: number; tagline: string }[] = [
  { id: "free", name: "Free", price: 0, tagline: "20GB · JPG only · 1 booking · 5 galleries" },
  { id: "lite", name: "Lite", price: 15, tagline: "150GB · RAW · unlimited bookings · 15 galleries" },
  { id: "studio", name: "Studio", price: 29, tagline: "500GB · white-label · $0.10/GB overage" },
  { id: "pro", name: "Pro", price: 59, tagline: "2TB · white-label · $0.10/GB overage" },
];

export function PlanPanel({ returnHint }: { returnHint?: string }) {
  const confirm = useConfirm();
  const [st, setSt] = useState<PlanStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/studio/plan");
      if (res.ok) setSt((await res.json()) as PlanStatus);
    } catch { /* cached render stands */ }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function choose(plan: string) {
    if (plan === st?.plan) return;
    if (plan !== "free" && st?.plan !== "free" && !(await confirm({ title: `Switch to ${plan}?`, body: "Your subscription changes immediately with prorated billing." }))) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/studio/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (res.ok && body.url) {
        window.location.href = body.url; // Stripe checkout
      } else if (res.ok) {
        setNotice(body.message ?? "Plan updated.");
        void refresh();
      } else {
        setNotice("Couldn't change the plan — try again in a moment.");
      }
    } catch {
      setNotice("Network error — try again.");
    }
    setBusy(false);
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
          <h2 className="text-[15px] font-medium text-ink">Plan</h2>
          <p className="mt-0.5 text-xs text-ink-subtle">
            {st.planName}{st.priceMonthlyUsd ? ` · $${st.priceMonthlyUsd}/mo` : ""}
            {st.planStatus !== "active" ? ` · ${st.planStatus.replace("_", " ")}` : ""}
          </p>
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
        <span className={`rounded-full px-2.5 py-1 ${st.rawAllowed ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>RAW uploads</span>
        <span className={`rounded-full px-2.5 py-1 ${st.whiteLabel ? "bg-surface-2 text-ink-muted" : "bg-surface-2 text-ink-tertiary line-through"}`}>White-label</span>
      </div>

      {returnHint === "return" && <p className="mt-2 text-xs text-success-text">Subscription active — welcome aboard.</p>}
      {notice && <p className="mt-2 text-xs text-ink-muted">{notice}</p>}

      {/* Plan cards */}
      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
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
              <p className="text-[11px] leading-snug text-ink-tertiary">{p.tagline}</p>
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
      <p className="mt-3 text-[11px] text-ink-tertiary">
        Stripe processing fees apply to payments. Plan changes prorate automatically; downgrades take effect at period end — your files are never deleted.
      </p>
    </section>
  );
}

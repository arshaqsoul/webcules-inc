"use client";

/* WEB-244 white-label 7/8 — the self-serve setup card: what changes
 * (explainer), 3-step checklist, preview chips, tier states, and the
 * first-flip success moment. The toggle auto-saves (its own PATCH) so the
 * checklist ticks live. Benefits-first copy, zero jargon. */
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";

type Plan = "free" | "lite" | "studio" | "pro";

export function WhiteLabelCard({
  studioName,
  slug,
  plan,
  entitled,
  removeBranding,
  steps,
  chips,
  onGenerateAssets,
  assetsBusy,
}: {
  studioName: string;
  slug: string;
  plan: Plan;
  entitled: boolean;
  removeBranding: boolean;
  /** checklist: ① logo+assets, ② accent/font, ③ flip (computed by parent). */
  steps: { logoDone: boolean; brandDone: boolean };
  chips: { favicon: string | null; emailHeader: string | null; ogCard: string | null };
  onGenerateAssets: () => void;
  assetsBusy: boolean;
}) {
  const [on, setOn] = useState(removeBranding);
  const [busy, setBusy] = useState(false);
  const [justFlipped, setJustFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWhatChanges, setShowWhatChanges] = useState(false);
  const [wasOnAtMount] = useState(removeBranding);

  const bookingUrl = `/b/${slug}`;
  const done = [steps.logoDone, steps.brandDone, on];
  const doneCount = done.filter(Boolean).length;

  async function flip(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/studio/brand", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removeBranding: next }),
      });
      if (res.ok) {
        setOn(next);
        if (next && !wasOnAtMount) setJustFlipped(true);
        if (!next) setJustFlipped(false);
      } else if (res.status === 403) {
        setError("White-label is part of the Studio and Pro plans.");
      } else {
        setError("Couldn't save — try again.");
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  const rows: [string, string, string][] = [
    ["Gallery footer", `Delivered by ${studioName} via Snap`, `© ${studioName}`],
    ["Emails", "Snap wordmark, “via Snap”", `Your logo, “Sent by ${studioName}”`],
    ["Booking page", "“…via Snap”", "Your brand only"],
    ["Invoice PDF", "Accent header", "Your logo + accent"],
    ["Browser tab", "Snap", `{Gallery} · ${studioName}`],
  ];

  return (
    <div className="mt-5 rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-64 flex-1">
          <h3 className="text-sm font-semibold text-ink">White-label{entitled ? "" : " (Studio & Pro)"}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
            Your clients should never meet us. One switch removes Snap from every surface they touch — and you can
            flip it back any time; nothing is deleted.
          </p>
        </div>
        {plan === "pro" && entitled ? (
          <a href="/dashboard/settings/domains" className="text-xs font-medium text-primary hover:underline">
            Add your own domain →
          </a>
        ) : plan === "studio" ? (
          <a href="/dashboard/settings/billing" className="text-xs font-medium text-primary hover:underline">
            Add your own domain → Pro
          </a>
        ) : null}
      </div>

      {/* What changes? — collapsible */}
      <button
        type="button"
        onClick={() => setShowWhatChanges((v) => !v)}
        className="mt-3 text-xs font-medium text-primary hover:underline"
        aria-expanded={showWhatChanges}
      >
        {showWhatChanges ? "Hide" : "What changes?"}
      </button>
      {showWhatChanges && (
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-hairline text-left text-ink-tertiary">
              <th className="py-1.5 pr-3 font-medium">Client surface</th>
              <th className="py-1.5 pr-3 font-medium">Without</th>
              <th className={`py-1.5 font-medium ${entitled ? "text-ink" : "text-ink-tertiary/60"}`}>With</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([surface, without, withWl]) => (
              <tr key={surface} className="border-b border-hairline last:border-0">
                <td className="py-1.5 pr-3 text-ink">{surface}</td>
                <td className="py-1.5 pr-3 text-ink-subtle">{without}</td>
                <td className={`py-1.5 ${entitled ? "text-ink" : "text-ink-tertiary/60"}`}>{withWl}</td>
              </tr>
            ))}
            <tr className="border-t border-hairline">
              <td className="py-1.5 pr-3 text-ink">And with Pro</td>
              <td className="py-1.5 pr-3 text-ink-subtle">—</td>
              <td className={`py-1.5 ${entitled ? "text-ink" : "text-ink-tertiary/60"}`}>Your own domain: gallery.yourstudio.com</td>
            </tr>
          </tbody>
        </table>
      )}

      {entitled ? (
        <>
          {/* 3-step checklist */}
          <div className="mt-4 flex flex-col gap-2">
            <Step n={1} done={steps.logoDone} title="Upload your logo">
              {steps.logoDone ? (
                <>Favicon, email header and share cards generate from it automatically.</>
              ) : (
                <>Use “Upload logo” below — your favicon, email header and share cards generate from it in one click.</>
              )}
              {!steps.logoDone && (
                <Button size="sm" variant="outline" className="ml-2" onClick={onGenerateAssets} disabled={assetsBusy}>
                  {assetsBusy ? "Generating…" : "Generate brand assets"}
                </Button>
              )}
            </Step>
            <Step n={2} done={steps.brandDone} title="Set your accent color & font">
              Brand accent + the optional font stack above — they flow through galleries, emails and widgets.
            </Step>
            <Step n={3} done={on} title="Flip “Remove Snap branding”" highlight={!on && doneCount === 2}>
              <label className="mt-1 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={busy}
                  onChange={(e) => void flip(e.target.checked)}
                  className="h-4 w-4"
                  aria-label="Remove Snap branding"
                />
                <span className="text-xs text-ink">Remove Snap branding</span>
              </label>
            </Step>
          </div>

          {/* Preview chips */}
          {(chips.favicon || chips.emailHeader || chips.ogCard) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">As your client sees it</span>
              {chips.favicon && (
                // eslint-disable-next-line @next/next/no-img-element -- brand asset chip
                <img src={chips.favicon} alt="Favicon" className="h-6 w-6 rounded-sm border border-hairline" />
              )}
              {chips.emailHeader && (
                // eslint-disable-next-line @next/next/no-img-element -- brand asset chip
                <img src={chips.emailHeader} alt="Email header" className="h-6 rounded-sm border border-hairline bg-white" />
              )}
              {chips.ogCard && (
                // eslint-disable-next-line @next/next/no-img-element -- brand asset chip
                <img src={chips.ogCard} alt="Share card" className="h-10 rounded-sm border border-hairline" />
              )}
            </div>
          )}

          {/* Success moment */}
          {justFlipped && on && (
            <div className="mt-4 rounded-[12px] border border-success/30 bg-success/5 p-4">
              <p className="text-sm font-medium text-ink">Snap is now invisible to your clients.</p>
              <p className="mt-1 text-xs text-ink-subtle">Here's your branded booking page as they'll see it:</p>
              <a href={bookingUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
                {bookingUrl} →
              </a>
              <p className="mt-2 text-[11px] text-ink-tertiary">Flip it off any time; nothing is deleted.</p>
            </div>
          )}
          {!on && doneCount === 2 && !justFlipped && (
            <p className="mt-3 text-xs font-medium text-ink">You're 1 step away — flip the switch above.</p>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="min-w-52 flex-1 text-xs leading-relaxed text-ink-subtle">
            Every client surface becomes 100% yours — gallery, emails, invoices, browser tab. Included on the Studio
            and Pro plans.
          </p>
          <a href="/dashboard/settings/billing">
            <Button size="sm">Unlock on Studio</Button>
          </a>
        </div>
      )}
    </div>
  );
}

function Step({
  n,
  done,
  title,
  highlight,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-hairline"
      }`}
    >
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
          done ? "bg-success/15 text-success-text" : "bg-surface-2 text-ink-tertiary"
        }`}
        aria-hidden
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink">{title}</p>
        <div className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">{children}</div>
      </div>
    </div>
  );
}

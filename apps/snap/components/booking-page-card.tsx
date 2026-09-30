"use client";

/* Booking page designer (WEB-254) — hero/intro/FAQ/socials/thanks for
 * /b/{slug}, with the studio's live booking page as the preview (the real
 * renderer). Lite+; Free sees the upgrade path. */
import { useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { UpgradeCta } from "@/components/lite-upsell";
import type { BookingPageConfig } from "@/lib/booking-page";

export function BookingPageCard({ initial, canEdit, bookingUrl }: { initial: BookingPageConfig; canEdit: boolean; bookingUrl: string }) {
  const [cfg, setCfg] = useState<BookingPageConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [upsell, setUpsell] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const set = (patch: Partial<BookingPageConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const input = "rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary";
  const label = "flex flex-col gap-1 text-xs text-ink-subtle";

  async function save() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    setUpsell(false);
    try {
      const res = await fetch("/api/studio/booking-page", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setUpsell(!res.ok && body.error === "lite_required");
      setStatus(res.ok ? "Saved — refresh the preview to see it live." : body.error === "invalid_config" ? "Some fields are invalid — check URLs (https) and lengths." : body.error === "lite_required" ? "Booking page design is included with Lite and above." : "Couldn't save — try again.");
      if (res.ok) setPreviewKey((k) => k + 1);
    } catch {
      setStatus("Network error — try again.");
    }
    setBusy(false);
  }

  if (!canEdit) {
    return (
      <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
        <h2 className="text-[15px] font-medium text-ink">Booking page</h2>
        <p className="mb-3 mt-1 text-xs text-ink-subtle">
          Your words on the booking page — hero copy, an intro, FAQ, social links and a custom thank-you. Included with Lite and above.
        </p>
        <a href="/dashboard/settings/billing" className="text-xs font-medium text-primary hover:underline">Upgrade to Lite →</a>
      </section>
    );
  }

  return (
    <section className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <h2 className="text-[15px] font-medium text-ink">Booking page</h2>
      <p className="mb-4 mt-1 text-xs text-ink-subtle">Hero copy, intro, FAQ (no-JS collapsibles), social links and the post-booking thank-you. Empty fields keep the defaults.</p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Hero title (when no logo)
              <input value={cfg.hero.title} onChange={(e) => set({ hero: { ...cfg.hero, title: e.target.value } })} maxLength={120} placeholder={cfg.hero.title || "Studio name"} className={input} />
            </label>
            <label className={label}>
              Hero subtitle
              <input value={cfg.hero.subtitle} onChange={(e) => set({ hero: { ...cfg.hero, subtitle: e.target.value } })} maxLength={300} placeholder="Pick a time that works for you…" className={input} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Intro heading (optional)
              <input value={cfg.intro?.heading ?? ""} onChange={(e) => set({ intro: { heading: e.target.value, body: cfg.intro?.body ?? "" } })} maxLength={120} placeholder="How booking works" className={input} />
            </label>
            <label className={label}>
              Thank-you title
              <input value={cfg.thanks.title} onChange={(e) => set({ thanks: { ...cfg.thanks, title: e.target.value } })} maxLength={120} placeholder="You're booked!" className={input} />
            </label>
          </div>
          <label className={label}>
            Intro body
            <textarea value={cfg.intro?.body ?? ""} onChange={(e) => set({ intro: { heading: cfg.intro?.heading ?? "", body: e.target.value } })} maxLength={1000} className={`${input} min-h-20`} placeholder="A couple of lines about your process…" />
          </label>
          <label className={label}>
            Thank-you body (merge fields work)
            <textarea value={cfg.thanks.body} onChange={(e) => set({ thanks: { ...cfg.thanks, body: e.target.value } })} maxLength={600} className={`${input} min-h-20`} placeholder="Thank you — a confirmation email is on its way." />
          </label>

          <div>
            <p className="mb-1 text-xs font-medium text-ink">FAQ ({cfg.faq.length}/8)</p>
            <div className="flex flex-col gap-2">
              {cfg.faq.map((f, i) => (
                <div key={i} className="flex flex-col gap-1 rounded-md border border-hairline bg-canvas p-2">
                  <div className="flex gap-2">
                    <input value={f.q} onChange={(e) => set({ faq: cfg.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} maxLength={200} placeholder="Question" className={`${input} flex-1`} />
                    <Button size="sm" variant="ghost" aria-label="Remove question" onClick={() => set({ faq: cfg.faq.filter((_, j) => j !== i) })}>✕</Button>
                  </div>
                  <textarea value={f.a} onChange={(e) => set({ faq: cfg.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} maxLength={600} placeholder="Answer" className={`${input} min-h-14`} />
                </div>
              ))}
              {cfg.faq.length < 8 && (
                <Button size="sm" variant="outline" onClick={() => set({ faq: [...cfg.faq, { q: "", a: "" }] })}>+ Add question</Button>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-ink">Social links ({cfg.socials.length}/5)</p>
            <div className="flex flex-col gap-2">
              {cfg.socials.map((soc, i) => (
                <div key={i} className="flex gap-2">
                  <select value={soc.kind} onChange={(e) => set({ socials: cfg.socials.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof soc.kind } : x)) })} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-2 text-xs text-ink outline-none">
                    {["instagram", "facebook", "tiktok", "website", "email"].map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  <input value={soc.url} onChange={(e) => set({ socials: cfg.socials.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://…" className={`${input} flex-1`} />
                  <Button size="sm" variant="ghost" aria-label="Remove link" onClick={() => set({ socials: cfg.socials.filter((_, j) => j !== i) })}>✕</Button>
                </div>
              ))}
              {cfg.socials.length < 5 && (
                <Button size="sm" variant="outline" onClick={() => set({ socials: [...cfg.socials, { kind: "instagram", url: "" }] })}>+ Add link</Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={busy} size="sm">{busy ? "Saving…" : "Save booking page"}</Button>
            {status && <span className="text-xs text-ink-subtle">{status}</span>}
            {upsell && <UpgradeCta to="lite" />}
          </div>
        </div>

        <aside className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink">Live preview</h3>
            <span className="text-xs text-ink-tertiary">your real page</span>
          </div>
          <iframe key={previewKey} src={bookingUrl} title="Booking page preview" className="h-[720px] w-full rounded-[12px] border border-hairline bg-white" />
        </aside>
      </div>
    </section>
  );
}

"use client";

/* WEB-320 — the visual template picker: a grid of the 10 seeded gallery
 * templates with real photographic preview thumbnails (R2-served, lazily
 * loaded — no live iframes in the grid), category chips, live preview
 * against the studio's own photos (?template= on the preview page), and
 * one-click apply with undo (the previous design is retained client-side).
 * Applying is free for every tier; customizing beyond a seed is the page
 * builder (Lite+) — the footer note links there. */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SEED_TEMPLATES } from "@/lib/seed-templates";
import { TEMPLATE_PREVIEWS } from "@/lib/template-previews";
import { accentInk, type GalleryDesign } from "@/lib/gallery-design";

const CATEGORY_ORDER = ["all", "wedding", "family", "party", "corporate", "editorial", "minimal"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  all: "All",
  wedding: "Wedding",
  family: "Family",
  party: "Party",
  corporate: "Corporate",
  editorial: "Editorial",
  minimal: "Minimal",
};

export function GalleryTemplatePicker({
  projectId,
  activeTemplateKey,
  hasCustomDesign,
  canBuild,
  onApplied,
}: {
  projectId: string;
  /** `template` marker of the currently applied design ("" = custom/none). */
  activeTemplateKey?: string;
  /** A saved design exists — applying replaces it (confirm first). */
  hasCustomDesign: boolean;
  /** Lite+ may open the page builder; Free gets the upsell link. */
  canBuild: boolean;
  /** Refresh the host (design state) after an apply/undo; defaults to a
   * router refresh so the server-rendered designer picks up the new design. */
  onApplied?: () => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [undo, setUndo] = useState<GalleryDesign | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // Label ink for every accent-filled control, from the live --accent value.
  const [ink, setInk] = useState("#ffffff");
  useEffect(() => {
    const v = getComputedStyle(rootRef.current ?? document.documentElement).getPropertyValue("--accent").trim();
    setInk(accentInk(v));
  }, []);

  function flash(msg: string, isError = false) {
    setNote(isError ? "" : msg);
    setErrMsg(isError ? msg : "");
    setTimeout(() => {
      setNote((cur) => (cur === msg ? "" : cur));
      setErrMsg((cur) => (cur === msg ? "" : cur));
    }, isError ? 4500 : 6000);
  }

  const visible = useMemo(
    () => (category === "all" ? SEED_TEMPLATES : SEED_TEMPLATES.filter((t) => t.category === category)),
    [category],
  );

  async function apply(key: string) {
    setBusy(key);
    try {
      const res = await fetch(`/api/projects/${projectId}/gallery-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; previous?: GalleryDesign | null; error?: string };
      if (!res.ok || !body.ok) {
        flash(body.error === "too_large" ? "That template didn't fit this project — try another." : "Couldn't apply the template — try again.", true);
      } else {
        setUndo(body.previous ?? null);
        flash(`${SEED_TEMPLATES.find((t) => t.key === key)?.name ?? "Template"} applied — your photos, a new look.`);
        (onApplied ?? (() => router.refresh()))();
      }
    } catch {
      flash("Network error — try again.", true);
    }
    setConfirming(null);
    setBusy(null);
  }

  async function undoApply() {
    if (!undo) return;
    setBusy("undo");
    try {
      const res = await fetch(`/api/projects/${projectId}/gallery-design`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ design: undo }),
      });
      if (res.ok) {
        setUndo(null);
        flash("Previous design restored.");
        (onApplied ?? (() => router.refresh()))();
      }
    } catch {
      // undo is best-effort; the design menu remains the source of truth
    }
    setBusy(null);
  }

  return (
    <div ref={rootRef} className="rounded-[16px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Start from a template</h3>
          <p className="mt-0.5 text-xs text-ink-subtle">Pick a look — your photos, instantly styled. {canBuild ? "Then customize every detail." : "Customizing every detail is a Lite feature."}</p>
        </div>
        {canBuild ? (
          <Link
            href={`/dashboard/projects/${projectId}/builder`}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-[filter] hover:brightness-110"
            style={{ background: "var(--accent)", color: ink }}
          >
            Open page builder →
          </Link>
        ) : (
          <Link
            href="/dashboard/settings/billing"
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Upgrade to customize
          </Link>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Template categories">
        {CATEGORY_ORDER.filter((c) => c === "all" || SEED_TEMPLATES.some((t) => t.category === c)).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              category === c ? "font-semibold" : "bg-surface-2 text-ink-muted hover:text-ink"
            }`}
            style={category === c ? { background: "var(--accent)", color: ink } : undefined}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((t) => {
          const thumbs = TEMPLATE_PREVIEWS[t.key];
          const active = activeTemplateKey === t.key;
          return (
            <div key={t.key} className={`group relative overflow-hidden rounded-[12px] border transition-shadow hover:shadow-md ${active ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"}`}>
              <a
                href={`/g/${projectId}/preview?template=${t.key}`}
                target="_blank"
                rel="noreferrer"
                className="relative block aspect-[4/3] bg-surface-2"
                title={`Preview ${t.name} with your photos`}
              >
                {thumbs ? (
                  // eslint-disable-next-line @next/next/no-img-element -- static R2 thumb, no optimizer
                  <img src={thumbs.desktop} alt={`${t.name} template preview`} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-ink-tertiary">{t.name}</span>
                )}
                {thumbs && (
                  <span className="absolute bottom-2 right-2 block h-16 w-9 overflow-hidden rounded-md border-2 border-white/80 shadow">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static R2 thumb */}
                    <img src={thumbs.mobile} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </span>
                )}
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  Preview with your photos ↗
                </span>
                {active && (
                  <span className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow" style={{ background: "var(--accent)", color: ink }}>
                    ✓ Applied
                  </span>
                )}
              </a>
              <div className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{t.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-subtle">{t.description}</p>
                </div>
                {confirming === t.key ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button type="button" disabled={busy !== null} onClick={() => void apply(t.key)} className="rounded-md bg-surface-2 px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:bg-surface-3 disabled:opacity-60">
                      {busy === t.key ? "Applying…" : "Confirm"}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-2 py-1.5 text-[11px] text-ink-muted hover:text-ink">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null || active}
                    onClick={() => (hasCustomDesign && !active ? setConfirming(t.key) : void apply(t.key))}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-[filter] hover:brightness-110 ${active ? "cursor-default" : ""} ${busy !== null && !active ? "opacity-60" : ""}`}
                    style={{ background: "var(--accent)", color: ink, opacity: active ? 1 : undefined }}
                  >
                    {active ? "✓ Applied" : busy === t.key ? "Applying…" : "Apply"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(note || errMsg) && (
        <p className={`mt-3 text-xs ${errMsg ? "text-destructive" : "text-ink-subtle"}`}>
          {errMsg || note}
          {!errMsg && undo && (
            <button type="button" onClick={() => void undoApply()} disabled={busy !== null} className="ml-2 font-semibold underline underline-offset-2 disabled:opacity-60">
              {busy === "undo" ? "Restoring…" : "Undo"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

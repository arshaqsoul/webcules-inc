"use client";

/* WEB-320 — the visual template picker: the seeded gallery templates in two
 * groups. FREE templates are a look only (layout, type, colors) - the
 * gallery's one cover title / subtitle / photo stay the studio's own, edited
 * in Gallery design. LITE / STUDIO templates are full page layouts with their
 * own sections; they preview for everyone but apply from Lite (collage:
 * Studio). Real photographic thumbs (R2-served, lazy) where we have them, a
 * themed swatch otherwise; live preview against the studio's own photos
 * (?template= on the preview page); one-click apply with undo (the previous
 * design is retained client-side). */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { SEED_TEMPLATES, type SeedTemplate } from "@/lib/seed-templates";
import { planMeetsSeedTier } from "@/lib/seed-gating";
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
const TIER_LABELS: Record<SeedTemplate["tier"], string> = { free: "Free", lite: "Lite", studio: "Studio" };

export function GalleryTemplatePicker({
  projectId,
  activeTemplateKey,
  hasCustomDesign,
  canBuild,
  plan,
  onApplied,
}: {
  projectId: string;
  /** `template` marker of the currently applied design ("" = custom). */
  activeTemplateKey?: string;
  /** A custom or sectioned design exists - applying replaces it (confirm first). */
  hasCustomDesign: boolean;
  /** Lite+ may open the page builder; Free gets the upsell link. */
  canBuild: boolean;
  /** The org's plan id - decides which templates apply vs. upsell. */
  plan: string;
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

  const { free, paid } = useMemo(() => {
    const list = category === "all" ? SEED_TEMPLATES : SEED_TEMPLATES.filter((t) => t.category === category);
    return { free: list.filter((t) => t.tier === "free"), paid: list.filter((t) => t.tier !== "free") };
  }, [category]);

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
        flash(
          body.error === "too_large"
            ? "That template didn't fit this project - try another."
            : body.error === "template_requires_lite"
              ? "That template needs the Lite plan."
              : body.error === "template_requires_studio"
                ? "That template needs the Studio plan."
                : "Couldn't apply the template - try again.",
          true,
        );
      } else {
        setUndo(body.previous ?? null);
        const applied = SEED_TEMPLATES.find((t) => t.key === key);
        flash(`${applied?.name ?? "Template"} applied - ${applied?.tier === "free" ? "your title, subtitle and cover are unchanged." : "your photos, a new look."}`);
        (onApplied ?? (() => router.refresh()))();
      }
    } catch {
      flash("Network error - try again.", true);
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

  function renderCard(t: SeedTemplate): ReactNode {
    const thumbs = TEMPLATE_PREVIEWS[t.key];
    const active = activeTemplateKey === t.key;
    const unlocked = planMeetsSeedTier(plan, t.tier);
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
            <TemplateSwatch design={t.design} />
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
          {active ? (
            <span className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow" style={{ background: "var(--accent)", color: ink }}>
              ✓ Applied
            </span>
          ) : (
            t.tier !== "free" && (
              <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white shadow backdrop-blur">
                {unlocked ? TIER_LABELS[t.tier] : `${TIER_LABELS[t.tier]} plan`}
              </span>
            )
          )}
        </a>
        <div className="flex items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{t.name}</p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-ink-subtle">{t.description}</p>
          </div>
          {!unlocked ? (
            <Link
              href="/dashboard/settings/billing"
              className="shrink-0 rounded-md bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              Upgrade to {TIER_LABELS[t.tier]}
            </Link>
          ) : confirming === t.key ? (
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
  }

  return (
    <div ref={rootRef} className="rounded-[16px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">Start from a template</h3>
          <p className="mt-0.5 text-xs text-ink-subtle">
            Pick a look - your photos, instantly styled. Free templates keep your own title, subtitle and cover.{" "}
            {canBuild ? "Lite and Studio templates are full page layouts you can customize." : "Full page layouts and customizing every detail are part of Lite."}
          </p>
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

      <TemplateGroup
        title="Free templates"
        hint="A look for your gallery. Set the title, subtitle and cover photo in Gallery design below."
        templates={free}
        render={renderCard}
      />
      <TemplateGroup
        title="Lite and Studio templates"
        hint={
          canBuild
            ? "Full page layouts with their own sections, copy and photo placements."
            : "Full page layouts with their own sections - preview any of them, apply with an upgrade."
        }
        templates={paid}
        render={renderCard}
      />
      {free.length === 0 && paid.length === 0 && <p className="mt-4 text-xs text-ink-subtle">No templates in this category yet.</p>}

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

function TemplateGroup({ title, hint, templates, render }: { title: string; hint: string; templates: SeedTemplate[]; render: (t: SeedTemplate) => ReactNode }) {
  if (templates.length === 0) return null;
  return (
    <section className="mt-5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">{title}</h4>
      <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{templates.map(render)}</div>
    </section>
  );
}

/** Themed stand-in for a template with no photographic thumb: the template's
 * own canvas, ink, accent and corner radius around a cover bar and a grid. */
function TemplateSwatch({ design }: { design: GalleryDesign }) {
  const dark = design.theme.background === "dark";
  const bg = design.theme.colors?.bg ?? (dark ? "#141418" : "#ffffff");
  const text = design.theme.colors?.text ?? (dark ? "#f2f2f4" : "#1a1a1a");
  const accent = design.theme.colors?.accent ?? "#7c7c8a";
  const radius = design.theme.radius === "0px" ? 0 : design.theme.radius === "8px" ? 4 : 8;
  const masonry = design.layout === "masonry";
  const tiles = masonry ? [3, 2, 2, 3, 3, 2, 2, 3] : [2, 2, 2, 2, 2, 2, 2, 2];
  return (
    <span className="flex h-full w-full flex-col gap-2 p-3" style={{ background: bg }} aria-hidden>
      <span className="relative block h-[34%] w-full overflow-hidden" style={{ background: `color-mix(in srgb, ${accent} 30%, ${bg})`, borderRadius: radius }}>
        <span className="absolute bottom-2 left-2 block h-1.5 w-1/3 rounded-full" style={{ background: text, opacity: 0.85 }} />
        <span className="absolute bottom-[3px] left-2 block h-1 w-1/5 rounded-full" style={{ background: text, opacity: 0.4 }} />
      </span>
      <span className="grid flex-1 grid-cols-4 gap-1.5">
        {tiles.map((h, i) => (
          <span
            key={i}
            style={{
              background: `color-mix(in srgb, ${accent} ${18 + ((i * 7) % 4) * 8}%, ${bg})`,
              borderRadius: radius,
              gridRow: masonry && h === 3 ? "span 2" : undefined,
            }}
          />
        ))}
      </span>
    </span>
  );
}

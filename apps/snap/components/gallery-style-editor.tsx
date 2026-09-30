"use client";

/* Gallery style editor (WEB-286) — defines a reusable gallery design
 * (cover style, layout, theme) with the SHARED dual-frame preview the
 * project designer also renders, so what you style here is exactly what
 * clients see. Bodies serialize through the same gallery-design helpers the
 * project designer uses — one format, two surfaces. */
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@webcules/ui/components/button";
import {
  CLASSIC_LAYOUT,
  CLASSIC_THEME,
  COVER_STYLES,
  GALLERY_LAYOUTS,
  THEME_BACKGROUNDS,
  THEME_CAPTIONS,
  THEME_PADDINGS,
  THEME_RADII,
  presetFromDesign,
  serializeGalleryDesign,
  type GalleryDesign,
} from "@/lib/gallery-design";
import { GalleryDualPreview } from "@/components/gallery-preview";

const input = "rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-primary";
const segBtn = (on: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs transition-colors ${on ? "border-primary bg-primary/5 font-medium text-ink" : "border-hairline bg-surface-2 text-ink-subtle hover:text-ink"}`;

function Segmented<T extends string>({ options, value, onChange, labels }: { options: readonly T[]; value: T; onChange: (v: T) => void; labels: Record<string, string> }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" aria-pressed={o === value} onClick={() => onChange(o)} className={segBtn(o === value)}>
          {labels[o] ?? o}
        </button>
      ))}
    </div>
  );
}

const COVER_LABELS: Record<string, string> = { static: "Photo + title", kenburns: "Ken Burns", split: "Split panel" };
const LAYOUT_LABELS: Record<string, string> = { grid: "Grid", masonry: "Masonry", cascade: "Cascade" };
const BG_LABELS: Record<string, string> = { light: "Light", dark: "Dark", brand: "Brand tint" };
const PAD_LABELS: Record<string, string> = { compact: "Compact", normal: "Normal", airy: "Airy" };
const CAP_LABELS: Record<string, string> = { off: "Off", hover: "On hover", always: "Always" };

export function GalleryStyleEditor({
  templateId,
  initialName,
  initialDesign,
}: {
  templateId?: string;
  initialName?: string;
  initialDesign?: GalleryDesign | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName ?? "");
  const [design, setDesign] = useState<GalleryDesign>(initialDesign ?? { layout: CLASSIC_LAYOUT, theme: CLASSIC_THEME });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /** WEB-258: the design layer is Lite+ — a 403 upsells instead of erroring. */
  const [upsell, setUpsell] = useState(false);

  const setCover = (patch: Partial<NonNullable<GalleryDesign["cover"]>>) =>
    setDesign((d) => ({ ...d, cover: { assetId: "", focal: { x: 0.5, y: 0.5 }, style: "static", title: "", subtitle: "", ...d.cover, ...patch } }));
  const setTheme = (patch: Partial<GalleryDesign["theme"]>) => setDesign((d) => ({ ...d, theme: { ...d.theme, ...patch } }));

  async function save() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    const payload = { name: name.trim(), body: serializeGalleryDesign(presetFromDesign(design)) };
    const res = templateId
      ? await fetch(`/api/studio/templates/${templateId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/studio/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "gallery_preset", ...payload }) });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok || (templateId ? false : !body.id)) {
      setUpsell(body.error === "presets_require_lite" || body.error === "limit_reached");
      setStatus(
        body.error === "presets_require_lite"
          ? "Gallery styles are part of the design layer — included with Lite."
          : body.error === "limit_reached"
            ? "Plan limit reached."
            : "Couldn't save — try again.",
      );
      return;
    }
    setUpsell(false);
    if (templateId) {
      setStatus("Saved — previews updated.");
    } else {
      router.replace(`/dashboard/templates/gallery-styles?edit=${body.id}`);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex flex-col gap-5 rounded-[12px] border border-hairline bg-surface-1 p-5">
        <label className="flex flex-col gap-1 text-xs text-ink-subtle">
          Style name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Editorial dark" className={input} />
        </label>
        <p className="-mt-2 text-xs text-ink-tertiary">Apply it from any project&apos;s Gallery tab → Design — the cover photo comes from each project; everything here is the look.</p>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Cover</legend>
          <Segmented options={COVER_STYLES} value={design.cover?.style ?? "static"} onChange={(style) => setCover({ style })} labels={COVER_LABELS} />
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <input value={design.cover?.title ?? ""} onChange={(e) => setCover({ title: e.target.value })} maxLength={80} placeholder="Cover title — {{client_name}} works" className={input} />
            <input value={design.cover?.subtitle ?? ""} onChange={(e) => setCover({ subtitle: e.target.value })} maxLength={120} placeholder="Subtitle — {{event_date}} works" className={input} />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Layout</legend>
          <Segmented options={GALLERY_LAYOUTS} value={design.layout} onChange={(layout) => setDesign((d) => ({ ...d, layout }))} labels={LAYOUT_LABELS} />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Theme</legend>
          <div className="flex flex-col gap-2.5">
            <Segmented options={THEME_BACKGROUNDS} value={design.theme.background} onChange={(background) => setTheme({ background })} labels={BG_LABELS} />
            <Segmented options={THEME_PADDINGS} value={design.theme.padding} onChange={(padding) => setTheme({ padding })} labels={PAD_LABELS} />
            <Segmented options={THEME_RADII} value={design.theme.radius} onChange={(radius) => setTheme({ radius })} labels={{ "0px": "Sharp", "8px": "Soft", "16px": "Rounded" }} />
            <Segmented options={THEME_CAPTIONS} value={design.theme.captions} onChange={(captions) => setTheme({ captions })} labels={CAP_LABELS} />
          </div>
        </fieldset>

        <div className="flex items-center gap-3 border-t border-hairline pt-3">
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy ? "Saving…" : templateId ? "Save style" : "Create style"}
          </Button>
          {status && <span className="text-xs text-ink-subtle">{status}</span>}
          {upsell && (
            <a href="/dashboard/settings/billing" className="text-xs font-medium text-primary underline underline-offset-2">
              Upgrade to Lite — $15/mo
            </a>
          )}
        </div>
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs text-ink-tertiary">Live preview — exactly what clients open</p>
        <GalleryDualPreview design={design} />
      </aside>
    </div>
  );
}

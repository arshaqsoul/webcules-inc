"use client";

/* WEB-258: gallery designer — covers (photo picker + draggable focal point +
 * three styles), layouts (grid/masonry/cascade), themes, and gallery
 * presets (save / apply / set-default, reusing the template store), with a
 * live phone-frame preview. Saving designs is Lite+ (the design layer);
 * Free sees the panel locked with an upsell. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@webcules/ui/components/button";
import {
  applyPreset,
  parseGalleryDesign,
  presetFromDesign,
  serializeGalleryDesign,
  focalPosition,
  type GalleryDesign,
} from "@/lib/gallery-design";
import { SLIDESHOW_PACES, SLIDESHOW_TRANSITIONS, type SlideshowConfig } from "@/lib/slideshow";
import { GalleryDualPreview } from "@/components/gallery-preview";
import { UpgradeCta, LiteUpsell } from "@/components/lite-upsell";

type PickerAsset = { id: string; filename: string; status: string };
type PresetRow = { id: string; name: string; isDefault: boolean; body?: string };
type MusicTrack = { id: string; name: string; bytes: number };

const CLASSIC: GalleryDesign = {
  layout: "grid",
  theme: { background: "light", padding: "normal", radius: "16px", captions: "off" },
};

export function GalleryDesigner({ projectId, initialDesign, inherited, canDesign, initialSlideshow, canMusic, canStyle }: {
  projectId: string;
  /** The project's own saved design (null = none). */
  initialDesign: GalleryDesign | null;
  /** The org's default preset design, shown when the project has none. */
  inherited: GalleryDesign | null;
  canDesign: boolean;
  /** WEB-259: slideshow config + whether this org may pick music (Lite+). */
  initialSlideshow: SlideshowConfig | null;
  canMusic: boolean;
  /** WEB-301: Studio+ controls — hero slider + column counts. */
  canStyle?: boolean;
}) {
  const [draft, setDraft] = useState<GalleryDesign>(initialDesign ?? inherited ?? CLASSIC);
  const [customized, setCustomized] = useState(Boolean(initialDesign));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  /** Lite-gate saves (design / presets / slideshow music) upsell, not error. */
  const [upsell, setUpsell] = useState(false);
  const [picker, setPicker] = useState<PickerAsset[] | null>(null);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetName, setPresetName] = useState("");
  const [slideshowDraft, setSlideshowDraft] = useState<SlideshowConfig>(
    initialSlideshow ?? { enabled: false, pace: 5, transition: "kenburns", music: "", musicStartAt: 0 },
  );
  const [slideshowDirty, setSlideshowDirty] = useState(false);
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [warranted, setWarranted] = useState(false);
  const [heroSel, setHeroSel] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const focalRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    // Cover choices + preview tiles — the project's own images (rejected
    // excluded). Small, staff-cookie authorized.
    fetch(`/api/projects/${projectId}/assets?kind=image&limit=60&sort=name`)
      .then((r) => (r.ok ? (r.json() as Promise<{ items?: PickerAsset[] }>) : Promise.resolve({ items: [] })))
      .then((b: { items?: PickerAsset[] }) => setPicker((b.items ?? []).filter((a) => a.status !== "rejected")))
      .catch(() => setPicker([]));
    fetch("/api/studio/templates?kind=gallery_preset")
      .then((r) => (r.ok ? (r.json() as Promise<{ templates?: PresetRow[] }>) : Promise.resolve({ templates: [] })))
      .then((b: { templates?: PresetRow[] }) => setPresets(b.templates ?? []))
      .catch(() => setPresets([]));
    if (canMusic) {
      fetch("/api/studio/slideshow-music")
        .then((r) => (r.ok ? (r.json() as Promise<{ tracks?: MusicTrack[] }>) : Promise.resolve({ tracks: [] })))
        .then((b: { tracks?: MusicTrack[] }) => setTracks(b.tracks ?? []))
        .catch(() => setTracks([]));
    }
  }, [projectId, canMusic]);

  function edit(patch: Partial<GalleryDesign>) {
    setDraft((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  }

  function editCover(patch: Partial<NonNullable<GalleryDesign["cover"]>>) {
    setDraft((cur) => ({ ...cur, cover: { ...(cur.cover ?? { assetId: "", focal: { x: 0.5, y: 0.5 }, style: "static", title: "", subtitle: "" }), ...patch } }));
    setDirty(true);
  }

  /** WEB-301 hero slider: ordered multi-pick from the project's photos. */
  const heroList = draft.cover?.images ?? [];
  function toggleHero(id: string) {
    const cur = heroList;
    const next = cur.some((i) => i.assetId === id)
      ? cur.filter((i) => i.assetId !== id)
      : [...cur, { assetId: id, focal: { x: 0.5, y: 0.5 } }];
    if (next.length > 6) return;
    setHeroSel(0);
    editCover({
      images: next,
      // the canonical cover follows the first slide (og:image + fallback)
      ...(next.length ? { assetId: next[0].assetId, focal: next[0].focal } : {}),
    });
  }
  function editHeroFocal(focal: { x: number; y: number }) {
    const cur = heroList;
    if (!cur.length) {
      editCover({ focal });
      return;
    }
    const next = cur.map((img, i) => (i === Math.min(heroSel, cur.length - 1) ? { ...img, focal } : img));
    editCover({ images: next, ...(heroSel === 0 ? { focal } : {}) });
  }

  function setFocalFromEvent(e: React.PointerEvent) {
    const el = focalRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    editHeroFocal({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }

  async function save(clear = false) {
    setUpsell(false);
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/gallery-design`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clear ? { design: null } : { design: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setUpsell(body.error === "design_requires_lite");
        setError(
          body.error === "design_requires_lite"
            ? "Designing galleries is a Lite feature — upgrade to unlock covers, layouts and themes."
            : body.error === "cover_not_in_project"
              ? "That cover photo isn't in this project any more — pick another."
              : "Couldn't save — check the fields and try again.",
        );
      } else {
        setDirty(false);
        setCustomized(!clear);
        if (clear) setDraft(inherited ?? CLASSIC);
        setNote(clear ? "Back to the studio default look ✓" : "Saved — the gallery updates instantly ✓");
        setTimeout(() => setNote(""), 3500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function savePreset() {
    setUpsell(false);
    const name = presetName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/studio/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "gallery_preset", name, body: serializeGalleryDesign(presetFromDesign(draft)) }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !body.id) {
        setUpsell(body.error === "presets_require_lite");
        setError(body.error === "presets_require_lite" ? "Saving presets is a Lite feature." : "Couldn't save the preset — try again.");
      } else {
        setPresetName("");
        setPresets((cur) => [...cur, { id: body.id!, name, isDefault: false, body: serializeGalleryDesign(presetFromDesign(draft)) }]);
        setNote(`Preset "${name}" saved ✓`);
        setTimeout(() => setNote(""), 3500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function presetAction(id: string, action: "default") {
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/templates/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setPresets((cur) => cur.map((p) => ({ ...p, isDefault: p.id === id })));
        setNote("New galleries will start with this preset ✓");
        setTimeout(() => setNote(""), 3500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  function applyPresetRow(p: PresetRow) {
    const next = applyPreset(parseGalleryDesign(safeJson(p.body)) ?? CLASSIC, draft);
    edit(next);
    setNote(`Applied "${p.name}" — remember to save.`);
    setTimeout(() => setNote(""), 3500);
  }

  function editSlideshow(patch: Partial<SlideshowConfig>) {
    setSlideshowDraft((cur) => ({ ...cur, ...patch }));
    setSlideshowDirty(true);
  }

  async function saveSlideshow() {
    setUpsell(false);
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/slideshow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideshow: slideshowDraft.enabled ? slideshowDraft : null }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setUpsell(body.error === "music_requires_lite");
        setError(body.error === "music_requires_lite" ? "Slideshow music is a Lite feature." : body.error === "track_not_found" ? "That track no longer exists — pick another." : "Couldn't save the slideshow — try again.");
      } else {
        setSlideshowDirty(false);
        setNote(slideshowDraft.enabled ? "Slideshow saved ✓" : "Slideshow turned off ✓");
        setTimeout(() => setNote(""), 3500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function uploadTrack() {
    if (!uploadFile || !warranted || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("warranted", "true");
      const res = await fetch("/api/studio/slideshow-music", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { id?: string; name?: string; bytes?: number; error?: string };
      if (!res.ok || !body.id) {
        setError(
          body.error === "file_too_large" ? "Tracks are capped at 15 MB."
          : body.error === "unsupported_audio" ? "MP3, AAC or M4A only."
          : body.error === "rights_warranty_required" ? "Please confirm you own the rights to this music."
          : body.error === "music_requires_lite" ? "Music uploads are a Lite feature."
          : "Upload failed — try again.",
        );
      } else {
        const track = { id: body.id, name: body.name ?? "Track", bytes: body.bytes ?? 0 };
        setTracks((cur) => [...(cur ?? []), track]);
        editSlideshow({ music: track.id });
        setUploadFile(null);
        setUploadName("");
        setWarranted(false);
        setNote(`"${track.name}" uploaded — remember to save ✓`);
        setTimeout(() => setNote(""), 3500);
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  async function removeTrack(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/studio/slideshow-music/${id}`, { method: "DELETE" });
      if (res.ok) {
        setTracks((cur) => (cur ?? []).filter((t) => t.id !== id));
        setSlideshowDraft((cur) => (cur.music === id ? { ...cur, music: "" } : cur));
      }
    } catch {
      setError("Network error — try again.");
    }
    setBusy(false);
  }

  function safeJson(body: string | undefined): unknown {
    try {
      return JSON.parse(body ?? "{}");
    } catch {
      return {};
    }
  }

  const cover = draft.cover;
  const coverAsset = cover?.assetId ? (picker ?? []).find((a) => a.id === cover.assetId) ?? { id: cover.assetId, filename: "", status: "" } : null;
  const previewTiles = (picker ?? []).slice(0, 6);
  const statusLabel = customized ? "Customized for this gallery" : inherited ? "Using your studio default preset" : "Classic Snap gallery";

  return (
    <div className="rounded-[12px] border border-hairline bg-surface-1 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-[15px] font-medium text-ink">Gallery design</h3>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-subtle">{statusLabel}{dirty ? " · unsaved" : ""}</span>
        <div className="ml-auto flex items-center gap-2">
          {customized && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(true)}>
              Reset to default
            </Button>
          )}
          <Button size="sm" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? "Saving…" : "Save design"}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------- controls ---------------- */}
        <div className="flex flex-col gap-6">
          {/* WEB-301 follow-up: the single hero/cover photo is FREE — every
           * studio can put their photo on the gallery cover. Styles, layouts,
           * themes and presets below stay Lite (slideshow is free-tier). */}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Cover</legend>
            {canDesign ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["static", "kenburns", "split"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => editCover({ style: s })}
                  aria-pressed={(cover?.style ?? "static") === s}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    (cover?.style ?? "static") === s ? "border-primary bg-primary/5 text-ink" : "border-hairline bg-surface-2 text-ink-subtle hover:text-ink"
                  }`}
                >
                  <span className="block font-medium">{s === "static" ? "Photo + title" : s === "kenburns" ? "Ken Burns" : "Split panel"}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-tertiary">
                    {s === "static" ? "full-bleed image" : s === "kenburns" ? "slow motion drift" : "image + title panel"}
                  </span>
                </button>
              ))}
            </div>
            ) : (
              <p className="mt-2 text-[11px] text-ink-tertiary">
                Photo + title. Cinematic Ken Burns and split-panel covers come with <span className="font-medium text-ink">Lite</span>.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => editCover({ assetId: "" })}
                className={`rounded-md border px-2.5 py-1.5 text-xs ${!cover?.assetId ? "border-primary text-ink" : "border-hairline text-ink-subtle"}`}
              >
                No photo
              </button>
              {(picker ?? []).slice(0, 24).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => editCover({ assetId: a.id })}
                  aria-label={`Cover: ${a.filename}`}
                  className={`h-12 w-12 overflow-hidden rounded-md border-2 ${cover?.assetId === a.id ? "border-primary" : "border-transparent"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy */}
                  <img src={`/api/assets/${a.id}?variant=thumb`} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
              {picker === null && <span className="text-xs text-ink-tertiary">Loading photos…</span>}
              {picker !== null && picker.length === 0 && <span className="text-xs text-ink-tertiary">Upload photos first — the cover picks from this project.</span>}
            </div>
            {cover?.assetId && (
              <div className="mt-3">
                <p className="text-[11px] text-ink-tertiary">Focal point — drag on the cover (keeps the subject framed on every screen):</p>
                <div
                  ref={focalRef}
                  onPointerDown={(e) => {
                    dragging.current = true;
                    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    setFocalFromEvent(e);
                  }}
                  onPointerMove={(e) => dragging.current && setFocalFromEvent(e)}
                  onPointerUp={() => (dragging.current = false)}
                  onPointerCancel={() => (dragging.current = false)}
                  className="relative mt-1.5 aspect-[16/9] w-full max-w-md cursor-crosshair touch-none overflow-hidden rounded-lg border border-hairline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy */}
                  <img
                    src={`/api/assets/${cover.assetId}?variant=preview`}
                    alt="Cover focal point"
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ objectPosition: focalPosition(cover.focal) }}
                  />
                  <span
                    className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                    style={{ left: `${cover.focal.x * 100}%`, top: `${cover.focal.y * 100}%`, background: "rgba(255,255,255,0.25)" }}
                  />
                </div>
              </div>
            )}
                        {canStyle && (
              <div className="mt-4 rounded-lg border border-hairline bg-surface-2/40 p-3">
                <p className="text-[11px] font-medium text-ink">Hero slider</p>
                <p className="mt-0.5 text-[11px] text-ink-tertiary">
                  Pick 2&ndash;6 photos for a swipeable cover carousel (first photo leads). Fewer than two keeps today&apos;s single cover.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(picker ?? []).slice(0, 24).map((a) => {
                    const idx = heroList.findIndex((i) => i.assetId === a.id);
                    const on = idx >= 0;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleHero(a.id)}
                        aria-pressed={on}
                        aria-label={"Hero image: " + a.filename}
                        title={on ? "Hero " + (idx + 1) + " — click to remove" : "Add to hero slider"}
                        className={"relative h-11 w-11 overflow-hidden rounded-md border-2 " + (on ? "border-primary" : "border-transparent opacity-70 hover:opacity-100")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy */}
                        <img src={"/api/assets/" + a.id + "?variant=thumb"} alt={a.filename} className="h-full w-full object-cover" loading="lazy" />
                        {on && (
                          <span className="absolute bottom-0 right-0 rounded-tl bg-primary px-1 text-[9px] font-bold text-white">{idx + 1}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {heroList.length >= 2 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-[11px] text-ink-subtle">
                      Auto-advance
                      <select
                        value={String(draft.cover?.interval ?? 0)}
                        onChange={(e) => editCover({ interval: Number(e.target.value) })}
                        className="snap-select mt-1 w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink"
                      >
                        <option value="0">Off — swipe only</option>
                        <option value="4">Every 4s</option>
                        <option value="6">Every 6s</option>
                        <option value="8">Every 8s</option>
                      </select>
                      <span className="mt-0.5 block text-ink-tertiary">Clients who prefer reduced motion never see auto-advance.</span>
                    </label>
                    <label className="text-[11px] text-ink-subtle">
                      Focal point edits hero image
                      <select
                        value={String(Math.min(heroSel, heroList.length - 1))}
                        onChange={(e) => setHeroSel(Number(e.target.value))}
                        className="snap-select mt-1 w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink"
                      >
                        {heroList.map((img, i) => (
                          <option key={img.assetId} value={i}>{"Hero " + (i + 1)}</option>
                        ))}
                      </select>
                      <span className="mt-0.5 block text-ink-tertiary">Drag on the cover preview above to set it.</span>
                    </label>
                  </div>
                )}
              </div>
            )}

<div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-ink-subtle">
                Title <span className="text-ink-tertiary">(merge works: {"{{client_name}}"})</span>
                <input
                  value={cover?.title ?? ""}
                  onChange={(e) => editCover({ title: e.target.value.slice(0, 80) })}
                  placeholder="Sarah & Jonah"
                  className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="text-xs text-ink-subtle">
                Subtitle <span className="text-ink-tertiary">({"{{event_date}}"})</span>
                <input
                  value={cover?.subtitle ?? ""}
                  onChange={(e) => editCover({ subtitle: e.target.value.slice(0, 140) })}
                  placeholder="A film from your day"
                  className="mt-1 w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
          </fieldset>

          {!canDesign && (
            <LiteUpsell feature="Gallery design" note="Cinematic Ken Burns + split covers, editorial layouts, dark or brand-tinted themes, reusable presets." />
          )}
          {canDesign && (
          <>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Layout</legend>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([
                { id: "grid", label: "Grid", hint: "uniform squares" },
                { id: "masonry", label: "Masonry", hint: "natural heights" },
                { id: "cascade", label: "Cascade", hint: "justified rows" },
              ] as const).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => edit({ layout: l.id })}
                  aria-pressed={draft.layout === l.id}
                  className={`rounded-lg border px-3 py-2.5 text-left text-xs transition-colors ${
                    draft.layout === l.id ? "border-primary bg-primary/5 text-ink" : "border-hairline bg-surface-2 text-ink-subtle hover:text-ink"
                  }`}
                >
                  <span className="block font-medium">{l.label}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-tertiary">{l.hint}</span>
                </button>
              ))}
            </div>
            {draft.layout !== "cascade" && (
              <div className="mt-3">
                {canStyle ? (
                  <div className="flex flex-wrap gap-2">
                    <Seg
                      label="Phone columns"
                      value={String(draft.columns?.mobile ?? 2)}
                      options={[["2", "2"], ["3", "3"]]}
                      onChange={(v) => edit({ columns: { ...draft.columns, mobile: Number(v) as 2 | 3 } })}
                    />
                    <Seg
                      label="Tablet columns"
                      value={String(draft.columns?.sm ?? 3)}
                      options={[["2", "2"], ["3", "3"]]}
                      onChange={(v) => edit({ columns: { ...draft.columns, sm: Number(v) as 2 | 3 } })}
                    />
                    <Seg
                      label="Desktop columns"
                      value={String(draft.columns?.md ?? 4)}
                      options={[["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]]}
                      onChange={(v) => edit({ columns: { ...draft.columns, md: Number(v) as 2 | 3 | 4 | 5 } })}
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hairline bg-surface-2/40 px-3 py-2.5">
                    <span className="text-[11px] text-ink-subtle">
                      Fewer columns, bigger photos — a <span className="font-medium text-ink">Studio</span> control.
                    </span>
                    <a
                      href="/dashboard/settings/billing"
                      className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
                    >
                      Upgrade
                    </a>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <fieldset>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Theme</legend>
              <label className="ml-auto flex items-center gap-2 text-sm text-ink" title="Videos leave the photo flow and get their own Films section (with a Reels strip for vertical clips)">
                <input
                  type="checkbox"
                  checked={draft.films === true}
                  onChange={(e) => edit({ films: e.target.checked })}
                  className="h-4 w-4"
                />
                Films section for videos
              </label>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Seg
                label="Background"
                value={draft.theme.background}
                options={[["light", "Light"], ["dark", "Dark"], ["brand", "Brand"]]}
                onChange={(v) => edit({ theme: { ...draft.theme, background: v as GalleryDesign["theme"]["background"] } })}
              />
              <Seg
                label="Spacing"
                value={draft.theme.padding}
                options={[["compact", "Compact"], ["normal", "Normal"], ["airy", "Airy"]]}
                onChange={(v) => edit({ theme: { ...draft.theme, padding: v as GalleryDesign["theme"]["padding"] } })}
              />
              <Seg
                label="Corners"
                value={draft.theme.radius}
                options={[["0px", "Sharp"], ["8px", "Soft"], ["16px", "Round"]]}
                onChange={(v) => edit({ theme: { ...draft.theme, radius: v as GalleryDesign["theme"]["radius"] } })}
              />
              <Seg
                label="Captions"
                value={draft.theme.captions}
                options={[["off", "Off"], ["hover", "Hover"], ["always", "Always"]]}
                onChange={(v) => edit({ theme: { ...draft.theme, captions: v as GalleryDesign["theme"]["captions"] } })}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Presets</legend>
            {presets.length === 0 ? (
              <p className="mt-2 text-xs text-ink-tertiary">No presets yet — design a gallery above and save it as a preset to reuse everywhere.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {presets.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{p.name}</span>
                    {p.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">default</span>}
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => applyPresetRow(p)}>Apply</Button>
                    {!p.isDefault && (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void presetAction(p.id, "default")}>
                        Make default
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value.slice(0, 120))}
                placeholder="Save current design as…"
                className="min-w-40 flex-1 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
              />
              <Button size="sm" variant="outline" disabled={!presetName.trim() || busy} onClick={() => void savePreset()}>
                Save as preset
              </Button>
            </div>
          </fieldset>
          </>
          )}
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">Slideshow</legend>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={slideshowDraft.enabled}
                  onChange={(e) => editSlideshow({ enabled: e.target.checked })}
                  className="h-4 w-4"
                />
                Slideshow button on the gallery
              </label>
              {slideshowDraft.enabled && (
                <>
                  <Seg
                    label="Pace"
                    value={String(slideshowDraft.pace)}
                    options={[["3", "3 s"], ["5", "5 s"], ["8", "8 s"]]}
                    onChange={(v) => editSlideshow({ pace: (SLIDESHOW_PACES as readonly number[]).includes(Number(v)) ? (Number(v) as SlideshowConfig["pace"]) : 5 })}
                  />
                  <Seg
                    label="Motion"
                    value={slideshowDraft.transition}
                    options={[["fade", "Crossfade"], ["kenburns", "Ken Burns"]]}
                    onChange={(v) => editSlideshow({ transition: v as SlideshowConfig["transition"] })}
                  />
                </>
              )}
              <Button size="sm" disabled={busy || !slideshowDirty} onClick={() => void saveSlideshow()} className="ml-auto">
                {busy ? "Saving…" : "Save slideshow"}
              </Button>
            </div>

            {slideshowDraft.enabled && (
              <div className="mt-3 rounded-lg border border-hairline bg-surface-2 p-4">
                {!canMusic ? (
                  <div className="text-sm text-ink-subtle">
                    <p className="font-medium text-ink">Slideshow music is a Lite feature.</p>
                    <p className="mt-1">Upload a track you own the rights to and it plays with the slideshow — no catalog, your music.</p>
                    <Link href="/dashboard/settings/billing" className="mt-2 inline-block text-sm font-medium text-primary underline underline-offset-2">
                      Upgrade to Lite — $15/mo
                    </Link>
                  </div>
                ) : (
                  <>
                    <label className="text-xs text-ink-subtle">
                      Music
                      <select
                        value={slideshowDraft.music}
                        onChange={(e) => editSlideshow({ music: e.target.value })}
                        className="snap-select mt-1 w-full max-w-sm rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink"
                      >
                        <option value="">No music (silent slideshow)</option>
                        {(tracks ?? []).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </label>
                    {slideshowDraft.music && (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- music preview */}
                        <audio controls preload="none" src={`/api/studio/slideshow-music/${slideshowDraft.music}`} className="h-8 w-72 max-w-full" />
                        <label className="text-xs text-ink-subtle">
                          Start at (s)
                          <input
                            type="number"
                            min={0}
                            max={600}
                            value={slideshowDraft.musicStartAt}
                            onChange={(e) => editSlideshow({ musicStartAt: Math.min(600, Math.max(0, Number(e.target.value) || 0)) })}
                            className="ml-2 w-20 rounded-md border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
                          />
                        </label>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeTrack(slideshowDraft.music)}>
                          Delete track
                        </Button>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
                      <input
                        type="file"
                        accept=".mp3,.aac,.m4a,audio/mpeg,audio/aac,audio/mp4"
                        onChange={(e) => {
                          setUploadFile(e.target.files?.[0] ?? null);
                          setUploadName(e.target.files?.[0]?.name ?? "");
                        }}
                        className="text-xs text-ink-subtle"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-ink-subtle">
                        <input type="checkbox" checked={warranted} onChange={(e) => setWarranted(e.target.checked)} className="h-3.5 w-3.5" />
                        I own the rights to this music
                      </label>
                      <Button size="sm" variant="outline" disabled={!uploadFile || !warranted || busy} onClick={() => void uploadTrack()}>
                        {busy && uploadName ? "Uploading…" : "Upload"}
                      </Button>
                      <span className="text-[11px] text-ink-tertiary">MP3 / AAC / M4A · ≤ 15 MB · reused across your galleries</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </fieldset>
        </div>

        {/* ---------------- live preview (shared with Templates → Gallery styles) ---------------- */}
        {canDesign && (
          <div className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs text-ink-tertiary">Live preview — what the client opens</p>
            <GalleryDualPreview design={draft} tiles={previewTiles.map((t) => ({ url: `/api/assets/${t.id}?variant=thumb` }))} />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-xs text-destructive">
          {error} {upsell && <UpgradeCta to="lite" />}
        </p>
      )}
      {note && <p className="mt-4 text-xs text-ink-subtle">{note}</p>}
    </div>
  );
}

function Seg({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-ink-subtle">
      {label}
      <div className="mt-1 flex overflow-hidden rounded-md border border-hairline">
        {options.map(([id, name]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={`flex-1 px-2 py-1.5 text-[11px] transition-colors ${value === id ? "bg-primary/10 font-medium text-ink" : "bg-surface-2 text-ink-subtle hover:text-ink"}`}
          >
            {name}
          </button>
        ))}
      </div>
    </label>
  );
}

/** WEB-286: the gallery miniature (phone + desktop frames) now lives in the
 * shared components/gallery-preview.tsx — the project designer and the
 * Templates → Gallery styles editor render the exact same preview. */

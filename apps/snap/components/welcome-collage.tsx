"use client";

/* Welcome collage (all plans): an optional picture that heads the "your
 * photos are ready" email and the top of the gallery. The photographer can
 * upload their own image or build one from the project's photos with the
 * in-browser collage maker. Everything is rendered/re-encoded here, then
 * POSTed as a small JPEG (<= 2 MB); the server never trusts it
 * (lib/repos/welcome-image.ts). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@webcules/ui/components/dialog";

import {
  ASPECTS,
  CAPTION_BAND,
  GAPS,
  LAYOUTS,
  MAX_COLLAGE_PHOTOS,
  coverCrop,
  layoutRects,
  type AspectId,
  type GapId,
  type LayoutId,
} from "@/lib/collage-layouts";

const MAX_UPLOAD_BYTES = 1_800_000; // under the server's 2 MB cap, with headroom
const MAX_EDGE = 1600;

type Photo = { id: string; filename: string };

/** Canvas → JPEG under the size cap (steps the quality down if needed). */
async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  for (const q of [0.88, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
  }
  return null;
}

/** Any image file → a <= 1600px JPEG (re-encoding also drops EXIF/GPS). */
async function fileToJpeg(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG has no alpha: flatten transparent PNGs onto white.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvasToJpeg(canvas);
}

export type WelcomeValue = { imageId: string; previewUrl: string } | null;

/** Upload a prepared JPEG; resolves the new image id. */
async function uploadWelcome(projectId: string, blob: Blob): Promise<string> {
  const form = new FormData();
  form.set("file", blob, "welcome.jpg");
  const res = await fetch(`/api/projects/${projectId}/welcome`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { imageId?: string; error?: string };
  if (!res.ok || !body.imageId) {
    throw new Error(
      body.error === "too_many_pending"
        ? "Too many unused collages - send one of them first."
        : body.error === "too_large"
          ? "That image is too large - try a smaller one."
          : "Couldn't upload the collage - try again.",
    );
  }
  return body.imageId;
}

export function WelcomeCollage({
  projectId,
  value,
  onChange,
  disabled,
  accent,
  defaultCaption,
}: {
  projectId: string;
  value: WelcomeValue;
  onChange: (next: WelcomeValue) => void;
  disabled?: boolean;
  /** Studio accent color, offered as a background in the maker. */
  accent?: string;
  /** Pre-fills the maker's caption (e.g. the project title). */
  defaultCaption?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [makerOpen, setMakerOpen] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPG, PNG or WebP).");
      const jpeg = await fileToJpeg(file);
      if (!jpeg) throw new Error("Couldn't prepare that image - try a different one.");
      const imageId = await uploadWelcome(projectId, jpeg);
      onChange({ imageId, previewUrl: URL.createObjectURL(jpeg) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use that image.");
    }
    setBusy(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-40 flex-1">
          <p className="text-xs font-medium text-ink">Welcome collage <span className="font-normal text-ink-tertiary">(optional)</span></p>
          <p className="text-[11px] leading-relaxed text-ink-tertiary">
            Heads the email and the top of the gallery. It's visible to anyone who gets the email, so only use photos you're happy to show there.
          </p>
        </div>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={value.previewUrl} alt="Welcome collage preview" className="h-14 w-auto max-w-[140px] rounded-md border border-hairline object-cover" />
        )}
        <div className="flex flex-wrap gap-1.5">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => fileInput.current?.click()}>
            {busy ? "Working..." : value ? "Replace image" : "Upload image"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={() => setMakerOpen(true)}>
            Make a collage
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => onChange(null)}>
              Remove
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}

      <CollageMaker
        projectId={projectId}
        open={makerOpen}
        onOpenChange={setMakerOpen}
        accent={accent}
        defaultCaption={defaultCaption}
        onDone={(next) => {
          onChange(next);
          setMakerOpen(false);
        }}
      />
    </div>
  );
}

/* ---------------- the maker ---------------- */

const BACKGROUNDS: { id: string; label: string; color: (accent?: string) => string; ink: string }[] = [
  { id: "white", label: "White", color: () => "#ffffff", ink: "#222222" },
  { id: "ivory", label: "Ivory", color: () => "#f6f1e7", ink: "#3a3328" },
  { id: "black", label: "Black", color: () => "#111111", ink: "#f2f2f2" },
  { id: "accent", label: "Brand", color: (a) => a || "#5e6ad2", ink: "#ffffff" },
];

function CollageMaker({
  projectId,
  open,
  onOpenChange,
  onDone,
  accent,
  defaultCaption,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (value: WelcomeValue) => void;
  accent?: string;
  defaultCaption?: string;
}) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [aspect, setAspect] = useState<AspectId>("landscape");
  const [layout, setLayout] = useState<LayoutId>("grid");
  const [gapId, setGapId] = useState<GapId>("normal");
  const [bgId, setBgId] = useState("white");
  const [caption, setCaption] = useState(defaultCaption ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmaps = useRef(new Map<string, ImageBitmap>());
  const drawSeq = useRef(0);

  const loadPage = useCallback(
    async (after: string | null) => {
      try {
        const q = new URLSearchParams({ status: "approved", kind: "image", sort: "name", limit: "120" });
        if (after) q.set("cursor", after);
        const res = await fetch(`/api/projects/${projectId}/assets?${q}`);
        if (!res.ok) throw new Error("load");
        const body = (await res.json()) as { items: Photo[]; nextCursor: string | null };
        setPhotos((cur) => [...(after ? (cur ?? []) : []), ...body.items.map((i) => ({ id: i.id, filename: i.filename }))]);
        setCursor(body.nextCursor);
      } catch {
        setError("Couldn't load your photos - close and try again.");
      }
    },
    [projectId],
  );

  useEffect(() => {
    if (open && photos === null) void loadPage(null);
  }, [open, photos, loadPage]);

  // Free decoded bitmaps when the maker closes.
  useEffect(() => {
    if (open) return;
    for (const b of bitmaps.current.values()) b.close();
    bitmaps.current.clear();
  }, [open]);

  const bg = BACKGROUNDS.find((b) => b.id === bgId) ?? BACKGROUNDS[0];
  const hasCaption = caption.trim().length > 0;

  const bitmapFor = useCallback(async (id: string): Promise<ImageBitmap | null> => {
    const cached = bitmaps.current.get(id);
    if (cached) return cached;
    try {
      // The 1600px preview: sharp enough for a 1600px collage, light enough to load fast.
      const res = await fetch(`/api/assets/${id}?variant=preview`);
      if (!res.ok) throw new Error("fetch");
      const bitmap = await createImageBitmap(await res.blob());
      bitmaps.current.set(id, bitmap);
      return bitmap;
    } catch {
      return null;
    }
  }, []);

  const draw = useCallback(async () => {
    const el = canvas.current;
    if (!el) return;
    const seq = ++drawSeq.current;
    const { w, h } = ASPECTS[aspect];
    el.width = w;
    el.height = h;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = bg.color(accent);
    ctx.fillRect(0, 0, w, h);
    const rects = layoutRects({ layout, count: picks.length, aspect, gap: GAPS[gapId], reserveBottom: hasCaption ? CAPTION_BAND : 0 });
    for (const [i, id] of picks.entries()) {
      const bitmap = await bitmapFor(id);
      if (seq !== drawSeq.current) return; // a newer draw superseded this one
      const cell = rects[i];
      if (!bitmap || !cell) continue;
      const src = coverCrop(bitmap.width, bitmap.height, cell);
      ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, cell.x, cell.y, cell.w, cell.h);
    }
    if (hasCaption) {
      ctx.fillStyle = bg.ink;
      ctx.font = `italic 46px Georgia, "Times New Roman", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(caption.trim().slice(0, 70), w / 2, h - CAPTION_BAND / 2 - GAPS[gapId] / 2);
    }
  }, [aspect, layout, gapId, picks, bg, accent, hasCaption, caption, bitmapFor]);

  useEffect(() => {
    if (open) void draw();
  }, [open, draw]);

  function togglePick(id: string) {
    setPicks((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COLLAGE_PHOTOS ? cur : [...cur, id]));
  }

  function shift(index: number, by: -1 | 1) {
    setPicks((cur) => {
      const next = [...cur];
      const to = index + by;
      if (to < 0 || to >= next.length) return cur;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  }

  async function useCollage() {
    const el = canvas.current;
    if (!el || !picks.length) return;
    setBusy(true);
    setError("");
    try {
      await draw();
      const blob = await canvasToJpeg(el);
      if (!blob) throw new Error("The collage is too large to send - try fewer photos.");
      const imageId = await uploadWelcome(projectId, blob);
      onDone({ imageId, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the collage - try again.");
    }
    setBusy(false);
  }

  const byId = useMemo(() => new Map((photos ?? []).map((p) => [p.id, p])), [photos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle>Make a welcome collage</DialogTitle>
          <DialogDescription>Pick up to {MAX_COLLAGE_PHOTOS} photos, choose a look, and it goes at the top of the email and the gallery.</DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[1fr_1.1fr]">
          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-xs font-medium text-ink">
              1. Choose photos <span className="font-normal text-ink-tertiary">({picks.length} of {MAX_COLLAGE_PHOTOS})</span>
            </p>
            <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-hairline bg-surface-1 p-1.5 sm:grid-cols-5 md:max-h-[22rem]">
              {photos === null ? (
                <p className="col-span-full py-6 text-center text-xs text-ink-subtle">Loading photos...</p>
              ) : photos.length === 0 ? (
                <p className="col-span-full py-6 text-center text-xs text-ink-subtle">Approve some photos in this project first.</p>
              ) : (
                photos.map((p) => {
                  const n = picks.indexOf(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePick(p.id)}
                      aria-pressed={n >= 0}
                      aria-label={`${p.filename}${n >= 0 ? `, photo ${n + 1}` : ""}`}
                      className={`relative aspect-square overflow-hidden rounded-md border bg-canvas ${n >= 0 ? "border-[var(--accent)] ring-2 ring-[var(--accent)]" : "border-hairline"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- authorized proxy, no optimizer */}
                      <img src={`/api/assets/${p.id}?variant=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
                      {n >= 0 && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-semibold text-white">{n + 1}</span>}
                    </button>
                  );
                })
              )}
              {cursor && (
                <Button type="button" size="sm" variant="outline" className="col-span-full" onClick={() => void loadPage(cursor)}>
                  Load more photos
                </Button>
              )}
            </div>
            {picks.length > 1 && (
              <ol className="flex flex-wrap gap-1.5" aria-label="Photo order in the collage">
                {picks.map((id, i) => (
                  <li key={id} className="flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-[11px] text-ink-muted">
                    <span className="max-w-24 truncate">{i + 1}. {byId.get(id)?.filename}</span>
                    <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => shift(i, -1)} className="px-0.5 disabled:opacity-30">‹</button>
                    <button type="button" aria-label="Move later" disabled={i === picks.length - 1} onClick={() => shift(i, 1)} className="px-0.5 disabled:opacity-30">›</button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-2">
            <p className="text-xs font-medium text-ink">2. Choose a look</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <label className="flex flex-col gap-1 text-ink-subtle">
                Shape
                <select value={aspect} onChange={(e) => setAspect(e.target.value as AspectId)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink">
                  {(Object.keys(ASPECTS) as AspectId[]).map((a) => (
                    <option key={a} value={a}>{ASPECTS[a].label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-ink-subtle">
                Layout
                <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutId)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink">
                  {LAYOUTS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-ink-subtle">
                Spacing
                <select value={gapId} onChange={(e) => setGapId(e.target.value as GapId)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink">
                  <option value="tight">Tight</option>
                  <option value="normal">Normal</option>
                  <option value="airy">Airy</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-ink-subtle">
                Background
                <select value={bgId} onChange={(e) => setBgId(e.target.value)} className="snap-select rounded-md border border-hairline bg-canvas px-2 py-1.5 text-xs text-ink">
                  {BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 70))}
              placeholder="Caption (optional) - e.g. Mia & Leo · June 2026"
              className="rounded-md border border-hairline bg-canvas px-3 py-1.5 text-sm text-ink"
            />
            <div className="flex min-h-48 flex-1 items-center justify-center rounded-lg border border-hairline bg-surface-1 p-2">
              {picks.length === 0 ? (
                <p className="text-xs text-ink-subtle">Pick photos to see your collage.</p>
              ) : null}
              <canvas ref={canvas} className={`max-h-72 w-full rounded-md object-contain ${picks.length === 0 ? "hidden" : ""}`} style={{ aspectRatio: `${ASPECTS[aspect].w} / ${ASPECTS[aspect].h}` }} />
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" disabled={!picks.length || busy} onClick={() => void useCollage()}>
            {busy ? "Saving..." : "Use this collage"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- manage a SENT gallery's collage ---------------- */

export function GrantCollageDialog({
  grantId,
  projectId,
  open,
  onOpenChange,
  accent,
  defaultCaption,
}: {
  grantId: string | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accent?: string;
  defaultCaption?: string;
}) {
  const [current, setCurrent] = useState<{ url: string | null; proofing: boolean } | null>(null);
  const [value, setValue] = useState<WelcomeValue>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !grantId) return;
    setCurrent(null);
    setValue(null);
    setStatus("");
    void fetch(`/api/grants/${grantId}/welcome`)
      .then((r) => (r.ok ? (r.json() as Promise<{ url: string | null; proofing: boolean }>) : null))
      .then((body) => setCurrent(body ?? { url: null, proofing: false }))
      .catch(() => setCurrent({ url: null, proofing: false }));
  }, [open, grantId]);

  async function change(next: WelcomeValue) {
    if (!grantId) return;
    setStatus("Saving...");
    try {
      if (next) {
        const res = await fetch(`/api/grants/${grantId}/welcome`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageId: next.imageId }),
        });
        const body = (await res.json().catch(() => ({}))) as { url?: string | null; error?: string };
        if (!res.ok) throw new Error(body.error === "proofing" ? "Proofing galleries can't have a collage." : "Couldn't save it - try again.");
        setValue(next);
        setCurrent((c) => ({ url: body.url ?? null, proofing: c?.proofing ?? false }));
        setStatus("Saved - it's on the gallery now. Press Re-send to put it in the email too.");
      } else {
        await fetch(`/api/grants/${grantId}/welcome`, { method: "DELETE" });
        setValue(null);
        setCurrent((c) => ({ url: null, proofing: c?.proofing ?? false }));
        setStatus("Removed.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't save it - try again.");
    }
  }

  const shown = value?.previewUrl ?? current?.url ?? null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome collage</DialogTitle>
          <DialogDescription>Shown at the top of this gallery and in its email.</DialogDescription>
        </DialogHeader>
        {current === null ? (
          <p className="py-6 text-center text-sm text-ink-subtle">Loading...</p>
        ) : current.proofing ? (
          <p className="text-sm text-ink-subtle">Proofing galleries can't have a welcome collage - it would put clean, unwatermarked photos in a public email.</p>
        ) : (
          <div className="space-y-3">
            {shown && (
              // eslint-disable-next-line @next/next/no-img-element -- signed route / local blob
              <img src={shown} alt="Current welcome collage" className="mx-auto max-h-64 w-auto rounded-lg border border-hairline object-contain" />
            )}
            <WelcomeCollage
              projectId={projectId}
              value={shown ? { imageId: value?.imageId ?? "current", previewUrl: shown } : null}
              onChange={(next) => void change(next)}
              accent={accent}
              defaultCaption={defaultCaption}
            />
            {status && <p className="text-xs text-ink-subtle" aria-live="polite">{status}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

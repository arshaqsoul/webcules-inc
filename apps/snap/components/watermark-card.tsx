"use client";

/* Settings → Brand → Watermark card (WEB-242): mode picker with a live
 * canvas mini-preview, clamped sliders, text input, save via the brand
 * PATCH, and the browser-side bulk "re-generate watermarked previews"
 * backfill (paged loop with progress + resume-on-revisit). */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@webcules/ui/components/button";

import { drawWatermark, loadWatermarkLogo } from "@/components/watermark-canvas";

type WmMode = "off" | "corner" | "tiled" | "text";
type WmState = { mode: WmMode; opacity: number; scale: number; margin: number; text: string };

export function WatermarkCard({
  initial,
  studioName,
  logoUrl,
  entitled,
}: {
  initial: WmState;
  studioName: string;
  /** Public watermark-source URL (2/8 asset); null → text fallbacks. */
  logoUrl: string | null;
  entitled: boolean;
}) {
  const router = useRouter();
  const [wm, setWm] = useState<WmState>(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Bulk backfill state.
  const [bulk, setBulk] = useState<{ running: boolean; done: number; total: number | null }>({ running: false, done: 0, total: null });

  useEffect(() => {
    void loadWatermarkLogo(logoUrl).then(setLogo);
  }, [logoUrl]);

  // Live mini-preview — a gradient "photo" with the current config applied.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 320, 200);
    grad.addColorStop(0, "#8aa6c1");
    grad.addColorStop(0.55, "#c9b29b");
    grad.addColorStop(1, "#5f7a63");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 200);
    if (wm.mode !== "off") {
      drawWatermark(ctx, {
        config: {
          mode: wm.mode === "text" ? "text" : wm.mode,
          opacity: wm.opacity,
          scale: wm.scale,
          margin: wm.margin,
          ...(wm.mode === "text" && wm.text.trim() ? { text: wm.text.trim() } : {}),
        },
        logo: wm.mode === "text" ? null : logo,
        studioName,
      });
    }
  }, [wm, logo, studioName]);

  async function save() {
    setBusy(true);
    setStatus(null);
    const body =
      wm.mode === "off"
        ? { watermark: null }
        : {
            watermark: {
              mode: wm.mode,
              opacity: wm.opacity,
              scale: wm.scale,
              margin: wm.margin,
              ...(wm.mode === "text" && wm.text.trim() ? { text: wm.text.trim() } : {}),
            },
          };
    const res = await fetch("/api/studio/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      setStatus(wm.mode === "off" ? "Watermark off — galleries serve clean previews." : "Watermark saved. Regenerate previews to apply to existing photos.");
      router.refresh();
    } else if (res.status === 403) {
      setStatus("Watermarks are part of white-label (Studio & Pro).");
    } else {
      setStatus("Save failed — try again.");
    }
  }

  /** Bulk backfill: page through eligible assets, composite each preview in
   * the browser, push preview_wm derivatives. Resume-safe (keyset cursor). */
  async function regenerate() {
    if (bulk.running) return;
    setBulk({ running: true, done: 0, total: null });
    setStatus("Regenerating watermarked previews…");
    const cfg =
      wm.mode === "off"
        ? null
        : {
            mode: wm.mode as "corner" | "tiled" | "text",
            opacity: wm.opacity,
            scale: wm.scale,
            margin: wm.margin,
            ...(wm.mode === "text" && wm.text.trim() ? { text: wm.text.trim() } : {}),
          };
    let cursor = "";
    let done = 0;
    try {
      for (;;) {
        const listRes = await fetch(`/api/studio/watermark/assets?limit=50${cursor ? `&after=${cursor}` : ""}`);
        if (!listRes.ok) break;
        const list = (await listRes.json()) as { ids: string[]; nextCursor: string | null };
        if (list.ids.length === 0) break;
        for (const id of list.ids) {
          if (!cfg) break; // off → nothing to draw
          const imgRes = await fetch(`/api/assets/${id}?variant=preview`);
          if (!imgRes.ok) continue;
          const blob = await imgRes.blob();
          const bitmap = await createImageBitmap(blob).catch(() => null);
          if (!bitmap) continue;
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          drawWatermark(ctx, { config: cfg, logo, studioName });
          const out = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.85));
          if (!out) continue;
          const form = new FormData();
          form.set("kind", "preview_wm");
          form.set("file", out, "preview_wm.jpg");
          form.set("replace", "1");
          await fetch(`/api/assets/${id}/derivative`, { method: "POST", body: form }).catch(() => null);
          done += 1;
          setBulk({ running: true, done, total: null });
        }
        if (!cfg || !list.nextCursor) break;
        cursor = list.nextCursor;
      }
      setStatus(`Regenerated ${done} watermarked preview${done === 1 ? "" : "s"}.`);
    } catch {
      setStatus(`Regeneration paused after ${done} — click again to resume.`);
    }
    setBulk({ running: false, done, total: null });
  }

  if (!entitled) {
    return (
      <div className="mt-5 rounded-[12px] border border-hairline bg-surface-1 p-4">
        <p className="text-sm font-medium text-ink">Watermark your gallery previews</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
          Your logo or studio name on gallery previews — originals and client downloads stay clean. Included on the
          Studio and Pro plans.
        </p>
        <a href="/dashboard/settings/billing" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
          Upgrade to Studio →
        </a>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-[12px] border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-56 flex-1">
          <p className="text-sm font-medium text-ink">Watermark gallery previews</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
            Applied to client gallery previews only — originals and standard downloads stay clean. Proofing galleries
            deliver watermarked downloads.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-ink-subtle">
              Mode
              <select
                value={wm.mode}
                onChange={(e) => setWm((w) => ({ ...w, mode: e.target.value as WmMode }))}
                className="snap-select rounded-md border border-input bg-background px-3 py-2 text-sm text-ink"
              >
                <option value="off">Off</option>
                <option value="corner">Logo — corner</option>
                <option value="tiled">Logo — tiled</option>
                <option value="text">Studio name text</option>
              </select>
            </label>
            {wm.mode === "text" && (
              <label className="flex flex-col gap-1 text-xs text-ink-subtle">
                Text (defaults to your studio name)
                <input
                  value={wm.text}
                  onChange={(e) => setWm((w) => ({ ...w, text: e.target.value.slice(0, 60) }))}
                  placeholder={studioName}
                  maxLength={60}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-ink"
                />
              </label>
            )}
            {wm.mode !== "off" && (
              <>
                <label className="flex flex-col gap-1 text-xs text-ink-subtle">
                  Opacity — {Math.round(wm.opacity * 100)}%
                  <input
                    type="range"
                    min={5}
                    max={60}
                    value={Math.round(wm.opacity * 100)}
                    onChange={(e) => setWm((w) => ({ ...w, opacity: Number(e.target.value) / 100 }))}
                    className="accent-primary"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-ink-subtle">
                  Size — {Math.round(wm.scale * 100)}%
                  <input
                    type="range"
                    min={5}
                    max={50}
                    value={Math.round(wm.scale * 100)}
                    onChange={(e) => setWm((w) => ({ ...w, scale: Number(e.target.value) / 100 }))}
                    className="accent-primary"
                  />
                </label>
              </>
            )}
          </div>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element -- canvas element, not an img */}
        <canvas ref={canvasRef} className="h-[130px] w-[208px] shrink-0 rounded-lg border border-hairline" aria-label="Watermark preview" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save watermark"}
        </Button>
        {wm.mode !== "off" && (
          <Button size="sm" variant="outline" onClick={() => void regenerate()} disabled={bulk.running}>
            {bulk.running ? `Regenerating… ${bulk.done}` : bulk.done > 0 ? `Regenerate previews (${bulk.done} done)` : "Regenerate previews"}
          </Button>
        )}
      </div>
      {bulk.running && (
        <p className="mt-2 text-xs text-ink-tertiary">Processing existing previews in the background — keep this tab open.</p>
      )}
      {status && <p className="mt-2 text-sm text-ink-subtle">{status}</p>}
    </div>
  );
}

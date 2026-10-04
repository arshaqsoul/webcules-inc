/* Browser-side helpers shared by every place a photographer arranges photos
 * (the Files-tab Share panel and the sent-gallery Arrange view): loading a
 * project's deliverable photos with their sort metadata, and making sure the
 * metadata a sort needs exists (EXIF capture dates are read server-side;
 * colors are analysed here from the thumbnails). */
import { colorKeyFromRgba } from "./color-sort";
import { orderedIdsForSort, type OrderItem, type SortMode } from "./gallery-order";

export type ArrangeItem = OrderItem & { kind: string };

type Status = (message: string) => void;

/** Rainbow analysis: thumbnail → 24x24 → colorKeyFromRgba, saved in batches. */
export async function analyzeColors(
  ids: string[],
  onProgress: (done: number) => void,
  save: (items: { id: string; key: number }[]) => Promise<void>,
): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  let done = 0;
  let batch: { id: string; key: number }[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const out = batch;
    batch = [];
    await save(out);
  };
  for (const id of ids) {
    try {
      const img = new Image();
      img.src = `/api/assets/${id}?variant=thumb`;
      await img.decode();
      ctx.clearRect(0, 0, 24, 24);
      ctx.drawImage(img, 0, 0, 24, 24);
      batch.push({ id, key: colorKeyFromRgba(ctx.getImageData(0, 0, 24, 24).data) });
    } catch {
      // no decodable thumbnail (RAW/HEIC) - stays unanalysed and sorts last
    }
    done += 1;
    onProgress(done);
    if (batch.length >= 100) await flush();
  }
  await flush();
}

/** Make sure every photo has what `mode` sorts on. Date taken: the server
 * reads EXIF in bounded passes. Color: this browser analyses thumbnails. */
export async function ensureSortMeta(projectId: string, mode: SortMode, galleryIds: Set<string>, status: Status): Promise<void> {
  const url = `/api/projects/${projectId}/assets/order-meta`;
  if (mode === "taken_old" || mode === "taken_new") {
    status("Reading when each photo was taken...");
    for (let pass = 0; pass < 200; pass++) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan: true }) });
      const body = (await res.json().catch(() => ({}))) as { remaining?: number };
      if (!res.ok || !body.remaining) break;
      status(`Reading when each photo was taken... ${body.remaining} to go`);
    }
  }
  if (mode === "color") {
    const res = await fetch(url);
    const meta = (await res.json().catch(() => ({}))) as { missingColor?: string[] };
    const missing = (meta.missingColor ?? []).filter((id) => galleryIds.has(id));
    if (missing.length) {
      await analyzeColors(
        missing,
        (done) => status(`Analyzing colors... ${done} of ${missing.length}`),
        async (items) => {
          await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ colors: items }) });
        },
      );
    }
  }
  status("");
}

type FeedItem = { id: string; filename: string; kind: string; createdAt: string; capturedAt: number | null; colorKey: number | null; folderName?: string | null };

/** All deliverable (approved + shared) photos of a project - optionally only
 * some folders - paged until complete, with the metadata sorts need. */
export async function fetchDeliverableItems(projectId: string, folders: { id: string; name: string }[] | null, folderIds: string[]): Promise<ArrangeItem[]> {
  const nameOf = new Map((folders ?? []).map((f) => [f.id, f.name]));
  const scopes: (string | null)[] = folderIds.length ? folderIds : [null];
  const seen = new Set<string>();
  const out: ArrangeItem[] = [];
  for (const folderId of scopes) {
    for (const status of ["approved", "shared"] as const) {
      let cursor: string | null = null;
      for (let page = 0; page < 40; page++) {
        const q = new URLSearchParams({ status, limit: "200", sort: "date" });
        if (folderId) q.set("folder", folderId);
        if (cursor) q.set("cursor", cursor);
        let body: { items: (FeedItem & { folderId: string | null })[]; nextCursor: string | null };
        try {
          const res = await fetch(`/api/projects/${projectId}/assets?${q}`);
          if (!res.ok) break;
          body = await res.json();
        } catch {
          break;
        }
        for (const a of body.items) {
          if (seen.has(a.id) || (a.kind !== "image" && a.kind !== "video")) continue;
          seen.add(a.id);
          out.push({
            id: a.id,
            filename: a.filename,
            kind: a.kind,
            createdAtSec: Math.floor(new Date(a.createdAt).getTime() / 1000),
            capturedAtSec: a.capturedAt,
            colorKey: a.colorKey,
            folder: a.folderId ? nameOf.get(a.folderId) ?? null : null,
          });
        }
        cursor = body.nextCursor;
        if (!cursor) break;
      }
    }
  }
  // Default send order = upload order, folders grouped (what the server does).
  const ids = orderedIdsForSort(out.sort((a, b) => a.createdAtSec - b.createdAtSec || (a.id < b.id ? -1 : 1)), "upload_old");
  const byId = new Map(out.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)!);
}

/* Download-all delivery (downloads 3.0): resolves what a client (or the
 * studio's favorites export) asked for, plans it into <= 2 GiB archives, and
 * streams one part per request straight from R2. Shared by the gallery route
 * (/api/g/{token}/zip) and the studio favorites export so both deliver the
 * exact same bytes the single-photo route would:
 *   - proofing galleries get the watermarked derivative, never originals;
 *   - original JPEGs are EXIF/GPS-stripped (WEB-172);
 *   - web size uses the ~2048px preview derivative (WEB-261). */
import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "./db";
import * as schema from "./db-schema";
import { stripJpegExif } from "./exif";
import { getObject } from "./storage/service";
import { getGrantById, grantIsOpen } from "./shares/grants";
import type { DownloadScope, SizePref } from "./gallery-downloads";
import {
  ENTRY_MAX_BYTES,
  allocateZipName,
  planParts,
  planRevision,
  zipReadable,
  type PlanItem,
  type PlannedPart,
  type ZipEntry,
} from "./zip-stream";

/** Derivatives are ~2048px JPEGs; used to size parts without a HEAD per file. */
const DERIVATIVE_ESTIMATE_BYTES = 2_500_000;
/** Above this a JPEG streams unstripped rather than risking Worker memory. */
const STRIP_BUFFER_MAX_BYTES = 64 * 1024 * 1024;
/** How often an open stream re-checks that the grant is still live. */
const GUARD_INTERVAL_MS = 3000;

export type ZipSelection = {
  scope: DownloadScope;
  folderName?: string | null;
  assetIds?: string[];
  size: SizePref;
};

type ZipRow = {
  id: string;
  filename: string;
  mimeType: string;
  kind: string;
  bytes: number;
  storageKey: string;
  thumbKey: string | null;
  previewKey: string | null;
  previewWmKey: string | null;
  folderName: string | null;
};

export type ZipPlan = {
  organizationId: string;
  grantId: string;
  items: PlanItem[];
  parts: PlannedPart[];
  /** Fingerprint - changes when the gallery changes between part requests. */
  revision: string;
  /** Files too large for a classic archive; delivered individually. */
  oversize: { id: string; filename: string }[];
  totalBytes: number;
  entryFor: Map<string, ZipEntry["open"]>;
};

export type ZipManifest = {
  files: number;
  bytes: number;
  revision: string;
  parts: { index: number; files: number; bytes: number }[];
  oversize: { id: string; filename: string }[];
};

/** Photos + films in the delivered set matching the selection. Ordered
 * (folder, filename, id) so the split into parts is deterministic. */
async function resolveRows(grantId: string, sel: ZipSelection): Promise<ZipRow[]> {
  const db = getDb();
  const rows: ZipRow[] = await db
    .select({
      id: schema.assets.id,
      filename: schema.assets.filename,
      mimeType: schema.assets.mimeType,
      kind: schema.assets.kind,
      bytes: schema.assets.bytes,
      storageKey: schema.assets.storageKey,
      thumbKey: schema.assets.thumbKey,
      previewKey: schema.assets.previewKey,
      previewWmKey: schema.assets.previewWmKey,
      folderName: schema.shareGrantAssets.folderName,
    })
    .from(schema.shareGrantAssets)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.shareGrantAssets.assetId))
    .where(and(eq(schema.shareGrantAssets.grantId, grantId), inArray(schema.assets.kind, ["image", "video"])));

  let picked = rows;
  if (sel.scope === "photos") {
    const wanted = new Set(sel.assetIds ?? []);
    picked = rows.filter((r) => wanted.has(r.id));
  } else if (sel.scope === "folder") {
    picked = rows.filter((r) => r.folderName === (sel.folderName ?? null));
  } else if (sel.scope === "favorites") {
    const favs = await db
      .select({ assetId: schema.galleryFavorites.assetId })
      .from(schema.galleryFavorites)
      .where(eq(schema.galleryFavorites.grantId, grantId));
    const ids = new Set(favs.map((f) => f.assetId));
    picked = rows.filter((r) => ids.has(r.id));
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return picked.sort((a, b) => cmp(a.folderName ?? "", b.folderName ?? "") || cmp(a.filename, b.filename) || cmp(a.id, b.id));
}

/** Which R2 object ships for a row - mirrors /api/assets/{id}?download=1. */
function sourceKey(row: ZipRow, size: SizePref, proofing: boolean): { key: string; strip: boolean; derivative: boolean } | null {
  if (row.kind === "video") {
    return proofing ? null : { key: row.storageKey, strip: false, derivative: false };
  }
  if (proofing) {
    const key = row.previewWmKey ?? row.previewKey ?? row.thumbKey;
    return key ? { key, strip: false, derivative: true } : null; // originals never leave a proofing grant
  }
  if (size === "web" && row.previewKey) return { key: row.previewKey, strip: false, derivative: true };
  return { key: row.storageKey, strip: row.mimeType === "image/jpeg", derivative: false };
}

export async function buildZipPlan(params: {
  organizationId: string;
  grantId: string;
  proofing: boolean;
  selection: ZipSelection;
}): Promise<ZipPlan> {
  const rows = await resolveRows(params.grantId, params.selection);
  const taken = new Set<string>();
  const items: PlanItem[] = [];
  const oversize: { id: string; filename: string }[] = [];
  const entryFor = new Map<string, ZipEntry["open"]>();

  for (const row of rows) {
    const src = sourceKey(row, params.selection.size, params.proofing);
    if (!src) continue;
    if (row.bytes >= ENTRY_MAX_BYTES) {
      oversize.push({ id: row.id, filename: row.filename });
      continue;
    }
    const name = allocateZipName(taken, row.folderName, row.filename);
    const estimate = src.derivative ? Math.min(row.bytes || DERIVATIVE_ESTIMATE_BYTES, DERIVATIVE_ESTIMATE_BYTES) : row.bytes;
    items.push({ id: row.id, name, bytes: estimate });
    entryFor.set(row.id, async () => {
      try {
        const object = await getObject(params.organizationId, src.key);
        if (!object?.body) return null;
        if (src.strip && object.size <= STRIP_BUFFER_MAX_BYTES) {
          // Original JPEGs leave a client gallery EXIF/GPS-free (WEB-172).
          const buf = await new Response(object.body).arrayBuffer();
          const stripped = stripJpegExif(buf);
          return { bytes: stripped ?? new Uint8Array(buf) };
        }
        return { stream: object.body, size: object.size };
      } catch (err) {
        console.error("zip entry unreadable:", String(err));
        return null;
      }
    });
  }

  return {
    organizationId: params.organizationId,
    grantId: params.grantId,
    items,
    parts: planParts(items),
    revision: await planRevision(items),
    oversize,
    totalBytes: items.reduce((n, i) => n + i.bytes, 0),
    entryFor,
  };
}

export function manifestOf(plan: ZipPlan): ZipManifest {
  return {
    files: plan.items.length,
    bytes: plan.totalBytes,
    revision: plan.revision,
    parts: plan.parts.map((p) => ({ index: p.index, files: p.items.length, bytes: p.bytes })),
    oversize: plan.oversize,
  };
}

/** A grant-liveness check, throttled so a 20 GB stream costs a handful of
 * D1 reads, not one per photo. Revoking (or expiring) a gallery aborts every
 * open download within seconds. */
export function grantGuard(grantId: string, intervalMs = GUARD_INTERVAL_MS): () => Promise<void> {
  let lastCheck = Date.now();
  return async () => {
    if (Date.now() - lastCheck < intervalMs) return;
    lastCheck = Date.now();
    const grant = await getGrantById(grantId);
    if (!grant || !grantIsOpen(grant)) throw new Error("gallery revoked or expired during download");
  };
}

function safeFilePart(label: string): string {
  return label.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Photos";
}

/** One part as a streamed ZIP response. `part` is 1-based. */
export function zipPartResponse(plan: ZipPlan, part: number, opts: { label: string; guard?: () => Promise<void> }): Response {
  const planned = plan.parts[part - 1];
  if (!planned) return Response.json({ error: "no_such_part" }, { status: 404 });
  const entries: ZipEntry[] = planned.items.map((item) => ({ name: item.name, open: plan.entryFor.get(item.id)! }));
  const suffix = plan.parts.length > 1 ? ` - part ${part} of ${plan.parts.length}` : "";
  const filename = `${safeFilePart(opts.label)}${suffix}.zip`;
  return new Response(zipReadable(entries, { beforeEntry: opts.guard }), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

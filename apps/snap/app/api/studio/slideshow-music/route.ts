/* /api/studio/slideshow-music (WEB-259) — the BYO music library. Upload is
 * Lite+ (marginal feature), MP3/AAC/M4A ≤ 15 MB, byte-sniffed (extension
 * alone is never trusted), with a rights warranty checkbox recorded in the
 * audit log. No catalog, no licensing on snap's books. */
import { permissionDenied } from "@/lib/permissions";
import { z } from "zod";

import { getDb } from "@/lib/db";
import * as schema from "@/lib/db-schema";
import { getOrgContext } from "@/lib/session";
import { getPlanEntitlements } from "@/lib/plans";
import { putObject } from "@/lib/storage/service";
import { audioMimeOf, MUSIC_MAX_BYTES, sniffAudio } from "@/lib/slideshow";
import { createTrack, listTracks } from "@/lib/repos/slideshow";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;
  const tracks = await listTracks(ctx.organizationId);
  return Response.json({
    tracks: tracks.map((t) => ({ id: t.id, name: t.name, mimeType: t.mimeType, bytes: t.bytes, createdAt: t.createdAt.toISOString() })),
  });
}

export async function POST(req: Request) {
  const ctx = await getOrgContext();
  if (!ctx) return Response.json({ error: "unauthorized" }, { status: 401 });
  const denied = permissionDenied(ctx, "settings.write");
  if (denied) return denied;

  const ent = await getPlanEntitlements(ctx.organizationId);
  if (ent?.id === "free") return Response.json({ error: "music_requires_lite" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected_multipart" }, { status: 400 });
  }
  const file = form.get("file");
  const warranted = form.get("warranted") === "true";
  if (!(file instanceof File)) return Response.json({ error: "missing_file" }, { status: 400 });
  if (!warranted) return Response.json({ error: "rights_warranty_required" }, { status: 400 });
  if (file.size > MUSIC_MAX_BYTES) {
    return Response.json({ error: "file_too_large", maxBytes: MUSIC_MAX_BYTES }, { status: 400 });
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  const kind = sniffAudio(buf);
  if (!kind) {
    return Response.json({ error: "unsupported_audio", allowed: ["mp3", "aac", "m4a"] }, { status: 400 });
  }

  const safeName = file.name.replace(/[^\w .\-']/g, "").trim().slice(0, 120) || "track";
  const key = await putObject(ctx.organizationId, `audio/${crypto.randomUUID()}/${safeName}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), audioMimeOf(kind));
  const track = await createTrack({
    organizationId: ctx.organizationId,
    name: safeName,
    storageKey: key,
    mimeType: audioMimeOf(kind),
    bytes: file.size,
  });

  await getDb().insert(schema.auditLog).values({
    id: crypto.randomUUID(),
    organizationId: ctx.organizationId,
    actorType: "user",
    actorId: ctx.user.id,
    action: "slideshow.music_uploaded",
    targetType: "slideshow_track",
    targetId: track.id,
    meta: JSON.stringify({ name: track.name, bytes: track.bytes, warranted: true }),
  });

  return Response.json({ id: track.id, name: track.name, bytes: track.bytes });
}

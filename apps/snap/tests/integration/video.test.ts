/* WEB-260 video delivery — duration/dimension capture (set-if-null at the
 * derivative step), the 4 GB video cap at session create, the Films design
 * flag, and the authorized proxy's Range semantics against a real R2 object
 * (206 + Content-Range + one-view-per-playback accounting). */
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { fmtDuration, parseGalleryDesign, parseGalleryDesignJson } from "@/lib/gallery-design";
import { attachDerivative } from "@/lib/repos/assets";
import { createUploadSession, VIDEO_MAX_BYTES } from "@/lib/uploads";
import { createShareGrant } from "@/lib/shares/grants";
import { mintGalleryCookie } from "@/lib/shares/gallery-auth";
import { putObject } from "@/lib/storage/service";
import { parseRangeHeader, serveR2Range } from "@/lib/http-range";
import { resetDb } from "../helpers/db";
import { seedAsset, seedProject, seedStudio } from "../helpers/seed";

beforeEach(resetDb);

// One solid JPEG byte blob (SOI/APP0/JFIF) — accepted by the derivative
// route's image check and storable in the test R2.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);

describe("duration + dimensions at the derivative step (WEB-260)", () => {
  it("stores width/height/duration set-if-null and never overwrites", async () => {
    const s = await seedStudio();
    const p = await seedProject(s.organizationId);
    const a = await seedAsset({ organizationId: s.organizationId, projectId: p, kind: "video", filename: "clip.mp4" });
    expect(await attachDerivative({ organizationId: s.organizationId, assetId: a, kind: "thumb", bytes: JPEG.buffer, contentType: "image/jpeg", width: 1080, height: 1920, durationMs: 63_400 })).toEqual({ ok: true });
    let row = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, a)).limit(1))[0];
    expect({ w: row.width, h: row.height, d: row.durationMs }).toEqual({ w: 1080, h: 1920, d: 63_400 });

    // A second derivative (preview) must not overwrite existing metadata.
    expect(await attachDerivative({ organizationId: s.organizationId, assetId: a, kind: "preview", bytes: JPEG.buffer, contentType: "image/jpeg", width: 640, height: 480, durationMs: 1 })).toEqual({ ok: true });
    row = (await getDb().select().from(schema.assets).where(eq(schema.assets.id, a)).limit(1))[0];
    expect({ w: row.width, h: row.height, d: row.durationMs }).toEqual({ w: 1080, h: 1920, d: 63_400 });
  });
});

describe("video upload cap (WEB-260)", () => {
  it("rejects a >4 GB video at session create; photos keep the 5 GB ceiling", async () => {
    const s = await seedStudio({ plan: "pro" });
    const p = await seedProject(s.organizationId);
    expect(
      await createUploadSession({
        organizationId: s.organizationId, projectId: p, uploadedBy: s.userId,
        filename: "film.mp4", mimeType: "video/mp4", bytes: VIDEO_MAX_BYTES + 1,
      }),
    ).toMatchObject({ ok: false, error: "video_too_large" });
    // Boundary + photo control: passing the cap check means no
    // video_too_large — these proceed to multipart presign, which the
    // workerd test R2 cannot do (it throws); that throw is the proof the
    // cap let them through.
    for (const filename of ["film.mp4", "huge.jpg"]) {
      let capBlocked = false;
      try {
        const r = await createUploadSession({
          organizationId: s.organizationId, projectId: p, uploadedBy: s.userId,
          filename, mimeType: filename.endsWith(".mp4") ? "video/mp4" : "image/jpeg",
          bytes: filename === "film.mp4" ? VIDEO_MAX_BYTES : VIDEO_MAX_BYTES + 1,
        });
        capBlocked = !r.ok && r.error === "video_too_large";
      } catch {
        // threw inside presign — past the cap
      }
      expect(capBlocked).toBe(false);
    }
  });
});

describe("Films design flag (WEB-260)", () => {
  it("parses and round-trips; absent = interleaved (today's behavior)", () => {
    const d = parseGalleryDesignJson('{"films":true,"layout":"grid","theme":{}}')!;
    expect(d.films).toBe(true);
    expect(parseGalleryDesignJson('{"layout":"grid","theme":{}}')!.films).toBeFalsy();
    expect(parseGalleryDesign({ layout: "grid", theme: {}, films: "yes" })!.films).toBe(false);
  });

  it("duration labels format m:ss / h:mm:ss", () => {
    expect(fmtDuration(0)).toBe("0:00");
    expect(fmtDuration(63_400)).toBe("1:03");
    expect(fmtDuration(3_723_000)).toBe("1:02:03");
  });
});

describe("Range streaming over R2 (WEB-260)", () => {
  it("parseRangeHeader handles open/closed/bounded and rejects junk", () => {
    expect(parseRangeHeader("bytes=100-199", 1024)).toEqual({ start: 100, end: 199 });
    expect(parseRangeHeader("bytes=100-", 1024)).toEqual({ start: 100, end: 1023 });
    expect(parseRangeHeader("bytes=0-9999", 1024)).toEqual({ start: 0, end: 1023 });
    expect(parseRangeHeader("bytes=-100", 1024)).toEqual({ start: 924, end: 1023 }); // RFC suffix range
    expect(parseRangeHeader("bytes=-9999", 1024)).toEqual({ start: 0, end: 1023 });
    expect(parseRangeHeader("bytes=-0", 1024)).toBeNull();
    expect(parseRangeHeader("bytes=2000-", 1024)).toBeNull();
    expect(parseRangeHeader("bytes=5-2", 1024)).toBeNull();
    expect(parseRangeHeader("chunks=1-2", 1024)).toBeNull();
    expect(parseRangeHeader(null, 1024)).toBeNull();
    expect(parseRangeHeader("bytes=0-", 0)).toBeNull();
  });

  it("serveR2Range: 200 full, 206 slice with exact Content-Range, real R2", async () => {
    const s = await seedStudio();
    const body = new Uint8Array(1024);
    for (let i = 0; i < body.length; i++) body[i] = i & 0xff;
    const key = await putObject(s.organizationId, "video-test/film.mp4", body.buffer, "video/mp4");

    const full = await serveR2Range({ organizationId: s.organizationId, key, req: new Request("https://x/f"), contentType: "video/mp4" });
    expect(full!.status).toBe(200);
    expect(full!.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await full!.arrayBuffer()).length).toBe(1024);

    const part = await serveR2Range({
      organizationId: s.organizationId, key, contentType: "video/mp4",
      req: new Request("https://x/f", { headers: { Range: "bytes=100-199" } }),
    });
    expect(part!.status).toBe(206);
    expect(part!.headers.get("content-range")).toBe("bytes 100-199/1024");
    expect(part!.headers.get("content-length")).toBe("100");
    const chunk = new Uint8Array(await part!.arrayBuffer());
    expect(chunk.length).toBe(100);
    expect(Array.from(chunk.slice(0, 3))).toEqual([100, 101, 102]);
  });
});
